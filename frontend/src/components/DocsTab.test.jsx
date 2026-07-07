import { vi, describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DocsTab from "./DocsTab";

vi.mock("lucide-react", async () => {
  const icons = {};
  for (const name of ["FileCode2", "Lock", "LockOpen"]) {
    icons[name] = (props) => <svg data-testid={`icon-${name}`} {...props} />;
  }
  return icons;
});

const baseProps = {
  docs: [],
  isAnalyzing: false,
  analyzed: false,
  onPickFile: vi.fn(),
};

beforeEach(() => vi.clearAllMocks());

describe("DocsTab empty states", () => {
  it("shows empty state when not analyzed", () => {
    render(<DocsTab {...baseProps} />);
    expect(screen.getByText("API Docs not available")).toBeInTheDocument();
  });

  it("shows skeleton when analyzing", () => {
    render(<DocsTab {...baseProps} isAnalyzing={true} />);
    expect(document.querySelector(".sk-row")).toBeInTheDocument();
  });

  it("shows no endpoints when analyzed but empty", () => {
    render(<DocsTab {...baseProps} analyzed={true} />);
    expect(screen.getByText("No API endpoints detected")).toBeInTheDocument();
  });
});

describe("DocsTab with endpoints", () => {
  const docs = [
    {
      method: "GET",
      path: "/repos",
      description: "List repos",
      auth_required: false,
      parameters: "None",
      file: "routes.py",
      line: 10,
    },
    {
      method: "POST",
      path: "/repos/create",
      description: "Create repo",
      auth_required: true,
      parameters: "name: string",
    },
    {
      method: "DELETE",
      path: "/repos/:id",
      description: "Delete repo",
      auth_required: true,
    },
  ];

  it("shows endpoint count", () => {
    render(<DocsTab {...baseProps} docs={docs} analyzed={true} />);
    expect(screen.getByText("3 endpoints discovered")).toBeInTheDocument();
  });

  it("renders endpoints", () => {
    render(<DocsTab {...baseProps} docs={docs} analyzed={true} />);
    expect(screen.getByText("/repos")).toBeInTheDocument();
    expect(screen.getByText("/repos/:id")).toBeInTheDocument();
    expect(screen.getByText("List repos")).toBeInTheDocument();
  });

  it("shows method badges", () => {
    render(<DocsTab {...baseProps} docs={docs} analyzed={true} />);
    const methods = document.querySelectorAll(".method");
    expect(methods.length).toBe(3);
  });

  it("shows AUTH badge for authenticated endpoints", () => {
    render(<DocsTab {...baseProps} docs={docs} analyzed={true} />);
    const badges = document.querySelectorAll(".auth-badge");
    const authBadges = Array.from(badges).filter((b) =>
      b.textContent.includes("AUTH"),
    );
    expect(authBadges.length).toBe(2);
  });

  it("shows PUBLIC badge for public endpoints", () => {
    render(<DocsTab {...baseProps} docs={docs} analyzed={true} />);
    expect(screen.getByText("PUBLIC")).toBeInTheDocument();
  });

  it("shows parameters when present", () => {
    render(<DocsTab {...baseProps} docs={docs} analyzed={true} />);
    expect(screen.getByText("Parameters: name: string")).toBeInTheDocument();
  });

  it("filters by method", () => {
    render(<DocsTab {...baseProps} docs={docs} analyzed={true} />);
    const deletePill = document.querySelector(".sev-pill");
    const pills = document.querySelectorAll(".sev-pill");
    const deleteBtn = Array.from(pills).find((el) =>
      el.textContent.includes("DELETE"),
    );
    fireEvent.click(deleteBtn);
    expect(screen.getByText("/repos/:id")).toBeInTheDocument();
    expect(screen.queryByText("List repos")).not.toBeInTheDocument();
  });

  it("file link calls onPickFile", () => {
    render(<DocsTab {...baseProps} docs={docs} analyzed={true} />);
    const route = screen.getByText("/repos");
    fireEvent.click(route);
    expect(baseProps.onPickFile).toHaveBeenCalledWith({
      path: "routes.py",
      line: 10,
    });
  });
});
