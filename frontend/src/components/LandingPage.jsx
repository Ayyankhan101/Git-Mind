import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  Suspense,
  lazy,
} from "react";
import {
  Search,
  ArrowRight,
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
  ShieldAlert,
} from "../icons";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import "./LandingPage.css";
import ThemeSwitcher from "./ThemeSwitcher";
import { loadTheme } from "../themeLoader";

// HealthCard pulls three.js via HealthGauge3D — keep it out of the
// landing entry chunk.
const HealthCard = lazy(() => import("./HealthCard"));

// three.js stays out of the landing bundle until the hero mounts.
const SceneManager = lazy(() => import("./SceneManager"));
const LandingScene = lazy(() => import("./LandingScene"));

gsap.registerPlugin(ScrollTrigger);

/* ── Data ─────────────────────────────────────────────────────── */
/* `span` drives the bento rhythm: xl tiles span all 6 columns (flagship),
   lg tiles span 4, sm tiles span 2. Order is the 4-row layout — never a
   3-equal-columns grid. */
const FEATURES = [
  {
    Icon: Zap,
    title: "6 AI Agents in Parallel",
    desc: "Architecture mapper, API surface analyzer, security auditor, dependency tracker, code quality scorer, and documentation reviewer — all running simultaneously.",
    span: "xl",
    visual: "agents",
  },
  {
    Icon: Shield,
    title: "Security & CVE Scanning",
    desc: "Automatic CVE matching against every dependency. Exploit scenario generation, CVSS scoring, and one-click crisis simulation.",
    span: "sm",
  },
  {
    Icon: Layers,
    title: "Architecture Visualization",
    desc: "Auto-generated dependency graphs, module boundaries, and call chains. Understand data flow at a glance.",
    span: "sm",
  },
  {
    Icon: FileCode2,
    title: "Deep Code Understanding",
    desc: "Goes beyond syntax. Understands business logic, design patterns, architectural decisions, and tech debt hotspots.",
    span: "sm",
  },
  {
    Icon: Globe,
    title: "GitHub URL Analysis",
    desc: "Paste any public GitHub URL. GitMind clones, parses, and produces a senior-engineer-level report in under 60 seconds.",
    span: "sm",
  },
  {
    Icon: ShieldCheck,
    title: "Zero Setup Required",
    desc: "No config files, no SDK, no boilerplate. Point at a repo and get results. Works with any language or framework.",
    span: "sm",
  },
  {
    Icon: BrainCircuit,
    title: "AI-Powered Insights",
    desc: "Reasons about your code like a senior engineer — suggesting refactors, flagging anti-patterns, predicting failure points.",
    span: "lg",
  },
  {
    Icon: Workflow,
    title: "Dependency Risk Mapping",
    desc: "Maps the full dependency tree and highlights vulnerable, outdated, or abandoned packages.",
    span: "sm",
  },
  {
    Icon: Gauge,
    title: "Performance Profiling",
    desc: "Identifies hot paths, N+1 queries, unnecessary re-renders, and memory leaks ranked by impact.",
    span: "lg",
  },
];

const STATS = [
  { value: "6", label: "AI Agents", Icon: Zap },
  { value: "<60s", label: "Full Analysis", Icon: BarChart3 },
  { value: "30+", label: "Languages", Icon: Globe },
  { value: "0", label: "Config Required", Icon: Lock },
];

/* The 30+ language marquee strip (one marquee per page, real content). */
const LANGUAGES = [
  "JavaScript",
  "TypeScript",
  "Python",
  "Rust",
  "Go",
  "Java",
  "C++",
  "C#",
  "Ruby",
  "PHP",
  "Swift",
  "Kotlin",
  "Solidity",
  "SQL",
  "HTML/CSS",
  "Bash",
  "Dockerfile",
  "YAML",
  "JSON",
  "GraphQL",
  "Terraform",
  "Scala",
  "Elixir",
  "Zig",
  "Haskell",
  "R",
  "Lua",
  "Dart",
  "Objective-C",
  "Assembly",
];

/* Sample report data — rendered through the REAL HealthCard component
   and the dashboard's finding-card classes, explicitly labeled as
   sample output in the panel header. */
