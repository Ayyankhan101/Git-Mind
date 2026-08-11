import React from "react";
import { GitBranch } from "lucide-react";

export default function LandingNav() {
  return (
    <nav className="lp-nav">
      <div className="lp-nav-inner">
        <div className="lp-nav-brand">
          <GitBranch size={18} />
          <span>GitMind</span>
        </div>
        <div className="lp-nav-links">
          <a href="#features">Features</a>
          <a href="#how-it-works">How it works</a>
        </div>
      </div>
    </nav>
  );
}
