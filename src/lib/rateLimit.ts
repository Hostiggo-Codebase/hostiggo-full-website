import "server-only";
import { NextRequest, NextResponse } from "next/server";

// Fixed-window rate limiter. With UPSTASH_REDIS_REST_URL / _TOKEN set, counters
// live in Redis and are shared by every serverless instance (a real global
// quota). Without them -- or if Redis is unreachable -- it falls back to
// per-instance memory: a speed bump against scripted abuse, not a hard limit.
// Supabase Auth applies its own limits to OTP sending on top.
const buckets = new Map<string, { count: number; resetAt: number }>();

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/+$/, "");
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

export function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

const tooMany = (retryAfterSeconds: number) =>
  NextResponse.json(
    { error: "Too many attempts. Please wait a moment and try again." },
    { status: 429, headers: { "Retry-After": String(Math.max(1, retryAfterSeconds)) } },
  );

/** Shared counter in Redis. Returns null when Redis isn't usable so the caller falls back. */
async function redisHit(key: string, windowMs: number): Promise<{ count: number; ttlMs: number } | null> {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  try {
    const res = await fetch(`${REDIS_URL}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify([
        ["INCR", `rl:${key}`],
        ["PEXPIRE", `rl:${key}`, windowMs, "NX"],
        ["PTTL", `rl:${key}`],
      ]),
      // A slow limiter must never slow every request down.
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return null;
    const out = (await res.json()) as Array<{ result?: number }>;
    const count = Number(out?.[0]?.result);
    const ttlMs = Number(out?.[2]?.result);
    return Number.isFinite(count) ? { count, ttlMs: Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : windowMs } : null;
  } catch {
    return null;
  }
}

/**
 * Returns a 429 response when `key` has exceeded `limit` hits in the current
 * `windowMs`, otherwise null.
 */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<NextResponse | null> {
  const shared = await redisHit(key, windowMs);
  if (shared) return shared.count <= limit ? null : tooMany(Math.ceil(shared.ttlMs / 1000));

  const now = Date.now();
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
  }
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }
  bucket.count += 1;
  if (bucket.count <= limit) return null;
  return tooMany(Math.ceil((bucket.resetAt - now) / 1000));
}
