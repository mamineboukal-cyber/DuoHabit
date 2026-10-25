import type { ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { errorMessage } from "./api/client";
import { useLogout, useMe } from "./api/hooks";
import { useToast } from "./components/Toast";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";

function LoadingScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <p role="status" className="animate-pulse text-sm text-slate-400">
        Loading…
      </p>
    </main>
  );
}

function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-5 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="max-w-sm text-sm text-slate-400">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="min-h-11 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover"
      >
        Retry
      </button>
    </main>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation();
  const me = useMe();

  if (me.isPending) {
    return <LoadingScreen />;
  }
  if (me.isError) {
    return (
      <ErrorScreen
        message={errorMessage(me.error)}
        onRetry={() => {
          void me.refetch();
        }}
      />
    );
  }
  if (!me.data) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

function PublicOnly({ children }: { children: ReactNode }) {
  const me = useMe();

  if (me.isPending) {
    return <LoadingScreen />;
  }
  if (me.isError) {
    return (
      <ErrorScreen
        message={errorMessage(me.error)}
        onRetry={() => {
          void me.refetch();
        }}
      />
    );
  }
  if (me.data) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function HomePage() {
  const me = useMe();
  const logout = useLogout();
  const { showToast } = useToast();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col items-center justify-center px-5 py-10 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">DuoHabits</p>
      <h1 className="mt-3 text-2xl font-bold">
        You&apos;re signed in{me.data ? `, ${me.data.display_name}` : ""}.
      </h1>
      <p className="mt-2 text-sm text-slate-400">
        {me.data?.couple_id == null
          ? "Pairing comes next; the Today screen arrives in Step 12."
          : "Today arrives in Step 12."}
      </p>
      <button
        type="button"
        onClick={() =>
          logout.mutate(undefined, {
            onError: (error) => showToast(errorMessage(error)),
          })
        }
        disabled={logout.isPending}
        className="mt-8 min-h-11 rounded-xl border border-white/10 px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-white/25 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {logout.isPending ? "Logging out…" : "Log out"}
      </button>
    </main>
  );
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnly>
            <LoginPage />
          </PublicOnly>
        }
      />
      <Route
        path="/register"
        element={
          <PublicOnly>
            <RegisterPage />
          </PublicOnly>
        }
      />
      <Route
        path="/"
        element={
          <RequireAuth>
            <HomePage />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
