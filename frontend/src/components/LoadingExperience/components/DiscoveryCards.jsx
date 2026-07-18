import React, { useEffect, useRef } from "react";
import gsap from "gsap";
import {
  Folder,
  FileCode,
  Puzzle,
  Link,
  Building2,
  ShieldCheck,
} from "lucide-react";

function usePrevious(value) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}

const CARD_CONFIG = [
  {
    key: "files",
    icon: Folder,
    label: "Repository Size",
    display: (v) => `${v ?? "Scanning..."}${v ? " files" : ""}`,
    unlockPhase: -1,
  },
  {
    key: "languages",
    icon: FileCode,
    label: "Languages",
    display: (v) => (v && v.length ? v.join(", ") : "Detecting..."),
    unlockPhase: 1,
  },
  {
    key: "frameworks",
    icon: Puzzle,
    label: "Frameworks",
    display: (v) => (v && v.length ? v.join(", ") : "Identifying..."),
    unlockPhase: 2,
  },
  {
    key: "dependencies",
    icon: Link,
    label: "Dependencies",
    display: (v) => (v ? `${v}` : "Discovering..."),
    unlockPhase: 2,
  },
  {
    key: "architecture",
    icon: Building2,
    label: "Architecture",
    display: (v) => v ?? "Analyzing...",
    unlockPhase: 3,
  },
  {
    key: "security",
    icon: ShieldCheck,
    label: "Security",
    display: (v) => v ?? "Pending...",
    unlockPhase: 4,
  },
];

export default function DiscoveryCards({ metrics = {}, currentPhase = 0 }) {
  const cardRefs = useRef([]);
  const unlocked = useRef(new Set());
  const prevMetrics = usePrevious(metrics);

  useEffect(() => {
    const visible = CARD_CONFIG.filter((c) => {
      if (c.unlockPhase < 0) return true;
      return currentPhase >= c.unlockPhase;
    });

    visible.forEach((c, idx) => {
      if (unlocked.current.has(c.key)) return;
      unlocked.current.add(c.key);

      const el = cardRefs.current[idx];
      if (el) {
        gsap.fromTo(
          el,
          { y: 16, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.5,
            delay: idx * 0.12,
            ease: "power2.out",
          },
        );
      }
    });
  }, [currentPhase]);

  useEffect(() => {
    CARD_CONFIG.forEach((c) => {
      const curr = metrics[c.key];
      const prev = prevMetrics ? prevMetrics[c.key] : undefined;
      if (curr === prev) return;

      let el;
      if (c.unlockPhase < 0 || currentPhase >= c.unlockPhase) {
        const visIdx = CARD_CONFIG.filter(
          (cc) => cc.unlockPhase < 0 || currentPhase >= cc.unlockPhase,
        ).indexOf(c);
        el = cardRefs.current[visIdx];
      }
      if (!el) return;

      gsap.fromTo(
        el,
        { borderColor: "var(--primary)" },
        { borderColor: "var(--border)", duration: 0.6, ease: "power2.out" },
      );

      if (typeof curr === "number" && prev != null) {
        const valEl = el.querySelector(".lg-disc-value");
        if (valEl) {
          const proxy = { val: prev };
          gsap.to(proxy, {
            val: curr,
            duration: 0.8,
            ease: "power2.out",
            onUpdate: () => {
              const v = Math.round(proxy.val);
              if (c.key === "dependencies") valEl.textContent = v;
              else if (c.key === "files") valEl.textContent = `${v} files`;
            },
          });
        }
      }
    });
  }, [metrics, prevMetrics, currentPhase]);

  const visibleCards = CARD_CONFIG.filter((c) => {
    if (c.unlockPhase < 0) return true;
    return currentPhase >= c.unlockPhase;
  });

  return (
    <div className="lg-discoveries">
      <div className="lg-panel-header">
        <span className="lg-panel-dot lg-dot-red" />
        <span className="lg-panel-dot lg-dot-yellow" />
        <span className="lg-panel-dot lg-dot-green" />
        <span className="lg-panel-title">LIVE DISCOVERIES</span>
      </div>
      <div className="lg-disc-grid">
        {visibleCards.map((c, idx) => {
          const val = metrics[c.key];
          const Icon = c.icon;
          return (
            <div
              key={c.key}
              className="lg-disc-card"
              ref={(el) => (cardRefs.current[idx] = el)}
            >
              <div className="lg-disc-icon">
                <Icon size={16} strokeWidth={1.5} />
              </div>
              <div className="lg-disc-body">
                <span className="lg-disc-label">{c.label}</span>
                <span
                  className={`lg-disc-value${val ? "" : " lg-disc-pending"}`}
                >
                  {c.display(val)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
