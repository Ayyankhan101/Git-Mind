import React, { useEffect, useRef } from "react";
import gsap from "gsap";

const DEFAULT_NODES = [
  "Client",
  "Services",
  "Data",
  "Infrastructure",
  "Interfaces",
  "Core",
];

const NODE_POSITIONS = [
  { x: 200, y: 80 },
  { x: 310, y: 160 },
  { x: 270, y: 290 },
  { x: 130, y: 290 },
  { x: 90, y: 160 },
  { x: 200, y: 200 },
];

const NODE_SIZES = [12, 15, 14, 13, 11, 20];

const SEGMENTS = [
  [0, 1],
  [0, 3],
  [0, 4],
  [1, 2],
  [1, 5],
  [2, 3],
  [2, 5],
  [3, 4],
  [3, 5],
  [4, 5],
];

const LINE_THICKNESS = [1.4, 1.6, 1.0, 2.2, 2.6, 2.0, 2.6, 1.0, 2.6, 2.6];

const PHASE_NODE_MAP = [5, 0, 4, 1, 2, 3];

export default function RepositoryHologram({
  stage = 1,
  nodes = DEFAULT_NODES,
  analysisComplete,
}) {
  const svgRef = useRef(null);
  const tl = useRef(null);
  const packetTweens = useRef([]);
  const ambientTweens = useRef([]);
  const prevStageInt = useRef(0);
  const pathRefs = useRef([]);
  const nodeRefs = useRef([]);
  const ringRef = useRef(null);
  const ringOuterRef = useRef(null);
  const rippleRef = useRef(null);

  useEffect(() => {
    if (tl.current) tl.current.kill();
    tl.current = gsap.timeline({ paused: true });
    const svg = svgRef.current;
    if (!svg) return;

    const coreInner = svg.querySelector(".lg-core-inner");
    const coreShell = svg.querySelector(".lg-core-shell");
    const nodeHalos = svg.querySelectorAll(".lg-node-halo");
    const nodeCircles = svg.querySelectorAll(".lg-holo-node");
    const labels = svg.querySelectorAll(".lg-holo-label");
    const lines = svg.querySelectorAll(".lg-holo-line");
    const glows = svg.querySelectorAll(".lg-holo-glow");
    const ghostRings = svg.querySelectorAll(".lg-holo-ghost");
    const grid = svg.querySelector(".lg-holo-grid");
    const coreRing = svg.querySelector(".lg-core-ring");
    const nodeDots = svg.querySelectorAll(".lg-node-dot");

    try {
      const t = tl.current;
      t.set(
        [
          nodeHalos,
          nodeCircles,
          nodeDots,
          labels,
          lines,
          glows,
          ghostRings,
          grid,
        ].filter(Boolean),
        { autoAlpha: 0 },
      );
      if (coreRing) t.set(coreRing, { autoAlpha: 0 });
      if (coreShell)
        t.to(
          coreShell,
          { autoAlpha: 1, scale: 1, duration: 0.6, ease: "power2.out" },
          0.3,
        );
      if (coreInner)
        t.to(
          coreInner,
          { autoAlpha: 1, scale: 1, duration: 0.5, ease: "power2.out" },
          0.4,
        );
      if (grid)
        t.to(grid, { autoAlpha: 0.5, duration: 0.8, ease: "power1.out" }, 0.8);
      if (coreRing)
        t.to(
          coreRing,
          { autoAlpha: 0.6, duration: 0.6, ease: "power1.out" },
          1.4,
        );
      t.to(
        nodeHalos,
        { autoAlpha: 0.2, duration: 0.5, stagger: 0.12, ease: "power1.out" },
        2.2,
      )
        .to(
          nodeCircles,
          {
            autoAlpha: 1,
            scale: 1,
            duration: 0.5,
            stagger: 0.12,
            ease: "back.out(2)",
          },
          2.8,
        )
        .to(
          labels,
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.4,
            stagger: 0.1,
            ease: "power1.out",
          },
          3.8,
        )
        .to(
          lines,
          {
            autoAlpha: 1,
            strokeDashoffset: 0,
            duration: 1,
            stagger: 0.12,
            ease: "power2.inOut",
          },
          4.6,
        )
        .to(
          nodeDots,
          { autoAlpha: 0.8, duration: 0.4, stagger: 0.08, ease: "power1.out" },
          5.4,
        )
        .to(
          ghostRings,
          { autoAlpha: 0.05, duration: 0.8, ease: "power1.out" },
          5.8,
        )
        .to(glows, { autoAlpha: 0.6, duration: 0.8, ease: "power1.out" }, 6.3);
    } catch (e) {
      console.warn("[Hologram] boot timeline error:", e);
    }

    tl.current.progress(0);
    if (analysisComplete) tl.current.pause();
    return () => {
      if (tl.current) tl.current.kill();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!tl.current) return;
    if (analysisComplete) tl.current.pause();
    else tl.current.progress(Math.min(stage / 7, 1));
  }, [stage, analysisComplete]);

  useEffect(() => {
    ambientTweens.current.forEach((t) => t.kill());
    ambientTweens.current = [];

    const svg = svgRef.current;
    if (!svg) return;
    const tweens = [];

    const coreShell = svg.querySelector(".lg-core-shell");
    const coreInner = svg.querySelector(".lg-core-inner");
    const coreRing = svg.querySelector(".lg-core-ring");
    const coreOrbits = svg.querySelector(".lg-core-orbits");
    const ripple = rippleRef.current;
    const nodeHalos = svg.querySelectorAll(".lg-node-halo");
    const nodeDots = svg.querySelectorAll(".lg-node-dot");
    const ghostRings = svg.querySelectorAll(".lg-holo-ghost");

    if (coreShell)
      tweens.push(
        gsap.to(coreShell, {
          opacity: 0.35,
          scale: 1.06,
          duration: 3,
          yoyo: true,
          repeat: -1,
          ease: "sine.inOut",
        }),
      );
    if (coreInner)
      tweens.push(
        gsap.to(coreInner, {
          opacity: 0.7,
          scale: 1.04,
          duration: 2.5,
          yoyo: true,
          repeat: -1,
          ease: "sine.inOut",
        }),
      );
    if (coreRing && !analysisComplete)
      tweens.push(
        gsap.to(coreRing, {
          rotation: 360,
          duration: 10,
          repeat: -1,
          ease: "none",
          transformOrigin: "200px 200px",
        }),
      );
    if (coreOrbits && !analysisComplete)
      tweens.push(
        gsap.to(coreOrbits, {
          rotation: 360,
          duration: 14,
          repeat: -1,
          ease: "none",
          transformOrigin: "200px 200px",
        }),
      );
    if (ringRef.current && !analysisComplete)
      tweens.push(
        gsap.to(ringRef.current, {
          rotation: 360,
          duration: 20,
          repeat: -1,
          ease: "none",
          transformOrigin: "200px 200px",
        }),
      );
    if (ringOuterRef.current && !analysisComplete)
      tweens.push(
        gsap.to(ringOuterRef.current, {
          rotation: -360,
          duration: 24,
          repeat: -1,
          ease: "none",
          transformOrigin: "200px 200px",
        }),
      );
    ghostRings.forEach((r) => {
      if (!analysisComplete)
        tweens.push(
          gsap.to(r, {
            rotation: 360,
            duration: 38,
            repeat: -1,
            ease: "none",
            transformOrigin: "200px 200px",
          }),
        );
    });
    if (ripple && !analysisComplete)
      tweens.push(
        gsap.to(ripple, {
          scale: 5,
          opacity: 0,
          duration: 2.5,
          repeat: -1,
          repeatDelay: 4,
          ease: "power2.out",
          transformOrigin: "200px 200px",
        }),
      );
    nodeHalos.forEach((h, i) => {
      tweens.push(
        gsap.to(h, {
          opacity: 0.1,
          scale: 1.03,
          duration: 3.5,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
          delay: i * 0.2,
        }),
      );
    });
    nodeDots.forEach((d, i) => {
      tweens.push(
        gsap.to(d, {
          opacity: 0.4,
          scale: 1.4,
          duration: 2,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
          delay: i * 0.15,
        }),
      );
    });

    ambientTweens.current = tweens;
    return () => {
      tweens.forEach((t) => t.kill());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!analysisComplete) return;

    const svg = svgRef.current;
    if (!svg) return;

    const coreShell = svg.querySelector(".lg-core-shell");
    const coreInner = svg.querySelector(".lg-core-inner");
    const corePulse = svg.querySelector(".lg-core-pulse");
    const lines = svg.querySelectorAll(".lg-holo-line");
    const glows = svg.querySelectorAll(".lg-holo-glow");
    const ripple = rippleRef.current;

    const tl = gsap.timeline({ defaults: { ease: "power2.out" } });

    if (corePulse) tl.to(corePulse, { scale: 8, opacity: 0, duration: 1.5 }, 0);
    if (coreShell)
      tl.to(coreShell, { opacity: 0.6, scale: 1.1, duration: 0.8 }, 0.3);
    if (coreInner)
      tl.to(
        coreInner,
        { opacity: 1, scale: 1.15, filter: "brightness(1.3)", duration: 0.8 },
        0.3,
      );

    packetTweens.current.forEach((t) => t.kill());
    packetTweens.current = [];

    const packetGroup = svg.querySelector(".lg-holo-packets");
    if (packetGroup) {
      packetGroup.innerHTML = "";
      const count = 15 + Math.floor(Math.random() * 10);
      const tList = [];
      for (let i = 0; i < count; i++) {
        const segIdx = Math.floor(Math.random() * SEGMENTS.length);
        const [a, b] = SEGMENTS[segIdx];
        let p1 = { ...NODE_POSITIONS[a] };
        let p2 = { ...NODE_POSITIONS[b] };
        const speed = 0.5 + Math.random() * 1;
        const size = 2 + Math.random() * 2;
        const opacity = 0.5 + Math.random() * 0.5;

        const circle = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "circle",
        );
        circle.setAttribute("r", String(size));
        circle.setAttribute("fill", "#22d3ee");
        circle.setAttribute("opacity", String(opacity));
        circle.setAttribute("cx", String(p1.x));
        circle.setAttribute("cy", String(p1.y));
        circle.classList.add("lg-holo-packet");
        packetGroup.appendChild(circle);

        const proxy = { x: p1.x, y: p1.y, progress: 0 };
        const tween = gsap.to(proxy, {
          progress: 1,
          duration: speed,
          repeat: -1,
          ease: "none",
          onUpdate: () => {
            circle.setAttribute(
              "cx",
              String(p1.x + (p2.x - p1.x) * proxy.progress),
            );
            circle.setAttribute(
              "cy",
              String(p1.y + (p2.y - p1.y) * proxy.progress),
            );
          },
          onRepeat: () => {
            const tmp = p1;
            p1 = p2;
            p2 = tmp;
            proxy.progress = 0;
            proxy.x = p1.x;
            proxy.y = p1.y;
          },
        });
        tList.push(tween);
      }
      packetTweens.current = tList;
    }

    tl.to(lines, { opacity: 0.85, strokeWidth: 2.5, duration: 0.8 }, 0.8);
    tl.to(glows, { autoAlpha: 1, duration: 1 }, 1.2);
    if (ripple)
      tl.to(
        ripple,
        { scale: 12, opacity: 0, duration: 2.5, ease: "power2.out" },
        1.6,
      );
    tl.call(
      () => {
        [ringRef.current, ringOuterRef.current].forEach((r) => {
          if (r)
            gsap.to(r, {
              rotation: 360,
              duration: 45,
              repeat: -1,
              ease: "none",
              transformOrigin: "200px 200px",
            });
        });
        {
          const ghosts = svg.querySelectorAll(".lg-holo-ghost");
          ghosts.forEach((g) =>
            gsap.to(g, {
              rotation: 360,
              duration: 60,
              repeat: -1,
              ease: "none",
              transformOrigin: "200px 200px",
            }),
          );
        }
      },
      null,
      3.5,
    );

    return () => {
      tl.kill();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisComplete]);

  useEffect(() => {
    if (analysisComplete) {
      nodeRefs.current.forEach((ref) => {
        if (ref)
          gsap.to(ref, {
            filter: "brightness(1.3)",
            scale: 1.1,
            duration: 0.5,
          });
      });
      return;
    }

    const stageInt = Math.floor(stage);
    if (stageInt === prevStageInt.current) return;
    prevStageInt.current = stageInt;

    const phaseIdx = Math.min(stageInt - 1, PHASE_NODE_MAP.length - 1);
    if (phaseIdx < 0) return;

    const nodeIdx = PHASE_NODE_MAP[phaseIdx];
    const nodeEl = nodeRefs.current[nodeIdx];
    const svg = svgRef.current;
    const corePulse = svg?.querySelector(".lg-core-pulse");

    if (corePulse) {
      gsap.fromTo(
        corePulse,
        { scale: 1, opacity: 0.5 },
        { scale: 4, opacity: 0, duration: 1.2, ease: "power2.out" },
      );
    }
    if (ringOuterRef.current) {
      gsap.fromTo(
        ringOuterRef.current,
        { opacity: 0.12 },
        { opacity: 0.3, duration: 0.4, yoyo: true, repeat: 1 },
      );
    }

    if (nodeEl) {
      gsap.fromTo(
        nodeEl,
        { filter: "brightness(1.6)", scale: 1.25 },
        {
          filter: "brightness(1)",
          scale: 1,
          duration: 0.6,
          ease: "power2.out",
        },
      );
    }

    SEGMENTS.forEach(([a, b], si) => {
      if (a !== nodeIdx && b !== nodeIdx) return;
      const path = pathRefs.current[si];
      if (path) {
        gsap.fromTo(
          path,
          { opacity: 0.9, strokeWidth: 2.5 },
          { opacity: 0.5, strokeWidth: LINE_THICKNESS[si], duration: 0.6 },
        );
      }
    });
  }, [stage, analysisComplete]);

  return (
    <div className="lg-hologram">
      <div className="lg-panel-header">
        <span className="lg-panel-dot lg-dot-red" />
        <span className="lg-panel-dot lg-dot-yellow" />
        <span className="lg-panel-dot lg-dot-green" />
        <span className="lg-panel-title">Architecture Intelligence Engine</span>
      </div>
      <div className="lg-scan-overlay" aria-hidden="true" />
      <svg
        ref={svgRef}
        viewBox="0 0 400 400"
        className="lg-holo-svg"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.6" />
            <stop offset="40%" stopColor="#22d3ee" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#818cf8" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="nodeHalo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="nodeGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--surface-3)" stopOpacity="1" />
            <stop offset="100%" stopColor="var(--surface-2)" stopOpacity="1" />
          </radialGradient>
          <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.6" />
            <stop offset="100%" stopColor="var(--info)" stopOpacity="0.3" />
          </linearGradient>
        </defs>

        <g className="lg-holo-grid" aria-hidden="true">
          {[50, 100, 150, 200].map((r) => (
            <circle key={r} cx={200} cy={200} r={r} />
          ))}
        </g>

        <g className="lg-holo-ghost" aria-hidden="true">
          <ellipse
            cx={200}
            cy={200}
            rx={190}
            ry={72}
            fill="none"
            stroke="var(--primary)"
            strokeWidth={0.3}
            opacity={0.025}
            strokeDasharray="2 14"
          />
        </g>
        <g className="lg-holo-ghost" aria-hidden="true">
          <ellipse
            cx={200}
            cy={200}
            rx={155}
            ry={58}
            fill="none"
            stroke="var(--primary)"
            strokeWidth={0.3}
            opacity={0.04}
            strokeDasharray="1 10"
          />
        </g>

        <ellipse
          ref={ringRef}
          cx={200}
          cy={200}
          rx={160}
          ry={55}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={0.5}
          opacity={0.2}
          strokeDasharray="4 6"
          className="lg-holo-ring"
        />

        <ellipse
          ref={ringOuterRef}
          cx={200}
          cy={200}
          rx={185}
          ry={68}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={0.4}
          opacity={0.12}
          strokeDasharray="3 10"
          className="lg-holo-ring-outer"
        />

        <g className="lg-holo-core">
          <circle
            ref={rippleRef}
            r={4}
            fill="none"
            stroke="var(--primary)"
            strokeWidth={1}
            opacity={0.5}
            className="lg-ripple"
          />
          <circle r={26} fill="url(#coreGlow)" className="lg-core-shell" />
          <circle r={5} fill="#fff" opacity={0.85} className="lg-core-inner" />
          <circle
            r={3}
            fill="none"
            stroke="var(--primary)"
            strokeWidth={1.2}
            opacity={0.6}
            className="lg-core-pulse"
          />
          <ellipse
            rx={22}
            ry={7}
            fill="none"
            stroke="var(--primary)"
            strokeWidth={0.8}
            opacity={0.5}
            className="lg-core-ring"
          />
          <g className="lg-core-orbits">
            <circle r={1.5} className="lg-core-orbital" cx={0} cy={-30} />
            <circle r={1} className="lg-core-orbital" cx={0} cy={38} />
            <circle r={2} className="lg-core-orbital" cx={0} cy={-20} />
          </g>
        </g>

        <g className="lg-holo-packets" />

        <g className="lg-holo-glows">
          {NODE_POSITIONS.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={35}
              fill="url(#nodeHalo)"
              className="lg-holo-glow"
            />
          ))}
        </g>

        <g className="lg-holo-line-group">
          {SEGMENTS.map(([a, b], i) => (
            <path
              key={i}
              d={`M${NODE_POSITIONS[a].x},${NODE_POSITIONS[a].y} L${NODE_POSITIONS[b].x},${NODE_POSITIONS[b].y}`}
              fill="none"
              stroke="url(#lineGrad)"
              strokeWidth={LINE_THICKNESS[i]}
              strokeDasharray="8 4"
              className="lg-holo-line"
              ref={(el) => {
                pathRefs.current[i] = el;
              }}
            />
          ))}
        </g>

        <g className="lg-holo-cube" />

        {NODE_POSITIONS.map((p, i) => {
          const r = NODE_SIZES[i];
          return (
            <g key={i}>
              <circle
                r={r + 12}
                cx={p.x}
                cy={p.y}
                fill="url(#nodeHalo)"
                opacity={0.15}
                className="lg-node-halo"
              />
              <circle
                r={r}
                cx={p.x}
                cy={p.y}
                fill="url(#nodeGrad)"
                stroke="var(--primary)"
                strokeWidth={1.5}
                className="lg-holo-node"
                ref={(el) => {
                  nodeRefs.current[i] = el;
                }}
              />
              <circle
                r={3}
                cx={p.x}
                cy={p.y}
                fill="var(--primary)"
                opacity={0}
                className="lg-node-dot"
              />
              <text
                x={p.x}
                y={p.y + r + 14}
                textAnchor="middle"
                fill="var(--text-2)"
                fontSize={8}
                fontFamily="var(--font-mono)"
                className="lg-holo-label"
                opacity={0}
                transform="translateY(4px)"
              >
                {nodes[i] || DEFAULT_NODES[i]}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
