import React, { useRef, useEffect, useMemo } from "react";
import gsap from "gsap";

function pad(n) {
  return String(n).padStart(2, "0");
}

function formatTime(d) {
  if (!d || !(d instanceof Date) || isNaN(d)) return "";
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const PREFIX_MAP = {
  info: { label: ">", cls: "lg-msg-info" },
  success: { label: "\u2713", cls: "lg-msg-success" },
  error: { label: "\u2717", cls: "lg-msg-error" },
  idle: { label: "\u25E6", cls: "lg-msg-idle" },
};

function detectCommand(text) {
  if (/initializing|model.*loaded|connected/i.test(text))
    return { tag: "INIT", cls: "lg-prefix-init" };
  if (
    /scanning|detect|resolv.*import|structure|tree.*resolv|packag/i.test(text)
  )
    return { tag: "SCAN", cls: "lg-prefix-scan" };
  if (
    /dependenc|module.*relat|boundar|service.*identif|endpoint|schema|architectur.*map|relationship/i.test(
      text,
    )
  )
    return { tag: "GRAPH", cls: "lg-prefix-graph" };
  if (/optimiz|comput|validat|generat.*doc|placement/i.test(text))
    return { tag: "AI", cls: "lg-prefix-ai" };
  if (/complete|generated|ready|compil/i.test(text))
    return { tag: "DONE", cls: "lg-prefix-done" };
  if (/error|cancel/i.test(text)) return { tag: "ERR", cls: "lg-prefix-err" };
  return { tag: "INFO", cls: "lg-prefix-info" };
}

export default function AITerminal({
  messages = [],
  analysisComplete,
  timelineEnded,
}) {
  const scrollRef = useRef(null);
  const lineRefs = useRef([]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  useEffect(() => {
    const last = lineRefs.current[lineRefs.current.length - 1];
    if (last) {
      gsap.fromTo(
        last,
        { opacity: 0, x: -4 },
        { opacity: 1, x: 0, duration: 0.3, ease: "power1.out" },
      );
    }
  }, [messages.length]);

  const lineEls = useMemo(
    () =>
      messages.map((msg, i) => {
        const p = PREFIX_MAP[msg.type] || PREFIX_MAP.info;
        const cmd = detectCommand(msg.text);
        const isNewest = i === messages.length - 1;
        const isDimmed = i < messages.length - 6;
        const cls = [
          "lg-term-line",
          p.cls,
          isNewest ? "lg-term-active" : "",
          isDimmed ? "lg-term-dimmed" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <div
            key={`${msg.ts?.getTime() || i}-${i}`}
            className={cls}
            ref={(el) => (lineRefs.current[i] = el)}
          >
            <span className="lg-term-ts">{formatTime(msg.ts)}</span>
            <span className="lg-term-prefix">{p.label}</span>
            <span className={`lg-term-command ${cmd.cls}`}>[{cmd.tag}]</span>
            <span className="lg-term-text">{msg.text}</span>
          </div>
        );
      }),
    [messages],
  );

  return (
    <div className="lg-terminal">
      <div className="lg-panel-header">
        <span className="lg-panel-dot lg-dot-red" />
        <span className="lg-panel-dot lg-dot-yellow" />
        <span className="lg-panel-dot lg-dot-green" />
        <span className="lg-panel-title">AI TERMINAL</span>
      </div>
      <div className="lg-term-scroll" ref={scrollRef}>
        {lineEls}
        {!analysisComplete && <span className="lg-term-cursor" />}
        {analysisComplete && timelineEnded && (
          <span className="lg-term-cursor" />
        )}
      </div>
    </div>
  );
}
