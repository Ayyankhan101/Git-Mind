import { vi, describe, it, expect, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import CrisisChat from "./CrisisChat";

vi.mock("../api", () => ({
  WS_BASE: "ws://localhost:8002",
  fetchIncidentReport: vi.fn(),
  generateFix: vi.fn(),
}));
vi.mock("../pdfBuilder", () => ({
  buildIncidentPdf: vi.fn(),
  downloadPdf: vi.fn(),
}));
vi.mock("./NodePanel", () => ({
  default: () => <div data-testid="node-panel" />,
}));

const { fetchIncidentReport } = await import("../api");
const pdfBuilder = await import("../pdfBuilder");

const baseProps = {
  finding: {
    severity: "critical",
    rule: "OOM-001",
    description: "Out of memory crash",
    title: "OOM in worker process",
    id: "finding-1",
  },
  sessionId: "sess-1",
  repoName: "test/repo",
  onClose: vi.fn(),
};

let wsInstances = [];

class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    wsInstances.push(this);
    setTimeout(() => {
      this.readyState = 1;
      this.onopen?.();
    }, 0);
  }
  send() {}
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  wsInstances = [];
  fetchIncidentReport.mockResolvedValue({
    report:
      "## Root Cause\nMemory leak in worker\n\n## Timeline\n2024-01-01 12:00 — OOM detected",
  });
  window.alert = vi.fn();
  window.WebSocket = MockWebSocket;
});

async function simulateResolved() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
    const ws = wsInstances[0];
    if (ws?.onmessage) {
      ws.onmessage({ data: JSON.stringify({ kind: "resolved" }) });
    }
  });
}

describe("CrisisChat rendering", () => {
  it("renders the close button", () => {
    render(<CrisisChat {...baseProps} />);
    expect(screen.getByLabelText("Close crisis chat")).toBeInTheDocument();
  });

  it("renders the finding title", () => {
    render(<CrisisChat {...baseProps} />);
    expect(screen.getByText("OOM in worker process")).toBeInTheDocument();
  });

  it("renders CRISIS ROOM label", () => {
    render(<CrisisChat {...baseProps} />);
    expect(screen.getByText("CRISIS ROOM")).toBeInTheDocument();
  });

  it("close button calls onClose", () => {
    render(<CrisisChat {...baseProps} />);
    fireEvent.click(screen.getByLabelText("Close crisis chat"));
    expect(baseProps.onClose).toHaveBeenCalled();
  });
});

describe("CrisisChat report flow", () => {
  it("shows Generate Report button after crisis resolves", async () => {
    render(<CrisisChat {...baseProps} />);
    await simulateResolved();
    expect(screen.getByText(/Generate Incident Report/)).toBeInTheDocument();
  });

  it("generates report when button clicked", async () => {
    render(<CrisisChat {...baseProps} />);
    await simulateResolved();
    fireEvent.click(screen.getByText(/Generate Incident Report/));
    await waitFor(() => expect(fetchIncidentReport).toHaveBeenCalled());
    expect(screen.getByText("INCIDENT REPORT")).toBeInTheDocument();
    expect(screen.getByText(/Root Cause/)).toBeInTheDocument();
  });

  it("has PDF download button after report loads", async () => {
    render(<CrisisChat {...baseProps} />);
    await simulateResolved();
    fireEvent.click(screen.getByText(/Generate Incident Report/));
    await waitFor(() => expect(fetchIncidentReport).toHaveBeenCalled());
    expect(screen.getByText("PDF")).toBeInTheDocument();
  });

  it("PDF button calls buildIncidentPdf", async () => {
    render(<CrisisChat {...baseProps} />);
    await simulateResolved();
    fireEvent.click(screen.getByText(/Generate Incident Report/));
    await waitFor(() => expect(fetchIncidentReport).toHaveBeenCalled());
    fireEvent.click(screen.getByText("PDF"));
    expect(pdfBuilder.buildIncidentPdf).toHaveBeenCalled();
  });

  it("has Copy button after report loads", async () => {
    render(<CrisisChat {...baseProps} />);
    await simulateResolved();
    fireEvent.click(screen.getByText(/Generate Incident Report/));
    await waitFor(() => expect(fetchIncidentReport).toHaveBeenCalled());
    expect(screen.getByText("Copy")).toBeInTheDocument();
  });
});

describe("CrisisChat error handling", () => {
  it("handles report fetch error", async () => {
    fetchIncidentReport.mockRejectedValue(new Error("network error"));
    render(<CrisisChat {...baseProps} />);
    await simulateResolved();
    fireEvent.click(screen.getByText(/Generate Incident Report/));
    await waitFor(() => expect(fetchIncidentReport).toHaveBeenCalled());
    expect(screen.getByText("network error")).toBeInTheDocument();
  });
});
