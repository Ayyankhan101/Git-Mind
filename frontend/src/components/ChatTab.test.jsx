import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ChatTab from "./ChatTab";

jest.mock("../api", () => ({
  postChatStream: jest.fn(),
}));

const { postChatStream } = require("../api");

const defaultProps = {
  sessionId: "sess-1",
  enabled: true,
  repoName: "test/repo",
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("ChatTab disabled state", () => {
  it("shows empty state when not enabled", () => {
    render(<ChatTab {...defaultProps} enabled={false} />);
    expect(
      screen.getByText("Analyze a repository to unlock chat"),
    ).toBeInTheDocument();
  });

  it("does not show input when disabled", () => {
    render(<ChatTab {...defaultProps} enabled={false} />);
    expect(
      screen.queryByPlaceholderText(/Ask anything/),
    ).not.toBeInTheDocument();
  });
});

describe("ChatTab rendering", () => {
  it("renders welcome prompt when enabled", () => {
    render(<ChatTab {...defaultProps} />);
    expect(screen.getByText(/Ask anything about/)).toBeInTheDocument();
    expect(screen.getByText("test/repo")).toBeInTheDocument();
  });

  it("renders chat input", () => {
    render(<ChatTab {...defaultProps} />);
    expect(
      screen.getByPlaceholderText(/Ask anything.*Enter to send/),
    ).toBeInTheDocument();
  });

  it("shows suggestion buttons", () => {
    render(<ChatTab {...defaultProps} />);
    expect(screen.getByText("What does this codebase do?")).toBeInTheDocument();
    expect(
      screen.getByText("How is authentication handled?"),
    ).toBeInTheDocument();
  });
});

describe("ChatTab interactions", () => {
  it("send function called on Enter key", async () => {
    postChatStream.mockResolvedValue({ response: "OK" });
    render(<ChatTab {...defaultProps} />);
    const textarea = screen.getByPlaceholderText(/Ask anything.*Enter to send/);
    fireEvent.change(textarea, { target: { value: "hello" } });
    fireEvent.keyDown(textarea, { key: "Enter" });
    // Verify postChatStream was called
    expect(postChatStream).toHaveBeenCalled();
  });

  it("suggestion button fills input", () => {
    render(<ChatTab {...defaultProps} />);
    fireEvent.click(screen.getByText("What does this codebase do?"));
    const textarea = screen.getByPlaceholderText(/Ask anything.*Enter to send/);
    expect(textarea.value).toBe("What does this codebase do?");
  });

  it("typing updates input value", () => {
    render(<ChatTab {...defaultProps} />);
    const textarea = screen.getByPlaceholderText(/Ask anything.*Enter to send/);
    fireEvent.change(textarea, { target: { value: "What are the findings?" } });
    expect(textarea.value).toBe("What are the findings?");
  });
});

describe("ChatTab streaming", () => {
  it("calls postChatStream with correct args", async () => {
    postChatStream.mockResolvedValue({ response: "OK" });
    render(<ChatTab {...defaultProps} />);
    const textarea = screen.getByPlaceholderText(/Ask anything.*Enter to send/);
    fireEvent.change(textarea, { target: { value: "Summarize" } });
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(postChatStream).toHaveBeenCalledWith(
      "sess-1",
      "Summarize",
      expect.any(Function),
      expect.any(AbortSignal),
      expect.any(Function),
    );
  });

  it("appends assistant response to messages", async () => {
    postChatStream.mockImplementation(
      async (sid, text, chunk, signal, onSources) => {
        chunk("Hello ");
        chunk("world");
        onSources?.([]);
        return { response: "Hello world" };
      },
    );
    render(<ChatTab {...defaultProps} />);
    const textarea = screen.getByPlaceholderText(/Ask anything.*Enter to send/);
    fireEvent.change(textarea, { target: { value: "Hi" } });
    fireEvent.keyDown(textarea, { key: "Enter" });
    // After postChatStream resolves, the message should be rendered
    await waitFor(() => {
      expect(screen.getByText("Hello world")).toBeInTheDocument();
    });
  });

  it("shows error message when stream fails", async () => {
    postChatStream.mockRejectedValue(new Error("Connection failed"));
    render(<ChatTab {...defaultProps} />);
    const textarea = screen.getByPlaceholderText(/Ask anything.*Enter to send/);
    fireEvent.change(textarea, { target: { value: "error test" } });
    fireEvent.keyDown(textarea, { key: "Enter" });
    await waitFor(() => {
      expect(screen.getByText("Error: Connection failed")).toBeInTheDocument();
    });
  });
});
