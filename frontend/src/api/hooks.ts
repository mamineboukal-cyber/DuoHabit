import { QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { xpProgress } from "../lib/xp";
import { ApiError, apiRequest, isApiError } from "./client";
import type {
  AuthResponse,
  CheckinResponse,
  Couple,
  CoupleResponse,
  HabitOwner,
  HabitPayload,
  HabitResponse,
  HabitsResponse,
  TodayMember,
  TodayResponse,
  UndoCheckinResponse,
  User,
} from "./types";

export const meQueryKey = ["me"] as const;
export const coupleQueryKey = ["couple"] as const;
export const habitsQueryRoot = ["habits"] as const;
export const habitsQueryKey = (owner: HabitOwner) => ["habits", owner] as const;
export const todayQueryRoot = ["today"] as const;
export const todayQueryKey = (date?: string) => ["today", date ?? "today"] as const;

/** Couple polling interval while waiting for the partner (PLAN section 8). */
export const COUPLE_POLL_INTERVAL_MS = 5_000;
/** Today dashboard polling interval (PLAN section 8, A16). */
export const TODAY_POLL_INTERVAL_MS = 15_000;

export interface CheckinVariables {
  habitId: number;
  date: string;
  /** Query-key date: undefined for the no-parameter Today query. */
  queryDate?: string;
}

interface TodayMutationContext {
  key: ReturnType<typeof todayQueryKey>;
  previous: TodayResponse | undefined;
}

export interface LoginBody {
  email: string;
  password: string;
}

export interface RegisterBody extends LoginBody {
  display_name: string;
}

export interface CreateCoupleBody {
  timezone?: string;
}

export interface JoinCoupleBody {
  invite_code: string;
}

function withTotalXp(member: TodayMember, totalXp: number): TodayMember {
  const progress = xpProgress(totalXp);

  return {
    ...member,
    total_xp: totalXp,
    level: progress.level,
    xp_into_level: progress.xpIntoLevel,
    xp_for_next_level: progress.xpForNextLevel,
  };
}

function optimisticCheckin(data: TodayResponse, habitId: number): TodayResponse {
  const row = data.me.habits.find((candidate) => candidate.habit.id === habitId);
  if (!row || row.done) {
    return data;
  }

  const points = row.points_if_done;
  const streak = row.streak_if_done ?? row.habit.current_streak + 1;

  return {
    ...data,
    me: {
      ...withTotalXp(data.me, data.me.total_xp + points),
      today_points: data.me.today_points + points,
      habits: data.me.habits.map((candidate) =>
        candidate.habit.id === habitId
          ? {
              ...candidate,
              done: true,
              checkin_points: points,
              points_if_done: points,
              habit: {
                ...candidate.habit,
                current_streak: streak,
                best_streak: Math.max(candidate.habit.best_streak, streak),
              },
            }
          : candidate,
      ),
    },
  };
}

function optimisticUndo(data: TodayResponse, habitId: number): TodayResponse {
  const row = data.me.habits.find((candidate) => candidate.habit.id === habitId);
  if (!row || !row.done) {
    return data;
  }

  const points = row.checkin_points ?? 0;

  return {
    ...data,
    me: {
      ...withTotalXp(data.me, Math.max(0, data.me.total_xp - points)),
      today_points: Math.max(0, data.me.today_points - points),
      habits: data.me.habits.map((candidate) =>
        candidate.habit.id === habitId
          ? { ...candidate, done: false, checkin_points: null }
          : candidate,
      ),
    },
  };
}

function applyCheckinResponse(
  data: TodayResponse,
  response: CheckinResponse,
  habitId: number,
): TodayResponse {
  const row = data.me.habits.find((candidate) => candidate.habit.id === habitId);
  if (!row) {
    return data;
  }

  const pointsDelta = response.checkin.points - (row.checkin_points ?? 0);

  return {
    ...data,
    me: {
      ...withTotalXp(data.me, response.total_xp),
      today_points: data.me.today_points + pointsDelta,
      habits: data.me.habits.map((candidate) =>
        candidate.habit.id === habitId
          ? {
              ...candidate,
              done: true,
              checkin_points: response.checkin.points,
              points_if_done: response.checkin.points,
              streak_if_done: response.checkin.streak_at_checkin,
              habit: response.habit,
            }
          : candidate,
      ),
    },
  };
}

function applyUndoResponse(
  data: TodayResponse,
  response: UndoCheckinResponse,
  habitId: number,
): TodayResponse {
  return {
    ...data,
    me: {
      ...withTotalXp(data.me, response.total_xp),
      habits: data.me.habits.map((candidate) =>
        candidate.habit.id === habitId
          ? { ...candidate, done: false, checkin_points: null, habit: response.habit }
          : candidate,
      ),
    },
  };
}

function cacheCouple(queryClient: QueryClient, couple: Couple) {
  queryClient.setQueryData(coupleQueryKey, couple);
  queryClient.setQueryData<User | null>(meQueryKey, (current) =>
    current ? { ...current, couple_id: couple.id } : current,
  );
}

/**
 * Shared QueryClient. Any 401 outside `/me` clears the cached user, which makes
 * the route guard redirect to `/login`; cached couple data is dropped too so a
 * new session never sees the previous account's pair.
 */
export function createQueryClient(): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
        staleTime: 30_000,
      },
    },
  });

  const handleAuthError = (error: unknown) => {
    if (isApiError(error) && error.status === 401) {
      queryClient.setQueryData(meQueryKey, null);
      queryClient.removeQueries({ queryKey: coupleQueryKey });
      queryClient.removeQueries({ queryKey: habitsQueryRoot });
      queryClient.removeQueries({ queryKey: todayQueryRoot });
    }
  };
  queryClient.getQueryCache().config.onError = handleAuthError;
  queryClient.getMutationCache().config.onError = handleAuthError;

  return queryClient;
}

