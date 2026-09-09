import React, { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MessageSquare } from "../../icons";
import { fs } from "../../typeScale";
import { postChatStream } from "../../api";

/* Standard tab-header so Chat matches every other dashboard tab. */
function ChatHeader({ enabled }) {
  return (
    <div className="tab-header">
      <div className="tab-header-main">
        <span className="tab-header-icon">
          <MessageSquare size={15} />
        </span>
        <div className="tab-header-text">
          <div className="tab-header-eyebrow">11 — Chat</div>
          <div className="tab-header-title">Chat</div>
          <div className="tab-header-sub">
            {enabled
              ? "Ask anything about this repository"
              : "Requires an analysis"}
          </div>
        </div>
      </div>
    </div>
  );
}

function SourceBadge({ source }) {
  const path = source.filepath || "";
  const parts = path.split("/");
  const short = parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : path;
  return (
    <span className="source-badge" title={path}>
      {short}
    </span>
  );
}

function Message({ msg }) {
  if (msg.role === "assistant" && !msg.content) return null;
  const isUser = msg.role === "user";
  const isErr = msg.role === "error";
  return (
    <div
      className={`chat-msg ${isUser ? "user" : "assistant"}`}
      style={isErr ? { color: "var(--danger)", fontStyle: "italic" } : {}}
    >
      {isUser || isErr ? (
        msg.content
      ) : (
        <div className="chat-markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {msg.content}
          </ReactMarkdown>
        </div>
      )}
      {msg.streaming && <span className="chat-cursor" />}
      {msg.sources?.length > 0 && !msg.streaming && (
        <div
          style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}
        >
          {msg.sources.map((s, i) => (
            <SourceBadge key={i} source={s} />
          ))}
        </div>
      )}
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
        (sources) => {
          setMessages((prev) =>
            prev.map((m, i) =>
              i === prev.length - 1 ? { ...m, streaming: false, sources } : m,
            ),
          );
        },
      );
      // Stream finished — ensure streaming flag is cleared
      setMessages((prev) =>
        prev.map((m, i) =>
          i === prev.length - 1 && m.streaming ? { ...m, streaming: false } : m,
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
        <ChatHeader enabled={false} />
        <div className="chat-empty">Analyze a repository to unlock chat</div>
      </div>
    );
  }

  return (
    <div className="chat-wrap">
      <ChatHeader enabled />
      <div
        className="chat-messages"
        aria-live="polite"
        aria-label="Chat messages"
      >
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
                fontSize: fs.base,
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
                  className="chat-suggestion"
                  onClick={() => {
                    setInput(q);
                    textareaRef.current?.focus();
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
            // rAF-batch the height write: reading scrollHeight per
            // keystroke interleaves layout reads/writes (thrash).
            const el = e.target;
            requestAnimationFrame(() => {
              el.style.height = "auto";
              el.style.height = Math.min(el.scrollHeight, 120) + "px";
            });
          }}
          onKeyDown={handleKeyDown}
          disabled={busy}
          placeholder="Ask anything about the repo — Enter to send"
          aria-label="Chat message"
          rows={1}
        />
      </div>
    </div>
  );
}
