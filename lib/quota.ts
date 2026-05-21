// lib/quota.ts — Daily per-visitor question quota (LAYER 2.5).
//
// Limits a fingerprint to N successful LLM responses per 24h window.
// Off-topic queries (Layer 4) and blocked queries (Layers 1/3) DON'T count —
// only successful chat responses consume a slot.
//
// Storage: Upstash Redis key `quota:fp:<fingerprint>`, type=string (counter),
// TTL=86400s set on first increment. Counter is incremented AFTER successful
// LLM stream so that failed/blocked requests don't burn a question.
//
// When the quota fallback applies (Upstash unavailable), the limiter
// fails-OPEN: requests pass through. The L2 rate limit + L8 cost cap still
// protect against abuse — the user-facing "5 questions" is best-effort
// without Redis.

import { Redis } from '@upstash/redis';

export const DAILY_QUESTION_QUOTA = 5;
const QUOTA_TTL_SECONDS = 86_400; // 24h

let redisClient: Redis | null | undefined;

function getRedis(): Redis | null {
  if (redisClient !== undefined) return redisClient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) { redisClient = null; return null; }
  try { redisClient = new Redis({ url, token }); return redisClient; }
  catch { redisClient = null; return null; }
}

export interface QuotaState {
  /** false = block, true = allow this question */
  allowed: boolean;
  /** Questions used so far in the current window. */
  used: number;
  /** Questions remaining after this one (clamped to 0). */
  remaining: number;
  /** Whether we're using the durable Upstash counter (true) or fail-open mode (false). */
  durable: boolean;
}

/**
 * Read the current quota state WITHOUT incrementing. Use this before deciding
 * whether to call the LLM.
 */
export async function checkQuota(fingerprint: string): Promise<QuotaState> {
  const redis = getRedis();
  if (!redis) {
    // Fail-OPEN: without Upstash we can't track persistently. L2+L8 still apply.
    return { allowed: true, used: 0, remaining: DAILY_QUESTION_QUOTA, durable: false };
  }
  try {
    const used = (await redis.get<number>(`quota:fp:${fingerprint}`)) ?? 0;
    const remaining = Math.max(0, DAILY_QUESTION_QUOTA - used);
    return {
      allowed: used < DAILY_QUESTION_QUOTA,
      used,
      remaining,
      durable: true,
    };
  } catch (err) {
    console.warn('[quota] check failed, failing open:', err);
    return { allowed: true, used: 0, remaining: DAILY_QUESTION_QUOTA, durable: false };
  }
}

/**
 * Increment the quota counter for the fingerprint. Idempotently sets TTL on
 * first increment so the counter resets in 24h.
 *
 * Call AFTER the LLM stream completes successfully — failed requests should
 * not consume a question slot.
 */
export async function incrementQuota(fingerprint: string): Promise<number> {
  const redis = getRedis();
  if (!redis) return 0;
  const key = `quota:fp:${fingerprint}`;
  try {
    const used = await redis.incr(key);
    // Set TTL only on first increment (when count == 1). Subsequent INCRs
    // preserve the existing TTL so the window doesn't slide forward.
    if (used === 1) {
      await redis.expire(key, QUOTA_TTL_SECONDS);
    }
    return used;
  } catch (err) {
    console.warn('[quota] increment failed:', err);
    return 0;
  }
}
