// api/agent.ts — Public, streaming AI agent endpoint for gustavoteixeira.dev.
//
// =============================================================================
// DEFENSE LAYERS (in execution order)
// =============================================================================
//   L1  Origin / method / content-type allowlist     → checkRequestShape()
//   L2  Persistent rate limit (per-FP + global)      → checkRateLimit()
//   L3  Input validation (length, charset, injection)→ validateUserInput()
//   L4  Cheap topic gate (keyword whitelist)         → checkTopic()
//   L5  Hardened system prompt + topic enforcement   → AGENT_SYSTEM_PROMPT
//   L6  Output sanitizer (URL allowlist + leak kill) → sanitizeUiMessageStream()
//   L7  Structured logging of security events        → logEvent()
//   L8  Daily cost cap                               → isOverDailyCap()
//
// =============================================================================
// ENV VARS
// =============================================================================
//   ANTHROPIC_API_KEY         (REQUIRED) — `sk-ant-...` for Anthropic provider.
//   UPSTASH_REDIS_REST_URL    (optional) — enables L2 persistence + L7 + L8.
//   UPSTASH_REDIS_REST_TOKEN  (optional) — companion token.
//   IP_HASH_SECRET            (optional) — random string; salts the IP+UA hash
//                                          used in L2 fingerprinting + L7 logs.
//   AGENT_DAILY_COST_USD      (optional) — override the $1/day default cap.
//
// Without Upstash vars set, the endpoint still works: L2 falls back to an
// in-memory limiter, L7 console.warns blocked events, L8 is disabled
// (returns false from isOverDailyCap, so requests pass).
//
// =============================================================================
// Runtime
// =============================================================================
// Vercel Edge runtime. NO Node APIs. All crypto is Web Crypto. Streaming uses
// `result.toUIMessageStreamResponse()` from AI SDK v6, optionally wrapped by
// our sanitizing Transform.

import { streamText, type UIMessage, type ModelMessage } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { AGENT_SYSTEM_PROMPT } from '../src/data/agent-context';
import {
  MAX_INPUT_CHARS,
  checkRequestShape,
  checkTopic,
  detectLanguage,
  extractIp,
  extractUserAgent,
  fallbackMessage,
  validateUserInput,
} from '../lib/agent-guard';
import { checkRateLimit, fingerprint } from '../lib/rate-limit';
import { hashIp, hashUa, logEvent } from '../lib/logger';
import { isOverDailyCap, recordUsage } from '../lib/cost-tracker';
import { sanitizeUiMessageStream } from '../lib/stream-sanitizer';
import { buildFakeMessageStream } from '../lib/fake-stream';
import { checkQuota, incrementQuota, DAILY_QUESTION_QUOTA } from '../lib/quota';

export const config = {
  runtime: 'edge',
};

// ---------------- Helpers ---------------------------------------------------

function extractText(message: UIMessage): string {
  if (!message?.parts) return '';
  return message.parts
    .filter((p: { type: string }) => p.type === 'text')
    .map((p: { type: string; text?: string }) => p.text ?? '')
    .join('');
}

/** Generic JSON error response — never leak internal reasons to the client. */
function jsonError(status: number, message: string, extraHeaders: HeadersInit = {}): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

// ---------------- Handler ---------------------------------------------------

