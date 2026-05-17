import React, { useState, useRef, useEffect, useCallback } from 'react';
import { postChatStream } from '../api';

const SUGGESTED = [
  'How does user authentication work?',
  'What does the main entry point do?',
  'Where is the database connection configured?',
];

function TypingIndicator() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '12px 14px', background: 'var(--gm-surface-2)', borderRadius: '14px 14px 14px 4px', width: 'fit-content' }}>
      {[0, 150, 300].map(delay => (
        <span key={delay} className="dot-bounce" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--gm-text-3)', display: 'block', animationDelay: `${delay}ms` }} />
      ))}
    </div>
  );
}

function Message({ msg }) {
  if (msg.role === 'assistant' && !msg.content) return null; // empty streaming placeholder
  const isUser = msg.role === 'user';
  const isErr  = msg.role === 'error';
  return (
    <div className="fade-up" style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: 8 }}>
      {!isUser && (
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0, marginBottom: 2 }}>🧠</div>
      )}
      <div style={{
        maxWidth: '80%', padding: '11px 14px',
        borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
        background: isUser ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : isErr ? 'rgba(239,68,68,0.1)' : 'var(--gm-surface-2)',
        border: isErr ? '1px solid rgba(239,68,68,0.25)' : 'none',
        fontSize: 13, lineHeight: 1.65,
        color: isUser ? '#fff' : isErr ? '#fca5a5' : 'var(--gm-text-1)',
        boxShadow: isUser ? '0 4px 14px rgba(99,102,241,0.25)' : 'none',
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>
        {/* Highlight file references in AI responses */}
        {!isUser && !isErr
          ? msg.content.split(/(\b\S+\.[a-z]{1,5}(?::\d+)?\b)/g).map((part, i) =>
              /\.\w{1,5}(?::\d+)?$/.test(part)
                ? <code key={i} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#818cf8', background: 'rgba(99,102,241,0.12)', padding: '1px 5px', borderRadius: 4 }}>{part}</code>
                : <span key={i}>{part}</span>
            )
          : msg.content}
      </div>
    </div>
  );
}

export default function ChatTab({ sessionId, enabled, repoName }) {
  const [messages,  setMessages]  = useState([]);
  const [input,     setInput]     = useState('');
  const [loading,   setLoading]   = useState(false);
  const bottomRef   = useRef(null);
  const inputRef    = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const send = useCallback(async (question) => {
    const q = question.trim();
    if (!q || loading || !enabled) return;

    // Add user message + empty assistant placeholder immediately
    setMessages(prev => [...prev, { role: 'user', content: q }, { role: 'assistant', content: '' }]);
    setInput('');
    setLoading(true);

    try {
      await postChatStream(sessionId, q, (token) => {
        setMessages(prev => {
          const msgs = [...prev];
          const last = msgs[msgs.length - 1];
          msgs[msgs.length - 1] = { ...last, content: last.content + token };
          return msgs;
        });
      });
    } catch (err) {
      setMessages(prev => {
        const msgs = [...prev];
        msgs[msgs.length - 1] = { role: 'error', content: err.message || 'Something went wrong. Please try again.' };
        return msgs;
      });
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [sessionId, loading, enabled]);

  const handleKey = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); }
  }, [input, send]);

  // Locked state
  if (!enabled) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 16 }}>
        <div style={{ width: 72, height: 72, borderRadius: 18, background: 'var(--gm-surface)', border: '2px dashed var(--gm-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30 }}>🔒</div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--gm-text-2)', marginBottom: 6 }}>Chat is locked</div>
          <div style={{ fontSize: 13, color: 'var(--gm-text-3)' }}>Run analysis first to unlock the Knowledge Agent</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 180px)', gap: 0 }}>
      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 16 }}>
        {messages.length === 0 && (
          <div className="fade-up" style={{ paddingTop: 24 }}>
            {repoName && (
              <div style={{ textAlign: 'center', marginBottom: 20, fontSize: 13, color: 'var(--gm-text-3)' }}>
                Chatting with <strong style={{ color: 'var(--gm-text-2)' }}>📦 {repoName}</strong>
              </div>
            )}
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, margin: '0 auto 12px' }}>🧠</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--gm-text-1)', marginBottom: 4 }}>Ask anything about this codebase</div>
              <div style={{ fontSize: 13, color: 'var(--gm-text-3)' }}>The Knowledge Agent has read every file and answers with exact file references.</div>
            </div>
            {/* Suggested prompts */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {SUGGESTED.map(s => (
                <button key={s} onClick={() => send(s)} style={{
                  width: '100%', padding: '12px 16px', textAlign: 'left',
                  background: 'var(--gm-surface)', border: '1px solid var(--gm-border)',
                  borderRadius: 12, color: 'var(--gm-text-2)', fontSize: 13, cursor: 'pointer',
                  transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 10,
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--gm-primary)'; e.currentTarget.style.color = 'var(--gm-text-1)'; e.currentTarget.style.background = 'var(--gm-primary-10)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--gm-border)';  e.currentTarget.style.color = 'var(--gm-text-2)'; e.currentTarget.style.background = 'var(--gm-surface)';   }}
                >
                  <span style={{ color: 'var(--gm-primary)', flexShrink: 0 }}>→</span>
                  <span>{s}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => <Message key={i} msg={msg} />)}
        {loading && !messages[messages.length - 1]?.content && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>🧠</div>
            <TypingIndicator />
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div style={{ flexShrink: 0, paddingTop: 12, borderTop: '1px solid var(--gm-border)' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <textarea
              ref={inputRef}
              rows={1}
              className="gm-input"
              style={{ resize: 'none', paddingRight: 44, minHeight: 42, maxHeight: 120, overflowY: 'auto', lineHeight: 1.5 }}
              placeholder="Ask about this codebase… (Enter to send)"
              value={input}
              onChange={e => {
                setInput(e.target.value);
                // auto-grow
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
              }}
              onKeyDown={handleKey}
              disabled={loading}
              aria-label="Chat message input"
            />
          </div>
          <button
            className="gm-btn-primary"
            style={{ flexShrink: 0, height: 42, padding: '0 18px' }}
            onClick={() => send(input)}
            disabled={loading || !input.trim()}
            aria-label="Send message"
          >
            {loading ? '…' : '↑ Send'}
          </button>
        </div>
        <div style={{ marginTop: 6, fontSize: 10, color: 'var(--gm-text-3)', textAlign: 'right' }}>
          Enter to send · Shift+Enter for newline
        </div>
      </div>
    </div>
  );
}
