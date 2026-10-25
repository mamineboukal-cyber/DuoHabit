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

/**
 * Mirrors `backend/app/schemas/couple.py`: the code is stripped, uppercased and
 * matched against the backend's 8-character alphabet (no I, O, 0 or 1).
 */
export const inviteCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/, "Enter a valid invite code.");

export const joinCoupleSchema = z.object({ invite_code: inviteCodeSchema });

/**
 * Mirrors `backend/app/schemas/habit.py`. Lengths are counted in Unicode code
 * points so emoji behave exactly like Python/Pydantic `len`, not UTF-16 units.
 */
const characterCount = (value: string) => Array.from(value).length;

export const habitNameSchema = z
  .string()
  .trim()
  .min(1, "Habit name is required.")
  .refine((value) => characterCount(value) <= 60, "Habit name must be 60 characters or fewer.");

export const habitEmojiSchema = z
  .string()
  .trim()
  .refine((value) => characterCount(value) <= 8, "Emoji must be 8 characters or fewer.")
  .transform((value) => (value === "" ? null : value));

export const habitDifficultySchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

export const habitScheduleDaysSchema = z
  .array(z.number().int().min(0).max(6))
  .min(1, "Pick at least one day.")
  .refine((days) => new Set(days).size === days.length, "Days must not repeat.")
  .transform((days) => [...days].sort((left, right) => left - right));

export const habitFormSchema = z.object({
  name: habitNameSchema,
  emoji: habitEmojiSchema,
  difficulty: habitDifficultySchema,
  schedule_days: habitScheduleDaysSchema,
});

export type HabitFormValues = z.input<typeof habitFormSchema>;
export type HabitFormData = z.output<typeof habitFormSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: loginPasswordSchema,
});

export const registerSchema = z.object({
  email: emailSchema,
  display_name: displayNameSchema,
  password: newPasswordSchema,
});

export type JoinCoupleValues = z.input<typeof joinCoupleSchema>;
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
