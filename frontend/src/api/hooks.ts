import { QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError, apiRequest, isApiError } from "./client";
import type { AuthResponse, User } from "./types";

export const meQueryKey = ["me"] as const;

export interface LoginBody {
  email: string;
  password: string;
}

export interface RegisterBody extends LoginBody {
  display_name: string;
}

/**
 * Shared QueryClient. Any 401 outside `/me` clears the cached user, which makes
 * the route guard redirect to `/login`.
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
    },
  });
}
