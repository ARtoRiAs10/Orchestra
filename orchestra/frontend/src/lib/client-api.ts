'use client';

import { useAuth } from '@clerk/nextjs';
import { useCallback } from 'react';

export const ORCHESTRA_API_URL = process.env.NEXT_PUBLIC_ORCHESTRA_API_URL || 'http://localhost:4000';
export const ORCHESTRA_SOCKET_URL = process.env.NEXT_PUBLIC_ORCHESTRA_SOCKET_URL || 'http://localhost:4000';

/**
 * Returns a fetch-like function for Client Components that calls the
 * Orchestra master API with the current Clerk session token attached.
 */
export function useOrchestraApi() {
  const { getToken } = useAuth();

  const apiFetch = useCallback(
    async (path: string, init: RequestInit = {}) => {
      const token = await getToken();
      return fetch(`${ORCHESTRA_API_URL}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(init.headers || {}),
        },
      });
    },
    [getToken]
  );

  const apiJson = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const res = await apiFetch(path, init);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Orchestra API error (${res.status})`);
      }
      return res.json() as Promise<T>;
    },
    [apiFetch]
  );

  return { apiFetch, apiJson };
}
