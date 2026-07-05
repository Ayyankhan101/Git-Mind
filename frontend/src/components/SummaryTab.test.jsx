import {
  vi,
  describe,
  it,
  test,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
} from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import SummaryTab from "./SummaryTab";

vi.mock("../api", () => ({
  fetchSummary: vi.fn(),
  subscribeMonitor: vi.fn(),
  fetchMonitorStatus: vi.fn(),
  fetchAnalysisHistory: vi.fn(),
}));
vi.mock("../pdfBuilder", () => ({
  buildSummaryPdf: vi.fn(),
  downloadPdf: vi.fn(),
}));
vi.mock("./HealthCard", () => ({
  default: () => <div data-testid="health-card" />,
}));
vi.mock("./TrendChart", () => ({
  default: () => <div data-testid="trend-chart" />,
}));

const baseProps = {
  sessionId: "sess-1",
  repoUrl: "https://github.com/test/repo",
  repoName: "test/repo",
  findings: [
    { severity: "high", rule: "TEST-001", description: "Test finding" },
  ],
  apiDocs: [],
  health: { grade: "A", score: 92 },
  elapsedSec: 15,
};

const { fetchSummary, fetchMonitorStatus, fetchAnalysisHistory } =
  await import("../api");

beforeEach(() => {
  vi.clearAllMocks();
  fetchSummary.mockResolvedValue({
    summary: "Test summary",
    structured_summary: {
      executive_summary: "Test summary",
      key_architectural_patterns: "MVC",
      quality_assessment: "Good",
      risk_areas: [],
    },
  });
  fetchMonitorStatus.mockResolvedValue({ repos: [] });
  fetchAnalysisHistory.mockResolvedValue({ history: [] });
});

test("renders empty state when not enabled", () => {
  render(<SummaryTab {...baseProps} enabled={false} />);
  expect(screen.getByText("Summary not available")).toBeInTheDocument();
});

test("renders summary with data when enabled", async () => {
  render(<SummaryTab {...baseProps} enabled={true} />);
  await waitFor(() => expect(fetchSummary).toHaveBeenCalled());
  expect(screen.getByText("Executive Summary")).toBeInTheDocument();
});

test("renders health card", async () => {
  render(<SummaryTab {...baseProps} enabled={true} />);
  await waitFor(() => expect(fetchSummary).toHaveBeenCalled());
  expect(screen.getByTestId("health-card")).toBeInTheDocument();
});

test("renders export button", async () => {
  render(<SummaryTab {...baseProps} enabled={true} />);
  await waitFor(() => expect(fetchSummary).toHaveBeenCalled());
  expect(screen.getByText("Export PDF")).toBeInTheDocument();
});

test("shows monitor subscribe button", async () => {
  fetchMonitorStatus.mockResolvedValue({ repos: [] });
  render(<SummaryTab {...baseProps} enabled={true} />);
  await waitFor(() => expect(fetchMonitorStatus).toHaveBeenCalled());
  expect(screen.getByText("Watch this repo")).toBeInTheDocument();
});

test("renders trend chart when history provided", async () => {
  fetchAnalysisHistory.mockResolvedValue({
    history: [
      { timestamp: "2024-01-01T00:00:00Z", health: { grade: "B", score: 85 } },
    ],
  });
  render(<SummaryTab {...baseProps} enabled={true} />);
  await waitFor(() => expect(fetchAnalysisHistory).toHaveBeenCalled());
  expect(screen.getByTestId("trend-chart")).toBeInTheDocument();
});

test("handles fetch error gracefully", async () => {
  fetchSummary.mockRejectedValue(new Error("API error"));
  render(<SummaryTab {...baseProps} enabled={true} />);
  await waitFor(() => expect(fetchSummary).toHaveBeenCalled());
  expect(screen.getByText(/Failed to load summary/)).toBeInTheDocument();
});
