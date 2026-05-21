// lib/fake-stream.ts — Emit a single "fake" assistant message in the AI SDK v6
// UI message stream format, without calling the LLM.
//
// Used by:
//   - Layer 4 (topic gate): when input is off-topic, we return the fallback as
//     a streamed assistant message so the React client doesn't need to know
//     anything special happened.
//   - Layer 6 (prompt-leak detection): if the real stream leaked, we abandon
//     it and emit the fallback instead.
//
// FORMAT (UI Message Stream, the wire format `result.toUIMessageStreamResponse()`
// emits):
//
//   data: {"type":"start"}
//   data: {"type":"start-step"}
//   data: {"type":"text-start","id":"<id>"}
//   data: {"type":"text-delta","id":"<id>","delta":"hello"}
//   data: {"type":"text-end","id":"<id>"}
//   data: {"type":"finish-step"}
//   data: {"type":"finish"}
//   data: [DONE]
//
// We use a minimal subset compatible with the AI SDK v6 React client parser
// (useChat). The client only requires start/text-delta/finish + [DONE].

export interface FakeStreamOptions {
  text: string;
  /** Stable identifier for the synthetic text part. */
  id?: string;
  /** Extra headers to merge into the response (e.g. `x-quota-remaining`). */
  extraHeaders?: Record<string, string>;
}

export function buildFakeMessageStream({ text, id, extraHeaders }: FakeStreamOptions): Response {
  const encoder = new TextEncoder();
  const textId = id ?? `synthetic-${Date.now()}`;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      send({ type: 'start' });
      send({ type: 'start-step' });
      send({ type: 'text-start', id: textId });
      // Send as one chunk — message is tiny so no need to fake multi-frame.
      send({ type: 'text-delta', id: textId, delta: text });
      send({ type: 'text-end', id: textId });
      send({ type: 'finish-step' });
      send({ type: 'finish' });
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      // Hint AI SDK we are speaking the UI message stream protocol.
      'x-vercel-ai-ui-message-stream': 'v1',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      ...(extraHeaders ?? {}),
    },
  });
}
