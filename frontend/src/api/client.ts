import type { ApiErrorEnvelope } from "./types";

const NETWORK_MESSAGE = "Can't reach the server. Check your connection and try again.";

/**
 * A failed API call. `status` is 0 for network failures (no HTTP response).
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, string>;

  constructor(status: number, code: string, message: string, details?: Record<string, string>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
};

/** Resolve API paths against the current origin so tests and the browser agree. */
function resolveUrl(path: string): string {
  return new URL(path, window.location.origin).toString();
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, signal } = options;

  let response: Response;
  try {
    response = await fetch(resolveUrl(path), {
      method,
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }
    throw new ApiError(0, "network_error", NETWORK_MESSAGE);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  let payload: unknown;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = undefined;
    }
  }

  if (!response.ok) {
    const envelope = payload as ApiErrorEnvelope | undefined;
    throw new ApiError(
      response.status,
      envelope?.error?.code ?? "http_error",
      envelope?.error?.message ?? "The request failed.",
      envelope?.error?.details,
    );
  }

  return payload as T;
}

/** Human-readable copy for an error, with per-code overrides for a screen. */
export function errorMessage(error: unknown, overrides: Record<string, string> = {}): string {
  if (isApiError(error)) {
    return overrides[error.code] ?? error.message;
  }
  return "Something went wrong. Try again.";
}

/** Field-level messages from a `422 validation_error`, keyed like the form fields. */
export function fieldErrors(error: unknown): Record<string, string> {
  return isApiError(error) ? (error.details ?? {}) : {};
}
