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

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: Record<string, string>;
  };
}