/** The signed-in user, or null when the session is missing/expired. */
export function useMe() {
  return useQuery({
    queryKey: meQueryKey,
    queryFn: async (): Promise<User | null> => {
      try {
        const data = await apiRequest<AuthResponse>("/api/auth/me");
        return data.user;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          return null;
        }
        throw error;
      }
    },
  });
}

/** The caller's couple; null means the caller has not created/joined one yet. */
export function useCouple() {
  return useQuery({
    queryKey: coupleQueryKey,
    queryFn: async (): Promise<Couple | null> => {
      try {
        const data = await apiRequest<CoupleResponse>("/api/couple");
        return data.couple;
      } catch (error) {
        if (isApiError(error) && error.status === 409 && error.code === "no_couple") {
          return null;
        }
        throw error;
      }
    },
    // Poll only while solo; stop once the partner has joined. TanStack Query
    // does not refetch while the tab is hidden by default.
    refetchInterval: (query) => {
      const couple = query.state.data;
      return couple && couple.members.length < 2 ? COUPLE_POLL_INTERVAL_MS : false;
    },
    refetchIntervalInBackground: false,
  });
}

export function useCreateCouple() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateCoupleBody) =>
      apiRequest<CoupleResponse>("/api/couple", { method: "POST", body }),
    onSuccess: ({ couple }) => {
      cacheCouple(queryClient, couple);
    },
  });
}

export function useJoinCouple() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: JoinCoupleBody) =>
      apiRequest<CoupleResponse>("/api/couple/join", { method: "POST", body }),
    onSuccess: ({ couple }) => {
      cacheCouple(queryClient, couple);
    },
  });
}

/** Active habits for the caller or their partner. */
export function useHabits(owner: HabitOwner, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: habitsQueryKey(owner),
    queryFn: () => apiRequest<HabitsResponse>(`/api/habits?owner=${owner}`),
    enabled: options.enabled ?? true,
  });
}

/**
 * The Today dashboard. ``date`` is omitted for today; when set it must be the
 * couple's today or yesterday. Polling pauses while a check-in is in flight.
 */
