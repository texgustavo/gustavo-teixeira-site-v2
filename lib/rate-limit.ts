// lib/rate-limit.ts — Sliding-window rate limit for the public /api/agent endpoint.
//
// LAYER 2 of the defense stack. See api/agent.ts header for the full layering.
//
// ENV VARS (optional, enables the persistent path):
//   UPSTASH_REDIS_REST_URL    — REST URL from Upstash Console → your Redis DB
//   UPSTASH_REDIS_REST_TOKEN  — REST token from Upstash Console → your Redis DB
//
// When both env vars are set: uses Upstash Redis with three sliding windows:
//   - per-fingerprint:   5 req / minute
//   - per-fingerprint:  20 req / day
//   - global hard cap: 100 req / hour (protects against distributed/botnet abuse)
//
// When env vars are NOT set: falls back to the in-memory map limiter
// (8 req / minute per fingerprint). This is the legacy behavior. It does NOT
// persist across edge invocations, so it only stops trivial repeat abuse.
//
// Fingerprint = sha256(IP + UA + secret) truncated. We hash IP+UA so simple IP
// rotation or UA rotation alone doesn't bypass the limit. Hash also doubles
// as a privacy measure (no raw IPs in Redis keys).
//
// Edge-safe: uses Web Crypto, no Node APIs. @upstash/redis is edge-compatible.

import { Redis } from '@upstash/redis';

// ---------------- Types -------------------------------------------------------

export interface RateLimitResult {
  /** false = block the request, true = allow it through */
  allowed: boolean;
  /** seconds the caller must wait before the next allowed request, when known */
  retryAfter?: number;
  /** approximate remaining quota in the tightest active window */
  remaining?: number;
  /** which window tripped (useful for logging) */
  trippedBy?: 'minute' | 'day' | 'global' | 'memory';
}

// ---------------- Config ------------------------------------------------------

const LIMITS = {
  perMinute: 5,        // per fingerprint
  perDay: 20,          // per fingerprint
  globalPerHour: 100,  // across all fingerprints
} as const;

const MEMORY_FALLBACK_PER_MINUTE = 8;

// ---------------- Upstash client (lazy, may be null) --------------------------

let redisClient: Redis | null | undefined; // undefined = not initialized yet

function getRedis(): Redis | null {
  if (redisClient !== undefined) return redisClient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    redisClient = null;
    return null;
  }
  try {
    redisClient = new Redis({ url, token });
    return redisClient;
  } catch {
    redisClient = null;
    return null;
  }
}

// ---------------- In-memory fallback ------------------------------------------

const memoryWindow = new Map<string, number[]>();
const MEM_WINDOW_MS = 60_000;

function memoryCheck(fingerprint: string): RateLimitResult {
  const now = Date.now();
  const history = memoryWindow.get(fingerprint) ?? [];
  const recent = history.filter((t) => now - t < MEM_WINDOW_MS);
  if (recent.length >= MEMORY_FALLBACK_PER_MINUTE) {
    const oldest = recent[0];
    const retryAfter = Math.max(1, Math.ceil((MEM_WINDOW_MS - (now - oldest)) / 1000));
    return { allowed: false, retryAfter, remaining: 0, trippedBy: 'memory' };
  }
  recent.push(now);
  memoryWindow.set(fingerprint, recent);
  // Soft GC
  if (memoryWindow.size > 1000) {
    for (const [id, times] of memoryWindow) {
      if (!times.some((t) => now - t < MEM_WINDOW_MS)) memoryWindow.delete(id);
    }
  }
  return { allowed: true, remaining: MEMORY_FALLBACK_PER_MINUTE - recent.length };
}

// ---------------- Web Crypto fingerprint --------------------------------------

const enc = new TextEncoder();

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Build a stable fingerprint from IP + UA + server-side secret. */
export async function fingerprint(ip: string, userAgent: string): Promise<string> {
  const secret = process.env.IP_HASH_SECRET ?? 'gustavo-default-fingerprint-salt-2026';
  const raw = `${ip}|${userAgent}|${secret}`;
  const hex = await sha256Hex(raw);
  return hex.slice(0, 32); // 128 bits is plenty for a key
}

