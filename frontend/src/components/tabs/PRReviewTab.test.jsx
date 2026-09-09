import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import PRReviewTab, { parseReview } from "./PRReviewTab";

jest.mock("../../api", () => ({
  reviewPR: jest.fn(),
  prImpact: jest.fn(),
  fetchOpenPRs: jest.fn(),
}));
jest.mock("../../tokenManager", () => ({
  get: jest.fn(() => ""),
  set: jest.fn(),
  restore: jest.fn(),
}));
jest.mock("../landing/OpenPRsList", () => (props) => (
  <div data-testid="open-prs-list" data-loading={props.prsLoading} />
));

const { reviewPR, prImpact } = require("../../api");

const APPROVE_REVIEW = [
  "## Summary",
  "Solid change with good test coverage.",
  "## Issues",
  "No significant issues found.",
  "## Verdict",
  "APPROVE",
].join("\n");

const CHANGES_REVIEW = [
  "## Summary",
  "Needs work before merge.",
  "## Issues",
  "src/auth.py:42 — [HIGH] Insecure deserialization — User input reaches pickle.loads.",
  "src/utils.py:7 — [MEDIUM] Unused import — os imported but never used.",
  "## Verdict",
  "REQUEST CHANGES — fix the auth issue first",
].join("\n");

const DISCUSS_REVIEW = [
  "## Summary",
  "Design question to settle.",
  "## Issues",
  "No significant issues found.",
  "## Verdict",
  "NEEDS DISCUSSION",
].join("\n");

function reviewResult(review, extra = {}) {
  return {
    review,
    repo: "test/repo",
    pr_num: 12,
    additions: 34,
    deletions: 5,
    changed_files: 3,
    ...extra,
  };
}

