import { vi, describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import NodePanel from "./NodePanel";

vi.mock("../api", () => ({
  postChatStream: vi.fn(),
}));

const { postChatStream } = await import("../api");

const defaultProps = {
  node: "AuthService",
  sessionId: "sess-1",
  enabled: true,
  onClose: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  // PostChatStream is called automatically by useEffect on mount for description
  postChatStream.mockImplementation(async (sid, q, onChunk) => {
    onChunk("Test description of the component");
    return {};
  });
});

describe("NodePanel header", () => {
  it("shows node name in title", () => {
    render(<NodePanel {...defaultProps} />);
    expect(screen.getByText("AuthService")).toBeInTheDocument();
  });

  it("close button calls onClose", () => {
    render(<NodePanel {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("Close"));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });
});

describe("NodePanel disabled state", () => {
  it("shows disabled message when enabled=false", () => {
    render(<NodePanel {...defaultProps} enabled={false} />);
    expect(
      screen.getByText("Analyze a repository to enable node insights."),
    ).toBeInTheDocument();
  });

  it("textarea is disabled when enabled=false", () => {
    render(<NodePanel {...defaultProps} enabled={false} />);
    const textarea = screen.getByLabelText("Ask about AuthService");
    expect(textarea).toBeDisabled();
  });

  it("textarea shows 'Analyze a repo first' placeholder when disabled", () => {
    render(<NodePanel {...defaultProps} enabled={false} />);
    expect(
      screen.getByPlaceholderText("Analyze a repo first"),
    ).toBeInTheDocument();
  });
});

describe("NodePanel chat input", () => {
  it("textarea placeholder shows node name when enabled", () => {
    render(<NodePanel {...defaultProps} />);
    expect(
      screen.getByPlaceholderText("Ask about AuthService…"),
    ).toBeInTheDocument();
  });

  it("send button is disabled when input is empty", () => {
    render(<NodePanel {...defaultProps} />);
    const sendBtn = screen.getByLabelText("Send message");
    expect(sendBtn).toBeDisabled();
  });

  it("send button enables when user types", () => {
    render(<NodePanel {...defaultProps} />);
    const textarea = screen.getByLabelText("Ask about AuthService");
    fireEvent.change(textarea, { target: { value: "What is this?" } });
    expect(screen.getByLabelText("Send message")).not.toBeDisabled();
  });

  it("textarea is enabled when chat is enabled", () => {
    render(<NodePanel {...defaultProps} />);
    const textarea = screen.getByLabelText("Ask about AuthService");
    expect(textarea).not.toBeDisabled();
  });
});

describe("NodePanel input behavior", () => {
  it("clears input after send", async () => {
    const { postChatStream } = await import("../api");
    postChatStream.mockImplementation(async (sid, q, onChunk) => {
      onChunk("Response");
      return {};
    });
    render(<NodePanel {...defaultProps} />);
    const textarea = screen.getByLabelText("Ask about AuthService");
    fireEvent.change(textarea, { target: { value: "Hello" } });
    await act(async () => {
      fireEvent.keyDown(textarea, { key: "Enter" });
    });
    expect(textarea.value).toBe("");
  });
});
