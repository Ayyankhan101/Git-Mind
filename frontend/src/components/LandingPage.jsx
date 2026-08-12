import React, { useEffect, useRef, useState } from "react";
import { Search, ArrowRight, Shield, GitBranch, FileCode2, Lock, Code2, MessageSquare, ChevronDown } from "lucide-react";
import "./LandingPage.css";

/* ── Floating Particles ──────────────────────────────────────── */
function Particles() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf;
    const particles = [];
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener("resize", resize);
    for (let i = 0; i < 60; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 2 + 0.5,
        dx: (Math.random() - 0.5) * 0.3,
        dy: (Math.random() - 0.5) * 0.3,
        o: Math.random() * 0.5 + 0.1,
      });
    }
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.x += p.dx; p.y += p.dy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(124, 111, 224, ${p.o})`;
        ctx.fill();
      });
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={canvasRef} className="lp-particles" />;
}

/* ── Animated Gradient Orb ───────────────────────────────────── */
function GradientOrb({ className }) {
  return <div className={`lp-orb ${className || ""}`} />;
}

/* ── SVG Code Visualization ──────────────────────────────────── */
function CodeViz({ scrollY }) {
  const offset = scrollY * 0.15;
  return (
    <svg className="lp-code-viz" viewBox="0 0 800 400" fill="none">
      {/* Grid lines */}
      {Array.from({ length: 20 }).map((_, i) => (
        <line key={`h${i}`} x1="0" y1={i * 20} x2="800" y2={i * 20}
          stroke="var(--border-s)" strokeWidth="0.5" opacity={0.3} />
      ))}
      {Array.from({ length: 40 }).map((_, i) => (
        <line key={`v${i}`} x1={i * 20} y1="0" x2={i * 20} y2="400"
          stroke="var(--border-s)" strokeWidth="0.5" opacity={0.3} />
      ))}
      {/* Animated nodes */}
      {[
        { cx: 200, cy: 120, r: 24, color: "var(--primary)", delay: 0 },
        { cx: 400, cy: 80, r: 18, color: "var(--info)", delay: 0.2 },
        { cx: 600, cy: 140, r: 20, color: "var(--success)", delay: 0.4 },
        { cx: 300, cy: 250, r: 16, color: "var(--warning)", delay: 0.6 },
        { cx: 500, cy: 280, r: 22, color: "var(--primary)", delay: 0.8 },
        { cx: 150, cy: 320, r: 14, color: "var(--danger)", delay: 1.0 },
        { cx: 650, cy: 300, r: 19, color: "var(--info)", delay: 1.2 },
      ].map((n, i) => (
        <g key={i}>
          <circle cx={n.cx} cy={n.cy + Math.sin((offset + i * 30) * 0.02) * 8}
            r={n.r} fill={n.color} opacity={0.15} />
          <circle cx={n.cx} cy={n.cy + Math.sin((offset + i * 30) * 0.02) * 8}
            r={n.r * 0.6} fill={n.color} opacity={0.4} />
          <circle cx={n.cx} cy={n.cy + Math.sin((offset + i * 30) * 0.02) * 8}
            r={n.r * 0.3} fill={n.color} opacity={0.9} />
        </g>
      ))}
      {/* Connection lines */}
      {[
        [200, 120, 400, 80], [400, 80, 600, 140], [200, 120, 300, 250],
        [300, 250, 500, 280], [600, 140, 500, 280], [150, 320, 300, 250],
        [500, 280, 650, 300],
      ].map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
          stroke="var(--primary)" strokeWidth="1" opacity={0.2}
          strokeDasharray="4 4" />
      ))}
    </svg>
  );
}

/* ── Security Shield SVG ─────────────────────────────────────── */
function ShieldViz({ scrollY }) {
  const progress = Math.min(1, Math.max(0, (scrollY - 600) / 400));
  return (
    <svg className="lp-shield-viz" viewBox="0 0 200 240" fill="none">
      <path d="M100 20 L180 60 L180 140 Q180 200 100 230 Q20 200 20 140 L20 60 Z"
        fill="var(--primary)" fillOpacity={0.08 + progress * 0.12}
        stroke="var(--primary)" strokeWidth="2" strokeOpacity={0.3 + progress * 0.4} />
      <path d="M100 50 L155 75 L155 130 Q155 175 100 195 Q45 175 45 130 L45 75 Z"
        fill="var(--primary)" fillOpacity={0.05 + progress * 0.1}
        stroke="var(--primary)" strokeWidth="1" strokeOpacity={0.2 + progress * 0.3}
        strokeDasharray={`${progress * 400} 400`} />
      {/* Checkmark */}
      <path d="M70 120 L90 140 L130 100" fill="none" stroke="var(--success)"
        strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray={`${progress * 100} 100`} opacity={progress} />
    </svg>
  );
}

/* ── Architecture Diagram SVG ────────────────────────────────── */
function ArchViz({ scrollY }) {
  const progress = Math.min(1, Math.max(0, (scrollY - 1200) / 400));
  const boxes = [
    { x: 300, y: 40, w: 200, h: 50, label: "API Gateway", color: "var(--primary)" },
    { x: 100, y: 140, w: 160, h: 40, label: "Auth Service", color: "var(--info)" },
    { x: 320, y: 140, w: 160, h: 40, label: "Core Engine", color: "var(--success)" },
    { x: 540, y: 140, w: 160, h: 40, label: "AI Agents", color: "var(--warning)" },
    { x: 200, y: 240, w: 140, h: 36, label: "Database", color: "var(--primary)" },
    { x: 460, y: 240, w: 140, h: 36, label: "Cache", color: "var(--info)" },
  ];
  return (
    <svg className="lp-arch-viz" viewBox="0 0 800 320" fill="none">
      {boxes.map((b, i) => (
        <g key={i} opacity={progress > i * 0.15 ? 1 : 0}
          style={{ transition: "opacity 0.5s ease" }}>
          <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="8"
            fill="var(--surface-0)" stroke={b.color} strokeWidth="1.5" />
          <text x={b.x + b.w / 2} y={b.y + b.h / 2 + 4} textAnchor="middle"
            fill="var(--text-2)" fontSize="12" fontFamily="var(--font-mono)">
            {b.label}
          </text>
        </g>
      ))}
      {/* Connection lines */}
      {[
        [400, 90, 180, 140], [400, 90, 400, 140], [400, 90, 620, 140],
        [180, 180, 270, 240], [400, 180, 270, 240], [400, 180, 530, 240],
        [620, 180, 530, 240],
      ].map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
          stroke="var(--primary)" strokeWidth="1" opacity={progress * 0.3}
          strokeDasharray="4 4" />
      ))}
    </svg>
  );
}

/* ── Main Landing Page ───────────────────────────────────────── */
export default function LandingPage({ onLoad, onAnalyzeUrl }) {
  const [input, setInput] = useState("");
  const [scrollY, setScrollY] = useState(0);
  const lpRef = useRef(null);

  useEffect(() => {
    const el = lpRef.current;
    if (!el) return;
    const onScroll = () => setScrollY(el.scrollTop);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    if (input.includes("github.com")) {
      onAnalyzeUrl(input.trim());
    } else {
      onLoad(input.trim());
    }
  };

  const features = [
    { Icon: Shield, title: "Security Scanning", desc: "Find vulnerabilities, secrets, and misconfigurations across your codebase." },
    { Icon: GitBranch, title: "Architecture Maps", desc: "Interactive diagrams showing module dependencies and data flow." },
    { Icon: FileCode2, title: "API Documentation", desc: "Auto-generated endpoint docs from your source code." },
    { Icon: Lock, title: "CVE Intelligence", desc: "Match dependencies against known CVE databases." },
    { Icon: Code2, title: "Code Audit", desc: "Deep static analysis with severity-ranked findings." },
    { Icon: MessageSquare, title: "AI Chat", desc: "Ask questions about your codebase in natural language." },
  ];

  const steps = [
    { num: "01", title: "Enter a repo", desc: "Paste a URL or type a GitHub username." },
    { num: "02", title: "AI analyzes", desc: "Six agents scan security, architecture, docs, and more." },
    { num: "03", title: "Get results", desc: "Interactive reports with findings, fixes, and exportable PDFs." },
  ];

  return (
    <div className="lp" ref={lpRef}>
      <Particles />

      {/* ── Nav ──────────────────────────────────────────────── */}
      <nav className="lp-nav">
        <div className="lp-nav-inner">
          <div className="lp-nav-brand">
            <div className="lp-nav-logo">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <span>GitMind</span>
          </div>
          <div className="lp-nav-links">
            <a href="#features">Features</a>
            <a href="#how-it-works">How it works</a>
          </div>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="lp-hero">
        <GradientOrb className="lp-orb-1" />
        <GradientOrb className="lp-orb-2" />
        <CodeViz scrollY={scrollY} />
        <div className="lp-hero-content">
          <div className="lp-badge">AI-Powered Code Intelligence</div>
          <h1 className="lp-hero-title">
            <span className="lp-title-line" style={{ transform: `translateY(${scrollY * -0.1}px)`, opacity: 1 - scrollY * 0.002 }}>
              Understand your code.
            </span>
            <br />
            <span className="lp-title-line" style={{ transform: `translateY(${scrollY * -0.05}px)`, opacity: 1 - scrollY * 0.0015 }}>
              Ship with confidence.
            </span>
          </h1>
          <p className="lp-hero-sub" style={{ transform: `translateY(${scrollY * -0.08}px)`, opacity: 1 - scrollY * 0.002 }}>
            Analyze repositories for vulnerabilities, architecture patterns, and
            code quality — powered by multi-agent AI.
          </p>
          <form className="lp-hero-input-group" onSubmit={handleSubmit}>
            <div className="lp-hero-input-wrapper">
              <Search size={16} className="lp-hero-input-icon" />
              <input
                className="lp-hero-input"
                placeholder="GitHub username or repo URL"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                autoFocus
              />
            </div>
            <button type="submit" className="lp-hero-btn">
              Analyze
              <ArrowRight size={14} />
            </button>
          </form>
          <p className="lp-hero-hint">
            Try <span>facebook/react</span> or paste a repo URL
          </p>
        </div>
        <div className="lp-scroll-hint" style={{ opacity: Math.max(0, 1 - scrollY * 0.005) }}>
          <ChevronDown size={20} />
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────── */}
      <section id="features" className="lp-features">
        <GradientOrb className="lp-orb-3" />
        <div className="lp-section-inner">
          <div className="lp-section-header">
            <ShieldViz scrollY={scrollY} />
            <div>
              <h2 className="lp-section-title">Everything you need to ship safer</h2>
              <p className="lp-section-sub">
                Six agents working in parallel to analyze every dimension of your
                repository.
              </p>
            </div>
          </div>
          <div className="lp-features-grid">
            {features.map(({ Icon, title, desc }, i) => (
              <div key={title} className="lp-feature-card"
                style={{ animationDelay: `${i * 0.1}s` }}>
                <div className="lp-feature-icon">
                  <Icon size={20} />
                </div>
                <h3 className="lp-feature-title">{title}</h3>
                <p className="lp-feature-desc">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ─────────────────────────────────────── */}
      <section id="how-it-works" className="lp-how">
        <GradientOrb className="lp-orb-4" />
        <div className="lp-section-inner">
          <div className="lp-section-header">
            <ArchViz scrollY={scrollY} />
            <div>
              <h2 className="lp-section-title">Three steps to insight</h2>
              <p className="lp-section-sub">
                No configuration. No setup. Just paste and go.
              </p>
            </div>
          </div>
          <div className="lp-how-steps">
            {steps.map(({ num, title, desc }, i) => (
              <div key={num} className="lp-how-step"
                style={{ animationDelay: `${i * 0.15}s` }}>
                <div className="lp-how-step-num">{num}</div>
                <h3 className="lp-how-step-title">{title}</h3>
                <p className="lp-how-step-desc">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────── */}
      <section className="lp-cta">
        <GradientOrb className="lp-orb-5" />
        <div className="lp-section-inner">
          <h2 className="lp-cta-title">Ready to analyze your code?</h2>
          <p className="lp-cta-sub">
            Start with a public repository or connect your GitHub token for private
            repos.
          </p>
          <button className="lp-cta-btn" onClick={() => onLoad("")}>
            Get started
            <ArrowRight size={16} />
          </button>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div className="lp-footer-brand">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
            <span>GitMind</span>
          </div>
          <p className="lp-footer-copy">Built with AI. Open source.</p>
        </div>
      </footer>
    </div>
  );
}