async function reviewWith(text) {
  reviewPR.mockResolvedValue(reviewResult(text));
  render(<PRReviewTab />);
  fireEvent.change(screen.getByLabelText("Pull request URL"), {
    target: { value: "https://github.com/owner/repo/pull/12" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Review PR" }));
  await screen.findByText("APPROVE");
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── parseReview unit tests ───────────────────────────────────────────────────

describe("parseReview", () => {
  test("parses approve verdict and summary", () => {
    const parsed = parseReview(APPROVE_REVIEW);
    expect(parsed.verdict).toBe("APPROVE");
    expect(parsed.summary).toContain("Solid change");
    expect(parsed.issues).toEqual([]);
  });

  test("parses request-changes verdict with justification", () => {
    const parsed = parseReview(CHANGES_REVIEW);
    expect(parsed.verdict).toBe("REQUEST CHANGES");
    expect(parsed.issues).toHaveLength(2);
    expect(parsed.issues[0]).toEqual({
      file: "src/auth.py",
      line: "42",
      severity: "HIGH",
      title: "Insecure deserialization",
      explanation: "User input reaches pickle.loads.",
    });
    expect(parsed.issues[1].severity).toBe("MEDIUM");
  });

  test("parses needs-discussion verdict", () => {
    const parsed = parseReview(DISCUSS_REVIEW);
    expect(parsed.verdict).toBe("NEEDS DISCUSSION");
  });

  test("keeps unparseable issue lines as raw text", () => {
    const parsed = parseReview(
      [
        "## Summary",
        "s",
        "## Issues",
        "this line does not match the format",
        "## Verdict",
        "APPROVE",
      ].join("\n"),
    );
    expect(parsed.issues).toEqual([
      { raw: "this line does not match the format" },
    ]);
  });

  test("returns empty verdict when missing", () => {
    const parsed = parseReview("## Summary\nno verdict section");
    expect(parsed.verdict).toBe("");
    expect(parsed.summary).toContain("no verdict section");
  });
});

// ── Verdict states ───────────────────────────────────────────────────────────

test("renders approve verdict with check styling", async () => {
  await reviewWith(APPROVE_REVIEW);
  const verdict = screen.getByText("APPROVE").closest(".pr-verdict");
  expect(verdict).toHaveClass("approve");
  expect(verdict).not.toHaveClass("changes");
  expect(screen.getByText("test/repo")).toBeInTheDocument();
  expect(screen.getByText("#12")).toBeInTheDocument();
  expect(screen.getByText("+34")).toBeInTheDocument();
  expect(screen.getByText("-5")).toBeInTheDocument();
  expect(screen.getByText("3 changed")).toBeInTheDocument();
});

test("renders request-changes verdict with warning styling", async () => {
  reviewPR.mockResolvedValue(reviewResult(CHANGES_REVIEW));
  render(<PRReviewTab />);
  fireEvent.change(screen.getByLabelText("Pull request URL"), {
    target: { value: "https://github.com/owner/repo/pull/12" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Review PR" }));

  const verdictText = await screen.findByText("REQUEST CHANGES");
  const verdict = verdictText.closest(".pr-verdict");
  expect(verdict).toHaveClass("changes");
  // Justification text appears without the verdict keyword
  expect(screen.getByText("fix the auth issue first")).toBeInTheDocument();
});

test("renders needs-discussion verdict with message styling", async () => {
  reviewPR.mockResolvedValue(reviewResult(DISCUSS_REVIEW));
  render(<PRReviewTab />);
  fireEvent.change(screen.getByLabelText("Pull request URL"), {
    target: { value: "https://github.com/owner/repo/pull/12" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Review PR" }));

  const verdictText = await screen.findByText("NEEDS DISCUSSION");
  expect(verdictText.closest(".pr-verdict")).toHaveClass("discuss");
});

// ── Issues rendering ─────────────────────────────────────────────────────────

test("renders parsed issues with severity rows", async () => {
  reviewPR.mockResolvedValue(reviewResult(CHANGES_REVIEW));
  render(<PRReviewTab />);
  fireEvent.change(screen.getByLabelText("Pull request URL"), {
    target: { value: "https://github.com/owner/repo/pull/12" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Review PR" }));

  expect(await screen.findByText("ISSUES (2)")).toBeInTheDocument();
  expect(screen.getByText("Insecure deserialization")).toBeInTheDocument();
  expect(screen.getByText("src/auth.py:42")).toBeInTheDocument();
  expect(screen.getByText("HIGH")).toBeInTheDocument();
  expect(screen.getByText("Unused import")).toBeInTheDocument();
});

// ── Validation & loading ─────────────────────────────────────────────────────

test("shows error when submitting without a URL", () => {
  render(<PRReviewTab />);
  // The Review PR button is disabled while the input is empty, so the
  // validation error only surfaces via the Enter key path.
  fireEvent.keyDown(screen.getByLabelText("Pull request URL"), {
    key: "Enter",
  });
  expect(screen.getByText("Enter a GitHub PR URL.")).toBeInTheDocument();
  expect(reviewPR).not.toHaveBeenCalled();
});

test("shows loading state while reviewing", () => {
  reviewPR.mockReturnValue(new Promise(() => {})); // never resolves
  render(<PRReviewTab />);
  fireEvent.change(screen.getByLabelText("Pull request URL"), {
    target: { value: "https://github.com/owner/repo/pull/12" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Review PR" }));
  expect(screen.getByText("Reviewing…")).toBeInTheDocument();
});

test("displays backend error from reviewPR", async () => {
  reviewPR.mockRejectedValue(new Error("PR not found"));
  render(<PRReviewTab />);
  fireEvent.change(screen.getByLabelText("Pull request URL"), {
    target: { value: "https://github.com/owner/repo/pull/404" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Review PR" }));
  expect(await screen.findByText("PR not found")).toBeInTheDocument();
});

// ── Impact panel ─────────────────────────────────────────────────────────────

test("renders impact panel with risk, deltas, and chips", async () => {
  reviewPR.mockResolvedValue(reviewResult(APPROVE_REVIEW));
  prImpact.mockResolvedValue({
    merge_risk: "low",
    health_delta: 3,
    confidence: "high",
    one_liner: "Small, focused change.",
    recommendation: "Safe to merge",
    affected_areas: ["api"],
    breaking_changes: [],
    narrative: "No risk to the core service.",
    head_ref: "feat/patch",
    head_sha: "abc123",
    base_score: 70,
    base_grade: "B",
    pr_score: 73,
    pr_grade: "B+",
    new_findings: [],
    fixed_findings: ["auth-1"],
    new_cves: [],
    fixed_cves: [],
    breakdown_delta: { security: 2 },
  });
  render(<PRReviewTab analyzed={true} sessionId="sess-1" />);
  fireEvent.change(screen.getByLabelText("Pull request URL"), {
    target: { value: "https://github.com/owner/repo/pull/12" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Review PR" }));

  expect(await screen.findByText("LOW RISK")).toBeInTheDocument();
  expect(screen.getByText("Safe to merge")).toBeInTheDocument();
  expect(screen.getByText("Small, focused change.")).toBeInTheDocument();
  expect(screen.getByText("+3")).toBeInTheDocument();
  expect(screen.getByText("1 fixed")).toBeInTheDocument();
  expect(screen.getByText("MERGE IMPACT ANALYSIS")).toBeInTheDocument();
  expect(screen.getByText("security: +2")).toBeInTheDocument();
});

test("shows impact error without a base session", async () => {
  render(<PRReviewTab analyzed={true} sessionId={null} />);
  fireEvent.change(screen.getByLabelText("Pull request URL"), {
    target: { value: "https://github.com/owner/repo/pull/12" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Predict Impact/i }));
  expect(
    await screen.findByText("Analyze a repository first to use as the base."),
  ).toBeInTheDocument();
});

test("filters open PRs via fetchOpenPRs when repoUrl is provided", async () => {
  const { fetchOpenPRs } = require("../../api");
  fetchOpenPRs.mockResolvedValue({ prs: [{ number: 1, title: "Fix bug" }] });
  render(<PRReviewTab repoUrl="https://github.com/acme/app.git" />);
  await waitFor(() =>
    expect(fetchOpenPRs).toHaveBeenCalledWith("acme", "app", null),
  );
  expect(screen.getByTestId("open-prs-list")).toBeInTheDocument();
});