export function useToday(date?: string, options: { enabled?: boolean; poll?: boolean } = {}) {
  return useQuery({
    queryKey: todayQueryKey(date),
    queryFn: () =>
      apiRequest<TodayResponse>(
        date ? `/api/today?date=${encodeURIComponent(date)}` : "/api/today",
      ),
    enabled: options.enabled ?? true,
    refetchInterval: options.poll === false ? false : TODAY_POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
    refetchOnMount: "always",
  });
}

export function useCreateCheckin() {
  const queryClient = useQueryClient();

  return useMutation<CheckinResponse, unknown, CheckinVariables, TodayMutationContext>({
    mutationFn: ({ habitId, date }) =>
      apiRequest<CheckinResponse>(`/api/habits/${habitId}/checkins`, {
        method: "POST",
        body: { date },
      }),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: todayQueryRoot });
      const key = todayQueryKey(variables.queryDate);
      const previous = queryClient.getQueryData<TodayResponse>(key);

      if (previous) {
        queryClient.setQueryData<TodayResponse>(
          key,
          optimisticCheckin(previous, variables.habitId),
        );
      }

      return { key, previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.key, context.previous);
      }
    },
    onSuccess: (response, variables) => {
      const key = todayQueryKey(variables.queryDate);
      queryClient.setQueryData<TodayResponse>(key, (current) =>
        current ? applyCheckinResponse(current, response, variables.habitId) : current,
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: todayQueryRoot });
      void queryClient.invalidateQueries({ queryKey: habitsQueryRoot });
    },
  });
}

export function useUndoCheckin() {
  const queryClient = useQueryClient();

  return useMutation<UndoCheckinResponse, unknown, CheckinVariables, TodayMutationContext>({
    mutationFn: ({ habitId, date }) =>
      apiRequest<UndoCheckinResponse>(`/api/habits/${habitId}/checkins/${date}`, {
        method: "DELETE",
      }),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: todayQueryRoot });
      const key = todayQueryKey(variables.queryDate);
      const previous = queryClient.getQueryData<TodayResponse>(key);

      if (previous) {
        queryClient.setQueryData<TodayResponse>(key, optimisticUndo(previous, variables.habitId));
      }

      return { key, previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.key, context.previous);
      }
    },
    onSuccess: (response, variables) => {
      const key = todayQueryKey(variables.queryDate);
      queryClient.setQueryData<TodayResponse>(key, (current) =>
        current ? applyUndoResponse(current, response, variables.habitId) : current,
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: todayQueryRoot });
      void queryClient.invalidateQueries({ queryKey: habitsQueryRoot });
    },
  });
}

export function useCreateHabit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: HabitPayload) =>
      apiRequest<HabitResponse>("/api/habits", { method: "POST", body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: habitsQueryRoot });
      void queryClient.invalidateQueries({ queryKey: todayQueryRoot });
    },
  });
}

export function useUpdateHabit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: HabitPayload }) =>
      apiRequest<HabitResponse>(`/api/habits/${id}`, { method: "PATCH", body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: habitsQueryRoot });
      void queryClient.invalidateQueries({ queryKey: todayQueryRoot });
    },
  });
}

export function useArchiveHabit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => apiRequest<void>(`/api/habits/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: habitsQueryRoot });
      void queryClient.invalidateQueries({ queryKey: todayQueryRoot });
    },
  });
}

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: LoginBody) =>
      apiRequest<AuthResponse>("/api/auth/login", { method: "POST", body }),
    onSuccess: ({ user }) => {
      queryClient.setQueryData(meQueryKey, user);
    },
  });
}

export function useRegister() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: RegisterBody) =>
      apiRequest<AuthResponse>("/api/auth/register", { method: "POST", body }),
    onSuccess: ({ user }) => {
      queryClient.setQueryData(meQueryKey, user);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiRequest<void>("/api/auth/logout", { method: "POST" }),
    onSettled: () => {
      queryClient.setQueryData(meQueryKey, null);
      queryClient.removeQueries({ queryKey: coupleQueryKey });
      queryClient.removeQueries({ queryKey: habitsQueryRoot });
      queryClient.removeQueries({ queryKey: todayQueryRoot });
    },
  });
}
