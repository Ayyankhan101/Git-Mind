import React, { useState, useRef, useEffect, useCallback } from "react";
import { X, Cpu, Send, MessageSquare } from "lucide-react";
import { postChatStream } from "../api";

const SUGGESTIONS = (node) => [
  `What files implement ${node}?`,
  `What does ${node} depend on?`,
  `What calls or uses ${node}?`,
  `What errors can occur in ${node}?`,
  `How does ${node} fit into the overall flow?`,
];

function ChatMessage({ msg }) {
  if (msg.role === "assistant" && !msg.content) return null;
  const isUser = msg.role === "user";
  const isErr = msg.role === "error";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: isUser ? "flex-end" : "flex-start",
      }}
    >
      <div
        style={{
          maxWidth: "88%",
          background: isErr
            ? "var(--danger-bg, #2a1010)"
            : isUser
              ? "var(--primary)"
              : "var(--surface-2)",
          color: isErr ? "var(--danger)" : isUser ? "#fff" : "var(--text-1)",
          borderRadius: isUser ? "12px 12px 3px 12px" : "12px 12px 12px 3px",
          padding: "8px 12px",
          fontSize: 13,
          lineHeight: 1.55,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {msg.content}
        {msg.streaming && <span className="chat-cursor" />}
      </div>
    </div>
  );
}

const RAG_ERR = "Knowledge base not ready";

export default function NodePanel({ node, sessionId, enabled, onClose }) {
  const [desc, setDesc] = useState("");
  const [descDone, setDescDone] = useState(false);
  const [ragUnavail, setRagUnavail] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef(null);
  const msgEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, desc]);

  // Auto-fetch description whenever the selected node changes
  useEffect(() => {
    setDesc("");
    setDescDone(false);
    setRagUnavail(false);
    setMessages([]);
    abortRef.current?.abort();

    if (!enabled || !sessionId) {
      setDescDone(true);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    const q = `Describe the "${node}" component from this codebase in 3–5 sentences: what it is, what it does, its core responsibilities, and how it connects to other parts of the system.`;
    let full = "";

    postChatStream(
      sessionId,
      q,
      (chunk) => {
        full += chunk;
        setDesc(full);
      },
      controller.signal,
    )
      .then(() => setDescDone(true))
      .catch((err) => {
        if (err.name === "AbortError") return;
        if (err.message?.includes(RAG_ERR)) setRagUnavail(true);
        setDescDone(true);
      });

    return () => controller.abort();
  }, [node, sessionId, enabled]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const send = useCallback(
    async (overrideText) => {
      const text = (overrideText || input).trim();
      if (!text || busy || !enabled || ragUnavail) return;
      setInput("");
      if (inputRef.current) inputRef.current.style.height = "auto";

      const contextQ = `[Focusing on the "${node}" component in this repo] ${text}`;
      setMessages((prev) => [
        ...prev,
        { role: "user", content: text },
        { role: "assistant", content: "", streaming: true },
      ]);
      setBusy(true);

      const controller = new AbortController();
      abortRef.current = controller;
      try {
        let full = "";
        await postChatStream(
          sessionId,
          contextQ,
          (chunk) => {
            full += chunk;
            setMessages((prev) =>
              prev.map((m, i) =>
                i === prev.length - 1 ? { ...m, content: full } : m,
              ),
            );
          },
          controller.signal,
        );
        setMessages((prev) =>
          prev.map((m, i) =>
            i === prev.length - 1 ? { ...m, streaming: false } : m,
          ),
        );
      } catch (err) {
        if (err.name === "AbortError") return;
        if (err.message?.includes(RAG_ERR)) {
          setRagUnavail(true);
          setMessages((prev) => prev.filter((_, i) => i < prev.length - 1));
        } else {
          setMessages((prev) =>
            prev.map((m, i) =>
              i === prev.length - 1
                ? { role: "error", content: `Error: ${err.message}` }
                : m,
            ),
          );
        }
      } finally {
        setBusy(false);
      }
    },
    [input, busy, enabled, ragUnavail, sessionId, node],
  );

  const chatEnabled = enabled && !ragUnavail;
  const showSuggestions = descDone && messages.length === 0 && chatEnabled;

  return (
    <div className="node-panel" onClick={(e) => e.stopPropagation()}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="node-panel-header">
        <Cpu
          size={15}
          style={{ color: "var(--primary)", flexShrink: 0 }}
          strokeWidth={1.5}
        />
        <span className="node-panel-title">{node}</span>
        <button className="btn-icon" onClick={onClose} title="Close (Esc)">
          <X size={14} strokeWidth={2} />
        </button>
      </div>

      {/* ── Auto description ────────────────────────────────────── */}
      <div className="node-panel-desc">
        {ragUnavail ? (
          <span
            style={{
              color: "var(--warning, #f59e0b)",
              fontSize: 12,
              lineHeight: 1.55,
            }}
          >
            Knowledge base unavailable for this session. Re-analyze the
            repository to enable chat.
          </span>
        ) : !desc && !descDone ? (
          <span
            style={{
              color: "var(--text-3)",
              fontStyle: "italic",
              fontSize: 13,
            }}
          >
            Analyzing component
            <span className="chat-cursor" />
          </span>
        ) : desc ? (
          <span
            style={{ fontSize: 13, lineHeight: 1.65, color: "var(--text-2)" }}
          >
            {desc}
            {!descDone && <span className="chat-cursor" />}
          </span>
        ) : !enabled ? (
          <span
            style={{
              color: "var(--text-3)",
              fontSize: 13,
              fontStyle: "italic",
            }}
          >
            Analyze a repository to enable node insights.
          </span>
        ) : null}
      </div>

      {/* ── Suggested questions ─────────────────────────────────── */}
      {showSuggestions && (
        <div className="node-panel-suggestions">
          <div
            style={{
              fontSize: 11,
              color: "var(--text-3)",
              marginBottom: 6,
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <MessageSquare size={11} strokeWidth={1.5} /> Ask about this node
          </div>
          {SUGGESTIONS(node).map((q) => (
            <button
              key={q}
              className="node-suggestion-chip"
              onClick={() => send(q)}
              disabled={busy}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* ── Chat messages ───────────────────────────────────────── */}
      {messages.length > 0 && (
        <div className="node-panel-messages">
          {messages.map((msg, i) => (
            <ChatMessage key={i} msg={msg} />
          ))}
          <div ref={msgEndRef} />
        </div>
      )}

      {/* ── Input ───────────────────────────────────────────────── */}
      <div className="node-panel-input-wrap">
        <div style={{ display: "flex", gap: 7, alignItems: "flex-end" }}>
          <textarea
            ref={inputRef}
            className="node-panel-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onInput={(e) => {
              e.target.style.height = "auto";
              e.target.style.height =
                Math.min(e.target.scrollHeight, 100) + "px";
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
              if (e.key === "Escape") onClose();
            }}
            disabled={busy || !chatEnabled}
            placeholder={
              ragUnavail
                ? "Knowledge base unavailable"
                : chatEnabled
                  ? `Ask about ${node}…`
                  : "Analyze a repo first"
            }
            rows={1}
          />
          <button
            className="node-send-btn"
            onClick={() => send()}
            disabled={!input.trim() || busy || !chatEnabled}
          >
            <Send size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
