import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { ApiError, apiRequest, errorMessage, fieldErrors, isApiError } from "../api/client";
import { server } from "./server";

function caught(error: unknown): ApiError {
  if (!isApiError(error)) {
    throw error;
  }
  return error;
}

describe("apiRequest", () => {
  it("maps the API error envelope and keeps details", async () => {
    server.use(
      http.get("*/api/test/error", () =>
        HttpResponse.json(
          {
            error: {
              code: "validation_error",
              message: "Invalid request data.",
              details: { email: "Enter a valid email address." },
            },
          },
          { status: 422 },
        ),
      ),
    );

    const error = caught(await apiRequest("/api/test/error").catch((value: unknown) => value));

    expect(error).toMatchObject({ status: 422, code: "validation_error" });
    expect(fieldErrors(error)).toEqual({ email: "Enter a valid email address." });
    expect(errorMessage(error, { validation_error: "Check the fields." })).toBe(
      "Check the fields.",
    );
  });

  it("turns a network failure into status 0", async () => {
    server.use(http.get("*/api/test/offline", () => HttpResponse.error()));

    const error = caught(await apiRequest("/api/test/offline").catch((value: unknown) => value));

    expect(error).toMatchObject({ status: 0, code: "network_error" });
    expect(error.message).toContain("Can't reach the server");
  });

  it("returns undefined for 204 responses", async () => {
    server.use(http.post("*/api/test/no-content", () => new HttpResponse(null, { status: 204 })));

    await expect(apiRequest("/api/test/no-content", { method: "POST" })).resolves.toBeUndefined();
  });
});
