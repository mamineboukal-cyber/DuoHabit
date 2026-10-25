import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";

import { errorMessage } from "../api/client";
import { useLogout } from "../api/hooks";
import { useToast } from "./Toast";

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
  icon: ReactNode;
}

function NavIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      {children}
    </svg>
  );
}

const NAV_ITEMS: NavItem[] = [
  {
    to: "/",
    label: "Today",
    end: true,
    icon: (
      <NavIcon>
        <path d="m3 10.5 9-7.5 9 7.5" />
        <path d="M5.5 9.5V21h13V9.5" />
      </NavIcon>
    ),
  },
  {
    to: "/habits",
    label: "Habits",
    icon: (
      <NavIcon>
        <circle cx="12" cy="12" r="9" />
        <path d="m8.5 12 2.5 2.5 4.5-5" />
      </NavIcon>
    ),
  },
  {
    to: "/duel",
    label: "Duel",
    icon: (
      <NavIcon>
        <path d="M13 2 4.5 13.5H11l-1 8.5L19.5 10H13V2Z" />
      </NavIcon>
    ),
  },
  {
    to: "/settings",
    label: "Settings",
    icon: (
      <NavIcon>
        <path d="M4 6h9" />
        <path d="M17 6h3" />
        <circle cx="15" cy="6" r="2" />
        <path d="M4 12h3" />
        <path d="M11 12h9" />
        <circle cx="9" cy="12" r="2" />
        <path d="M4 18h9" />
        <path d="M17 18h3" />
        <circle cx="15" cy="18" r="2" />
      </NavIcon>
    ),
  },
];

function LogoutButton({ className }: { className?: string }) {
  const logout = useLogout();
  const { showToast } = useToast();

  return (
    <button
      type="button"
      onClick={() =>
        logout.mutate(undefined, {
          onError: (error) => showToast(errorMessage(error)),
        })
      }
      disabled={logout.isPending}
      className={[
        "inline-flex min-h-tap items-center justify-center rounded-control border border-line px-3 py-2 font-semibold text-content-muted transition",
        "hover:border-line-strong hover:text-content disabled:cursor-not-allowed disabled:opacity-60",
        className ?? "",
      ].join(" ")}
    >
      {logout.isPending ? "Logging out…" : "Log out"}
    </button>
  );
}

function desktopNavClass({ isActive }: { isActive: boolean }): string {
  return [
    "flex min-h-tap items-center gap-3 rounded-control px-3 py-2 text-sm font-medium transition",
    isActive
      ? "bg-accent/10 text-accent"
      : "text-content-muted hover:bg-surface-raised hover:text-content",
  ].join(" ");
}

function mobileNavClass({ isActive }: { isActive: boolean }): string {
  return [
    "flex min-h-tap flex-1 flex-col items-center justify-center gap-1 rounded-control px-1 py-1.5 text-xs font-medium transition",
    isActive
      ? "bg-accent/10 text-accent"
      : "text-content-muted hover:bg-surface-raised hover:text-content",
  ].join(" ");
}

const BRAND_LINK_CLASS = "inline-flex items-center text-lg font-bold tracking-tight text-content";

/** Responsive authenticated shell: sidebar at >=768 px, bottom tabs below. */
export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas text-content">
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-line bg-surface px-4 py-6 md:flex">
        <Link to="/" className={BRAND_LINK_CLASS}>
          DuoHabits
        </Link>
        <nav aria-label="Primary" className="mt-8 flex flex-1 flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={desktopNavClass}>
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>
        <LogoutButton className="w-full" />
      </aside>

      <div className="md:pl-60">
        <header className="flex items-center justify-between border-b border-line px-4 py-3 md:hidden">
          <Link to="/" className={BRAND_LINK_CLASS}>
            DuoHabits
          </Link>
          <LogoutButton className="text-xs" />
        </header>
        <main className="mx-auto w-full max-w-content px-4 pb-28 pt-6 md:px-8 md:pb-12">
          {children}
        </main>
      </div>

      <nav
        aria-label="Mobile primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur md:hidden"
      >
        <div className="mx-auto flex max-w-md items-stretch gap-1 px-2 pb-[calc(0.35rem+env(safe-area-inset-bottom))] pt-1.5">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={mobileNavClass}>
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
