import { QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError, apiRequest, isApiError } from "./client";
import type { AuthResponse, Couple, CoupleResponse, User } from "./types";

export const meQueryKey = ["me"] as const;
export const coupleQueryKey = ["couple"] as const;

/** Couple polling interval while waiting for the partner (PLAN section 8). */
export const COUPLE_POLL_INTERVAL_MS = 5_000;

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
    },
  });
}
