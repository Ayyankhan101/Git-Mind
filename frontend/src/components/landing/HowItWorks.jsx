import React from "react";
import { Search, Cpu, FileCheck } from "lucide-react";

const steps = [
  {
    Icon: Search,
    step: "01",
    title: "Enter a repo",
    desc: "Paste a URL or type a GitHub username to load repositories.",
  },
  {
    Icon: Cpu,
    step: "02",
    title: "AI analyzes",
    desc: "Six specialized agents scan security, architecture, docs, and more.",
  },
  {
    Icon: FileCheck,
    step: "03",
    title: "Get results",
    desc: "Interactive reports with findings, fixes, and exportable PDFs.",
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="lp-how">
      <div className="lp-section-inner">
        <h2 className="lp-section-title">Three steps to insight</h2>
        <p className="lp-section-sub">
          No configuration. No setup. Just paste and go.
        </p>
        <div className="lp-how-steps">
          {steps.map(({ Icon, step, title, desc }) => (
            <div key={step} className="lp-how-step">
              <div className="lp-how-step-num">{step}</div>
              <div className="lp-how-step-icon">
                <Icon size={24} />
              </div>
              <h3 className="lp-how-step-title">{title}</h3>
              <p className="lp-how-step-desc">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
