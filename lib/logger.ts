// lib/logger.ts — Structured security event logging for the public agent endpoint.
//
// LAYER 7 of the defense stack. See api/agent.ts header for the full layering.
//
// ENV VARS (optional, enables persisted logs):
//   UPSTASH_REDIS_REST_URL    — same Redis used by rate-limit
//   UPSTASH_REDIS_REST_TOKEN  — same Redis used by rate-limit
//   IP_HASH_SECRET            — random string (used to hash IPs in stored events)
//
// When env vars are set:
//   - Each event is pushed to a capped Redis list `agent:events` (LPUSH + LTRIM to 1000).
//   - Blocked events (origin/injection/topic/cost) are also incremented in
//     daily counters: `agent:counters:YYYY-MM-DD:<type>` (TTL 7 days).
//
// When env vars are NOT set:
//   - Blocked events go to console.warn (visible in `vercel logs`).
//   - "request" + "llm_response" events are dropped (would be too noisy
//     without persistence).
//
// NOTE: never log raw inputs/outputs. Only metadata (length, latency, type).

import { Redis } from '@upstash/redis';

export type AgentEventType =
  | 'request'           // accepted, sent to LLM
  | 'blocked_origin'    // L1 failure
  | 'blocked_method'    // L1 failure
  | 'blocked_content_type' // L1 failure
  | 'rate_limited'      // L2 failure
  | 'blocked_input'     // L3 failure (validation or injection regex)
  | 'topic_gated'       // L4 cheap fallback
  | 'llm_response'      // L5/L6 success
  | 'output_sanitized'  // L6 stripped something
  | 'cost_capped'       // L8 hard cap hit
  | 'quota_exhausted'   // per-visitor daily quota reached → CTA streamed
  | 'error';            // unexpected

export interface AgentEvent {
  type: AgentEventType;
  ipHash?: string;
  uaHash?: string;
  inputLength?: number;
  outputLength?: number;
  latencyMs?: number;
  status?: number;
  /** short tag for blocked_input: 'too_long' | 'non_printable' | 'injection' | 'shape' */
  reason?: string;
  /** which rate-limit window tripped, if applicable */
  trippedBy?: string;
}

const enc = new TextEncoder();

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Hash an IP for storage — never store raw IPs. */
export async function hashIp(ip: string): Promise<string> {
  const salt = process.env.IP_HASH_SECRET ?? 'gustavo-default-iphash-salt-2026';
  const hex = await sha256Hex(`ip|${ip}|${salt}`);
  return hex.slice(0, 16);
}

/** Hash a UA for storage. */
export async function hashUa(ua: string): Promise<string> {
  const salt = process.env.IP_HASH_SECRET ?? 'gustavo-default-iphash-salt-2026';
  const hex = await sha256Hex(`ua|${ua}|${salt}`);
  return hex.slice(0, 12);
}

// ---------------- Upstash client ---------------------------------------------

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

const BLOCKED_TYPES = new Set<AgentEventType>([
  'blocked_origin',
  'blocked_method',
  'blocked_content_type',
  'rate_limited',
  'blocked_input',
  'topic_gated',
  'output_sanitized',
  'cost_capped',
  'error',
]);

/** Log a security event. Never throws — logging must never break the request. */
export async function logEvent(event: AgentEvent): Promise<void> {
  const enriched = {
    ...event,
    ts: new Date().toISOString(),
  };

  const redis = getRedis();
  if (!redis) {
    // Fallback: console.warn for blocked events only (avoid spam for successful flows).
    if (BLOCKED_TYPES.has(event.type)) {
      try {
        console.warn('[agent-security]', JSON.stringify(enriched));
      } catch {
        /* never bubble */
      }
    }
    return;
  }

  try {
    const day = new Date().toISOString().slice(0, 10);
    // Push to a capped event ring (last 1000 events).
    await redis.lpush('agent:events', JSON.stringify(enriched));
    await redis.ltrim('agent:events', 0, 999);
    // Daily counters for blocked types.
    if (BLOCKED_TYPES.has(event.type)) {
      const key = `agent:counters:${day}:${event.type}`;
      await redis.incr(key);
      await redis.expire(key, 60 * 60 * 24 * 7); // 7 days
    }
  } catch (err) {
    // Never let logging errors break the request.
    try {
      console.warn('[agent-security] logging failed:', err);
    } catch {
      /* swallow */
    }
  }
}