export default async function handler(req: Request): Promise<Response> {
  const startedAt = Date.now();

  // Pre-compute hashes for logging (cheap; always done).
  const ip = extractIp(req);
  const ua = extractUserAgent(req);
  const [ipHashed, uaHashed] = await Promise.all([hashIp(ip), hashUa(ua)]);

  // === LAYER 1 — Origin / method / content-type =============================
  // Method check first (cheapest), then content-type, then origin.
  // We use a generic "forbidden" error for ALL L1 failures — no info leak.
  const shape = checkRequestShape(req);
  if (!shape.ok) {
    const event =
      shape.reason === 'method'
        ? 'blocked_method'
        : shape.reason === 'content-type'
        ? 'blocked_content_type'
        : 'blocked_origin';
    await logEvent({ type: event, ipHash: ipHashed, uaHash: uaHashed, status: 403 });
    if (shape.reason === 'method') {
      return jsonError(405, 'method not allowed', { Allow: 'POST' });
    }
    return jsonError(403, 'forbidden');
  }

  // === LAYER 8 — Daily cost cap (pre-flight) ================================
  // Block BEFORE we burn tokens. Fail-safe = allow (returns false) if Upstash
  // is unavailable.
  if (await isOverDailyCap()) {
    await logEvent({ type: 'cost_capped', ipHash: ipHashed, uaHash: uaHashed, status: 503 });
    return jsonError(503, 'service temporarily unavailable');
  }

  // === LAYER 2 — Rate limit =================================================
  const fp = await fingerprint(ip, ua);
  const rl = await checkRateLimit(fp);
  if (!rl.allowed) {
    await logEvent({
      type: 'rate_limited',
      ipHash: ipHashed,
      uaHash: uaHashed,
      status: 429,
      trippedBy: rl.trippedBy,
    });
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (rl.retryAfter) (headers as Record<string, string>)['Retry-After'] = String(rl.retryAfter);
    return new Response(
      JSON.stringify({ error: 'too many requests' }),
      { status: 429, headers },
    );
  }

  // === Parse body ===========================================================
  let messages: UIMessage[];
  try {
    const body = (await req.json()) as { messages?: UIMessage[] };
    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      await logEvent({
        type: 'blocked_input',
        ipHash: ipHashed,
        uaHash: uaHashed,
        status: 400,
        reason: 'shape',
      });
      return jsonError(400, 'invalid input');
    }
    messages = body.messages;
  } catch {
    await logEvent({
      type: 'blocked_input',
      ipHash: ipHashed,
      uaHash: uaHashed,
      status: 400,
      reason: 'shape',
    });
    return jsonError(400, 'invalid input');
  }

  // Hard cap on conversation length to prevent context-stuffing attacks.
  if (messages.length > 40) {
    await logEvent({
      type: 'blocked_input',
      ipHash: ipHashed,
      uaHash: uaHashed,
      status: 400,
      reason: 'shape',
    });
    return jsonError(400, 'invalid input');
  }

  // === LAYER 3 — Input validation on the LATEST user message ================
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'user') {
    await logEvent({
      type: 'blocked_input',
      ipHash: ipHashed,
      uaHash: uaHashed,
      status: 400,
      reason: 'shape',
    });
    return jsonError(400, 'invalid input');
  }
  const userText = extractText(last);
  const inputCheck = validateUserInput(userText);
  if (!inputCheck.ok) {
    await logEvent({
      type: 'blocked_input',
      ipHash: ipHashed,
      uaHash: uaHashed,
      inputLength: userText.length,
      reason: inputCheck.reason,
      status: 400,
    });
    return jsonError(400, 'invalid input');
  }

  // Also validate all prior user messages for length/charset (cheap, prevents
  // injection via earlier turns). Skip injection-regex on prior turns to allow
  // benign conversation history through.
  for (const m of messages) {
    if (m.role !== 'user') continue;
    const t = extractText(m);
    if (t.length > MAX_INPUT_CHARS) {
      await logEvent({
        type: 'blocked_input',
        ipHash: ipHashed,
        uaHash: uaHashed,
        inputLength: t.length,
        reason: 'too_long',
        status: 400,
      });
      return jsonError(400, 'invalid input');
    }
  }

  const lang = detectLanguage(userText);

  // === Quota check (per-visitor daily limit) ===============================
  // Read remaining BEFORE deciding the flow so we can attach x-quota-remaining
  // on every response (LLM, topic-gated, exhausted).
  const quota = await checkQuota(fp);

  // === LAYER 4 — Topic gate (cheap, no LLM call) ===========================
  const topic = checkTopic(userText);
  if (!topic.onTopic && !topic.isGreetingOrMeta) {
    // Stream the fallback as a synthetic assistant message — no token spend.
    // Off-topic does NOT consume a quota slot — preserves current remaining.
    await logEvent({
      type: 'topic_gated',
      ipHash: ipHashed,
      uaHash: uaHashed,
      inputLength: userText.length,
      latencyMs: Date.now() - startedAt,
      status: 200,
    });
    return buildFakeMessageStream({
      text: fallbackMessage(lang),
      extraHeaders: { 'X-Quota-Remaining': String(quota.remaining) },
    });
  }

  // === Quota exhausted → CTA stream (no LLM call) ==========================
  if (!quota.allowed) {
    await logEvent({
      type: 'quota_exhausted',
      ipHash: ipHashed,
      uaHash: uaHashed,
      inputLength: userText.length,
      latencyMs: Date.now() - startedAt,
      status: 200,
    });
    const cta =
      lang === 'pt'
        ? `você atingiu seu limite diário de ${DAILY_QUESTION_QUOTA} perguntas. pra continuar a conversa, fala comigo direto:\n\nWhatsApp: https://wa.me/19177028156\nemail: gustavo.guitar.teixeira@gmail.com`
        : `you've reached your daily limit of ${DAILY_QUESTION_QUOTA} questions. to keep talking, reach me directly:\n\nWhatsApp: https://wa.me/19177028156\nemail: gustavo.guitar.teixeira@gmail.com`;
    return buildFakeMessageStream({
      text: cta,
      extraHeaders: {
        'X-Quota-Remaining': '0',
        'X-Quota-Exhausted': '1',
      },
    });
  }

  // === Build model messages =================================================
  const modelMessages: ModelMessage[] = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: extractText(m),
    }));

  // === LAYER 5 — Hardened system prompt enforced by streamText =============
  try {
    const result = streamText({
      model: anthropic('claude-haiku-4-5'),
      system: AGENT_SYSTEM_PROMPT,
      messages: modelMessages,
      temperature: 0.4,
      maxOutputTokens: 350,
      // After the LLM call settles, record token usage for L8 + log + bump quota.
      onFinish: async ({ usage }) => {
        try {
          const inputTokens = Number(usage?.inputTokens ?? 0);
          const outputTokens = Number(usage?.outputTokens ?? 0);
          await recordUsage(inputTokens, outputTokens);
          // Only successful LLM responses consume a quota slot.
          await incrementQuota(fp);
          await logEvent({
            type: 'llm_response',
            ipHash: ipHashed,
            uaHash: uaHashed,
            inputLength: userText.length,
            latencyMs: Date.now() - startedAt,
            status: 200,
          });
        } catch {
          /* never bubble */
        }
      },
    });

    // === LAYER 6 — Sanitize the output stream in-flight =====================
    const upstream = result.toUIMessageStreamResponse();
    if (!upstream.body) {
      await logEvent({ type: 'error', ipHash: ipHashed, uaHash: uaHashed, status: 502 });
      return jsonError(502, 'upstream error');
    }
    const sanitized = sanitizeUiMessageStream(upstream.body, {
      language: lang,
      onSanitized: ({ urlsStripped, leakDetected }) => {
        if (urlsStripped > 0 || leakDetected) {
          void logEvent({
            type: 'output_sanitized',
            ipHash: ipHashed,
            uaHash: uaHashed,
            reason: leakDetected ? 'leak' : 'url',
            status: 200,
          });
        }
      },
    });

    // Preserve original headers (content-type, ai-ui-message-stream) but
    // add strict security headers + quota signal for the client.
    const headers = new Headers(upstream.headers);
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'no-referrer');
    headers.set('Cache-Control', 'no-store');
    headers.set('X-Robots-Tag', 'noindex, nofollow');
    // Remaining AFTER this question succeeds (current minus 1, clamped). The
    // client uses this to render the counter and switch to CTA mode at 0.
    headers.set('X-Quota-Remaining', String(Math.max(0, quota.remaining - 1)));

    return new Response(sanitized, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  } catch (err) {
    // Fail-safe: error → generic 500, no stack trace, log it.
    try {
      console.error('[agent] error:', err);
    } catch {
      /* swallow */
    }
    await logEvent({
      type: 'error',
      ipHash: ipHashed,
      uaHash: uaHashed,
      status: 500,
      latencyMs: Date.now() - startedAt,
    });
    return jsonError(500, 'internal error');
  }
}
