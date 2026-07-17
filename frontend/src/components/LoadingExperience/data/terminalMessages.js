export const PHASE_MESSAGES = {
  0: [
    { text: "Initializing GitMind AI...", type: "info" },
    { text: "Language models loaded", type: "success" },
    { text: "Establishing repository context...", type: "info" },
    { text: "Connected to analysis pipeline", type: "success" },
  ],
  1: [
    { text: "Repository detected", type: "success" },
    { text: "Scanning package.json...", type: "info" },
    { text: "Reading project structure...", type: "info" },
    { text: "Resolving imports...", type: "info" },
    { text: "File tree resolved", type: "success" },
  ],
  2: [
    { text: "Dependency graph generated", type: "success" },
    { text: "Analyzing module relationships...", type: "info" },
    { text: "Service boundaries identified", type: "success" },
    { text: "Searching for API endpoints...", type: "info" },
    { text: "Resolving database schemas...", type: "info" },
  ],
  3: [
    { text: "Architecture map built", type: "success" },
    { text: "Optimizing node placement...", type: "info" },
    { text: "Computing relationship weights...", type: "info" },
    { text: "Validating consistency...", type: "info" },
  ],
  4: [
    { text: "Architecture visualization ready", type: "success" },
    { text: "Generating documentation...", type: "info" },
    { text: "Report compiled", type: "success" },
    { text: "Final validation...", type: "info" },
  ],
};

export const IDLE_OBSERVATIONS = [
  "Optimizing dependency graph...",
  "Reviewing architecture relationships...",
  "Checking module boundaries...",
  "Calculating complexity score...",
  "Cross-validating API topology...",
  "Performing deep code analysis...",
  "Verifying module coherence...",
  "Computing architectural metrics...",
  "Synchronizing visualization state...",
];

export const CANCELLATION_MSG = { text: "Analysis cancelled.", type: "error" };
export const FAILURE_MSG = { text: "Analysis interrupted.", type: "error" };

export const NEAR_COMPLETE_MSG = [
  { text: "Encrypting insights...", type: "info" },
  { text: "Compiling intelligence...", type: "info" },
  { text: "Rendering visualization...", type: "info" },
];

export const COMPLETE_MSG = [
  { text: "Repository Intelligence Complete", type: "success" },
  { text: "Architecture Generated", type: "success" },
  { text: "Report Ready", type: "success" },
];
