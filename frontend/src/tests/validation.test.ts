import { describe, expect, it } from "vitest";

import {
  habitEmojiSchema,
  habitFormSchema,
  habitNameSchema,
  habitScheduleDaysSchema,
  zodFieldErrors,
} from "../lib/validation";

describe("habit validation", () => {
  it("counts the name limit in Unicode code points", () => {
    expect(habitNameSchema.safeParse("😀".repeat(60)).success).toBe(true);
    expect(habitNameSchema.safeParse("😀".repeat(61)).success).toBe(false);
  });

  it("trims the name and rejects a blank one", () => {
    expect(habitNameSchema.parse("  Run  ")).toBe("Run");
    expect(habitNameSchema.safeParse("   ").success).toBe(false);
  });

  it("counts the emoji limit in code points and maps blanks to null", () => {
    expect(habitEmojiSchema.parse("😀".repeat(8))).toBe("😀".repeat(8));
    expect(habitEmojiSchema.safeParse("😀".repeat(9)).success).toBe(false);
    expect(habitEmojiSchema.parse("  ")).toBeNull();
    expect(habitEmojiSchema.parse(" 🏃 ")).toBe("🏃");
  });

  it("requires at least one unique weekday and sorts the selection", () => {
    expect(habitScheduleDaysSchema.safeParse([]).success).toBe(false);
    expect(habitScheduleDaysSchema.safeParse([1, 1]).success).toBe(false);
    expect(habitScheduleDaysSchema.safeParse([7]).success).toBe(false);
    expect(habitScheduleDaysSchema.parse([4, 0, 2])).toEqual([0, 2, 4]);
  });

  it("normalizes a complete form payload", () => {
    const result = habitFormSchema.safeParse({
      name: "  Run  ",
      emoji: " 🏃 ",
      difficulty: 2,
      schedule_days: [4, 0, 2],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        name: "Run",
        emoji: "🏃",
        difficulty: 2,
        schedule_days: [0, 2, 4],
      });
    }
  });

  it("maps issues to their form field names", () => {
    const result = habitFormSchema.safeParse({
      name: "",
      emoji: "",
      difficulty: 4,
      schedule_days: [],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = zodFieldErrors(result.error);
      expect(errors.name).toBe("Habit name is required.");
      expect(errors.difficulty).toBeDefined();
      expect(errors.schedule_days).toBe("Pick at least one day.");
    }
  });
});
