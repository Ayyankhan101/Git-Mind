import React from "react";
import ReactDOM from "react-dom/client";
import * as Sentry from "@sentry/react";
import "./index.css";
import App from "./App";

// Sentry init — only if DSN is set
if (process.env.REACT_APP_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.REACT_APP_SENTRY_DSN,
    tracesSampleRate: 0.1,
    environment: process.env.NODE_ENV || "development",
    integrations: [Sentry.browserTracingIntegration()],
  });
}

// Global unhandled error handler
window.addEventListener("error", (event) => {
  console.error("[Global Error]", event.error);
  if (process.env.REACT_APP_SENTRY_DSN) {
    Sentry.captureException(event.error);
  }
});
window.addEventListener("unhandledrejection", (event) => {
  console.error("[Unhandled Rejection]", event.reason);
  if (process.env.REACT_APP_SENTRY_DSN) {
    Sentry.captureException(event.reason);
  }
});

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
