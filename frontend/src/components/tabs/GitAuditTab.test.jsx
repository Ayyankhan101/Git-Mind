import React from "react";
import { render, screen } from "@testing-library/react";
import GitAuditTab from "./GitAuditTab";

test("shows commits-unavailable warning instead of implying zero bad messages", () => {
  // Regression: a failed GitHub commits fetch used to render identically to
  // "checked every commit, found zero bad messages" — no distinguishing
  // signal at all, even though real secret/sensitive-file findings exist.
  const audit = {
    commits: [],
    sensitive_files: [],
    secret_findings: [{ file: "x.env", match: "SECRET" }],
    commits_unavailable: true,
    stats: {
      total: 0,
      bad_messages: 0,
      warn_messages: 0,
      secrets_found: 1,
      sensitive_files: 0,
    },
  };
  render(<GitAuditTab audit={audit} isAnalyzing={false} analyzed={true} />);
  expect(screen.getByText(/could not be fetched/i)).toBeInTheDocument();
});

test("shows no warning when commit history was fetched successfully", () => {
  const audit = {
    commits: [{ sha: "abc", msg_quality: "good", message: "fix: bug" }],
    sensitive_files: [],
    secret_findings: [],
    commits_unavailable: false,
    stats: {
      total: 1,
      bad_messages: 0,
      warn_messages: 0,
      secrets_found: 0,
      sensitive_files: 0,
    },
  };
  render(<GitAuditTab audit={audit} isAnalyzing={false} analyzed={true} />);
  expect(screen.queryByText(/could not be fetched/i)).not.toBeInTheDocument();
});
