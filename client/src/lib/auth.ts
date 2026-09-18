import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { LoginInput, RegisterInput, Role } from '@deadwax/shared'
import { api } from './api'

export interface AuthUser {
  id: number
  email: string
  displayName: string
  role: Role
}

interface MeResponse {
  user: AuthUser | null
}

interface AuthResponse {
  user: AuthUser
}

const ME_KEY = ['auth', 'me'] as const

export function useAuth() {
  const query = useQuery({
    queryKey: ME_KEY,
    queryFn: ({ signal }) => api<MeResponse>('/auth/me', { signal }),
    staleTime: 5 * 60_000,
  })

  return {
    user: query.data?.user ?? null,
    isPending: query.isPending,
  }
}

export function useLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: LoginInput) =>
      api<AuthResponse>('/auth/login', { method: 'POST', body: input }),
    onSuccess: (data) => queryClient.setQueryData(ME_KEY, data),
  })
}

export function useRegister() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: RegisterInput) =>
      api<AuthResponse>('/auth/register', { method: 'POST', body: input }),
    onSuccess: (data) => queryClient.setQueryData(ME_KEY, data),
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api<void>('/auth/logout', { method: 'POST' }),
    onSuccess: () => queryClient.setQueryData(ME_KEY, { user: null }),
  })
}
