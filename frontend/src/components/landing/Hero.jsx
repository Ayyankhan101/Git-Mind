import React, { useState } from "react";
import { Search, ArrowRight } from "lucide-react";

export default function Hero({ onLoad, onAnalyzeUrl }) {
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
    <section className="lp-hero">
      <div className="lp-hero-orb" />
      <div className="lp-hero-content">
        <div className="lp-badge">AI-Powered Code Intelligence</div>
        <h1 className="lp-hero-title">
          Understand your code.
          <br />
          Ship with confidence.
        </h1>
        <p className="lp-hero-sub">
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
    </section>
  );
}
