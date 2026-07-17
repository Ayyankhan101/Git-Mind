import React, { useEffect, useRef } from "react";
import gsap from "gsap";

export default function CompletionAnimation({ onFinishScreen }) {
  const containerRef = useRef(null);
  const ringRef = useRef(null);
  const overlayRef = useRef(null);
  const particlesRef = useRef([]);
  const titleRef = useRef(null);
  const subtitleRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power2.out" } });

      const particles = particlesRef.current;

      tl.to(
        ringRef.current,
        { scale: 8, opacity: 0, duration: 1.2, ease: "power1.out" },
        0,
      )
        .to(overlayRef.current, { opacity: 1, duration: 0.5 }, 0.4)
        .to(
          particles,
          {
            x: () => (Math.random() - 0.5) * 300,
            y: () => (Math.random() - 0.5) * 300,
            opacity: 0,
            scale: 0,
            duration: 1.2,
            stagger: 0.03,
            ease: "power2.out",
          },
          0.8,
        )
        .to(
          titleRef.current,
          { autoAlpha: 1, y: 0, scale: 1, duration: 0.7 },
          2.0,
        )
        .to(subtitleRef.current, { autoAlpha: 1, y: 0, duration: 0.5 }, 2.6)
        .to(overlayRef.current, { opacity: 0.5, duration: 0.8 }, 3.0)
        .to(buttonRef.current, { autoAlpha: 1, y: 0, duration: 0.5 }, 4.0);
    }, containerRef);

    return () => ctx.revert();
  }, []);

  useEffect(() => {
    if (buttonRef.current) {
      buttonRef.current.focus();
    }
  }, []);

  return (
    <div className="lg-completion" ref={containerRef}>
      <div className="lg-completion-overlay" ref={overlayRef} />
      <svg
        className="lg-completion-ring"
        ref={ringRef}
        viewBox="0 0 200 200"
        aria-hidden="true"
      >
        <circle
          cx="100"
          cy="100"
          r="40"
          fill="none"
          stroke="var(--primary)"
          strokeWidth="2"
        />
      </svg>

      <div className="lg-particle-burst" aria-hidden="true">
        {Array.from({ length: 25 }).map((_, i) => (
          <span
            key={i}
            className="lg-particle"
            ref={(el) => (particlesRef.current[i] = el)}
            style={{
              width: `${2 + Math.random() * 4}px`,
              height: `${2 + Math.random() * 4}px`,
              background: i % 2 === 0 ? "var(--primary)" : "var(--info)",
              borderRadius: "50%",
              position: "absolute",
              left: "50%",
              top: "50%",
            }}
          />
        ))}
      </div>

      <div className="lg-completion-text">
        <h2 className="lg-completion-title" ref={titleRef}>
          Repository Intelligence Complete
        </h2>
        <p className="lg-completion-subtitle-arch" ref={subtitleRef}>
          Architecture successfully generated
        </p>
        <button
          className="lg-completion-btn"
          ref={buttonRef}
          onClick={onFinishScreen}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") onFinishScreen();
          }}
          tabIndex={0}
          aria-label="View Analysis"
        >
          View Analysis &rarr;
        </button>
      </div>
    </div>
  );
}
