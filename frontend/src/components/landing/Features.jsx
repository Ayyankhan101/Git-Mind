import React from "react";
import {
  ShieldAlert,
  GitBranch,
  FileCode2,
  Lock,
  Code2,
  MessageSquare,
} from "lucide-react";

const features = [
  {
    Icon: ShieldAlert,
    title: "Security Scanning",
    desc: "Find vulnerabilities, secrets, and misconfigurations across your codebase.",
  },
  {
    Icon: GitBranch,
    title: "Architecture Maps",
    desc: "Interactive diagrams showing module dependencies and data flow.",
  },
  {
    Icon: FileCode2,
    title: "API Documentation",
    desc: "Auto-generated endpoint docs from your source code.",
  },
  {
    Icon: Lock,
    title: "CVE Intelligence",
    desc: "Match dependencies against known CVE databases.",
  },
  {
    Icon: Code2,
    title: "Code Audit",
    desc: "Deep static analysis with severity-ranked findings.",
  },
  {
    Icon: MessageSquare,
    title: "AI Chat",
    desc: "Ask questions about your codebase in natural language.",
  },
];

export default function Features() {
  return (
    <section id="features" className="lp-features">
      <div className="lp-section-inner">
        <h2 className="lp-section-title">Everything you need to ship safer</h2>
        <p className="lp-section-sub">
          Six agents working in parallel to analyze every dimension of your
          repository.
        </p>
        <div className="lp-features-grid">
          {features.map(({ Icon, title, desc }) => (
            <div key={title} className="lp-feature-card">
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
  );
}
