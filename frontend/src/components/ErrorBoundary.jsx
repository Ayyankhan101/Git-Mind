import React from "react";
import * as Sentry from "@sentry/react";
import { AlertTriangle } from "lucide-react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(err) {
    return { hasError: true, message: err?.message || "Unknown error" };
  }

  componentDidCatch(err, info) {
    console.error("[ErrorBoundary]", err, info);
    Sentry.captureException(err, { extra: info });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="empty" style={{ padding: "48px 32px" }}>
          <AlertTriangle
            size={20}
            className="empty-icon"
            strokeWidth={1.5}
            style={{ color: "var(--danger)" }}
          />
          <div className="empty-title">Something went wrong</div>
          <div className="empty-sub">{this.state.message}</div>
          <button
            style={{
              marginTop: 16,
              fontSize: 12,
              padding: "6px 14px",
              border: "1px solid var(--border)",
              borderRadius: 6,
              background: "transparent",
              color: "var(--text-2)",
              cursor: "pointer",
            }}
            onClick={() => this.setState({ hasError: false, message: "" })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
