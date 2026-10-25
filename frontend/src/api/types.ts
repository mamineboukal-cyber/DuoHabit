/** TypeScript mirrors of the API objects this slice consumes (PLAN sections 6-7). */

export interface User {
  id: number;
  email: string;
  display_name: string;
  couple_id: number | null;
}

export interface AuthResponse {
  user: User;
}

export interface CoupleMember {
  id: number;
  display_name: string;
}

export interface Couple {
  id: number;
  timezone: string;
  invite_code: string | null;
  members: CoupleMember[];
  created_at: string;
}

export interface CoupleResponse {
  couple: Couple;
}

export type HabitDifficulty = 1 | 2 | 3;
export type HabitOwner = "me" | "partner";

export interface Habit {
  id: number;
  owner_id: number;
  name: string;
  emoji: string | null;
  difficulty: HabitDifficulty;
  schedule_days: number[];
  current_streak: number;
  best_streak: number;
  archived_at: string | null;
  created_at: string;
}

export interface HabitsResponse {
  habits: Habit[];
}

export interface HabitResponse {
  habit: Habit;
}

export interface HabitPayload {
  name: string;
  emoji: string | null;
  difficulty: HabitDifficulty;
  schedule_days: number[];
}

export interface TodayHabitRow {
  habit: Habit;
  done: boolean;
  points_if_done: number;
  checkin_points: number | null;
  /** Present on dated responses; Today falls back to current_streak + 1. */
  streak_if_done?: number;
}

export interface TodayMember {
  user: CoupleMember;
  level: number;
  total_xp: number;
  xp_into_level: number;
  xp_for_next_level: number;
  today_points: number;
  habits: TodayHabitRow[];
}

export interface TodayResponse {
  date: string;
  timezone: string;
  me: TodayMember;
  partner: TodayMember | null;
}

export interface Checkin {
  id: number;
  habit_id: number;
  checkin_date: string;
  points: number;
  streak_at_checkin: number;
}

export interface CheckinResponse {
  checkin: Checkin;
  habit: Habit;
  total_xp: number;
  level: number;
}

export interface UndoCheckinResponse {
  habit: Habit;
  total_xp: number;
  level: number;
}

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: Record<string, string>;
  };
}
