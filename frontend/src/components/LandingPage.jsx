import React, { useState, useEffect, useRef } from "react";
import {
  ArrowRight,
  Zap,
  GitBranch,
  Lock,
  BarChart3,
  Globe,
  FileCode2,
  Search,
  BotMessageSquare,
  Layers,
  ShieldCheck,
  BrainCircuit,
  Workflow,
  Gauge,
} from "lucide-react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import "./LandingPage.css";

gsap.registerPlugin(ScrollTrigger);

const FEATURES = [
  {
    Icon: BotMessageSquare,
    title: "6 AI Agents in Parallel",
    desc: "Architecture mapper, API surface analyzer, security auditor, dependency tracker, code quality scorer, and documentation reviewer \u2014 all running simultaneously.",
  },
  {
    Icon: Search,
    title: "Security & CVE Scanning",
    desc: "Automatic CVE matching against every dependency. Exploit scenario generation, CVSS scoring, and one-click crisis simulation for your project.",
  },
  {
    Icon: Layers,
    title: "Architecture Visualization",
    desc: "Auto-generated dependency graphs, module boundaries, and call chains. Understand how data flows through your entire codebase at a glance.",
  },
  {
    Icon: FileCode2,
    title: "Deep Code Understanding",
    desc: "Goes beyond syntax. Understands business logic, design patterns, architectural decisions, and tech debt hotspots across every file.",
  },
  {
    Icon: Globe,
    title: "GitHub URL Analysis",
    desc: "Paste any public GitHub URL. Git Mind clones, parses, and produces a full senior-engineer-level report in under 60 seconds.",
  },
  {
    Icon: ShieldCheck,
    title: "Zero Setup Required",
    desc: "No config files, no SDK, no boilerplate. Point at a repo and get results. Works with any language, framework, or project size.",
  },
  {
    Icon: BrainCircuit,
    title: "AI-Powered Insights",
    desc: "Not just static analysis. Git Mind reasons about your code like a senior engineer \u2014 suggesting refactors, flagging anti-patterns, and predicting failure points.",
  },
  {
    Icon: Workflow,
    title: "Dependency Risk Mapping",
    desc: "Maps the full dependency tree and highlights vulnerable, outdated, or abandoned packages. Visualize supply chain risk before it becomes an incident.",
  },
  {
    Icon: Gauge,
    title: "Performance Profiling",
    desc: "Identifies hot paths, N+1 queries, unnecessary re-renders, and memory leaks. Get actionable performance recommendations ranked by impact.",
  },
];

const STATS = [
  { value: "6", label: "AI Agents", Icon: Zap },
  { value: "<60s", label: "Full Analysis", Icon: BarChart3 },
  { value: "30+", label: "Languages", Icon: Globe },
  { value: "0", label: "Config Required", Icon: Lock },
];

function splitLines(el) {
  if (!el) return;
  const text = el.innerHTML;
  const lines = text.split(/<br\s*\/?>/gi);
  el.innerHTML = lines
    .map(
      (line) =>
        `<span class="lp-line"><span class="lp-line-inner">${line}</span></span>`,
    )
    .join("");
}

