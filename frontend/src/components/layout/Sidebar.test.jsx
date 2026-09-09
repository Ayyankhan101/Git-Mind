import React from "react";
import { render, screen } from "@testing-library/react";
import Sidebar from "./Sidebar";

const defaultProps = {
  repos: [],
  onSelect: jest.fn(),
  selectedUrl: null,
  loading: false,
  error: null,
  history: [],
  onHistorySelect: jest.fn(),
  agentStatus: {},
  isAnalyzing: false,
  analyzed: false,
  elapsedSec: 0,
  repoName: "",
  onLoadUser: jest.fn(),
  currentUser: null,
  loadedUsers: [],
};

test("renders empty state when no repos and no history", () => {
  render(<Sidebar {...defaultProps} />);
  expect(screen.getByText("No repositories")).toBeInTheDocument();
  expect(screen.getByText("Enter a GitHub username above")).toBeInTheDocument();
});

test("renders repo list when repos provided", () => {
  const repos = [
    {
      name: "test-repo",
      full_name: "user/test-repo",
      description: "Test",
      language: "Python",
      stars: 10,
      url: "https://github.com/user/test-repo",
      fork: false,
      private: false,
      pushed_at: "2024-01-01",
      updated_at: "2024-01-01",
    },
  ];
  render(<Sidebar {...defaultProps} repos={repos} />);
  expect(screen.getByText("test-repo")).toBeInTheDocument();
});

test("renders filter input when more than 4 repos", () => {
  const repos = Array.from({ length: 5 }, (_, i) => ({
    name: `repo-${i}`,
    full_name: `user/repo-${i}`,
    description: "",
    language: "",
    stars: 0,
    url: `https://github.com/user/repo-${i}`,
    fork: false,
    private: false,
    pushed_at: "2024-01-01",
    updated_at: "2024-01-01",
  }));
  render(<Sidebar {...defaultProps} repos={repos} />);
  expect(screen.getByPlaceholderText("Filter repos…")).toBeInTheDocument();
});

test("renders error state", () => {
  render(<Sidebar {...defaultProps} error="Failed to load" />);
  expect(screen.getByText("Failed to load")).toBeInTheDocument();
});

test("renders recent history section", () => {
  const history = [
    {
      name: "prev-repo",
      url: "https://github.com/user/prev-repo",
      ts: Date.now(),
    },
  ];
  render(<Sidebar {...defaultProps} history={history} />);
  expect(screen.getByText("prev-repo")).toBeInTheDocument();
});
