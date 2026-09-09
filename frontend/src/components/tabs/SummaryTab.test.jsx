import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SummaryTab from "./SummaryTab";
jest.mock("../../api", () => ({
  fetchSummary: jest.fn(),
  subscribeMonitor: jest.fn(),
  fetchMonitorStatus: jest.fn(),
}));
jest.mock("../../tokenManager", () => ({ get: jest.fn(() => null) }));
jest.mock("../../pdfBuilder", () => ({
  buildSummaryPdf: jest.fn(() => ({ content: [] })),
  downloadPdf: jest.fn(),
  sanitizeFilename: jest.fn((n) =>
    String(n || "gitmind-report").replace(/\//g, "-"),
  ),
}));

describe("SummaryTab export", () => {
  it("downloads a summary PDF on button click", async () => {
    // react-scripts jest runs with resetMocks: true — factory impls are wiped,
    // so set implementations here.
    const {
      fetchSummary,
      subscribeMonitor,
      fetchMonitorStatus,
    } = require("../../api");
    fetchSummary.mockResolvedValue({ summary: "OK", stats: { commits: 5 } });
    subscribeMonitor.mockResolvedValue({});
    fetchMonitorStatus.mockResolvedValue({ repos: [] });
    const {
      buildSummaryPdf,
      downloadPdf,
      sanitizeFilename,
    } = require("../../pdfBuilder");
    render(
      <SummaryTab
        sessionId="sess-1"
        enabled
        repoName="acme/app"
        findings={[]}
        apiDocs={[]}
        elapsedSec={12}
        isAnalyzing={false}
        health={{ grade: "A", score: 95, breakdown: {} }}
        repoUrl="https://github.com/acme/app"
        ghToken={null}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /export summary pdf/i }),
    );
    await waitFor(() => expect(downloadPdf).toHaveBeenCalled());
    expect(buildSummaryPdf).toHaveBeenCalledWith(
      expect.objectContaining({ repoName: "acme/app", summary: "OK" }),
    );
    expect(downloadPdf.mock.calls[0][1]).toMatch(/^gitmind-summary-acme-app-/);
    expect(sanitizeFilename).toHaveBeenCalledWith("acme/app");
  });
});

describe("SummaryTab across a repo switch within one session", () => {
  it("does not keep showing the previous repo's summary text", async () => {
    // SESSION_ID is a stable per-browser-tab constant (App.jsx) reused for
    // every analysis in that tab — switching repos does NOT change
    // sessionId. SummaryTab's own fetch-and-cache effect used to key its
    // reset on sessionId, so it never refetched on a repo switch and kept
    // showing the first repo's LLM-generated summary for every repo
    // analyzed afterward. The real fix lives one level up
    // (DashboardLayout.jsx adds `key={repoName}` to force a remount on
    // repo switch, mirroring the same trick already used for ChatTab) —
    // simulated here by re-rendering with a different `key`, exactly what
    // that fix causes React to do.
    const {
      fetchSummary,
      subscribeMonitor,
      fetchMonitorStatus,
    } = require("../../api");
    subscribeMonitor.mockResolvedValue({});
    fetchMonitorStatus.mockResolvedValue({ repos: [] });
    fetchSummary.mockResolvedValueOnce({
      summary: "Summary for repo A",
      stats: {},
    });

    const { rerender } = render(
      <SummaryTab
        key="acme/app-a"
        sessionId="sess-1"
        enabled
        repoName="acme/app-a"
        findings={[]}
        apiDocs={[]}
        elapsedSec={5}
        isAnalyzing={false}
        health={{ grade: "A", score: 95, breakdown: {} }}
        repoUrl="https://github.com/acme/app-a"
        ghToken={null}
      />,
    );
    await screen.findByText("Summary for repo A");

    fetchSummary.mockResolvedValueOnce({
      summary: "Summary for repo B",
      stats: {},
    });
    rerender(
      <SummaryTab
        key="acme/app-b"
        sessionId="sess-1"
        enabled
        repoName="acme/app-b"
        findings={[]}
        apiDocs={[]}
        elapsedSec={2}
        isAnalyzing={false}
        health={{ grade: "B", score: 80, breakdown: {} }}
        repoUrl="https://github.com/acme/app-b"
        ghToken={null}
      />,
    );

    await screen.findByText("Summary for repo B");
    expect(screen.queryByText("Summary for repo A")).not.toBeInTheDocument();
    expect(fetchSummary).toHaveBeenCalledTimes(2);
  });
});
