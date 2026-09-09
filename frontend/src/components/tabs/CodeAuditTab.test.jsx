import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import CodeAuditTab from "./CodeAuditTab";

const SAMPLE_AUDIT = [
  {
    language: "python",
    tool: "pylint",
    file_count: 2,
    findings: [
      {
        id: "py-1",
        severity: "high",
        title: "Unused import",
        file: "src/main.py",
        line: 1,
        description: "Import os is unused.",
        remediation: "Remove the unused import.",
        rule: "W0611",
      },
    ],
  },
];

test("shows empty state before analysis", () => {
  render(
    <CodeAuditTab codeAudit={null} isAnalyzing={false} analyzed={false} />,
  );
  expect(screen.getByText("Code Audit")).toBeInTheDocument();
  expect(screen.getByText(/Analyze a repository/i)).toBeInTheDocument();
});

test("renders language findings after analysis", () => {
  render(
    <CodeAuditTab
      codeAudit={SAMPLE_AUDIT}
      isAnalyzing={false}
      analyzed={true}
    />,
  );
  expect(screen.getByText("Unused import")).toBeInTheDocument();
  expect(screen.getByText(/src\/main\.py:1/)).toBeInTheDocument();
  expect(screen.getByText("W0611")).toBeInTheDocument();
});

test("shows clean state when no findings", () => {
  render(<CodeAuditTab codeAudit={[]} isAnalyzing={false} analyzed={true} />);
  expect(screen.getByText("No issues found")).toBeInTheDocument();
});

test("shows triage-failed warning instead of implying clean when tool found raw issues", () => {
  // Regression: a language whose static tool found real issues but whose
  // LLM triage crashed used to render identically to a genuinely clean
  // language (finding_count: 0, no distinguishing signal at all).
  const DEGRADED_AUDIT = [
    {
      language: "python",
      tool: "pylint",
      file_count: 2,
      findings: [],
      finding_count: 0,
      triage_failed: true,
      raw_issue_count: 3,
    },
  ];
  render(
    <CodeAuditTab
      codeAudit={DEGRADED_AUDIT}
      isAnalyzing={false}
      analyzed={true}
    />,
  );
  expect(screen.getByText(/pylint found 3 raw issues/i)).toBeInTheDocument();
  expect(screen.getByText(/triage step failed/i)).toBeInTheDocument();
});

test("calls onFix when Generate Fix clicked", () => {
  const onFix = jest.fn();
  render(
    <CodeAuditTab
      codeAudit={SAMPLE_AUDIT}
      isAnalyzing={false}
      analyzed={true}
      onFix={onFix}
      fixLoading={null}
      fixResult={null}
    />,
  );

  fireEvent.click(screen.getByText("Unused import"));
  fireEvent.click(screen.getByRole("button", { name: /Generate Fix/i }));

  expect(onFix).toHaveBeenCalledWith(
    expect.objectContaining({
      id: "py-1",
      title: "Unused import",
      file: "src/main.py",
    }),
  );
});
