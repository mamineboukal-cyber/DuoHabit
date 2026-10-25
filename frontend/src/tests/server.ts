import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

import type { User } from "../api/types";

export const unauthenticated = {
  error: { code: "unauthenticated", message: "Authentication required." },
};

export const defaultUser: User = {
  id: 1,
  email: "owner@example.com",
  display_name: "Owner",
  couple_id: null,
};

/**
 * Default session: logged out. `/me` returns 401, which `useMe` maps to null;
 * tests override handlers per case.
 */
export const server = setupServer(
  http.get("*/api/auth/me", () => HttpResponse.json(unauthenticated, { status: 401 })),
);
