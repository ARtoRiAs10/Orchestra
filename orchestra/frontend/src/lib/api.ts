import { auth } from '@clerk/nextjs/server';

export const ORCHESTRA_API_URL = process.env.ORCHESTRA_API_URL || 'http://localhost:4000';

/**
 * Fetch from the Orchestra master API, attaching the current Clerk session
 * token as a Bearer token. Use from Server Components / Route Handlers only
 * (relies on `auth()` from `@clerk/nextjs/server`).
 *
 * The Express master verifies this token with `@clerk/backend`'s
 * `verifyToken()` using CLERK_SECRET_KEY (see master/src/middleware/auth.ts).
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { getToken } = auth();
  const token = await getToken();

  return fetch(`${ORCHESTRA_API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
    cache: 'no-store',
  });
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Orchestra API error (${res.status})`);
  }
  return res.json() as Promise<T>;
}