const SAMPLE_HEALTH = {
  grade: "A",
  score: 92,
  breakdown: {
    security: 88,
    documentation: 94,
    api_coverage: 91,
    dependency_freshness: 96,
    code_quality: 89,
  },
};

const REPORT_STATS = [
  { value: "3", label: "Findings", Icon: ShieldAlert },
  { value: "48", label: "Endpoints", Icon: Globe },
  { value: "214", label: "Files", Icon: FileCode2 },
];

const REPORT_FINDINGS = [
  {
    sev: "critical",
    title: "Dependency with critical CVE in production path",
    path: "requirements.txt:14",
  },
  {
    sev: "high",
    title: "Hardcoded secret in version-controlled file",
    path: "src/config.py:31",
  },
  {
    sev: "medium",
    title: "Broad CORS policy on all API routes",
    path: "src/main.py:88",
  },
];

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

/* ── Bento Feature Card ──────────────────────────────────────── */
function FeatureCard({ Icon, title, desc, span, children, delay }) {
  const ref = useScrollReveal();
  return (
    <div
      ref={ref}
      className={`lp-feature-card lp-feature-card--${span}`}
      style={{ "--reveal-delay": `${delay}s` }}
    >
      <div className="lp-feature-icon">
        <Icon size={span === "lg" || span === "xl" ? 22 : 20} />
      </div>
      <h3 className="lp-feature-title">{title}</h3>
      <p className="lp-feature-desc">{desc}</p>
      {children}
    </div>
  );
}

/* ── Mini agent pipeline (flagship tile) ─────────────────────── */
/* Decorative echo of the hero radar: six agents sweeping in
   parallel, animated via transform/opacity only. */
