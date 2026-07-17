import React, { useState } from "react";
import { Zap, Sparkles, Lock, Command, Star } from "lucide-react";
import { LANG_COLOR } from "../constants";

const EXAMPLE_REPOS = [
  {
    user: "vercel",
    name: "next.js",
    description:
      "The React Framework — file-based routing, RSC, server actions, and more.",
    language: "JavaScript",
    stars: "126k",
    url: "https://github.com/vercel/next.js",
  },
  {
    user: "tiangolo",
    name: "fastapi",
    description:
      "High-performance Python web framework with automatic OpenAPI docs.",
    language: "Python",
    stars: "73k",
    url: "https://github.com/tiangolo/fastapi",
  },
  {
    user: "expressjs",
    name: "express",
    description: "Fast, unopinionated, minimalist web framework for Node.js.",
    language: "JavaScript",
    stars: "64k",
    url: "https://github.com/expressjs/express",
  },
];

export default function Onboarding({ onLoad, onAnalyzeUrl }) {
  const [name, setName] = useState("");
  const submit = () => name.trim() && onLoad(name.trim());

  return (
    <div className="onboarding">
      <div className="onboarding-card">
        <div className="onboarding-mark">G</div>
        <h1>Analyze any GitHub repository.</h1>
        <p>
          Six AI agents run in parallel — architecture, API surface, security
          findings, CVE scan, knowledge index, and PR review — all in one
          workspace.
        </p>

        <div className="onboarding-form">
          <input
            className="onboarding-input"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="paste a GitHub username…"
          />
          <button
            className="btn btn-primary"
            onClick={submit}
            disabled={!name.trim()}
          >
            <Zap size={13} strokeWidth={1.5} /> Go
          </button>
        </div>

        <div className="onboarding-examples-label">or try one of these</div>
        <div className="onboarding-examples">
          {EXAMPLE_REPOS.map((repo) => (
            <div
              key={repo.url}
              className="onboarding-example-card"
              role="button"
              tabIndex={0}
              onClick={() =>
                onAnalyzeUrl ? onAnalyzeUrl(repo.url) : onLoad(repo.user)
              }
              onKeyDown={(e) =>
                e.key === "Enter" &&
                (onAnalyzeUrl ? onAnalyzeUrl(repo.url) : onLoad(repo.user))
              }
            >
              <div className="oec-top">
                <span className="oec-name">
                  {repo.user}/{repo.name}
                </span>
                <span className="oec-stars">
                  <Star size={11} strokeWidth={1.5} />
                  {repo.stars}
                </span>
              </div>
              <div className="oec-desc">{repo.description}</div>
              <div className="oec-meta">
                <span
                  className="lang-dot"
                  style={{ background: LANG_COLOR[repo.language] || "#64748b" }}
                />
                {repo.language}
              </div>
            </div>
          ))}
        </div>

        <div className="onboarding-hints">
          <div className="onboarding-hint">
            <Sparkles
              size={16}
              strokeWidth={1.5}
              className="onboarding-hint-icon"
            />
            <div className="onboarding-hint-title">Multi-agent analysis</div>
            <div className="onboarding-hint-body">
              Six specialists run in parallel — usually done in under 60
              seconds.
            </div>
          </div>
          <div className="onboarding-hint">
            <Lock
              size={16}
              strokeWidth={1.5}
              className="onboarding-hint-icon"
            />
            <div className="onboarding-hint-title">Security-first</div>
            <div className="onboarding-hint-body">
              Findings include exploit scenarios and one-click crisis
              simulation.
            </div>
          </div>
          <div className="onboarding-hint">
            <Command
              size={16}
              strokeWidth={1.5}
              className="onboarding-hint-icon"
            />
            <div className="onboarding-hint-title">Keyboard-driven</div>
            <div className="onboarding-hint-body">
              Press{" "}
              <span
                style={{
                  color: "var(--text-1)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                ?
              </span>{" "}
              any time for every shortcut.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
