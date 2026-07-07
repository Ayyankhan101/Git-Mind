import { vi, describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import FilePreviewDrawer from "./FilePreviewDrawer";

vi.mock("lucide-react", async () => {
  const icons = {};
  for (const name of ["FileText", "ExternalLink", "Copy", "X"]) {
    icons[name] = (props) => <svg data-testid={`icon-${name}`} {...props} />;
  }
  return icons;
});

const baseProps = {
  path: null,
  line: null,
  repoUrl: "https://github.com/user/repo",
  ghToken: null,
  onClose: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => vi.restoreAllMocks());

describe("FilePreviewDrawer empty state", () => {
  it("renders nothing when path is null", () => {
    const { container } = render(<FilePreviewDrawer {...baseProps} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("FilePreviewDrawer with path", () => {
  const mockContent = btoa(
    "line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10",
  );

  beforeEach(() => {
    fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: mockContent }),
    });
  });

  it("shows loading state", async () => {
    fetch.mockImplementation(() => new Promise(() => {})); // never resolves
    render(<FilePreviewDrawer {...baseProps} path="src/app.py" />);
    expect(screen.getByText("Fetching from GitHub…")).toBeInTheDocument();
  });

  it("renders file path in header", () => {
    render(<FilePreviewDrawer {...baseProps} path="src/app.py" />);
    expect(screen.getByText("src/app.py")).toBeInTheDocument();
  });

  it("shows Esc hint", () => {
    render(<FilePreviewDrawer {...baseProps} path="src/app.py" />);
    expect(screen.getByText("Esc")).toBeInTheDocument();
  });

  it("shows line number in title when provided", () => {
    render(<FilePreviewDrawer {...baseProps} path="src/app.py" line="5" />);
    expect(screen.getByText("src/app.py:5")).toBeInTheDocument();
  });

  it("fetches file from GitHub API", () => {
    render(<FilePreviewDrawer {...baseProps} path="src/app.py" />);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.github.com/repos/user/repo/contents/src/app.py",
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });

  it("closes on Escape", () => {
    render(<FilePreviewDrawer {...baseProps} path="src/app.py" />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(baseProps.onClose).toHaveBeenCalled();
  });

  it("closes on backdrop click", () => {
    render(<FilePreviewDrawer {...baseProps} path="src/app.py" />);
    const backdrop = document.querySelector(".drawer-backdrop");
    fireEvent.click(backdrop);
    expect(baseProps.onClose).toHaveBeenCalled();
  });

  it("close button calls onClose", () => {
    render(<FilePreviewDrawer {...baseProps} path="src/app.py" />);
    const closeBtn = document.querySelector(".drawer .btn-icon:last-child");
    fireEvent.click(closeBtn);
    expect(baseProps.onClose).toHaveBeenCalled();
  });
});

describe("FilePreviewDrawer errors", () => {
  it("shows error when fetch fails", async () => {
    fetch.mockRejectedValue(new Error("404"));
    render(<FilePreviewDrawer {...baseProps} path="missing.py" />);
    await waitFor(() =>
      expect(screen.getByText(/Preview not available/)).toBeInTheDocument(),
    );
  });

  it("shows GitHub link when repoUrl provided", async () => {
    fetch.mockRejectedValue(new Error("404"));
    render(<FilePreviewDrawer {...baseProps} path="missing.py" />);
    await waitFor(() => {
      const links = screen.getAllByRole("link");
      expect(
        links.some((a) => a.textContent.includes("Open on GitHub")),
      ).toBeTruthy();
    });
  });
});