function AgentPipeline() {
  const agents = ["SCAN", "SEC", "CVE", "ARCH", "DOCS", "GIT"];
  return (
    <div className="lp-bento-agents" aria-hidden="true">
      {agents.map((code, i) => (
        <span
          key={code}
          className="lp-bento-agent"
          style={{ animationDelay: `${i * 0.18}s` }}
        >
          <i />
          {code}
        </span>
      ))}
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
      style={{ "--reveal-delay": `${delay}s` }}
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
function HowStep({ title, desc, delay, step }) {
  const ref = useScrollReveal();
  return (
    <div
      ref={ref}
      className="lp-how-step"
      style={{ "--reveal-delay": `${delay}s` }}
    >
      <div className="lp-how-step-num">{step}</div>
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
  const [token, setToken] = useState("");
  const [tokenOpen, setTokenOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    setSubmitting(true);
    try {
      const ghToken = token.trim();
      /* Pass the token through only when actually provided, so the
         one-argument handlers keep working for public repos. */
      if (input.includes("github.com")) {
        if (ghToken) onAnalyzeUrl(input.trim(), ghToken);
        else onAnalyzeUrl(input.trim());
      } else if (ghToken) {
        onLoad(input.trim(), ghToken);
      } else {
        onLoad(input.trim());
      }
    } finally {
      setTimeout(() => setSubmitting(false), 2000);
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
            type="url"
            inputMode="url"
            className="lp-hero-input"
            name="github-repo"
            placeholder="e.g. facebook/react — username or repo URL…"
            aria-label="GitHub username or repository URL"
            autoComplete="off"
            spellCheck={false}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        </div>
        <button type="submit" className="lp-hero-btn" disabled={submitting}>
          {submitting ? (
            <>
              <span className="lp-hero-btn-spinner" />
              Analyzing…
            </>
          ) : (
            <>
              Analyze
              <ArrowRight size={14} />
            </>
          )}
        </button>
      </form>

      {/* Optional GitHub token — for private repos & higher rate limits.
         Collapsed by default so the hero stays clean; submits alongside
         the username/URL above. */}
      <div className="lp-token-row">
        <button
          type="button"
          className={`lp-token-toggle${tokenOpen ? " open" : ""}`}
          onClick={() => setTokenOpen((o) => !o)}
          aria-expanded={tokenOpen}
          aria-controls="lp-token-field"
        >
          <Lock size={12} />
          {tokenOpen ? "Hide token" : "Use GitHub token"}
        </button>
        {tokenOpen && (
          <div className="lp-token-field" id="lp-token-field">
            <input
              type="password"
              className="lp-token-input"
              name="github-token"
              placeholder="Personal access token — ghp_… (optional)…"
              aria-label="GitHub personal access token"
              autoComplete="off"
              spellCheck={false}
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <span className="lp-token-hint">
              Enables private repos &amp; higher rate limits
            </span>
          </div>
        )}
      </div>
    </>
  );
}

/* ── Main Landing Page ───────────────────────────────────────── */
export default function LandingPage({ onLoad, onAnalyzeUrl }) {
  const [activeSection, setActiveSection] = useState("");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [landingTheme, setLandingTheme] = useState(
    () => localStorage.getItem("gm-theme") || "default",
  );
  const landingDispatch = useCallback((action) => {
    if (action.type === "SET_THEME") {
      setLandingTheme(action.theme);
      document.documentElement.setAttribute("data-theme", action.theme);
      localStorage.setItem("gm-theme", action.theme);
      // Fetch the theme's CSS chunk — without this the palette tokens
      // never land on the landing route (dashboard path goes through
      // appReducer, which App.jsx backs with loadTheme()).
      loadTheme(action.theme);
    }
  }, []);

  /* Respect prefers-reduced-motion: the marquee renders a single
     (non-duplicated) copy, so the wrapped static list never repeats
     every language twice. */
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = (e) => setReducedMotion(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const heroInputRef = useRef(null);
  const heroRef = useRef(null);
  const featuresRef = useRef(null);
  const statsRef = useRef(null);
  const howRef = useRef(null);

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

    /* Single driver: gsap.ticker only. The previous version ALSO drove
       lenis from a self-scheduled rAF (two updates per frame) and its
       cleanup removed a freshly-created anonymous fn — a no-op — leaving
       an orphan loop calling lenis.raf on the destroyed instance. */
    const driveLenis = (time) => {
      lenis.raf(time * 1000);
    };
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add(driveLenis);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(driveLenis);
      lenis.destroy();
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
        gsap.to(".lp-hero-inner", {
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
      {/* Scroll-driven animation: a fixed progress bar that fills as you
         scroll down the page (CSS scroll-timeline, same as the dashboard). */}
      <div className="lp-scroll-progress" aria-hidden="true" />

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
          <div className="lp-nav-right">
            <div
              className={`lp-nav-links${mobileMenuOpen ? " mobile-open" : ""}`}
            >
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
            <ThemeSwitcher theme={landingTheme} dispatch={landingDispatch} />
            <button
              className="lp-nav-hamburger"
              onClick={() => setMobileMenuOpen((o) => !o)}
              aria-label="Toggle menu"
              aria-expanded={mobileMenuOpen}
            >
              <span
                className={`lp-nav-hamburger-line${mobileMenuOpen ? " open" : ""}`}
              />
              <span
                className={`lp-nav-hamburger-line${mobileMenuOpen ? " open" : ""}`}
              />
            </button>
          </div>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="lp-hero" ref={heroRef}>
        <Suspense fallback={null}>
          <SceneManager
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 0,
              pointerEvents: "none",
            }}
          >
            {({ sceneRef, subscribe, prefersReduced }) => (
              <Suspense fallback={null}>
                <LandingScene
                  sceneRef={sceneRef}
                  subscribe={subscribe}
                  prefersReduced={prefersReduced}
                />
              </Suspense>
            )}
          </SceneManager>
        </Suspense>
        <div className="lp-hero-inner" style={{ position: "relative", zIndex: 1 }}>
          <div className="lp-hero-copy">
            {/* Signature moment: agent radar sweep behind the copy — pure
                CSS rings + rotating conic sweep echoing the AgentPipeline
                motif. Anchored to the copy block so it always sits behind
                the text column, whatever the viewport. */}
            <div className="lp-hero-radar" aria-hidden="true" />
            <div className="lp-badge">AI-Powered Code Intelligence</div>
            <h1 className="lp-hero-title">
              <span className="lp-title-line">Understand code.</span>
              <br />
              <span className="lp-title-line lp-title-accent">
                Ship confidence.
              </span>
            </h1>
            <p className="lp-hero-sub">
              Analyze repositories for vulnerabilities, architecture patterns,
              and code quality — powered by 6 AI agents working in parallel.
            </p>
            <HeroForm
              onLoad={onLoad}
              onAnalyzeUrl={onAnalyzeUrl}
              inputRef={heroInputRef}
            />
          </div>
          <div className="lp-hero-preview">
            <div className="lp-hero-preview-window">
              <div className="lp-hero-preview-head">
                <span className="lp-hero-preview-repo">facebook/react</span>
                <span className="lp-hero-preview-tag">Sample output</span>
              </div>
              <Suspense fallback={null}>
                <HealthCard health={SAMPLE_HEALTH} static />
              </Suspense>
              <div className="lp-hero-preview-stats">
                {REPORT_STATS.map(({ value, label, Icon }) => (
                  <div key={label} className="lp-hero-preview-stat">
                    <Icon size={13} />
                    <span className="lp-hero-preview-stat-value">{value}</span>
                    <span className="lp-hero-preview-stat-label">{label}</span>
                  </div>
                ))}
              </div>
              <div className="lp-hero-preview-findings">
                {REPORT_FINDINGS.slice(0, 2).map((f) => (
                  <div key={f.title} className={`finding-card ${f.sev}`}>
                    <div className="finding-body">
                      <div className="finding-title">{f.title}</div>
                      <div className="finding-path">{f.path}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────── */}
      <section id="features" className="lp-features" ref={featuresRef}>
        <div className="lp-section-inner">
          <div className="lp-section-header">
            <div>
              <span className="lp-section-label">What’s Inside</span>
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
            {FEATURES.map(({ Icon, title, desc, span, visual }, i) => (
              <FeatureCard
                key={title}
                Icon={Icon}
                title={title}
                desc={desc}
                span={span}
                delay={i * 0.06}
              >
                {visual === "agents" && <AgentPipeline />}
              </FeatureCard>
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

      {/* ── Languages marquee ─────────────────────────────────── */}
      {/* The track duplicates the list only for the seamless loop.
         Decorative (aria-hidden): "30+ Languages" is already surfaced
         in the stats section, and reduced-motion users get one copy. */}
      <section className="lp-langs">
        <div className="lp-langs-track" aria-hidden="true">
          {(reducedMotion ? LANGUAGES : [...LANGUAGES, ...LANGUAGES]).map(
            (lang, i) => (
              <span key={`${lang}-${i}`} className="lp-langs-item">
                <span className="lp-langs-sep" aria-hidden="true" />
                {lang}
              </span>
            ),
          )}
        </div>
      </section>

      {/* ── How It Works ─────────────────────────────────────── */}
      <section id="how-it-works" className="lp-how" ref={howRef}>
        <div className="lp-section-inner">
          <div className="lp-section-header">
            <div>
              <h2 className="lp-section-title">Three steps to insight</h2>
              <p className="lp-section-sub">
                No configuration. No setup. Just paste and go.
              </p>
            </div>
          </div>
          <div className="lp-how-steps">
            <HowStep
              step="01"
              title="Enter a repo"
              desc="Paste a GitHub URL or type a username to browse repos."
              delay={0}
            />
            <HowStep
              step="02"
              title="AI analyzes"
              desc="Six agents scan security, architecture, docs, CVEs, and code quality in parallel."
              delay={0.12}
            />
            <HowStep
              step="03"
              title="Get results"
              desc="Interactive reports with severity-ranked findings, fix suggestions, and exportable PDFs."
              delay={0.24}
            />
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div className="lp-footer-left">
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
            <span className="lp-footer-sep">·</span>
            <span className="lp-footer-copy">Built with AI</span>
          </div>
          <div className="lp-footer-right">
            <ThemeSwitcher theme={landingTheme} dispatch={landingDispatch} />
            <a
              href="https://github.com/Ayyankhan101/Git-Mind"
              target="_blank"
              rel="noopener noreferrer"
              className="lp-footer-link"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
