import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_FETCH_MS,
  fetchWithTimeout,
  hasAuthCookie,
} from "./middleware-auth";

describe("hasAuthCookie", () => {
  it("is false for anonymous visitors (no cookies)", () => {
    expect(hasAuthCookie([])).toBe(false);
  });

  it("is false for unrelated cookies", () => {
    expect(hasAuthCookie([{ name: "theme" }, { name: "next-locale" }])).toBe(
      false,
    );
  });

  it("is true for a Supabase session cookie", () => {
    expect(
      hasAuthCookie([{ name: "sb-mikpqxejtljnhhiiibzf-auth-token" }]),
    ).toBe(true);
  });

  it("is true for a chunked Supabase session cookie", () => {
    expect(
      hasAuthCookie([{ name: "sb-mikpqxejtljnhhiiibzf-auth-token.0" }]),
    ).toBe(true);
  });
});

describe("fetchWithTimeout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("aborts a hung fetch well under the Vercel middleware budget", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(init.signal?.reason ?? new Error("aborted"));
          });
        });
      }),
    );

    const started = Date.now();
    await expect(fetchWithTimeout("https://example.invalid/auth")).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(AUTH_FETCH_MS + 1500);
    expect(Date.now() - started).toBeGreaterThan(AUTH_FETCH_MS - 1500);
  });
});
