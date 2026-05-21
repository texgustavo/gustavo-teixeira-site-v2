// lib/stream-sanitizer.ts — Inline sanitizer for AI SDK v6 UI message streams.
//
// LAYER 6 of the defense stack. See api/agent.ts header.
//
// AI SDK v6 toUIMessageStreamResponse() emits SSE frames where each event is
// `data: ${JSON.stringify(obj)}\n\n`. The known event types we care about:
//
//   { type: 'start' }
//   { type: 'start-step' }
//   { type: 'text-start', id }
//   { type: 'text-delta', id, delta }
//   { type: 'text-end', id }
//   { type: 'finish-step' }
//   { type: 'finish' }
//   [DONE]
//
// We parse each `data:` line, scan text-delta `delta` fields, and rewrite
// when needed. Everything else passes through untouched.
//
// Two outcomes per stream:
//   - URL not in allowlist            → replace inline with "[link removed]"
//   - System-prompt leak detected     → kill stream early, swap the offending
//     delta for the fallback message. Subsequent input is drained but discarded
//     (we still pass through finish/finish-step/[DONE] events so the client's
//     state machine closes cleanly).
//
// Because URLs can be split across two deltas, we buffer the end of each
// delta until the next one arrives or until `text-end`.

import { fallbackMessage, looksLikePromptLeak, sanitizeUrls } from './agent-guard';

const URL_TAIL_BUFFER = 80;

interface SanitizerOptions {
  language: 'pt' | 'en';
  onSanitized?: (info: { urlsStripped: number; leakDetected: boolean }) => void;
}

export function sanitizeUiMessageStream(
  input: ReadableStream<Uint8Array>,
  opts: SanitizerOptions,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let lineBuffer = '';
  // Per-id tail buffers: the AI SDK gives each text part a stable id, and we
  // keep the held-back tail of the most recent delta keyed by that id so that
  // a URL split across deltas can be reassembled before sanitization.
  const tailById = new Map<string, string>();
  let urlsStripped = 0;
  let leakDetected = false;

  // We emit the "killed" replacement only ONCE per text id, then drop
  // subsequent deltas for that id. Control events (finish, etc.) still pass.
  const killedIds = new Set<string>();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = input.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          lineBuffer += decoder.decode(value, { stream: true });
          let newlineIdx: number;
          while ((newlineIdx = lineBuffer.indexOf('\n')) !== -1) {
            const rawLine = lineBuffer.slice(0, newlineIdx);
            lineBuffer = lineBuffer.slice(newlineIdx + 1);
            emit(controller, processLine(rawLine), true);
          }
        }
        // Stream ended. Flush any remaining lineBuffer and tails.
        if (lineBuffer.length > 0) {
          emit(controller, processLine(lineBuffer), false);
        }
        // Final flush: any leftover tail that wasn't closed by text-end.
        for (const [id, tail] of tailById) {
          if (!tail || killedIds.has(id)) continue;
          const { text: cleaned, changed } = sanitizeUrls(tail);
          if (changed) urlsStripped++;
          if (cleaned) {
            const payload = JSON.stringify({ type: 'text-delta', id, delta: cleaned });
            controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
          }
        }
      } catch (err) {
        try {
          console.warn('[stream-sanitizer] error:', err);
        } catch {
          /* swallow */
        }
      } finally {
        opts.onSanitized?.({ urlsStripped, leakDetected });
        controller.close();
      }
    },
  });

  // --- helpers ---

  function emit(
    controller: ReadableStreamDefaultController<Uint8Array>,
    out: string | null,
    trailingNewline: boolean,
  ): void {
    if (out === null) return;
    const suffix = trailingNewline ? '\n' : '';
    controller.enqueue(encoder.encode(out + suffix));
  }

  /**
   * Process a single line from the SSE wire.
   * Returns the line to forward (possibly rewritten) or null to swallow.
   */
  function processLine(line: string): string | null {
    // Blank lines: forward (these terminate SSE events).
    if (line === '' || line === '\r') return line;
    if (!line.startsWith('data:')) return line;

    const payload = line.slice(5).trimStart();
    if (payload === '[DONE]') return line;

    let obj: unknown;
    try {
      obj = JSON.parse(payload);
    } catch {
      return line; // unknown shape, pass through
    }
    if (!obj || typeof obj !== 'object') return line;

    const event = obj as { type?: string; delta?: string; id?: string; text?: string };
    const id = typeof event.id === 'string' ? event.id : '__default__';

    if (event.type === 'text-end') {
      // Flush any tail we were holding for this id.
      const tail = tailById.get(id) ?? '';
      tailById.delete(id);
      if (killedIds.has(id) || !tail) return line; // pass through text-end
      // Sanitize the tail and emit it as a final delta BEFORE the text-end.
      const { text: cleaned, changed } = sanitizeUrls(tail);
      if (changed) urlsStripped++;
      if (cleaned) {
        const before = JSON.stringify({ type: 'text-delta', id, delta: cleaned });
        // We need to emit two lines: the flush delta + the original text-end.
        return `data: ${before}\n\ndata: ${payload}`;
      }
      return line;
    }

    if (event.type !== 'text-delta' && event.type !== 'text') {
      return line;
    }

    // From here on it's a text delta.
    if (killedIds.has(id)) {
      // Discard further deltas after a kill.
      return null;
    }

    const deltaText =
      typeof event.delta === 'string'
        ? event.delta
        : typeof event.text === 'string'
        ? event.text
        : '';
    if (!deltaText) return line;

    const tail = tailById.get(id) ?? '';
    const combined = tail + deltaText;

    if (looksLikePromptLeak(combined)) {
      leakDetected = true;
      killedIds.add(id);
      tailById.delete(id);
      const replacement = JSON.stringify({
        type: 'text-delta',
        id,
        delta: fallbackMessage(opts.language),
      });
      return `data: ${replacement}`;
    }

    const releaseBoundary = findReleaseBoundary(
      combined,
      Math.max(0, combined.length - URL_TAIL_BUFFER),
    );
    const release = combined.slice(0, releaseBoundary);
    const newTail = combined.slice(releaseBoundary);
    tailById.set(id, newTail);

    if (!release) {
      // Holding everything as tail this turn — swallow.
      return null;
    }

    const { text: cleaned, changed } = sanitizeUrls(release);
    if (changed) urlsStripped++;

    const newPayload = JSON.stringify({
      type: 'text-delta',
      id,
      delta: cleaned,
    });
    return `data: ${newPayload}`;
  }
}

function findReleaseBoundary(text: string, target: number): number {
  if (target <= 0) return 0;
  if (target >= text.length) return text.length;
  const minBoundary = Math.max(0, target - 32);
  for (let i = target; i >= minBoundary; i--) {
    const ch = text.charCodeAt(i);
    if (ch === 32 || ch === 10 || ch === 13 || ch === 9) return i;
  }
  return target;
}
