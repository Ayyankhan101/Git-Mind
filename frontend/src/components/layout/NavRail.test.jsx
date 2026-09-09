import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import NavRail from "./NavRail";

jest.mock("../../tokenManager", () => ({
  get: jest.fn(() => ""),
  set: jest.fn(),
  restore: jest.fn(),
}));

jest.mock("../../api", () => ({
  BASE: "https://backend.example.com",
  isValidGhToken: jest.fn(() => true),
}));

const baseProps = {
  activeTab: "summary",
  drawerOpen: false,
  isAnalyzing: false,
  analyzed: false,
  agentStatus: {},
  repos: [],
  tabs: [],
  dispatch: jest.fn(),
  theme: "obsidian",
  ghToken: "",
};

describe("NavRail token popover", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("opens and closes on the lock icon", () => {
    render(<NavRail {...baseProps} />);
    expect(screen.queryByLabelText("GitHub personal access token")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "GitHub token" }));
    expect(
      screen.getByLabelText("GitHub personal access token"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "GitHub token" }));
    expect(screen.queryByLabelText("GitHub personal access token")).toBeNull();
  });

  it("closes on Escape", () => {
    render(<NavRail {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "GitHub token" }));
    expect(
      screen.getByLabelText("GitHub personal access token"),
    ).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByLabelText("GitHub personal access token")).toBeNull();
  });

  it("closes on outside click (mousedown)", () => {
    render(<NavRail {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "GitHub token" }));
    expect(
      screen.getByLabelText("GitHub personal access token"),
    ).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByLabelText("GitHub personal access token")).toBeNull();
  });

  it("links Sign in with GitHub to the backend's OAuth login route", () => {
    render(<NavRail {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "GitHub token" }));
    const link = screen.getByText("Sign in with GitHub").closest("a");
    expect(link).toHaveAttribute(
      "href",
      "https://backend.example.com/auth/github/login",
    );
  });

  it("updates ghToken via dispatch when typing in the token field", () => {
    render(<NavRail {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "GitHub token" }));
    fireEvent.change(screen.getByLabelText("GitHub personal access token"), {
      target: { value: "ghp_test123" },
    });
    expect(baseProps.dispatch).toHaveBeenCalledWith({
      type: "SET_GH_TOKEN",
      value: "ghp_test123",
    });
  });
});
