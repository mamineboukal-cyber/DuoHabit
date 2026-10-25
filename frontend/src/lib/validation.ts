import { z } from "zod";

/**
 * Mirrors `backend/app/schemas/auth.py`:
 * - email is stripped, lowercased, <= 254 chars and matches the same pattern;
 * - display name is stripped, 1-40 chars;
 * - passwords are NOT stripped, 10-128 chars (login allows 1-128).
 */
export const emailSchema = z
  .string()
  .trim()
  .min(1, "Enter a valid email address.")
  .max(254, "Enter a valid email address.")
  .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, "Enter a valid email address.")
  .transform((value) => value.toLowerCase());

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, "Display name is required.")
  .max(40, "Display name must be 40 characters or fewer.");

export const newPasswordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters.")
  .max(128, "Password must be 128 characters or fewer.");

export const loginPasswordSchema = z
  .string()
  .min(1, "Password is required.")
  .max(128, "Password must be 128 characters or fewer.");

export const loginSchema = z.object({
  email: emailSchema,
  password: loginPasswordSchema,
});

export const registerSchema = z.object({
  email: emailSchema,
  display_name: displayNameSchema,
  password: newPasswordSchema,
});

export type LoginValues = z.input<typeof loginSchema>;
export type RegisterValues = z.input<typeof registerSchema>;

/** Flatten zod issues into `{field: firstMessage}` for inline display. */
export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (key && !errors[key]) {
      errors[key] = issue.message;
    }
  }
  return errors;
}
