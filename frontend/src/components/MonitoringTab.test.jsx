import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import MonitoringTab from "./MonitoringTab";

jest.mock("../api", () => ({
  subscribeMonitor: jest.fn(),
  fetchMonitorStatus: jest.fn(),
  unsubscribeMonitor: jest.fn(),
  fetchAnalysisHistory: jest.fn(),
}));

const { subscribeMonitor, fetchMonitorStatus, unsubscribeMonitor } =
  require("../api");

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
        id: "mon-1",
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
        id: "mon-2",
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

// ── Subscribe form ──────────────────────────────────────────────────────────

test("opens subscribe form and validates empty URL", async () => {
  fetchMonitorStatus.mockResolvedValue({ repos: [] });
  render(<MonitoringTab />);
  await screen.findByText("No repos monitored yet");

  fireEvent.click(screen.getByText("Subscribe to a repo"));
  expect(
    screen.getByPlaceholderText("https://github.com/owner/repo"),
  ).toBeInTheDocument();

  fireEvent.click(screen.getByText("Subscribe"));
  expect(screen.getByText("Enter a GitHub repository URL.")).toBeInTheDocument();
  expect(subscribeMonitor).not.toHaveBeenCalled();
});

test("rejects non-GitHub URLs", async () => {
  fetchMonitorStatus.mockResolvedValue({ repos: [] });
  render(<MonitoringTab />);
  await screen.findByText("No repos monitored yet");

  fireEvent.click(screen.getByText("Subscribe to a repo"));
  fireEvent.change(
    screen.getByPlaceholderText("https://github.com/owner/repo"),
    { target: { value: "https://gitlab.com/foo/bar" } },
  );
  fireEvent.click(screen.getByText("Subscribe"));

  expect(
    screen.getByText("Only GitHub repositories are supported."),
  ).toBeInTheDocument();
  expect(subscribeMonitor).not.toHaveBeenCalled();
});

test("subscribes successfully and refreshes the list", async () => {
  fetchMonitorStatus
    .mockResolvedValueOnce({ repos: [] })
    .mockResolvedValueOnce({
    repos: [
      {
        id: "mon-3",
        repo_url: "https://github.com/foo/bar",
        last_sha: "abc",
        last_check_at: Math.floor(Date.now() / 1000),
      },
    ],
    });
  subscribeMonitor.mockResolvedValue({ ok: true });
  render(<MonitoringTab />);
  await screen.findByText("No repos monitored yet");

  fireEvent.click(screen.getByText("Subscribe to a repo"));
  fireEvent.change(
    screen.getByPlaceholderText("https://github.com/owner/repo"),
    { target: { value: "https://github.com/foo/bar" } },
  );
  fireEvent.click(screen.getByText("Subscribe"));

  await waitFor(() =>
    expect(subscribeMonitor).toHaveBeenCalledWith(
      "https://github.com/foo/bar",
      {},
      null,
    ),
  );
  // List refreshes and the form closes
  expect(await screen.findByText("foo/bar")).toBeInTheDocument();
  expect(
    screen.queryByPlaceholderText("https://github.com/owner/repo"),
  ).not.toBeInTheDocument();
});

test("sends optional slack webhook with the subscription", async () => {
  fetchMonitorStatus.mockResolvedValueOnce({ repos: [] }).mockResolvedValueOnce({      repos: [
        {
          id: "mon-4",
          repo_url: "https://github.com/foo/bar",
          last_sha: "abc",
          last_check_at: null,
        },
      ],
  });
  subscribeMonitor.mockResolvedValue({ ok: true });
  render(<MonitoringTab />);
  await screen.findByText("No repos monitored yet");

  fireEvent.click(screen.getByText("Subscribe to a repo"));
  fireEvent.change(
    screen.getByPlaceholderText("https://github.com/owner/repo"),
    { target: { value: "https://github.com/foo/bar" } },
  );
  fireEvent.change(screen.getByPlaceholderText("Slack webhook URL (optional)"), {
    target: { value: "https://hooks.slack.com/XYZ" },
  });
  fireEvent.click(screen.getByText("Subscribe"));

  await waitFor(() =>
    expect(subscribeMonitor).toHaveBeenCalledWith(
      "https://github.com/foo/bar",
      { slack_webhook_url: "https://hooks.slack.com/XYZ" },
      null,
    ),
  );
});

