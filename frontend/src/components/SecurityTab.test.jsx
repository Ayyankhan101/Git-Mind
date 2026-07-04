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
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SecurityTab from "./SecurityTab";

const mockFindings = [
  {
    id: "F-001",
    severity: "high",
    rule: "TEST-001",
    description: "SQL injection risk",
    file: "backend/main.py",
    line_start: 42,
  },
  {
    id: "F-002",
    severity: "low",
    rule: "TEST-002",
    description: "Unused variable",
    file: "frontend/App.js",
    line_start: 10,
  },
];

vi.mock("../api", () => ({
  generateFix: vi.fn(),
  createFixPR: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

test("renders findings", () => {
  render(
    <SecurityTab findings={mockFindings} sessionId="sess-1" analyzed={true} />,
  );
  expect(screen.getByText("TEST-001")).toBeInTheDocument();
  expect(screen.getByText("TEST-002")).toBeInTheDocument();
  expect(screen.getByText("HIGH")).toBeInTheDocument();
  expect(screen.getByText("LOW")).toBeInTheDocument();
  expect(screen.getByText("All")).toBeInTheDocument();
});

test("expands finding details on click", async () => {
  render(
    <SecurityTab findings={mockFindings} sessionId="sess-1" analyzed={true} />,
  );
  const highButton = screen.getByText("HIGH");
  fireEvent.click(highButton);
  const fileRefs = screen.getAllByText("backend/main.py:42");
  expect(fileRefs.length).toBeGreaterThanOrEqual(1);
});

test("shows PR button and token input flow", async () => {
  const { createFixPR } = await import("../api");
  createFixPR.mockResolvedValue({
    pr_url: "https://github.com/test/repo/pull/1",
  });
  render(
    <SecurityTab findings={mockFindings} sessionId="sess-1" analyzed={true} />,
  );
  fireEvent.click(screen.getByText("HIGH"));
  const prBtn = screen.getByText("Open PR");
  fireEvent.click(prBtn);
  const tokenInput = screen.getByPlaceholderText("GitHub token (repo write)");
  fireEvent.change(tokenInput, { target: { value: "ghp_test" } });
  fireEvent.click(screen.getByText("Confirm"));
  await waitFor(() => expect(createFixPR).toHaveBeenCalled());
});

test("renders empty state when no findings after analysis", () => {
  render(<SecurityTab findings={[]} sessionId="sess-1" analyzed={true} />);
  expect(screen.getByText("No vulnerabilities detected")).toBeInTheDocument();
});

test("shows skeleton when analyzing", () => {
  render(<SecurityTab findings={[]} sessionId="sess-1" isAnalyzing={true} />);
});

test("shows empty prompt before analysis", () => {
  render(<SecurityTab findings={[]} sessionId="sess-1" />);
  expect(screen.getByText("Security not available")).toBeInTheDocument();
});
