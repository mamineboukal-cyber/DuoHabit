import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

import type { Couple, User } from "../api/types";

export const unauthenticated = {
  error: { code: "unauthenticated", message: "Authentication required." },
};

export const noCouple = {
  error: { code: "no_couple", message: "You are not in a couple yet." },
};

export const defaultUser: User = {
  id: 1,
  email: "owner@example.com",
  display_name: "Owner",
  couple_id: null,
};

export const coupledUser: User = {
  ...defaultUser,
  couple_id: 10,
};

export const soloCouple: Couple = {
  id: 10,
  timezone: "Africa/Casablanca",
  invite_code: "ABCD2345",
  members: [{ id: 1, display_name: "Owner" }],
  created_at: "2026-10-25T00:00:00+00:00",
};

export const fullCouple: Couple = {
  ...soloCouple,
  invite_code: null,
  members: [
    { id: 1, display_name: "Owner" },
    { id: 2, display_name: "Partner" },
  ],
};

/**
 * Default session: logged out. `/me` returns 401, which `useMe` maps to null;
 * `/couple` returns `no_couple`, which `useCouple` maps to null. Tests override
 * handlers per case.
 */
export const server = setupServer(
  http.get("*/api/auth/me", () => HttpResponse.json(unauthenticated, { status: 401 })),
  http.get("*/api/couple", () => HttpResponse.json(noCouple, { status: 409 })),
);
