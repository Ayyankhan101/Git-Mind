import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import * as Sentry from "@sentry/react";
import "./design-tokens.css";
import "./index.css";
import App from "./App";

// Sentry init — only if DSN is set
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    tracesSampleRate: 0.1,
    environment: process.env.NODE_ENV || "development",
    integrations: [Sentry.browserTracingIntegration()],
  });
}

// Global unhandled error handler
window.addEventListener("error", (event) => {
  console.error("[Global Error]", event.error);
  if (import.meta.env.VITE_SENTRY_DSN) {
    Sentry.captureException(event.error);
  }
});
window.addEventListener("unhandledrejection", (event) => {
  console.error("[Unhandled Rejection]", event.reason);
  if (import.meta.env.VITE_SENTRY_DSN) {
    Sentry.captureException(event.reason);
  }
});

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
