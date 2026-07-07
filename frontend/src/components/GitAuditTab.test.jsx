import { vi, describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import GitAuditTab from "./GitAuditTab";

vi.mock("lucide-react", async () => {
  const icons = {};
  for (const name of [
    "GitCommit",
    "AlertTriangle",
    "CheckCircle",
    "Clock",
    "ShieldAlert",
    "FileWarning",
    "ExternalLink",
  ]) {
    icons[name] = (props) => <svg data-testid={`icon-${name}`} {...props} />;
  }
  return icons;
});

const baseProps = {
  audit: null,
  isAnalyzing: false,
  analyzed: false,
};

beforeEach(() => vi.clearAllMocks());

describe("GitAuditTab empty states", () => {
  it("shows empty state when not analyzed", () => {
    render(<GitAuditTab {...baseProps} />);
    expect(screen.getByText("Git Audit not available")).toBeInTheDocument();
    expect(
      screen.getByText("Analyze a repository to get started"),
    ).toBeInTheDocument();
  });

  it("shows skeleton when analyzing without data", () => {
    render(<GitAuditTab {...baseProps} isAnalyzing={true} />);
    expect(
      screen.queryByText("Git Audit not available"),
    ).not.toBeInTheDocument();
    expect(document.querySelector(".sk-row")).toBeInTheDocument();
  });

  it("shows no data when analyzed but audit is null", () => {
    render(<GitAuditTab {...baseProps} analyzed={true} />);
    expect(screen.getByText("No commit data available")).toBeInTheDocument();
  });
});

describe("GitAuditTab with data", () => {
  const audit = {
    stats: {
      total: 42,
      bad_messages: 3,
      warn_messages: 5,
      secrets_found: 2,
      sensitive_files: 1,
    },
    commits: [
      {
        sha: "abc1234",
        message: "fix: bug fix",
        author: "dev",
        date: "2024-01-15",
        msg_quality: "good",
        body: "Fixed the crash",
        full_sha: "abc1234def",
        url: "https://github.com/test/repo/commit/abc1234",
      },
      {
        sha: "def5678",
        message: "update",
        author: "dev",
        date: "2024-01-16",
        msg_quality: "bad",
        full_sha: "def5678ghi",
      },
      {
        sha: "ghi9012",
        message: "stuff",
        author: "dev2",
        date: "2024-01-17",
        msg_quality: "warn",
        full_sha: "ghi9012jkl",
      },
    ],
    secret_findings: [
      {
        severity: "high",
        type: "AWS Key",
        path: "config.js",
        line: 5,
        snippet: "AKIA...",
      },
    ],
    sensitive_files: [{ path: ".env", reason: "Environment file" }],
  };

  it("renders stats row", () => {
    render(<GitAuditTab {...baseProps} audit={audit} analyzed={true} />);
    const pills = document.querySelectorAll(".stat-pill-value");
    expect(pills[0].textContent).toBe("42");
    expect(screen.getByText("Commits")).toBeInTheDocument();
    expect(screen.getByText("Poor msgs")).toBeInTheDocument();
  });

  it("renders commit count in header", () => {
    render(<GitAuditTab {...baseProps} audit={audit} analyzed={true} />);
    expect(screen.getByText("42 commits · 3 issues found")).toBeInTheDocument();
  });

  it("renders commit rows", () => {
    render(<GitAuditTab {...baseProps} audit={audit} analyzed={true} />);
    expect(screen.getByText("abc1234")).toBeInTheDocument();
    expect(screen.getByText("fix: bug fix")).toBeInTheDocument();
  });

  it("expand commit body on click", () => {
    render(<GitAuditTab {...baseProps} audit={audit} analyzed={true} />);
    fireEvent.click(screen.getByText("fix: bug fix"));
    expect(screen.getByText("Fixed the crash")).toBeInTheDocument();
  });

  it("shows external link for commit with URL", () => {
    render(<GitAuditTab {...baseProps} audit={audit} analyzed={true} />);
    const links = screen.getAllByRole("link");
    const commitLink = links.find(
      (a) => a.href === "https://github.com/test/repo/commit/abc1234",
    );
    expect(commitLink).toBeTruthy();
  });

  it("filters to poor commits only", () => {
    render(<GitAuditTab {...baseProps} audit={audit} analyzed={true} />);
    fireEvent.click(screen.getByText("Poor Only"));
    expect(screen.getByText("def5678")).toBeInTheDocument();
    expect(screen.queryByText("abc1234")).not.toBeInTheDocument();
  });

  it("switches to secrets tab", () => {
    render(<GitAuditTab {...baseProps} audit={audit} analyzed={true} />);
    const pills = document.querySelectorAll(".sev-pill");
    const secretsPill = Array.from(pills).find((el) =>
      el.textContent.includes("Secrets"),
    );
    fireEvent.click(secretsPill);
    expect(screen.getByText("HARDCODED SECRETS IN CODE")).toBeInTheDocument();
    expect(screen.getByText("SENSITIVE FILES IN REPO")).toBeInTheDocument();
  });

  it("shows clean state when no secrets", () => {
    render(
      <GitAuditTab
        {...baseProps}
        audit={{ ...audit, secret_findings: [], sensitive_files: [] }}
        analyzed={true}
      />,
    );
    const pills = document.querySelectorAll(".sev-pill");
    const secretsPill = Array.from(pills).find((el) =>
      el.textContent.includes("Secrets"),
    );
    fireEvent.click(secretsPill);
    expect(screen.getByText("No secrets detected")).toBeInTheDocument();
  });
});
