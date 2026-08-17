import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import CommandBar from "./CommandBar";

jest.mock("../tokenManager", () => ({
  get: jest.fn(() => ""),
  set: jest.fn(),
  restore: jest.fn(),
}));

const baseProps = {
  githubUser: "octocat",
  ghToken: "",
  reposLoading: false,
  isAnalyzing: false,
  analyzed: false,
  shareCopied: false,
  statusClass: "",
  statusText: "",
  usernameRef: { current: null },
  dispatch: jest.fn(),
  handleLoadRepos: jest.fn(),
  handleShare: jest.fn(),
  handleExport: jest.fn(),
  theme: "obsidian",
};

describe("CommandBar token popover", () => {
  it("opens and closes on toggle button click", () => {
    render(<CommandBar {...baseProps} />);
    expect(screen.queryByLabelText("GitHub personal access token")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "GitHub token" }));
    expect(
      screen.getByLabelText("GitHub personal access token"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "GitHub token" }));
    expect(screen.queryByLabelText("GitHub personal access token")).toBeNull();
  });

  it("closes on Escape", () => {
    render(<CommandBar {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "GitHub token" }));
    expect(
      screen.getByLabelText("GitHub personal access token"),
    ).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByLabelText("GitHub personal access token")).toBeNull();
  });

  it("closes on outside click (mousedown)", () => {
    render(<CommandBar {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "GitHub token" }));
    expect(
      screen.getByLabelText("GitHub personal access token"),
    ).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByLabelText("GitHub personal access token")).toBeNull();
  });

  it("stays open when interacting inside the popover", () => {
    render(<CommandBar {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "GitHub token" }));
    const input = screen.getByLabelText("GitHub personal access token");

    fireEvent.mouseDown(input);
    expect(input).toBeInTheDocument();
  });
});
