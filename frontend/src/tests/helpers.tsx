import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import App from "../App";
import { createQueryClient } from "../api/hooks";
import { ToastProvider } from "../components/Toast";

/** Render the real route table (guards included) at `initialPath`. */
export function renderApp(initialPath = "/") {
  const queryClient = createQueryClient();

  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={[initialPath]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <ToastProvider>
          <App />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  return { ...view, queryClient };
}
