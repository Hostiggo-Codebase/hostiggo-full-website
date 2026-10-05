import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { rateLimit } from "../rateLimit";

afterEach(() => vi.useRealTimers());

describe("rateLimit (in-memory fallback)", () => {
  it("allows up to the limit then answers 429 with Retry-After", async () => {
    const key = `t-${Math.random()}`;
    for (let i = 0; i < 3; i++) expect(await rateLimit(key, 3, 60_000)).toBeNull();
    const blocked = await rateLimit(key, 3, 60_000);
    expect(blocked?.status).toBe(429);
    expect(Number(blocked?.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("starts a fresh window once the old one has expired", async () => {
    vi.useFakeTimers();
    const key = `t-${Math.random()}`;
    expect(await rateLimit(key, 1, 1000)).toBeNull();
    expect((await rateLimit(key, 1, 1000))?.status).toBe(429);
    vi.advanceTimersByTime(1500);
    expect(await rateLimit(key, 1, 1000)).toBeNull();
  });
});
