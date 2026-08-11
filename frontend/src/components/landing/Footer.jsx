import React from "react";
import { GitBranch } from "lucide-react";

export default function Footer() {
  return (
    <footer className="lp-footer">
      <div className="lp-footer-inner">
        <div className="lp-footer-brand">
          <GitBranch size={16} />
          <span>GitMind</span>
        </div>
        <p className="lp-footer-copy">
          Built with AI. Open source.
        </p>
      </div>
    </footer>
  );
}
