import React, { useEffect, useRef, useState } from "react";
import {
  Search,
  ArrowRight,
  ChevronDown,
  Zap,
  FileCode2,
  Lock,
  Shield,
  Globe,
  Layers,
  BrainCircuit,
  Workflow,
  Gauge,
  BarChart3,
  ShieldCheck,
} from "lucide-react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import "./LandingPage.css";

gsap.registerPlugin(ScrollTrigger);

/* ── Data ─────────────────────────────────────────────────────── */
const FEATURES = [
  {
    Icon: Zap,
    title: "6 AI Agents in Parallel",
    desc: "Architecture mapper, API surface analyzer, security auditor, dependency tracker, code quality scorer, and documentation reviewer — all running simultaneously.",
  },
  {
    Icon: Shield,
    title: "Security & CVE Scanning",
    desc: "Automatic CVE matching against every dependency. Exploit scenario generation, CVSS scoring, and one-click crisis simulation.",
  },
  {
    Icon: Layers,
    title: "Architecture Visualization",
    desc: "Auto-generated dependency graphs, module boundaries, and call chains. Understand data flow at a glance.",
  },
  {
    Icon: FileCode2,
    title: "Deep Code Understanding",
    desc: "Goes beyond syntax. Understands business logic, design patterns, architectural decisions, and tech debt hotspots.",
  },
  {
    Icon: Globe,
    title: "GitHub URL Analysis",
    desc: "Paste any public GitHub URL. GitMind clones, parses, and produces a senior-engineer-level report in under 60 seconds.",
  },
  {
    Icon: ShieldCheck,
    title: "Zero Setup Required",
    desc: "No config files, no SDK, no boilerplate. Point at a repo and get results. Works with any language or framework.",
  },
  {
    Icon: BrainCircuit,
    title: "AI-Powered Insights",
    desc: "Reasons about your code like a senior engineer — suggesting refactors, flagging anti-patterns, predicting failure points.",
  },
  {
    Icon: Workflow,
    title: "Dependency Risk Mapping",
    desc: "Maps the full dependency tree and highlights vulnerable, outdated, or abandoned packages.",
  },
  {
    Icon: Gauge,
    title: "Performance Profiling",
    desc: "Identifies hot paths, N+1 queries, unnecessary re-renders, and memory leaks ranked by impact.",
  },
];

const STATS = [
  { value: "6", label: "AI Agents", Icon: Zap },
  { value: "<60s", label: "Full Analysis", Icon: BarChart3 },
  { value: "30+", label: "Languages", Icon: Globe },
  { value: "0", label: "Config Required", Icon: Lock },
];

