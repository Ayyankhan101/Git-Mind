import React, { useEffect, useCallback, useState, useRef } from "react";
import useLoadingSimulation from "./hooks/useLoadingSimulation";
import AITerminal from "./components/AITerminal";
import RepositoryHologram from "./components/RepositoryHologram";
import DiscoveryCards from "./components/DiscoveryCards";
import AnalysisStatus from "./components/AnalysisStatus";
import CompletionAnimation from "./components/CompletionAnimation";
import ParticleBackground from "./components/ParticleBackground";
import { PHASE_NAMES } from "./data/phaseConfig";
import "./LoadingExperience.css";

export default function LoadingExperience({
  analysisComplete = false,
  isAnalyzing = true,
  agentStatus = {},
  elapsedTime = 0,
  repoName = "repository",
  onFinishScreen,
  onPhaseAdvance,
  onDiscovery,
  onComplete,
}) {
  const sim = useLoadingSimulation({
    agentStatus,
    elapsedTime,
    isAnalyzing,
    analysisComplete,
    onPhaseAdvance,
    onDiscovery,
  });

  const SUBTITLES = [
    "Understanding repository structure...",
    "Mapping application layers...",
    "Resolving dependencies...",
    "Building architecture graph...",
    "Detecting service boundaries...",
    "Generating documentation...",
  ];
  const [subtitleIdx, setSubtitleIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(
      () => setSubtitleIdx((i) => (i + 1) % SUBTITLES.length),
      6000,
    );
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFinish = useCallback(() => {
    if (onFinishScreen) onFinishScreen();
  }, [onFinishScreen]);

  useEffect(() => {
    if (analysisComplete && onComplete) {
      const t = setTimeout(() => onComplete(), 4500);
      return () => clearTimeout(t);
    }
  }, [analysisComplete, onComplete]);

  const prevPhaseInt = useRef(0);
  const [pulsing, setPulsing] = useState(false);
  useEffect(() => {
    const phaseInt = Math.floor(sim.currentPhase);
    if (
      phaseInt !== prevPhaseInt.current &&
      (phaseInt > 0 || sim.currentPhase > 0)
    ) {
      setPulsing(true);
      const t = setTimeout(() => setPulsing(false), 600);
      prevPhaseInt.current = phaseInt;
      return () => clearTimeout(t);
    }
  }, [sim.currentPhase]);

  return (
    <div className={`lg-root${pulsing ? " lg-global-pulse" : ""}`}>
      <ParticleBackground analysisComplete={analysisComplete} />

      <div className="lg-header">
        <div className="lg-header-label">Analyzing</div>
        <div className="lg-header-repo">
          <span className="lg-header-icon">&boxUr;</span>
          {repoName}
        </div>
        <div className="lg-header-subtitle">{SUBTITLES[subtitleIdx]}</div>
      </div>

      {!analysisComplete && (
        <div className="lg-activity-strip">
          <span className="lg-activity-dot" />
          <span className="lg-activity-stage">
            {
              PHASE_NAMES[
                Math.min(Math.floor(sim.currentPhase), PHASE_NAMES.length - 1)
              ]
            }
          </span>
          <div className="lg-activity-bar-track">
            <div
              className="lg-activity-bar-fill"
              style={{
                width: `${Math.min((sim.currentPhase / 5) * 100, 100)}%`,
              }}
            />
          </div>
          <span className="lg-activity-desc">{sim.taskLabel}</span>
        </div>
      )}

      {analysisComplete ? (
        <CompletionAnimation onFinishScreen={handleFinish} />
      ) : (
        <div className="lg-grid">
          <div className="lg-cell lg-cell-terminal">
            <AITerminal
              messages={sim.messages}
              analysisComplete={analysisComplete}
              timelineEnded={sim.timelineEnded}
            />
            <div className="lg-current-task">
              <span className="lg-task-dot" />
              <span className="lg-task-label">Current Task</span>
              <span className="lg-task-name">{sim.taskLabel}</span>
            </div>
          </div>

          <div className="lg-cell lg-cell-hologram">
            <RepositoryHologram
              stage={sim.hologramStage}
              analysisComplete={analysisComplete}
            />
          </div>

          <div className="lg-cell lg-cell-discoveries">
            <DiscoveryCards
              metrics={sim.metrics}
              currentPhase={sim.currentPhase}
            />
          </div>

          <div className="lg-cell lg-cell-status">
            <AnalysisStatus
              currentPhase={sim.currentPhase}
              estimatedTime={sim.estimatedTime}
              currentObservation={sim.currentObservation}
              scoreLabel={sim.scoreLabel}
              analysisComplete={analysisComplete}
            />
          </div>
        </div>
      )}
    </div>
  );
}