export default function LandingPage({ onLoad, onAnalyzeUrl }) {
  const [inputVal, setInputVal] = useState("");
  const rootRef = useRef(null);
  const navRef = useRef(null);
  const heroContentRef = useRef(null);
  const headlineRef = useRef(null);
  const featuresRef = useRef(null);
  const statsRef = useRef(null);
  const ctaRef = useRef(null);
  const reducedMotion = useRef(false);

  useEffect(() => {
    reducedMotion.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
  }, []);

  /* Lenis smooth scroll + GSAP ticker sync */
  useEffect(() => {
    if (reducedMotion.current) return;

    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });

    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(lenis.raf);
      lenis.destroy();
      ScrollTrigger.getAll().forEach((t) => t.kill());
    };
  }, []);

  /* Headline line split + Hero entrance timeline */
  useEffect(() => {
    splitLines(headlineRef.current);

    if (reducedMotion.current) return;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

      tl.from(".lp-badge", {
        opacity: 0,
        y: 20,
        duration: 0.6,
        delay: 0.1,
      })
        .from(
          ".lp-hero-3d-title",
          {
            opacity: 0,
            y: 30,
            scale: 0.95,
            duration: 0.8,
          },
          "-=0.3",
        )
        .from(
          ".lp-headline .lp-line",
          {
            opacity: 0,
            y: 40,
            duration: 0.6,
            stagger: 0.12,
          },
          "-=0.4",
        )
        .from(
          ".lp-subhead",
          {
            opacity: 0,
            y: 20,
            duration: 0.5,
          },
          "-=0.3",
        )
        .from(
          ".lp-input-group",
          {
            opacity: 0,
            y: 20,
            duration: 0.5,
          },
          "-=0.2",
        )
        .from(
          ".lp-hero-hint",
          {
            opacity: 0,
            duration: 0.4,
          },
          "-=0.2",
        );
    }, rootRef);

    return () => ctx.revert();
  }, []);

  /* Nav shrink on scroll (scrub) */
  useEffect(() => {
    if (reducedMotion.current || !navRef.current) return;

    const ctx = gsap.context(() => {
      gsap.to(navRef.current, {
        scrollTrigger: {
          trigger: rootRef.current,
          start: "top top",
          end: "120px top",
          scrub: true,
        },
        padding: "6px 24px",
        duration: 0.1,
      });

      gsap.to(".lp-nav-inner", {
        scrollTrigger: {
          trigger: rootRef.current,
          start: "top top",
          end: "120px top",
          scrub: true,
        },
        padding: "6px 16px",
        gap: "0",
        duration: 0.1,
      });
    }, rootRef);

    return () => ctx.revert();
  }, []);

  /* Parallax on background orbs */
  useEffect(() => {
    if (reducedMotion.current) return;

    const ctx = gsap.context(() => {
      gsap.to(".lp-orb-1", {
        scrollTrigger: {
          trigger: rootRef.current,
          start: "top top",
          end: "bottom bottom",
          scrub: 1.5,
        },
        y: -120,
        ease: "none",
      });
      gsap.to(".lp-orb-2", {
        scrollTrigger: {
          trigger: rootRef.current,
          start: "top top",
          end: "bottom bottom",
          scrub: 2,
        },
        y: -80,
        ease: "none",
      });
      gsap.to(".lp-orb-3", {
        scrollTrigger: {
          trigger: rootRef.current,
          start: "top top",
          end: "bottom bottom",
          scrub: 2.5,
        },
        y: -60,
        ease: "none",
      });
    }, rootRef);

    return () => ctx.revert();
  }, []);

  /* Features: pinned section with staggered card reveals */
  useEffect(() => {
    if (reducedMotion.current || !featuresRef.current) return;

    const ctx = gsap.context(() => {
      const cards = featuresRef.current.querySelectorAll(".lp-feature-card");
      const header = featuresRef.current.querySelector(".lp-section-header");

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: featuresRef.current,
          start: "top 80%",
          end: "top 20%",
          scrub: 0.8,
        },
      });

      tl.from(header, {
        opacity: 0,
        y: 40,
        duration: 0.4,
      }).from(
        cards,
        {
          opacity: 0,
          y: 50,
          scale: 0.95,
          duration: 0.5,
          stagger: 0.08,
        },
        "-=0.2",
      );
    }, rootRef);

    return () => ctx.revert();
  }, []);

  /* Stats: scale-in + counter animation */
  useEffect(() => {
    if (reducedMotion.current || !statsRef.current) return;

    const ctx = gsap.context(() => {
      const items = statsRef.current.querySelectorAll(".lp-stat-item");

      gsap.from(items, {
        scrollTrigger: {
          trigger: statsRef.current,
          start: "top 80%",
          end: "top 40%",
          scrub: 0.6,
        },
        opacity: 0,
        scale: 0.8,
        y: 30,
        stagger: 0.1,
        ease: "power2.out",
      });
    }, rootRef);

    return () => ctx.revert();
  }, []);

  /* CTA: pin + reveal */
  useEffect(() => {
    if (reducedMotion.current || !ctaRef.current) return;

    const ctx = gsap.context(() => {
      gsap.from(".lp-cta-card", {
        scrollTrigger: {
          trigger: ctaRef.current,
          start: "top 75%",
          end: "top 35%",
          scrub: 0.6,
        },
        opacity: 0,
        y: 60,
        scale: 0.96,
        ease: "power2.out",
      });
    }, rootRef);

    return () => ctx.revert();
  }, []);

  /* Spline load */
  const splineUrl =
    "https://my.spline.design/aidatamodelinteraction-eeyThmwWx2FAcM8oe2sM3RYs/";

  /* Magnetic hover for primary buttons */
  useEffect(() => {
    const buttons = rootRef.current?.querySelectorAll(".lp-btn-primary");
    if (!buttons) return;

    const handleMove = (e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      gsap.to(e.currentTarget, {
        x: x * 0.3,
        y: y * 0.3,
        duration: 0.3,
        ease: "power2.out",
      });
    };

    const handleLeave = (e) => {
      gsap.to(e.currentTarget, {
        x: 0,
        y: 0,
        duration: 0.5,
        ease: "elastic.out(1, 0.4)",
      });
    };

    buttons.forEach((btn) => {
      btn.addEventListener("mousemove", handleMove);
      btn.addEventListener("mouseleave", handleLeave);
    });

    return () => {
      buttons.forEach((btn) => {
        btn.removeEventListener("mousemove", handleMove);
        btn.removeEventListener("mouseleave", handleLeave);
      });
    };
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputVal.trim()) {
      if (inputVal.trim().includes("github.com")) {
        onAnalyzeUrl?.(inputVal.trim());
      } else {
        onLoad?.(inputVal.trim());
      }
    }
  };

  const handleGetStarted = () => {
    onLoad?.("");
  };

  return (
    <div className="lp-root" ref={rootRef}>
      {/* Animated Background */}
      <div className="lp-bg" aria-hidden="true">
        <div className="lp-gradient-orb lp-orb-1" />
        <div className="lp-gradient-orb lp-orb-2" />
        <div className="lp-gradient-orb lp-orb-3" />
      </div>

      {/* 3D Spline Scene (full page) */}
      <div className="lp-spline-fullpage" aria-hidden="true">
        <iframe
          src={splineUrl}
          title="3D Spline Scene"
          frameBorder="0"
          allow="autoplay"
        />
      </div>

      {/* Navigation */}
      <nav className="lp-nav" ref={navRef}>
        <div className="lp-nav-inner">
          <div className="lp-nav-brand">
            <div className="lp-logo-mark">
              <BrainCircuit size={16} strokeWidth={2} />
            </div>
            <span className="lp-logo-text">Git Mind</span>
          </div>

          <div className="lp-nav-links">
            <a href="#features" className="lp-nav-link">
              Features
            </a>
            <a href="#stats" className="lp-nav-link">
              Capabilities
            </a>
            <a href="#cta" className="lp-nav-link">
              Get Started
            </a>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="lp-hero">
        <div className="lp-hero-content" ref={heroContentRef}>
          <div className="lp-badge">
            <Zap size={12} />
            <span>AI-Powered Code Intelligence</span>
          </div>

          <h2 className="lp-hero-3d-title">GIT MIND</h2>

          <h1 className="lp-headline" ref={headlineRef}>
            Understand any
            <br />
            <span className="lp-headline-accent">codebase</span> in seconds.
          </h1>

          <p className="lp-subhead">
            Six specialized AI agents analyze your repository in parallel
            &mdash; architecture, security, APIs, dependencies, and code
            quality. One report. Zero configuration.
          </p>

          <form className="lp-input-group" onSubmit={handleSubmit}>
            <div className="lp-input-wrapper">
              <GitBranch size={16} className="lp-input-icon" />
              <input
                className="lp-input"
                placeholder="Paste a GitHub URL or enter a username"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                aria-label="GitHub URL or username"
              />
            </div>
            <button
              type="submit"
              className="lp-btn lp-btn-primary"
              disabled={!inputVal.trim()}
            >
              <Zap size={14} />
              Analyze
            </button>
          </form>

          <div className="lp-hero-hint">
            Try{" "}
            <button
              className="lp-hint-link"
              onClick={() => {
                setInputVal("vercel");
                onLoad?.("vercel");
              }}
              type="button"
            >
              vercel
            </button>{" "}
            or{" "}
            <button
              className="lp-hint-link"
              onClick={() => {
                setInputVal("tiangolo");
                onLoad?.("tiangolo");
              }}
              type="button"
            >
              tiangolo
            </button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="lp-features" id="features" ref={featuresRef}>
        <div className="lp-section-inner">
          <div className="lp-section-header">
            <span className="lp-section-label">What's Inside</span>
            <h2 className="lp-section-title">
              Everything you need to
              <br />
              understand any codebase
            </h2>
          </div>

          <div className="lp-features-grid">
            {FEATURES.map(({ Icon, title, desc }) => (
              <div key={title} className="lp-feature-card lp-glass">
                <div className="lp-feature-icon">
                  <Icon size={22} strokeWidth={1.5} />
                </div>
                <h3 className="lp-feature-title">{title}</h3>
                <p className="lp-feature-desc">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="lp-stats" id="stats" ref={statsRef}>
        <div className="lp-section-inner">
          <div className="lp-stats-grid">
            {STATS.map(({ value, label, Icon }) => (
              <div key={label} className="lp-stat-item lp-glass">
                <div className="lp-stat-icon">
                  <Icon size={18} strokeWidth={1.5} />
                </div>
                <div className="lp-stat-value">{value}</div>
                <div className="lp-stat-label">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="lp-cta" id="cta" ref={ctaRef}>
        <div className="lp-section-inner">
          <div className="lp-cta-card lp-glass">
            <h2 className="lp-cta-title">Ready to understand your codebase?</h2>
            <p className="lp-cta-desc">
              Drop in a GitHub URL. Get a senior engineer's understanding in 60
              seconds.
            </p>
            <button
              className="lp-btn lp-btn-primary lp-btn-large"
              onClick={handleGetStarted}
            >
              <Zap size={16} />
              Get Started — It's Free
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div className="lp-footer-brand">
            <div className="lp-logo-mark lp-logo-mark-sm">
              <BrainCircuit size={12} strokeWidth={2} />
            </div>
            <span className="lp-footer-name">Git Mind</span>
          </div>
          <span className="lp-footer-copy">
            AI-powered codebase analysis. Open source.
          </span>
        </div>
      </footer>
    </div>
  );
}
