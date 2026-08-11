import React from "react";
import { ArrowRight } from "lucide-react";

export default function LandingCTA({ onLoad }) {
  return (
    <section className="lp-cta">
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
  );
}
