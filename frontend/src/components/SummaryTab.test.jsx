import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SummaryTab from "./SummaryTab";
jest.mock("../api", () => ({
  fetchSummary: jest.fn(),
  subscribeMonitor: jest.fn(),
  fetchMonitorStatus: jest.fn(),
}));
jest.mock("../tokenManager", () => ({ get: jest.fn(() => null) }));
jest.mock("../pdfBuilder", () => ({
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
    } = require("../api");
    fetchSummary.mockResolvedValue({ summary: "OK", stats: { commits: 5 } });
    subscribeMonitor.mockResolvedValue({});
    fetchMonitorStatus.mockResolvedValue({ repos: [] });
    const {
      buildSummaryPdf,
      downloadPdf,
      sanitizeFilename,
    } = require("../pdfBuilder");
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
