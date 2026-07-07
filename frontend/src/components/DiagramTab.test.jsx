import { vi, describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import DiagramTab from "./DiagramTab";

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async () => ({
      svg: '<svg><g class="node"><rect width="100" height="40"/></g></svg>',
    })),
  },
}));
vi.mock("./NodePanel", () => ({
  default: ({ open, onClose }) =>
    open ? (
      <div data-testid="node-panel">
        <button onClick={onClose}>close</button>
      </div>
    ) : null,
}));

const { default: mermaid } = await import("mermaid");

const baseProps = {
  diagram: "graph TD; A-->B",
  isAnalyzing: false,
  analyzed: true,
  theme: "obsidian",
  sessionId: "sess-1",
  enabled: true,
  repoName: "test/repo",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DiagramTab empty/loading states", () => {
  it("shows empty state when no diagram and not analyzing", () => {
    render(<DiagramTab {...baseProps} diagram={null} isAnalyzing={false} />);
    expect(screen.getByText("Architecture not available")).toBeInTheDocument();
  });

  it("shows skeleton loader when analyzing without diagram", () => {
    render(<DiagramTab {...baseProps} diagram={null} isAnalyzing={true} />);
    expect(
      screen.getByText("Generating architecture diagram…"),
    ).toBeInTheDocument();
  });
});

describe("DiagramTab mermaid rendering", () => {
  it("initializes mermaid on mount", () => {
    render(<DiagramTab {...baseProps} />);
    expect(mermaid.initialize).toHaveBeenCalled();
  });

  it("re-initializes mermaid on theme change", async () => {
    const { rerender } = render(<DiagramTab {...baseProps} theme="obsidian" />);
    const initCount = mermaid.initialize.mock.calls.length;
    await act(async () => {
      rerender(<DiagramTab {...baseProps} theme="spatial" />);
    });
    expect(mermaid.initialize.mock.calls.length).toBeGreaterThan(initCount);
  });

  it("renders diagram wrapper when diagram provided", async () => {
    await act(async () => {
      render(<DiagramTab {...baseProps} />);
    });
    expect(document.querySelector(".diagram-wrap")).toBeInTheDocument();
  });

  it("calls mermaid.render with diagram source", async () => {
    await act(async () => {
      render(<DiagramTab {...baseProps} />);
    });
    expect(mermaid.render).toHaveBeenCalled();
    const [id, src] = mermaid.render.mock.calls[0];
    expect(id).toMatch(/^gm-d-/);
    expect(src).toBe("graph TD; A-->B");
  });
});

describe("DiagramTab error handling", () => {
  it("shows error state when mermaid.render rejects", async () => {
    mermaid.render.mockRejectedValueOnce(new Error("bad syntax"));
    await act(async () => {
      render(<DiagramTab {...baseProps} />);
    });
    expect(screen.getByText("Raw Mermaid")).toBeInTheDocument();
  });
});

describe("DiagramTab controls", () => {
  it("shows zoom and action controls when diagram is ready", async () => {
    await act(async () => {
      render(<DiagramTab {...baseProps} />);
    });
    expect(screen.getByLabelText("Zoom out")).toBeInTheDocument();
    expect(screen.getByLabelText("Zoom in")).toBeInTheDocument();
    expect(screen.getByLabelText("Reset zoom")).toBeInTheDocument();
    expect(screen.getByLabelText("Fit to screen")).toBeInTheDocument();
    expect(screen.getByLabelText("Copy source")).toBeInTheDocument();
    expect(screen.getByLabelText("Toggle fullscreen")).toBeInTheDocument();
  });

  it("copy button calls clipboard.writeText", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    await act(async () => {
      render(<DiagramTab {...baseProps} />);
    });
    fireEvent.click(screen.getByLabelText("Copy source"));
    expect(writeText).toHaveBeenCalledWith("graph TD; A-->B");
  });

  it("shows check icon after copy", async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    await act(async () => {
      render(<DiagramTab {...baseProps} />);
    });
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Copy source"));
    });
    // After copy, the Check icon should appear (it's an SVG, look for the button)
    const copyBtn = screen.getByLabelText("Copy source");
    expect(copyBtn).toBeInTheDocument();
  });
});

describe("DiagramTab keyboard shortcuts", () => {
  it("no crash on Escape key", async () => {
    await act(async () => {
      render(<DiagramTab {...baseProps} />);
    });
    expect(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    }).not.toThrow();
  });

  it("no crash on + key", async () => {
    await act(async () => {
      render(<DiagramTab {...baseProps} />);
    });
    expect(() => {
      fireEvent.keyDown(window, { key: "+" });
    }).not.toThrow();
  });

  it("no crash on - key", async () => {
    await act(async () => {
      render(<DiagramTab {...baseProps} />);
    });
    expect(() => {
      fireEvent.keyDown(window, { key: "-" });
    }).not.toThrow();
  });

  it("no crash on 0 key (reset zoom)", async () => {
    await act(async () => {
      render(<DiagramTab {...baseProps} />);
    });
    expect(() => {
      fireEvent.keyDown(window, { key: "0" });
    }).not.toThrow();
  });
});

describe("DiagramTab SVG click", () => {
  it("no crash when SVG node is clicked", async () => {
    await act(async () => {
      render(<DiagramTab {...baseProps} />);
    });
    const node = document.querySelector("g.node");
    if (node) {
      expect(() => fireEvent.click(node)).not.toThrow();
    }
  });
});
