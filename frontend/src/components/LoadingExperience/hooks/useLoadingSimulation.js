import { useState, useEffect, useRef, useCallback } from "react";
import {
  PHASE_MESSAGES,
  IDLE_OBSERVATIONS,
  CANCELLATION_MSG,
  NEAR_COMPLETE_MSG,
  COMPLETE_MSG,
} from "../data/terminalMessages";
import { PHASE_OBSERVATIONS } from "../data/observations";
import { PHASE_TASKS, ESTIMATED_LABELS } from "../data/phaseConfig";

export default function useLoadingSimulation({
  agentStatus = {},
  elapsedTime = 0,
  isAnalyzing = false,
  analysisComplete = false,
  onPhaseAdvance,
  onDiscovery,
}) {
  const [currentPhase, setCurrentPhase] = useState(0);
  const [messages, setMessages] = useState([]);
  const [metrics, setMetrics] = useState({
    files: null,
    dependencies: null,
    languages: [],
    frameworks: [],
    architecture: null,
    security: null,
  });
  const [currentObservation, setCurrentObservation] = useState(
    PHASE_OBSERVATIONS[0],
  );
  const [estimatedTime, setEstimatedTime] = useState(ESTIMATED_LABELS[0]);
  const [scoreLabel, setScoreLabel] = useState("Learning...");
  const [isIdling, setIsIdling] = useState(false);
  const [timelineEnded, setTimelineEnded] = useState(false);

  const idleIndexRef = useRef(0);
  const obsTimerRef = useRef(null);
  const phaseRef = useRef(0);
  const lastPhaseChangeRef = useRef(0);
  const idleInjectRef = useRef(null);
  const cancelledRef = useRef(false);

  const interpolatedPhase = Math.min(
    currentPhase + (analysisComplete ? 1 : 0),
    5,
  );
  const hologramStage =
    interpolatedPhase <= 0 ? 1 : Math.min(1 + (interpolatedPhase / 5) * 6, 7);
  const taskLabel = PHASE_TASKS[Math.min(Math.floor(interpolatedPhase), 5)];

  const derivePhaseFromAgent = useCallback(() => {
    const s = agentStatus;
    if (s.cve_scanner === "done" || s.security === "done") return 5;
    if (s.api_docs === "done") return 4;
    if (s.architecture === "done") return 3;
    if (s.architecture === "running") return 2;
    if (s.scanner === "done") return 1;
    if (s.scanner === "running") return 0;
    return -1;
  }, [agentStatus]);

  const advancePhase = useCallback(
    (newPhase) => {
      phaseRef.current = newPhase;
      setCurrentPhase(newPhase);
      setEstimatedTime(
        ESTIMATED_LABELS[Math.min(newPhase, ESTIMATED_LABELS.length - 1)],
      );
      setCurrentObservation(
        PHASE_OBSERVATIONS[Math.min(newPhase, PHASE_OBSERVATIONS.length - 1)],
      );
      lastPhaseChangeRef.current = Date.now();
      setIsIdling(false);
      if (onPhaseAdvance) onPhaseAdvance(newPhase);

      if (PHASE_MESSAGES[newPhase]) {
        const phaseMsgs = PHASE_MESSAGES[newPhase];
        phaseMsgs.forEach((msg, i) => {
          setTimeout(() => {
            setMessages((prev) => [...prev, { ...msg, ts: new Date() }]);
          }, i * 1200);
        });
      }
    },
    [onPhaseAdvance],
  );

  useEffect(() => {
    if (!isAnalyzing) return;
    cancelledRef.current = false;

    const agentPhase = derivePhaseFromAgent();
    if (agentPhase >= 0 && agentPhase !== phaseRef.current) {
      advancePhase(agentPhase);
    }

    const timePhaseInterval = setInterval(() => {
      if (analysisComplete) return;
      const agentP = derivePhaseFromAgent();
      if (agentP >= 0 && agentP !== phaseRef.current) {
        advancePhase(agentP);
        return;
      }

      const timeBasedPhase = Math.min(Math.floor(elapsedTime / 18), 4);
      if (timeBasedPhase > phaseRef.current) {
        advancePhase(timeBasedPhase);
      }
    }, 2000);

    return () => clearInterval(timePhaseInterval);
  }, [
    isAnalyzing,
    elapsedTime,
    analysisComplete,
    derivePhaseFromAgent,
    advancePhase,
  ]);

  useEffect(() => {
    if (!isAnalyzing || analysisComplete) return;

    const idleCheck = setInterval(() => {
      const sinceLastPhase = Date.now() - lastPhaseChangeRef.current;
      if (sinceLastPhase > 10000 && !isIdling) {
        setIsIdling(true);
      }
    }, 3000);

    return () => clearInterval(idleCheck);
  }, [isAnalyzing, analysisComplete, isIdling]);

  useEffect(() => {
    if (!isAnalyzing || analysisComplete) return;

    idleInjectRef.current = setInterval(() => {
      if (isIdling) {
        const obs =
          IDLE_OBSERVATIONS[idleIndexRef.current % IDLE_OBSERVATIONS.length];
        idleIndexRef.current++;
        setMessages((prev) => [
          ...prev,
          { text: obs, type: "idle", ts: new Date() },
        ]);
      }
    }, 5000);

    return () => clearInterval(idleInjectRef.current);
  }, [isAnalyzing, analysisComplete, isIdling]);

  useEffect(() => {
    if (!analysisComplete) return;

    if (PHASE_MESSAGES[4]) {
      const phaseMsgs = PHASE_MESSAGES[4];
      phaseMsgs.forEach((msg, i) => {
        setTimeout(() => {
          setMessages((prev) => [...prev, { ...msg, ts: new Date() }]);
        }, i * 800);
      });
    }

    setTimeout(
      () => {
        NEAR_COMPLETE_MSG.forEach((msg, i) => {
          setTimeout(() => {
            setMessages((prev) => [...prev, { ...msg, ts: new Date() }]);
          }, i * 1500);
        });
      },
      PHASE_MESSAGES[4] ? PHASE_MESSAGES[4].length * 800 + 500 : 500,
    );

    const totalDelay =
      (PHASE_MESSAGES[4] ? PHASE_MESSAGES[4].length * 800 : 0) + 1500;

    setTimeout(() => {
      COMPLETE_MSG.forEach((msg, i) => {
        setTimeout(
          () => {
            setMessages((prev) => [...prev, { ...msg, ts: new Date() }]);
          },
          totalDelay + i * 600,
        );
      });
    }, 0);

    const doneDelay = totalDelay + COMPLETE_MSG.length * 600 + 300;
    setTimeout(() => {
      setTimelineEnded(true);
    }, doneDelay);

    setCurrentObservation("Repository intelligence complete.");
    setEstimatedTime("Complete");
  }, [analysisComplete]);

  useEffect(() => {
    obsTimerRef.current = setInterval(() => {
      setCurrentObservation(
        PHASE_OBSERVATIONS[
          Math.min(phaseRef.current, PHASE_OBSERVATIONS.length - 1)
        ],
      );
    }, 5000);

    return () => clearInterval(obsTimerRef.current);
  }, []);

  useEffect(() => {
    if (analysisComplete) {
      setScoreLabel("Learning...");
      const t = setTimeout(() => setScoreLabel("100"), 2200);
      return () => clearTimeout(t);
    }
  }, [analysisComplete]);

  useEffect(() => {
    if (metrics.files !== null && onDiscovery) onDiscovery("files");
    if (metrics.dependencies !== null && onDiscovery)
      onDiscovery("dependencies");
    if (metrics.languages.length > 0 && onDiscovery) onDiscovery("languages");
    if (metrics.frameworks.length > 0 && onDiscovery) onDiscovery("frameworks");
  }, [metrics, onDiscovery]);

  useEffect(() => {
    if (!isAnalyzing && cancelledRef.current) {
      setMessages((prev) => [...prev, { ...CANCELLATION_MSG, ts: new Date() }]);
    }
  }, [isAnalyzing]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
  }, []);

  return {
    currentPhase: interpolatedPhase,
    hologramStage,
    taskLabel,
    messages,
    metrics,
    setMetrics,
    currentObservation,
    estimatedTime,
    scoreLabel,
    isIdling,
    timelineEnded,
    cancel,
  };
}