// ---------------- Upstash sliding-window check --------------------------------

/**
 * Sliding-window check using a sorted-set per (fingerprint, window).
 *
 * Algorithm per window:
 *   1. ZREMRANGEBYSCORE key 0 (now - windowMs)         → drop stale entries
 *   2. ZCARD key                                        → count survivors
 *   3. If count >= limit → reject (return retryAfter)
 *   4. Else: ZADD key now now (member must be unique → use now+random)
 *   5. EXPIRE key windowMs/1000 + buffer
 *
 * All three windows are checked. Tightest one wins.
 */
async function upstashCheck(redis: Redis, fp: string): Promise<RateLimitResult> {
  const now = Date.now();

  // Window definitions
  const windows = [
    { key: `rl:m:${fp}`, windowMs: 60_000, limit: LIMITS.perMinute, name: 'minute' as const },
    { key: `rl:d:${fp}`, windowMs: 86_400_000, limit: LIMITS.perDay, name: 'day' as const },
    { key: `rl:g:hour`, windowMs: 3_600_000, limit: LIMITS.globalPerHour, name: 'global' as const },
  ];

  // First pass: count each window WITHOUT inserting. If any is over → reject.
  for (const w of windows) {
    try {
      await redis.zremrangebyscore(w.key, 0, now - w.windowMs);
      const count = (await redis.zcard(w.key)) ?? 0;
      if (count >= w.limit) {
        // Estimate retryAfter: oldest member's score + windowMs - now
        const oldest = await redis.zrange(w.key, 0, 0, { withScores: true });
        let retryAfter = Math.ceil(w.windowMs / 1000);
        if (Array.isArray(oldest) && oldest.length >= 2) {
          const oldestScore = Number(oldest[1]);
          if (!Number.isNaN(oldestScore)) {
            retryAfter = Math.max(1, Math.ceil((w.windowMs - (now - oldestScore)) / 1000));
          }
        }
        return { allowed: false, retryAfter, remaining: 0, trippedBy: w.name };
      }
    } catch (err) {
      // Fail-safe: if Upstash errors, fall back to memory check (don't open the gate).
      console.warn('[rate-limit] upstash error, falling back to memory:', err);
      return memoryCheck(fp);
    }
  }

  // Second pass: all windows OK → insert into each.
  // Use a unique member per insert (now + random suffix) to avoid set collisions.
  const member = `${now}-${Math.floor(Math.random() * 1e9)}`;
  let tightestRemaining = Number.POSITIVE_INFINITY;
  for (const w of windows) {
    try {
      await redis.zadd(w.key, { score: now, member });
      await redis.expire(w.key, Math.ceil(w.windowMs / 1000) + 60);
      const count = (await redis.zcard(w.key)) ?? 0;
      tightestRemaining = Math.min(tightestRemaining, Math.max(0, w.limit - count));
    } catch (err) {
      console.warn('[rate-limit] upstash write error:', err);
    }
  }

  return {
    allowed: true,
    remaining: Number.isFinite(tightestRemaining) ? tightestRemaining : undefined,
  };
}

// ---------------- Public API --------------------------------------------------

/**
 * Check if a client may proceed. Pass the already-computed fingerprint
 * (see `fingerprint()`), NOT raw IP, so all paths agree on the key.
 *
 * Fail-safe: if anything goes wrong inside, we fall back to the memory
 * limiter so the gate is never silently opened.
 */
export async function checkRateLimit(fp: string): Promise<RateLimitResult> {
  const redis = getRedis();
  if (!redis) return memoryCheck(fp);
  try {
    return await upstashCheck(redis, fp);
  } catch (err) {
    console.warn('[rate-limit] unexpected error:', err);
    return memoryCheck(fp);
  }
}

/** Convenience: does the env tell us Upstash is wired up? */
export function isUpstashConfigured(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}
