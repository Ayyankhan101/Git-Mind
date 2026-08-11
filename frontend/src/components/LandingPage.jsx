import React, { useState } from "react";
import { Search, ArrowRight, Clock, GitBranch } from "lucide-react";
import "./LandingPage.css";

export default function LandingPage({ onLoad, onAnalyzeUrl }) {
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
    <div className="lp">
      <div className="lp-grid" />
      <div className="lp-content">
        <div className="lp-logo">GitMind</div>
        <p className="lp-tagline">
          Analyze your repositories. Find vulnerabilities. Ship safer code.
        </p>
        <form className="lp-input-group" onSubmit={handleSubmit}>
          <div className="lp-input-wrapper">
            <Search size={16} className="lp-input-icon" />
            <input
              className="lp-input"
              placeholder="GitHub username or repo URL"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              autoFocus
            />
          </div>
          <button type="submit" className="btn btn-primary lp-btn">
            Analyze
            <ArrowRight size={14} />
          </button>
        </form>
        <div className="lp-recent">
          <div className="lp-recent-label">
            <Clock size={12} />
            Quick start
          </div>
          <div className="lp-recent-cards">
            {[
              { name: "facebook/react", lang: "JavaScript" },
              { name: "vuejs/vue", lang: "TypeScript" },
              { name: "sveltejs/svelte", lang: "JavaScript" },
            ].map((repo) => (
              <button
                key={repo.name}
                className="lp-recent-card"
                onClick={() => onAnalyzeUrl(`https://github.com/${repo.name}`)}
              >
                <GitBranch size={14} />
                <span className="lp-recent-name">{repo.name}</span>
                <span className="lp-recent-lang">{repo.lang}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