test("shows backend error when subscription fails", async () => {
  fetchMonitorStatus.mockResolvedValue({ repos: [] });
  subscribeMonitor.mockRejectedValue(new Error("Rate limited"));
  render(<MonitoringTab />);
  await screen.findByText("No repos monitored yet");

  fireEvent.click(screen.getByText("Subscribe to a repo"));
  fireEvent.change(
    screen.getByPlaceholderText("https://github.com/owner/repo"),
    { target: { value: "https://github.com/foo/bar" } },
  );
  fireEvent.click(screen.getByText("Subscribe"));

  expect(await screen.findByText("Rate limited")).toBeInTheDocument();
});

test("auto-fills repoUrl into the form when analyzed", async () => {
  fetchMonitorStatus.mockResolvedValue({ repos: [] });
  render(
    <MonitoringTab repoUrl="https://github.com/acme/app" analyzed={true} />,
  );
  await screen.findByText("No repos monitored yet");

  fireEvent.click(screen.getByText("Subscribe to a repo"));
  expect(
    screen.getByPlaceholderText("https://github.com/owner/repo"),
  ).toHaveValue("https://github.com/acme/app");
});

// ── Error banner ─────────────────────────────────────────────────────────────

test("shows error banner when status fetch fails", async () => {
  fetchMonitorStatus.mockRejectedValue(new Error("Backend unreachable"));
  render(<MonitoringTab />);
  expect(await screen.findByText("Backend unreachable")).toBeInTheDocument();
});

test("dismisses the error banner", async () => {
  fetchMonitorStatus.mockRejectedValue(new Error("Backend unreachable"));
  render(<MonitoringTab />);
  await screen.findByText("Backend unreachable");

  fireEvent.click(screen.getByRole("button", { name: "Dismiss error" }));
  expect(screen.queryByText("Backend unreachable")).not.toBeInTheDocument();
});

// ── Unsubscribe ──────────────────────────────────────────────────────────────

test("unsubscribes and removes the row", async () => {
  fetchMonitorStatus.mockResolvedValue({
    repos: [
      { id: "mon-1", repo_url: "https://github.com/foo/bar", last_sha: "abc" },
    ],
  });
  unsubscribeMonitor.mockResolvedValue({ ok: true });
  render(<MonitoringTab />);
  await screen.findByText("foo/bar");

  fireEvent.click(screen.getByLabelText("Stop monitoring foo/bar"));

  await waitFor(() =>
    expect(unsubscribeMonitor).toHaveBeenCalledWith("mon-1", null),
  );
  expect(await screen.findByText("No repos monitored yet")).toBeInTheDocument();
});

// ── Relative time + meta ─────────────────────────────────────────────────────

test("renders relative last-check time", async () => {
  fetchMonitorStatus.mockResolvedValue({
    repos: [
      {
        id: "mon-5",
        repo_url: "https://github.com/foo/bar",
        last_sha: "abc",
        last_check_at: Math.floor(Date.now() / 1000) - 5 * 60, // 5m ago
      },
    ],
  });
  render(<MonitoringTab />);
  expect(await screen.findByText("foo/bar")).toBeInTheDocument();
  expect(screen.getByText(/5m ago/)).toBeInTheDocument();
});

test("renders 'just now' for fresh checks and Slack badge", async () => {
  fetchMonitorStatus.mockResolvedValue({
    repos: [
      {
        id: "mon-6",
        repo_url: "https://github.com/foo/bar",
        last_sha: "abc",
        last_check_at: Math.floor(Date.now() / 1000),
        slack_webhook_url: "https://hooks.slack.com/XYZ",
      },
    ],
  });
  render(<MonitoringTab />);
  expect(await screen.findByText("foo/bar")).toBeInTheDocument();
  expect(screen.getByText(/just now/)).toBeInTheDocument();
  expect(screen.getByText("Slack alerts")).toBeInTheDocument();
});

test("renders link to latest analysis when session exists", async () => {
  fetchMonitorStatus.mockResolvedValue({
    repos: [
      {
        id: "mon-7",
        repo_url: "https://github.com/foo/bar",
        last_sha: "abc",
        last_check_at: null,
        last_session_id: "sess-123",
      },
    ],
  });
  render(<MonitoringTab />);
  expect(await screen.findByText("foo/bar")).toBeInTheDocument();
  const link = screen.getByText("View latest analysis →");
  expect(link).toHaveAttribute("href", "/?share=sess-123");
});

test("strips .git suffix and https prefix from repo display name", async () => {
  fetchMonitorStatus.mockResolvedValue({
    repos: [
      {
        id: "mon-8",
        repo_url: "https://github.com/foo/bar.git",
        last_sha: "abc",
        last_check_at: null,
      },
    ],
  });
  render(<MonitoringTab />);
  expect(await screen.findByText("foo/bar")).toBeInTheDocument();
});
