import React, { useState, useRef, useEffect, useCallback } from "react";
import { postChatStream } from "../api";

function Message({ msg }) {
  if (msg.role === "assistant" && !msg.content) return null;
  const isUser = msg.role === "user";
  const isErr = msg.role === "error";
  return (
    <div
      className={`chat-msg ${isUser ? "user" : "assistant"}`}
      style={isErr ? { color: "var(--danger)", fontStyle: "italic" } : {}}
    >
      {msg.content}
      {msg.streaming && <span className="chat-cursor" />}
    </div>
  );
}

export default function ChatTab({ sessionId, enabled, repoName }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || busy || !enabled) return;
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    const userMsg = { role: "user", content: text };
    const botSlot = { role: "assistant", content: "", streaming: true };
    setMessages((prev) => [...prev, userMsg, botSlot]);
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      let full = "";
      await postChatStream(
        sessionId,
        text,
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
      setMessages((prev) =>
        prev.map((m, i) =>
          i === prev.length - 1
            ? { role: "error", content: `Error: ${err.message}` }
            : m,
        ),
      );
    } finally {
      setBusy(false);
    }
  }, [input, busy, enabled, sessionId]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (!enabled) {
    return (
      <div className="chat-wrap">
        <div className="chat-empty">Analyze a repository to unlock chat</div>
      </div>
    );
  }

  return (
    <div className="chat-wrap">
      <div className="chat-messages">
        {messages.length === 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              paddingTop: 40,
              gap: 20,
            }}
          >
            <div
              style={{
                color: "var(--text-3)",
                fontSize: 14,
                textAlign: "center",
              }}
            >
              Ask anything about{" "}
              <strong style={{ color: "var(--text-2)" }}>{repoName}</strong>
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                justifyContent: "center",
                maxWidth: 480,
              }}
            >
              {[
                "What does this codebase do?",
                "How is authentication handled?",
                "What are the main API endpoints?",
                "Where is the database layer?",
                "How is error handling done?",
                "What are the key dependencies?",
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => {
                    setInput(q);
                    textareaRef.current?.focus();
                  }}
                  style={{
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: "6px 12px",
                    fontSize: 12,
                    color: "var(--text-2)",
                    cursor: "pointer",
                    transition: "border-color 0.15s, color 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--primary)";
                    e.currentTarget.style.color = "var(--text-1)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--border)";
                    e.currentTarget.style.color = "var(--text-2)";
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <Message key={i} msg={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-wrap">
        <textarea
          ref={textareaRef}
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onInput={(e) => {
            e.target.style.height = "auto";
            e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
          }}
          onKeyDown={handleKeyDown}
          disabled={busy}
          placeholder="Ask anything about the repo — Enter to send"
          rows={1}
        />
      </div>
    </div>
  );
}
