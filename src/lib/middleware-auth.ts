/** Abort Auth fetches before Vercel Edge middleware times out (typically 25s). */
export const AUTH_FETCH_MS = 4_000;

export function hasAuthCookie(cookies: { name: string }[]) {
  return cookies.some(
    (c) => c.name.includes("-auth-token") || c.name.startsWith("sb-"),
  );
}

export function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const timeout = AbortSignal.timeout(AUTH_FETCH_MS);
  const signal =
    init?.signal && typeof AbortSignal.any === "function"
      ? AbortSignal.any([init.signal, timeout])
      : timeout;
  return fetch(input, { ...init, signal });
}
