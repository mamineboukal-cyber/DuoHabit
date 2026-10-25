import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

import type { Couple, Habit, TodayHabitRow, TodayResponse, User } from "../api/types";

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

export const myHabit: Habit = {
  id: 21,
  owner_id: 1,
  name: "Run",
  emoji: "🏃",
  difficulty: 1,
  schedule_days: [0, 2, 4],
  current_streak: 3,
  best_streak: 5,
  archived_at: null,
  created_at: "2026-10-20T08:00:00+00:00",
};

export const partnerHabit: Habit = {
  id: 22,
  owner_id: 2,
  name: "Stretch",
  emoji: "🧘",
  difficulty: 2,
  schedule_days: [0, 1, 2, 3, 4, 5, 6],
  current_streak: 0,
  best_streak: 2,
  archived_at: null,
  created_at: "2026-10-21T08:00:00+00:00",
};

export const todayHabit: Habit = {
  ...myHabit,
  id: 31,
  name: "Run",
  current_streak: 1,
  best_streak: 3,
};

export const yesterdayHabit: Habit = {
  ...myHabit,
  id: 32,
  name: "Read",
  emoji: "📚",
  difficulty: 2,
  schedule_days: [3],
  current_streak: 0,
  best_streak: 1,
};

export const todayRow: TodayHabitRow = {
  habit: todayHabit,
  done: false,
  points_if_done: 11,
  checkin_points: null,
};

export const checkedInTodayRow: TodayHabitRow = {
  ...todayRow,
  done: true,
  checkin_points: 11,
  points_if_done: 11,
  habit: { ...todayHabit, current_streak: 2, best_streak: 3 },
};

export const partnerTodayRow: TodayHabitRow = {
  habit: { ...partnerHabit, current_streak: 1, best_streak: 2 },
  done: true,
  points_if_done: 20,
  checkin_points: 20,
};

export const yesterdayRow: TodayHabitRow = {
  habit: yesterdayHabit,
  done: false,
  points_if_done: 20,
  checkin_points: null,
  streak_if_done: 1,
};

export const checkedInYesterdayRow: TodayHabitRow = {
  ...yesterdayRow,
  done: true,
  checkin_points: 20,
  points_if_done: 20,
  habit: { ...yesterdayHabit, current_streak: 1, best_streak: 1 },
};

export const emptyToday: TodayResponse = {
  date: "2026-10-23",
  timezone: "Africa/Casablanca",
  me: {
    user: { id: 1, display_name: "Owner" },
    level: 1,
    total_xp: 0,
    xp_into_level: 0,
    xp_for_next_level: 100,
    today_points: 0,
    habits: [],
  },
  partner: null,
};

export const todayWithHabits: TodayResponse = {
  ...emptyToday,
  me: {
    ...emptyToday.me,
    level: 1,
    total_xp: 90,
    xp_into_level: 90,
    xp_for_next_level: 100,
    habits: [todayRow],
  },
};

export const checkedInToday: TodayResponse = {
  ...todayWithHabits,
  me: {
    ...todayWithHabits.me,
    level: 2,
    total_xp: 101,
    xp_into_level: 1,
    xp_for_next_level: 300,
    today_points: 11,
    habits: [checkedInTodayRow],
  },
};

export const todayWithPartner: TodayResponse = {
  ...todayWithHabits,
  partner: {
    user: { id: 2, display_name: "Partner" },
    level: 2,
    total_xp: 120,
    xp_into_level: 20,
    xp_for_next_level: 300,
    today_points: 20,
    habits: [partnerTodayRow],
  },
};

export const yesterdayToday: TodayResponse = {
  ...emptyToday,
  date: "2026-10-22",
  me: {
    ...emptyToday.me,
    habits: [yesterdayRow],
  },
};

export const checkedInYesterday: TodayResponse = {
  ...yesterdayToday,
  me: {
    ...yesterdayToday.me,
    total_xp: 20,
    xp_into_level: 20,
    today_points: 20,
    habits: [checkedInYesterdayRow],
  },
};

/**
 * Default session: logged out. `/me` returns 401, which `useMe` maps to null;
 * `/couple` returns `no_couple`, which `useCouple` maps to null; the habit and
 * today lists are empty so shell navigation does not hit an unhandled request.
 * Tests override handlers per case.
 */
export const server = setupServer(
  http.get("*/api/auth/me", () => HttpResponse.json(unauthenticated, { status: 401 })),
  http.get("*/api/couple", () => HttpResponse.json(noCouple, { status: 409 })),
  http.get("*/api/habits", () => HttpResponse.json({ habits: [] })),
  http.get("*/api/today", () => HttpResponse.json(emptyToday)),
);
