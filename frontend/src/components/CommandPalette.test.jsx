import { vi, describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CommandPalette from "./CommandPalette";

vi.mock("lucide-react", async () => {
  const icons = {};
  for (const name of [
    "Search",
    "BarChart3",
    "GitBranch",
    "FileCode2",
    "ShieldAlert",
    "Lock",
    "GitPullRequest",
    "MessageSquare",
    "Share2",
    "Download",
    "Keyboard",
    "AlignJustify",
    "ZoomOut",
    "ZoomIn",
    "FolderOpen",
    "Clock",
    "ChevronRight",
  ]) {
    icons[name] = (props) => <svg data-testid={`icon-${name}`} {...props} />;
  }
  return icons;
});

const baseProps = {
  open: true,
  onClose: vi.fn(),
  onAction: vi.fn(),
  repos: [],
  recents: [],
  theme: "obsidian",
  density: "compact",
};

beforeEach(() => vi.clearAllMocks());

describe("CommandPalette rendering", () => {
  it("renders when open", () => {
    render(<CommandPalette {...baseProps} />);
    expect(screen.getByPlaceholderText(/Type a command/)).toBeInTheDocument();
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <CommandPalette {...baseProps} open={false} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("shows navigation items", () => {
    render(<CommandPalette {...baseProps} />);
    expect(screen.getByText("Go to Summary")).toBeInTheDocument();
    expect(screen.getByText("Go to Architecture")).toBeInTheDocument();
    expect(screen.getByText("Go to Security")).toBeInTheDocument();
  });

  it("shows action items", () => {
    render(<CommandPalette {...baseProps} />);
    expect(screen.getByText("Share analysis")).toBeInTheDocument();
    expect(screen.getByText("Export report")).toBeInTheDocument();
    expect(screen.getByText("Keyboard shortcuts")).toBeInTheDocument();
  });

  it("shows theme items", () => {
    render(<CommandPalette {...baseProps} />);
    expect(screen.getByText("Obsidian theme")).toBeInTheDocument();
    expect(screen.getByText("Daylight theme")).toBeInTheDocument();
  });

  it("shows density items", () => {
    render(<CommandPalette {...baseProps} />);
    expect(screen.getByText("Compact density")).toBeInTheDocument();
    expect(screen.getByText("Comfortable density")).toBeInTheDocument();
    expect(screen.getByText("Spacious density")).toBeInTheDocument();
  });
});

describe("CommandPalette search", () => {
  it("filters items by query", async () => {
    render(<CommandPalette {...baseProps} />);
    fireEvent.change(screen.getByPlaceholderText(/Type a command/), {
      target: { value: "summary" },
    });
    expect(screen.getByText("Go to Summary")).toBeInTheDocument();
    expect(screen.queryByText("Go to Chat")).not.toBeInTheDocument();
  });

  it("shows no results message for unknown query", async () => {
    render(<CommandPalette {...baseProps} />);
    fireEvent.change(screen.getByPlaceholderText(/Type a command/), {
      target: { value: "zzznoexist" },
    });
    expect(screen.getByText(/No results for/)).toBeInTheDocument();
  });
});

describe("CommandPalette navigation", () => {
  it("closes on Escape", () => {
    render(<CommandPalette {...baseProps} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(baseProps.onClose).toHaveBeenCalled();
  });

  it("calls onAction when item clicked", () => {
    render(<CommandPalette {...baseProps} />);
    fireEvent.click(screen.getByText("Go to Summary"));
    expect(baseProps.onAction).toHaveBeenCalled();
  });

  it("calls onClose when backdrop clicked", () => {
    render(<CommandPalette {...baseProps} />);
    const backdrop = document.querySelector(".palette-backdrop");
    fireEvent.mouseDown(backdrop);
    expect(baseProps.onClose).toHaveBeenCalled();
  });

  it("arrow keys navigate and Enter selects", () => {
    render(<CommandPalette {...baseProps} />);
    const input = screen.getByPlaceholderText(/Type a command/);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(baseProps.onAction).toHaveBeenCalled();
  });
});

describe("CommandPalette repos", () => {
  it("shows repos in results", () => {
    render(
      <CommandPalette
        {...baseProps}
        repos={[{ name: "my-repo", full_name: "user/my-repo" }]}
      />,
    );
    expect(screen.getByText("my-repo")).toBeInTheDocument();
    expect(screen.getByText("user/my-repo")).toBeInTheDocument();
  });

  it("filters repos by name", () => {
    render(
      <CommandPalette
        {...baseProps}
        repos={[
          { name: "frontend", full_name: "u/frontend" },
          { name: "backend", full_name: "u/backend" },
        ]}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText(/Type a command/), {
      target: { value: "frontend" },
    });
    expect(screen.getByText("frontend")).toBeInTheDocument();
    expect(screen.queryByText("backend")).not.toBeInTheDocument();
  });

  it("shows recents when no query", () => {
    render(
      <CommandPalette
        {...baseProps}
        recents={[{ id: "r1", label: "Recent Repo", sub: "user/repo" }]}
      />,
    );
    expect(screen.getByText("Recent Repo")).toBeInTheDocument();
  });
});
