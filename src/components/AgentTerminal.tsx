// AgentTerminal.tsx — sessão "talk-to-my-agent" inspirada em imflorea.dev.
// Terminal aesthetic: prompt monospace, status badge, suggestion chips, streaming reply.
// Backend: /api/agent (AI SDK v6 streaming → Anthropic Haiku 4.5).

import { useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

const SUGGESTIONS = [
  'qual seu stack?',
  'me mostra um projeto',
  'tá disponível?',
  '/help',
];

// Mirror the server's hard cap (api/agent.ts → MAX_INPUT_CHARS). Keep this in
// sync if you change the server. UI just shortcircuits before the request hits
// the network; server still enforces the same limit.
const MAX_CHARS = 500;

type StatusLabel = 'IDLE' | 'THINKING' | 'STREAMING' | 'ERROR';

function getStatusLabel(status: string, hasError: boolean): StatusLabel {
  if (hasError) return 'ERROR';
  if (status === 'submitted') return 'THINKING';
  if (status === 'streaming') return 'STREAMING';
  return 'IDLE';
}

function getMessageText(message: { parts?: Array<{ type: string; text?: string }> }) {
  if (!message.parts) return '';
  return message.parts
    .filter((p) => p.type === 'text')
    .map((p) => p.text ?? '')
    .join('');
}

export default function AgentTerminal() {
  const transport = useMemo(
    () => new DefaultChatTransport({ api: '/api/agent' }),
    []
  );

  const { messages, sendMessage, status, error } = useChat({ transport });

  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const startedAtRef = useRef<Record<string, number>>({});
  const [respTimes, setRespTimes] = useState<Record<string, number>>({});

  const statusLabel = getStatusLabel(status, !!error);
  const isBusy = status === 'streaming' || status === 'submitted';

  // Mede tempo de resposta — start no sendMessage, end quando a msg do assistant aparece
  useEffect(() => {
    if (status === 'ready') {
      const last = messages[messages.length - 1];
      if (last?.role === 'assistant' && startedAtRef.current[last.id] && !respTimes[last.id]) {
        const elapsed = (Date.now() - startedAtRef.current[last.id]) / 1000;
        setRespTimes((prev) => ({ ...prev, [last.id]: Math.round(elapsed * 10) / 10 }));
      }
    }
  }, [status, messages, respTimes]);

  // Auto-scroll do log
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [messages]);

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isBusy) return;
    // Marca timestamp da request — vai casar com a próxima mensagem assistant
    const tempKey = `__pending_${Date.now()}`;
    startedAtRef.current[tempKey] = Date.now();
    // Re-key quando a próxima assistant message chegar
    queueMicrotask(() => {
      // sendMessage do AI SDK v6 aceita { text } pra mensagem simples de user
      void sendMessage({ text: trimmed });
    });
    // Mapeia tempKey → id real depois (na hora que o assistant message aparece)
    // Truque: usar setInterval seria messy. Vamos só medir do startedAt do __último user__ ID.
    setInput('');
  };

  // Hook alt: sempre que uma user message é adicionada, registra startedAt nela
  useEffect(() => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUser && !startedAtRef.current[lastUser.id]) {
      startedAtRef.current[lastUser.id] = Date.now();
    }
    // E pareia user→assistant: quando assistant chega depois de um user, copia o startedAt
    for (let i = 0; i < messages.length - 1; i++) {
      const cur = messages[i];
      const next = messages[i + 1];
      if (cur.role === 'user' && next.role === 'assistant') {
        if (startedAtRef.current[cur.id] && !startedAtRef.current[next.id]) {
          startedAtRef.current[next.id] = startedAtRef.current[cur.id];
        }
      }
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit(input);
  };

  const handleChipClick = (s: string) => {
    setInput(s);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Tab pra autocompletar com a primeira suggestion se input estiver vazio
    if (e.key === 'Tab' && !input.trim()) {
      e.preventDefault();
      setInput(SUGGESTIONS[0]);
    }
  };

  return (
    <section className="agent-terminal" id="agent">
      {/* Window frame envolvendo tudo — vibe de janela de terminal real */}
      <div className="agent-terminal__window">
        {/* Chrome / title bar — dots Mac-style + título */}
        <div className="agent-terminal__chrome">
          <div className="agent-terminal__dots" aria-hidden="true">
            <span className="agent-terminal__dot agent-terminal__dot--red" />
            <span className="agent-terminal__dot agent-terminal__dot--amber" />
            <span className="agent-terminal__dot agent-terminal__dot--green" />
          </div>
          <span className="agent-terminal__brand">
            GUSTAVOTEIXEIRA.DEV — TALK-TO-MY-AGENT
          </span>
          <span className={`agent-terminal__status agent-terminal__status--${statusLabel.toLowerCase()}`}>
            <span className="agent-terminal__status-dot" />
            LOCAL · {statusLabel}
          </span>
        </div>

        {/* Shell — scrollable area com welcome + log */}
        <div className="agent-terminal__shell">
          {/* Welcome card + suggestions */}
          <div className="agent-terminal__panel">
        <h2 className="agent-terminal__welcome">welcome.</h2>
        <p className="agent-terminal__body">
          treinado nos projetos, stack e experiência do gustavo. pergunte sobre o
          que ele faz, com quem trabalhou, ou se está disponível.
        </p>
        <p className="agent-terminal__disclaimer">
          ⚠ este recurso usa IA. respostas podem ser imprecisas — sempre verifique.
        </p>

        <p className="agent-terminal__try">
          <span className="agent-terminal__try-dollar">$</span> try one{' '}
          <span className="agent-terminal__try-arrow">›</span>
        </p>

        <div className="agent-terminal__chips">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className="agent-terminal__chip"
              onClick={() => handleChipClick(s)}
              disabled={isBusy}
            >
              [ {s} ]
            </button>
          ))}
        </div>
      </div>

      {/* Conversation log */}
      {messages.length > 0 && (
        <div className="agent-terminal__log" ref={logRef}>
          {messages.map((m) => {
            const text = getMessageText(m);
            if (m.role === 'user') {
              return (
                <div className="agent-terminal__row agent-terminal__row--user" key={m.id}>
                  <span className="agent-terminal__prompt">
                    <span className="agent-terminal__prompt-client">client</span>
                    <span className="agent-terminal__prompt-at">@</span>
                    <span className="agent-terminal__prompt-host">gustavo</span>
                    <span className="agent-terminal__prompt-tilde"> ~ </span>
                    <span className="agent-terminal__prompt-percent">%</span>
                  </span>
                  <span className="agent-terminal__user-text"> {text}</span>
                </div>
              );
            }
            return (
              <div className="agent-terminal__row agent-terminal__row--bot" key={m.id}>
                <span className="agent-terminal__bot-icon" aria-hidden="true">G</span>
                <div className="agent-terminal__bot-body">
                  <div className="agent-terminal__bot-text">{text || <em>…</em>}</div>
                  {respTimes[m.id] !== undefined && (
                    <div className="agent-terminal__meta">
                      [answered in {respTimes[m.id]}s]
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {status === 'submitted' && (
            <div className="agent-terminal__row agent-terminal__row--bot">
              <span className="agent-terminal__bot-icon" aria-hidden="true">G</span>
              <div className="agent-terminal__bot-body">
                <div className="agent-terminal__bot-text agent-terminal__bot-text--thinking">
                  <span className="agent-terminal__blink">▌</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

        </div>
        {/* /shell */}

        {/* Input row — sempre fixed no bottom da janela */}
        <form className="agent-terminal__input-row" onSubmit={handleSubmit}>
        <span className="agent-terminal__prompt">
          <span className="agent-terminal__prompt-client">client</span>
          <span className="agent-terminal__prompt-at">@</span>
          <span className="agent-terminal__prompt-host">gustavo</span>
          <span className="agent-terminal__prompt-tilde"> ~ </span>
          <span className="agent-terminal__prompt-percent">%</span>
        </span>
        <input
          ref={inputRef}
          type="text"
          className="agent-terminal__input"
          value={input}
          onChange={(e) => setInput(e.target.value.slice(0, MAX_CHARS))}
          onKeyDown={handleKeyDown}
          maxLength={MAX_CHARS}
          disabled={isBusy}
          placeholder={isBusy ? '' : 'pergunte algo...'}
          aria-label="Pergunta ao agente"
          autoComplete="off"
          spellCheck={false}
        />
        {input.length === 0 && !isBusy && (
          <span className="agent-terminal__cursor-block" aria-hidden="true" />
        )}
        <span className="agent-terminal__hint">tab ⇥ to use</span>
        <span className="agent-terminal__counter">
          {input.length}/{MAX_CHARS}
        </span>
        </form>

        {error && (
          <p className="agent-terminal__error">
            erro: {error.message || 'request failed'}
          </p>
        )}
      </div>
      {/* /window */}
    </section>
  );
}
