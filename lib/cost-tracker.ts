// lib/cost-tracker.ts — Daily cost ceiling for the public agent endpoint.
//
// LAYER 8 of the defense stack. See api/agent.ts header for the full layering.
//
// ENV VARS (optional, enables persistence):
//   UPSTASH_REDIS_REST_URL
//   UPSTASH_REDIS_REST_TOKEN
//   AGENT_DAILY_COST_USD     — daily ceiling in USD (default: "1" → $1/day)
//
// Pricing (Claude Haiku 4.5, as of 2026-05):
//   $0.80 per 1M input tokens
//   $4.00 per 1M output tokens
//
// API:
//   await getTodayCostUsd()      → current spend or 0 if no Redis
//   await isOverDailyCap()        → boolean, fail-safe = false (allow)
//   await recordUsage(in, out)    → no-op when no Redis
//
// We approximate cost from token counts the model returns. Before we have
// counts (i.e. BEFORE the request is fired), we only enforce the previous
// total against the cap. After the request, we record the new usage. This
// means we can overshoot by at most one request's worth of tokens — fine for
// a $1/day ceiling on a portfolio site.

import { Redis } from '@upstash/redis';

const PRICING = {
  inputUsdPerToken: 0.80 / 1_000_000,
  outputUsdPerToken: 4.00 / 1_000_000,
} as const;

let redisClient: Redis | null | undefined;

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

function dailyKey(): string {
  return `agent:cost:${new Date().toISOString().slice(0, 10)}`;
}

function hourlyKey(): string {
  // ISO: 2026-05-21T03 → bucket per UTC hour
  return `agent:cost:h:${new Date().toISOString().slice(0, 13)}`;
}

function dailyCapUsd(): number {
  const raw = process.env.AGENT_DAILY_COST_USD;
  const parsed = raw ? Number(raw) : 1;
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return parsed;
}

function hourlyCapUsd(): number {
  const raw = process.env.AGENT_HOURLY_COST_USD;
  const parsed = raw ? Number(raw) : 0.3;
  if (!Number.isFinite(parsed) || parsed <= 0) return 0.3;
  return parsed;
}

export function approximateCostUsd(inputTokens: number, outputTokens: number): number {
  return inputTokens * PRICING.inputUsdPerToken + outputTokens * PRICING.outputUsdPerToken;
}

/** Current accumulated USD spend today. Returns 0 if Redis is not configured. */
export async function getTodayCostUsd(): Promise<number> {
  const redis = getRedis();
  if (!redis) return 0;
  try {
    const raw = await redis.get<number | string | null>(dailyKey());
    if (raw === null || raw === undefined) return 0;
    const n = typeof raw === 'string' ? Number(raw) : raw;
    return Number.isFinite(n) ? Number(n) : 0;
  } catch {
    // Fail-safe: do NOT block on tracker errors.
    return 0;
  }
}

/** Current accumulated USD spend in the current UTC hour bucket. */
export async function getHourCostUsd(): Promise<number> {
  const redis = getRedis();
  if (!redis) return 0;
  try {
    const raw = await redis.get<number | string | null>(hourlyKey());
    if (raw === null || raw === undefined) return 0;
    const n = typeof raw === 'string' ? Number(raw) : raw;
    return Number.isFinite(n) ? Number(n) : 0;
  } catch {
    return 0;
  }
}

/** Hard cap check (daily). Fail-safe = false (do not block) on tracker errors. */
export async function isOverDailyCap(): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  try {
    const cost = await getTodayCostUsd();
    return cost >= dailyCapUsd();
  } catch {
    return false;
  }
}

/** Hard cap check (hourly). Catches burst attacks that would only trip
 *  the daily cap after eating most of today's budget in a few minutes. */
export async function isOverHourlyCap(): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  try {
    const cost = await getHourCostUsd();
    return cost >= hourlyCapUsd();
  } catch {
    return false;
  }
}

/** Add usage to today's AND this hour's tally. No-op if Redis missing. Never throws. */
export async function recordUsage(inputTokens: number, outputTokens: number): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  const cost = approximateCostUsd(
    Math.max(0, inputTokens | 0),
    Math.max(0, outputTokens | 0),
  );
  if (!Number.isFinite(cost) || cost <= 0) return;
  try {
    await redis.incrbyfloat(dailyKey(), cost);
    await redis.expire(dailyKey(), 60 * 60 * 48);
    await redis.incrbyfloat(hourlyKey(), cost);
    // Hourly key lives 2h so the window can be inspected after it closes
    await redis.expire(hourlyKey(), 60 * 60 * 2);
  } catch (err) {
    try {
      console.warn('[cost-tracker] record failed:', err);
    } catch {
      /* swallow */
    }
  }
}
