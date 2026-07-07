import { vi, describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import PRReviewTab from "./PRReviewTab";

vi.mock("../api", () => ({
  reviewPR: vi.fn(),
  prImpact: vi.fn(),
  fetchOpenPRs: vi.fn(),
}));
vi.mock("../tokenManager", () => ({
  get: vi.fn(() => ""),
  set: vi.fn(),
}));

const { reviewPR, prImpact, fetchOpenPRs } = await import("../api");

const baseProps = {
  prAutoUrl: null,
  onAutoUrlUsed: vi.fn(),
  sessionId: "sess-1",
  analyzed: true,
  repoUrl: "https://github.com/test/repo",
};

beforeEach(() => {
  vi.clearAllMocks();
  fetchOpenPRs.mockResolvedValue({ prs: [] });
  prImpact.mockResolvedValue({
    merge_risk: "low",
    head_ref: "feature/x",
    head_sha: "abc123",
    base_score: 90,
    base_grade: "A",
    pr_score: 88,
    pr_grade: "A-",
    health_delta: -2,
    recommendation: "Safe to merge",
    one_liner: "Minimal changes",
    confidence: "high",
    narrative: "The PR changes 1 file with minimal impact.",
    affected_areas: ["auth"],
    breaking_changes: [],
    new_findings: [],
    fixed_findings: [],
    new_cves: [],
    fixed_cves: [],
    breakdown_delta: {},
  });
});

describe("PRReviewTab rendering", () => {
  it("shows PR Review title", () => {
    render(<PRReviewTab {...baseProps} />);
    expect(screen.getByText("PR Review")).toBeInTheDocument();
  });

  it("shows PR URL input", () => {
    render(<PRReviewTab {...baseProps} />);
    expect(
      screen.getByPlaceholderText("https://github.com/owner/repo/pull/123"),
    ).toBeInTheDocument();
  });

  it("shows Review PR button", () => {
    render(<PRReviewTab {...baseProps} />);
    expect(screen.getByText("Review PR")).toBeInTheDocument();
  });

  it("shows Advanced toggle", () => {
    render(<PRReviewTab {...baseProps} />);
    expect(screen.getByText("Advanced")).toBeInTheDocument();
  });

  it("Advanced toggle shows token input", async () => {
    render(<PRReviewTab {...baseProps} />);
    fireEvent.click(screen.getByText("Advanced"));
    expect(
      screen.getByPlaceholderText(/GitHub personal access token/),
    ).toBeInTheDocument();
  });

  it("hides Advanced section on second click", async () => {
    render(<PRReviewTab {...baseProps} />);
    fireEvent.click(screen.getByText("Advanced"));
    expect(
      screen.getByPlaceholderText(/GitHub personal access token/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText("Advanced"));
    expect(
      screen.queryByPlaceholderText(/GitHub personal access token/),
    ).not.toBeInTheDocument();
  });
});

describe("PRReviewTab validation", () => {
  it("Review PR button disabled when URL is empty", () => {
    render(<PRReviewTab {...baseProps} />);
    const btn = screen.getByText("Review PR").closest("button");
    expect(btn).toBeDisabled();
  });

  it("Review PR button enabled when URL is entered", () => {
    render(<PRReviewTab {...baseProps} />);
    fireEvent.change(
      screen.getByPlaceholderText("https://github.com/owner/repo/pull/123"),
      { target: { value: "https://github.com/test/repo/pull/42" } },
    );
    const btn = screen.getByText("Review PR").closest("button");
    expect(btn).not.toBeDisabled();
  });
});

describe("PRReviewTab review flow", () => {
  it("calls reviewPR on submit with URL", async () => {
    reviewPR.mockResolvedValue({
      review_data: {
        verdict: "APPROVE",
        summary: "Looks good",
        issues: [],
        verdict_justification: "No issues found",
      },
      repo: "test/repo",
      pr_num: 42,
      additions: 10,
      deletions: 5,
      changed_files: 2,
    });
    render(<PRReviewTab {...baseProps} />);
    fireEvent.change(
      screen.getByPlaceholderText("https://github.com/owner/repo/pull/123"),
      { target: { value: "https://github.com/test/repo/pull/42" } },
    );
    fireEvent.click(screen.getByText("Review PR"));
    await waitFor(() => expect(reviewPR).toHaveBeenCalled());
  });

  it("shows review result with VERDICT", async () => {
    reviewPR.mockResolvedValue({
      review_data: {
        verdict: "APPROVE",
        summary: "Looks good",
        issues: [],
        verdict_justification: "Clean code",
      },
      repo: "test/repo",
      pr_num: 42,
      additions: 10,
      deletions: 5,
      changed_files: 2,
    });
    render(<PRReviewTab {...baseProps} />);
    fireEvent.change(
      screen.getByPlaceholderText("https://github.com/owner/repo/pull/123"),
      { target: { value: "https://github.com/test/repo/pull/42" } },
    );
    fireEvent.click(screen.getByText("Review PR"));
    await waitFor(() => {
      expect(screen.getByText("VERDICT")).toBeInTheDocument();
      expect(screen.getByText("APPROVE")).toBeInTheDocument();
      expect(screen.getByText("Looks good")).toBeInTheDocument();
    });
  });

  it("shows issues list", async () => {
    reviewPR.mockResolvedValue({
      review_data: {
        verdict: "REQUEST CHANGES",
        summary: "Has issues",
        issues: [
          {
            severity: "high",
            title: "SQL injection",
            explanation: "Unsanitized input",
            file: "app.py",
            line: 42,
          },
        ],
        verdict_justification: "Security issue",
      },
      repo: "test/repo",
      pr_num: 42,
    });
    render(<PRReviewTab {...baseProps} />);
    fireEvent.change(
      screen.getByPlaceholderText("https://github.com/owner/repo/pull/123"),
      { target: { value: "https://github.com/test/repo/pull/42" } },
    );
    fireEvent.click(screen.getByText("Review PR"));
    await waitFor(() => {
      expect(screen.getByText("ISSUES (1)")).toBeInTheDocument();
      expect(screen.getByText("SQL injection")).toBeInTheDocument();
      expect(screen.getByText("app.py:42")).toBeInTheDocument();
    });
  });

  it("displays review error", async () => {
    reviewPR.mockRejectedValue(new Error("PR not found"));
    render(<PRReviewTab {...baseProps} />);
    fireEvent.change(
      screen.getByPlaceholderText("https://github.com/owner/repo/pull/123"),
      { target: { value: "https://github.com/test/repo/pull/99" } },
    );
    fireEvent.click(screen.getByText("Review PR"));
    await waitFor(() => {
      expect(screen.getByText("PR not found")).toBeInTheDocument();
    });
  });
});

describe("PRReviewTab impact analysis", () => {
  it("shows Predict Impact button when analyzed", () => {
    render(<PRReviewTab {...baseProps} analyzed={true} />);
    expect(screen.getByText("Predict Impact")).toBeInTheDocument();
  });

  it("hides Predict Impact when not analyzed", () => {
    render(<PRReviewTab {...baseProps} analyzed={false} />);
    expect(screen.queryByText("Predict Impact")).not.toBeInTheDocument();
  });

  it("Predict Impact button disabled when URL is empty", () => {
    render(<PRReviewTab {...baseProps} />);
    const btn = screen.getByText("Predict Impact");
    expect(btn).toBeDisabled();
  });

  it("calls prImpact and renders result", async () => {
    render(<PRReviewTab {...baseProps} />);
    fireEvent.change(
      screen.getByPlaceholderText("https://github.com/owner/repo/pull/123"),
      { target: { value: "https://github.com/test/repo/pull/42" } },
    );
    fireEvent.click(screen.getByText("Predict Impact"));
    await waitFor(() => {
      expect(screen.getByText("LOW RISK")).toBeInTheDocument();
      expect(screen.getByText("Safe to merge")).toBeInTheDocument();
      expect(screen.getByText("Minimal changes")).toBeInTheDocument();
      expect(screen.getByText("auth")).toBeInTheDocument();
    });
    expect(prImpact).toHaveBeenCalledWith(
      "https://github.com/test/repo/pull/42",
      "sess-1",
    );
  });

  it("displays impact error", async () => {
    prImpact.mockRejectedValue(new Error("No base session"));
    render(<PRReviewTab {...baseProps} />);
    fireEvent.change(
      screen.getByPlaceholderText("https://github.com/owner/repo/pull/123"),
      { target: { value: "https://github.com/test/repo/pull/42" } },
    );
    fireEvent.click(screen.getByText("Predict Impact"));
    await waitFor(() => {
      expect(screen.getByText("No base session")).toBeInTheDocument();
    });
  });
});

describe("PRReviewTab open PRs", () => {
  it("fetches open PRs on mount when repoUrl is set", async () => {
    fetchOpenPRs.mockResolvedValue({
      prs: [
        {
          number: 1,
          title: "Fix bug",
          url: "https://github.com/test/repo/pull/1",
          head_ref: "fix",
          base_ref: "main",
          user: "dev",
          updated_at: "2024-01-01T00:00:00Z",
          draft: false,
          labels: ["bug"],
        },
      ],
    });
    render(<PRReviewTab {...baseProps} />);
    await waitFor(() => {
      expect(fetchOpenPRs).toHaveBeenCalledWith("test", "repo");
      expect(screen.getByText("Fix bug")).toBeInTheDocument();
      expect(screen.getByText("#1")).toBeInTheDocument();
    });
  });

  it("shows draft badge for draft PRs", async () => {
    fetchOpenPRs.mockResolvedValue({
      prs: [
        {
          number: 2,
          title: "WIP feature",
          url: "https://github.com/test/repo/pull/2",
          head_ref: "feat",
          base_ref: "main",
          user: "dev",
          updated_at: "2024-01-01T00:00:00Z",
          draft: true,
          labels: [],
        },
      ],
    });
    render(<PRReviewTab {...baseProps} />);
    await waitFor(() => {
      expect(screen.getByText("DRAFT")).toBeInTheDocument();
      expect(screen.getByText("WIP feature")).toBeInTheDocument();
    });
  });

  it("shows loading skeletons while fetching PRs", async () => {
    fetchOpenPRs.mockReturnValue(new Promise(() => {})); // never resolves
    render(<PRReviewTab {...baseProps} />);
    expect(screen.getByText("OPEN PULL REQUESTS")).toBeInTheDocument();
  });

  it("clicking a PR runs analysis", async () => {
    fetchOpenPRs.mockResolvedValue({
      prs: [
        {
          number: 1,
          title: "Fix bug",
          url: "https://github.com/test/repo/pull/1",
          head_ref: "fix",
          base_ref: "main",
          user: "dev",
          updated_at: "2024-01-01T00:00:00Z",
          draft: false,
          labels: [],
        },
      ],
    });
    reviewPR.mockResolvedValue({
      review_data: {
        verdict: "APPROVE",
        summary: "OK",
        issues: [],
        verdict_justification: "Looks clean",
      },
      repo: "test/repo",
      pr_num: 1,
    });
    render(<PRReviewTab {...baseProps} />);
    await waitFor(() =>
      expect(screen.getByText("Fix bug")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByText("Fix bug"));
    await waitFor(() => expect(reviewPR).toHaveBeenCalled());
  });
});

describe("PRReviewTab auto-URL", () => {
  it("triggers review when prAutoUrl is provided", async () => {
    reviewPR.mockResolvedValue({
      review_data: {
        verdict: "APPROVE",
        summary: "OK",
        issues: [],
        verdict_justification: "Clean",
      },
      repo: "test/repo",
      pr_num: 99,
    });
    render(
      <PRReviewTab
        {...baseProps}
        prAutoUrl="https://github.com/test/repo/pull/99"
      />,
    );
    await waitFor(() => {
      expect(reviewPR).toHaveBeenCalled();
      expect(baseProps.onAutoUrlUsed).toHaveBeenCalled();
    });
  });
});
