import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CrisisChat from "./CrisisChat";

class FakeWS {
  constructor() {
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;
    // Trigger onopen once the component attaches its handler; CrisisChat's
    // onopen sends the session payload, and this fake replies with "resolved".
    queueMicrotask(() => this.onopen && this.onopen());
  }
  send() {
    queueMicrotask(() => {
      this.onmessage({ data: JSON.stringify({ kind: "resolved" }) });
    });
  }
  close() {}
}
global.WebSocket = FakeWS;

jest.mock("../api", () => ({
  WS_BASE: "ws://localhost:8002",
  fetchIncidentReport: jest.fn(),
}));
jest.mock("../pdfBuilder", () => ({
  buildIncidentPdf: jest.fn(() => ({ content: [] })),
  downloadPdf: jest.fn(),
  sanitizeFilename: jest.fn((n) =>
    String(n || "gitmind-report").replace(/\//g, "-"),
  ),
}));

describe("CrisisChat incident export", () => {
  it("downloads the incident PDF once the report exists", async () => {
    // react-scripts jest runs with resetMocks: true — set impls in the test.
    const { fetchIncidentReport } = require("../api");
    fetchIncidentReport.mockResolvedValue({
      report: "## Summary\nContained",
    });
    const {
      buildIncidentPdf,
      downloadPdf,
      sanitizeFilename,
    } = require("../pdfBuilder");
    render(
      <CrisisChat
        finding={{ id: "f1", title: "Leak", severity: "high" }}
        sessionId="sess-1"
        repoName="acme/app"
        onClose={() => {}}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /generate incident report/i }),
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: /export incident report pdf/i,
      }),
    );
    await waitFor(() => expect(downloadPdf).toHaveBeenCalled());
    expect(buildIncidentPdf).toHaveBeenCalledWith(
      expect.objectContaining({ repoName: "acme/app", outcome: "resolved" }),
    );
    expect(downloadPdf.mock.calls[0][1]).toMatch(/^gitmind-incident-acme-app-/);
    expect(sanitizeFilename).toHaveBeenCalledWith("acme/app");
  });
});