/* ── Floating Particles ──────────────────────────────────────── */
function Particles() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let ctx;
    try {
      ctx = canvas.getContext("2d");
    } catch (e) {
      // jsdom (Jest) doesn't implement getContext; bail out gracefully
      return;
    }
    if (!ctx) return;
    let raf;
    const particles = [];
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);
    /* Fewer particles on small screens keeps the hero smooth on mobile */
    const count = window.innerWidth < 480 ? 20 : 50;
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 1.5 + 0.5,
        dx: (Math.random() - 0.5) * 0.2,
        dy: (Math.random() - 0.5) * 0.2,
        o: Math.random() * 0.4 + 0.1,
      });
    }
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.x += p.dx;
        p.y += p.dy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(96, 165, 250, ${p.o})`;
        ctx.fill();
      });
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);
  return <canvas ref={canvasRef} className="lp-particles" />;
}

/* ── Gradient Orbs ───────────────────────────────────────────── */
function GradientOrb({ className }) {
  return <div className={`lp-orb ${className || ""}`} />;
}

/* ── useScrollReveal ─────────────────────────────────────────── */
function useScrollReveal(threshold = 0.15) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("lp-visible");
          observer.unobserve(el);
        }
      },
      { threshold },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);
  return ref;
}

/* ── Feature Card ────────────────────────────────────────────── */
function FeatureCard({ Icon, title, desc, delay }) {
  const ref = useScrollReveal();
  return (
    <div
      ref={ref}
      className="lp-feature-card"
      style={{ transitionDelay: `${delay}s` }}
    >
      <div className="lp-feature-icon">
        <Icon size={20} />
      </div>
      <h3 className="lp-feature-title">{title}</h3>
      <p className="lp-feature-desc">{desc}</p>
    </div>
  );
}

/* ── Stat Item ───────────────────────────────────────────────── */
function StatItem({ value, label, Icon, delay }) {
  const ref = useScrollReveal();
  return (
    <div
      ref={ref}
      className="lp-stat-item"
      style={{ transitionDelay: `${delay}s` }}
    >
      <div className="lp-stat-icon">
        <Icon size={20} />
      </div>
      <div className="lp-stat-value">{value}</div>
      <div className="lp-stat-label">{label}</div>
    </div>
  );
}

/* ── How Step ────────────────────────────────────────────────── */
function HowStep({ num, title, desc, delay }) {
  const ref = useScrollReveal();
  return (
    <div
      ref={ref}
      className="lp-how-step"
      style={{ transitionDelay: `${delay}s` }}
    >
      <div className="lp-how-step-num">{num}</div>
      <h3 className="lp-how-step-title">{title}</h3>
      <p className="lp-how-step-desc">{desc}</p>
    </div>
  );
}

/* ── Hero Form ───────────────────────────────────────────────── */
/* Isolated component so typing in the input only re-renders the form,
   not the whole landing page (feature grid, stats, steps, etc.). */
function HeroForm({ onLoad, onAnalyzeUrl, inputRef }) {
  const [input, setInput] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    if (input.includes("github.com")) {
      onAnalyzeUrl(input.trim());
    } else {
      onLoad(input.trim());
    }
  };

  return (
    <>
      <form
        className="lp-hero-input-group"
        onSubmit={handleSubmit}
        aria-label="Analyze a GitHub repository"
      >
        <div className="lp-hero-input-wrapper">
          <Search size={16} className="lp-hero-input-icon" />
          <input
            ref={inputRef}
            className="lp-hero-input"
            placeholder="GitHub username or repo URL"
            aria-label="GitHub username or repository URL"
            autoComplete="off"
            spellCheck={false}
            value={input}
            onChange={(e) => setInput(e.target.value)}
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
    </>
  );
}

/* ── Hero Product Preview ───────────────────────────────────── */
/* A tasteful agent-scan radar that shows GitMind in action — 6
   agents sweeping a repository in parallel. Kept decorative
   (aria-hidden) since the real product is one click away. */

const SCAN_AGENTS = [
  { code: "SCAN", angle: 0 },
  { code: "SEC", angle: 60 },
  { code: "CVE", angle: 120 },
  { code: "ARCH", angle: 180 },
  { code: "DOCS", angle: 240 },
  { code: "GIT", angle: 300 },
];

function HeroPreview() {
  return (
    <div className="lp-preview" aria-hidden="true">
      {/* Window chrome */}
      <div className="lp-preview-chrome">
        <span className="lp-preview-dots">
          <i />
          <i />
          <i />
        </span>
        <span className="lp-preview-title">gitmind · facebook/react</span>
        <span className="lp-preview-badge">
          <span className="lp-preview-pulse" />6 AGENTS · SWEEPING
        </span>
      </div>

      <div className="lp-preview-body">
        {/* File tree sidebar */}
        <div className="lp-preview-sidebar">
          {[
            "src/",
            "  components/",
            "  hooks/",
            "  utils/",
            "  App.js",
            "  index.js",
            "package.json",
            "webpack.config.js",
          ].map((line, i) => (
            <div
              key={i}
              className={`lp-preview-tree${line.startsWith("  ") ? " indent" : ""}${i === 2 ? " active" : ""}`}
            >
              {line.trim()}
            </div>
          ))}
        </div>

        {/* Agent-scan radar */}
        <div className="lp-radar">
          {/* Orbit rings */}
          <span className="lp-radar-ring r1" />
          <span className="lp-radar-ring r2" />
          <span className="lp-radar-ring r3" />
          <span className="lp-radar-ring r4" />
          {/* Rotating sweep beam */}
          <span className="lp-radar-sweep" />
          {/* Crosshair ticks */}
          <span className="lp-radar-tick t0" />
          <span className="lp-radar-tick t60" />
          <span className="lp-radar-tick t120" />

          {/* Central repository node */}
          <div className="lp-radar-core">
            <span className="lp-radar-core-mark">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </span>
            <span className="lp-radar-core-label">repo</span>
          </div>

          {/* Six orbiting agent nodes */}
          {SCAN_AGENTS.map(({ code, angle }, i) => (
            <div
              key={code}
              className="lp-radar-orbit"
              style={{
                transform: `rotate(${angle}deg) translateX(var(--radar-r))`,
              }}
            >
              <div
                className="lp-radar-agent"
                style={{
                  transform: `translate(-50%, -50%) rotate(${-angle}deg)`,
                }}
              >
                <span
                  className="lp-radar-agent-dot"
                  style={{ animationDelay: `${i * 0.32}s` }}
                />
                <span className="lp-radar-agent-code">{code}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Terminal footer */}
      <div className="lp-preview-terminal">
        <span className="lp-preview-prompt">$</span>
        <span className="lp-preview-cmd">gitmind analyze facebook/react</span>
        <span className="lp-preview-cursor" />
        <span className="lp-preview-ok">
          <span className="lp-preview-ok-check">✓</span>
          <span className="lp-preview-ok-text">
            3 findings · grade A · 48 endpoints
          </span>
        </span>
      </div>
    </div>
  );
}

/* ── Main Landing Page ───────────────────────────────────────── */
export default function LandingPage({ onLoad, onAnalyzeUrl }) {
  const [scrollY, setScrollY] = useState(0);
  const [activeSection, setActiveSection] = useState("");
  const heroInputRef = useRef(null);
  const heroRef = useRef(null);
  const featuresRef = useRef(null);
  const statsRef = useRef(null);
  const howRef = useRef(null);
  const ctaRef = useRef(null);

  /* Lenis smooth scroll + GSAP ticker */
  useEffect(() => {
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    )?.matches;
    if (reducedMotion) return;

    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      /* Smooth in-page anchor navigation (#features, #stats, #how-it-works).
         Lenis intercepts same-page hash clicks and scrolls via its own
         animation; scroll-margin-top: 80px on the sections is respected
         automatically, so the fixed nav never covers the section header. */
      anchors: true,
    });

    const raf = (time) => {
      lenis.raf(time);
      requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);

    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((time) => {
      lenis.raf(time * 1000);
    });
    gsap.ticker.lagSmoothing(0);

    return () => {
      lenis.destroy();
      gsap.ticker.remove((time) => {
        lenis.raf(time * 1000);
      });
    };
  }, []);

  /* GSAP scroll animations */
  useEffect(() => {
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    )?.matches;
    if (reducedMotion) return;

    const ctx = gsap.context(() => {
      /* Hero parallax */
      if (heroRef.current) {
        gsap.to(".lp-hero-content", {
          y: -80,
          opacity: 0,
          ease: "none",
          scrollTrigger: {
            trigger: heroRef.current,
            start: "top top",
            end: "bottom top",
            scrub: 1,
          },
        });
      }

      /* Section headers */
      gsap.utils.toArray(".lp-section-header").forEach((el) => {
        gsap.from(el, {
          y: 40,
          opacity: 0,
          duration: 0.8,
          ease: "power3.out",
          scrollTrigger: {
            trigger: el,
            start: "top 85%",
            toggleActions: "play none none none",
          },
        });
      });

      /* NOTE: stats are revealed by useScrollReveal (.lp-visible class)
         only — a gsap.from opacity:0 tween here pinned an inline
         opacity:0 that overrode the class and kept them invisible. */
    });

    return () => ctx.revert();
  }, []);

  /* Scroll position tracking — the landing page scrolls with the window */
  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* Nav active section observer */
  useEffect(() => {
    const sections = ["features", "stats", "how-it-works"];
    const observers = [];
    sections.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActiveSection(id);
        },
        { threshold: 0.3, rootMargin: "-56px 0px 0px 0px" },
      );
      observer.observe(el);
      observers.push(observer);
    });
    return () => observers.forEach((o) => o.disconnect());
  }, []);

  return (
    <div className="lp">
      <Particles />

      {/* ── Nav ──────────────────────────────────────────────── */}
      <nav className="lp-nav">
        <div className="lp-nav-inner">
          <div className="lp-nav-brand">
            <div className="lp-nav-logo">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <span>GitMind</span>
          </div>
          <div className="lp-nav-links">
            <a
              href="#features"
              className={`lp-nav-link${activeSection === "features" ? " lp-nav-link--active" : ""}`}
            >
              Features
            </a>
            <a
              href="#stats"
              className={`lp-nav-link${activeSection === "stats" ? " lp-nav-link--active" : ""}`}
            >
              Stats
            </a>
            <a
              href="#how-it-works"
              className={`lp-nav-link${activeSection === "how-it-works" ? " lp-nav-link--active" : ""}`}
            >
              How it works
            </a>
          </div>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="lp-hero" ref={heroRef}>
        <GradientOrb className="lp-orb-1" />
        <GradientOrb className="lp-orb-2" />
        <div className="lp-hero-content">
          <div className="lp-badge">AI-Powered Code Intelligence</div>
          <h1 className="lp-hero-title">
            <span className="lp-title-line">Understand your code.</span>
            <br />
            <span className="lp-title-line lp-title-accent">
              Ship with confidence.
            </span>
          </h1>
          <p className="lp-hero-sub">
            Analyze repositories for vulnerabilities, architecture patterns, and
            code quality — powered by 6 AI agents working in parallel.
          </p>
          <HeroForm
            onLoad={onLoad}
            onAnalyzeUrl={onAnalyzeUrl}
            inputRef={heroInputRef}
          />
          <HeroPreview />
        </div>
        <div
          className="lp-scroll-hint"
          style={{ opacity: Math.max(0, 1 - scrollY * 0.005) }}
        >
          <ChevronDown size={20} />
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────── */}
      <section id="features" className="lp-features" ref={featuresRef}>
        <GradientOrb className="lp-orb-3" />
        <div className="lp-section-inner">
          <div className="lp-section-header">
            <div>
              <span className="lp-section-label">What's Inside</span>
              <h2 className="lp-section-title">
                Everything you need to ship safer
              </h2>
              <p className="lp-section-sub">
                Six agents working in parallel to analyze every dimension of
                your repository.
              </p>
            </div>
          </div>
          <div className="lp-features-grid">
            {FEATURES.map(({ Icon, title, desc }, i) => (
              <FeatureCard
                key={title}
                Icon={Icon}
                title={title}
                desc={desc}
                delay={i * 0.06}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── Stats ────────────────────────────────────────────── */}
      <section id="stats" className="lp-stats" ref={statsRef}>
        <div className="lp-section-inner">
          <div className="lp-stats-grid">
            {STATS.map(({ value, label, Icon }, i) => (
              <StatItem
                key={label}
                value={value}
                label={label}
                Icon={Icon}
                delay={i * 0.1}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ─────────────────────────────────────── */}
      <section id="how-it-works" className="lp-how" ref={howRef}>
        <GradientOrb className="lp-orb-4" />
        <div className="lp-section-inner">
          <div className="lp-section-header">
            <div>
              <span className="lp-section-label">How It Works</span>
              <h2 className="lp-section-title">Three steps to insight</h2>
              <p className="lp-section-sub">
                No configuration. No setup. Just paste and go.
              </p>
            </div>
          </div>
          <div className="lp-how-steps">
            <HowStep
              num="01"
              title="Enter a repo"
              desc="Paste a GitHub URL or type a username to browse repos."
              delay={0}
            />
            <HowStep
              num="02"
              title="AI analyzes"
              desc="Six agents scan security, architecture, docs, CVEs, and code quality in parallel."
              delay={0.12}
            />
            <HowStep
              num="03"
              title="Get results"
              desc="Interactive reports with severity-ranked findings, fix suggestions, and exportable PDFs."
              delay={0.24}
            />
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────── */}
      <section className="lp-cta" ref={ctaRef}>
        <GradientOrb className="lp-orb-5" />
        <div className="lp-section-inner">
          <h2 className="lp-cta-title">Ready to analyze your code?</h2>
          <p className="lp-cta-sub">
            Start with a public repository or connect your GitHub token for
            private repos.
          </p>
          <button
            className="lp-cta-btn"
            onClick={() => {
              heroInputRef.current?.focus({ preventScroll: true });
              heroInputRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "center",
              });
            }}
          >
            Get started
            <ArrowRight size={16} />
          </button>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div className="lp-footer-brand">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
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
