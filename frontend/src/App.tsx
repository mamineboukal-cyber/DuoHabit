import type { ReactNode } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";

import { errorMessage } from "./api/client";
import { useMe } from "./api/hooks";
import AppShell from "./components/AppShell";
import ComingSoon from "./components/ComingSoon";
import HabitFormPage from "./pages/HabitFormPage";
import HabitsPage from "./pages/HabitsPage";
import LoginPage from "./pages/LoginPage";
import PairPage from "./pages/PairPage";
import RegisterPage from "./pages/RegisterPage";

function LoadingScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <p role="status" className="animate-pulse text-sm text-content-muted">
        Loading…
      </p>
    </main>
  );
}

function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-5 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="max-w-sm text-sm text-content-muted">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="min-h-11 rounded-control bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent transition hover:bg-accent-hover"
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

function RequireCouple({ children }: { children: ReactNode }) {
  const me = useMe();

  // A solo couple has a `couple_id` and may use the whole app; only users with
  // no couple are sent to /pair.
  if (me.data?.couple_id == null) {
    return <Navigate to="/pair" replace />;
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

function TodayPlaceholder() {
  const me = useMe();

  return (
    <section className="mx-auto max-w-xl">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Today</p>
      <h1 className="mt-3 text-2xl font-bold">
        You&apos;re signed in{me.data ? `, ${me.data.display_name}` : ""}.
      </h1>
      <p className="mt-2 text-sm text-content-muted">
        The Today screen arrives in Step 12. Your habits, check-ins and partner progress will live
        here.
      </p>
    </section>
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
        path="/pair"
        element={
          <RequireAuth>
            <PairPage />
          </RequireAuth>
        }
      />
      <Route
        path="/"
        element={
          <RequireAuth>
            <RequireCouple>
              <AppShell>
                <Outlet />
              </AppShell>
            </RequireCouple>
          </RequireAuth>
        }
      >
        <Route index element={<TodayPlaceholder />} />
        <Route path="habits" element={<HabitsPage />} />
        <Route path="habits/new" element={<HabitFormPage />} />
        <Route path="habits/:id/edit" element={<HabitFormPage />} />
        <Route path="duel" element={<ComingSoon title="Duel" step={13} />} />
        <Route path="settings" element={<ComingSoon title="Settings" step={14} />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
