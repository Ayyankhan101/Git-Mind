import { render, screen } from "@testing-library/react";
import MonitoringTab from "./MonitoringTab";

jest.mock("../api", () => ({
  subscribeMonitor: jest.fn(),
  fetchMonitorStatus: jest.fn(),
  unsubscribeMonitor: jest.fn(),
  fetchAnalysisHistory: jest.fn(),
}));
jest.mock("./TrendChart", () => ({
  default: () => <div data-testid="trend-chart" />,
}));

const { fetchMonitorStatus } = require("../api");

beforeEach(() => {
  jest.clearAllMocks();
});

test("renders empty state when no subscriptions", async () => {
  fetchMonitorStatus.mockResolvedValue({ repos: [] });
  render(<MonitoringTab />);
  expect(await screen.findByText("No repos monitored yet")).toBeInTheDocument();
});

test("renders subscription list when subscribed", async () => {
  fetchMonitorStatus.mockResolvedValue({
    repos: [
      {
        repo_url: "https://github.com/test/repo",
        last_sha: "abc123",
        last_check_at: Math.floor(Date.now() / 1000),
      },
    ],
  });
  render(<MonitoringTab />);
  expect(await screen.findByText("test/repo")).toBeInTheDocument();
  expect(screen.getByText("Active")).toBeInTheDocument();
});

test("shows pending badge when never checked", async () => {
  fetchMonitorStatus.mockResolvedValue({
    repos: [
      {
        repo_url: "https://github.com/test/repo",
        last_sha: null,
        last_check_at: null,
      },
    ],
  });
  render(<MonitoringTab />);
  expect(await screen.findByText("test/repo")).toBeInTheDocument();
  expect(screen.getByText("Pending")).toBeInTheDocument();
});

test("shows quick subscribe button with repoUrl prop", async () => {
  fetchMonitorStatus.mockResolvedValue({ repos: [] });
  render(
    <MonitoringTab repoUrl="https://github.com/test/repo" analyzed={true} />,
  );
  expect(await screen.findByText("Watch this repo")).toBeInTheDocument();
});
