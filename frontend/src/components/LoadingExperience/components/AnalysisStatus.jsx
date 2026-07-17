import React, { useEffect, useRef } from "react";
import gsap from "gsap";
import { PHASE_NAMES, ESTIMATED_LABELS } from "../data/phaseConfig";

const PROGRESS_TARGETS = [5, 18, 33, 48, 65, 83, 100];

function adaptivePct(currentPhase) {
  const phaseIdx = Math.min(
    Math.floor(currentPhase),
    PROGRESS_TARGETS.length - 2,
  );
  const phaseFrac = currentPhase - Math.floor(currentPhase);
  const low = PROGRESS_TARGETS[phaseIdx];
  const high =
    PROGRESS_TARGETS[Math.min(phaseIdx + 1, PROGRESS_TARGETS.length - 1)];
  return Math.round(low + (high - low) * phaseFrac);
}

export default function AnalysisStatus({
  currentPhase = 0,
  estimatedTime = "Just starting...",
  currentObservation = "Establishing repository context...",
  scoreLabel = "Learning...",
  analysisComplete = false,
}) {
  const phaseIdx = Math.min(Math.floor(currentPhase), PHASE_NAMES.length - 1);
  const pct = analysisComplete ? 100 : adaptivePct(currentPhase);
  const badgeRef = useRef(null);
  const prevPhaseRef = useRef(phaseIdx);

  useEffect(() => {
    if (phaseIdx !== prevPhaseRef.current && badgeRef.current) {
      gsap.fromTo(
        badgeRef.current,
        { scale: 1.2 },
        { scale: 1, duration: 0.3, ease: "back.out(2)" },
      );
      prevPhaseRef.current = phaseIdx;
    }
  }, [phaseIdx]);

  return (
    <div className="lg-status">
      <div className="lg-panel-header">
        <span className="lg-panel-dot lg-dot-red" />
        <span className="lg-panel-dot lg-dot-yellow" />
        <span className="lg-panel-dot lg-dot-green" />
        <span className="lg-panel-title">ANALYSIS STATUS</span>
      </div>

      <div className="lg-status-section">
        <span className="lg-status-label">Current Phase</span>
        <div className="lg-phase-bar-track">
          <div className="lg-phase-bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="lg-phase-name">{PHASE_NAMES[phaseIdx]}</span>
      </div>

      <div className="lg-status-section">
        <span className="lg-status-label">Estimated Remaining</span>
        {analysisComplete ? (
          <span className="lg-status-done">Complete</span>
        ) : (
          <span className="lg-status-eta">
            {ESTIMATED_LABELS[phaseIdx] || "Working..."}
          </span>
        )}
      </div>

      <div className="lg-status-section">
        <span className="lg-status-label">Repository Understanding</span>
        <div className="lg-score-bar-track">
          <div
            className={`lg-score-bar-fill${analysisComplete ? " lg-score-complete" : ""}`}
            style={{
              width: analysisComplete
                ? "100%"
                : `${Math.min(currentPhase * 16, 80)}%`,
            }}
          />
        </div>
        <span className="lg-score-label">
          {analysisComplete ? (
            <>
              <span className="lg-score-pct">100%</span>
              <span className="lg-score-morph">
                Repository Intelligence Complete
              </span>
            </>
          ) : (
            <span className="lg-score-learning">{scoreLabel}</span>
          )}
        </span>
      </div>

      <div className="lg-status-section">
        <span className="lg-status-label">Current Observation</span>
        <div
          className={`lg-obs-bubble${analysisComplete ? " lg-obs-done" : ""}`}
        >
          {currentObservation}
        </div>
      </div>
    </div>
  );
}
