import React from "react";
import { render, screen } from "@testing-library/react";
import AgentPipeline from "./AgentPipeline";

const baseProps = {
  status: {},
  isAnalyzing: false,
  analyzed: false,
  elapsedSec: 0,
  repoName: "",
};

test("renders all agent labels", () => {
  render(<AgentPipeline {...baseProps} />);
  expect(screen.getByText("REPO SCANNER")).toBeInTheDocument();
  expect(screen.getByText("ARCHITECTURE")).toBeInTheDocument();
  expect(screen.getByText("API DOCS")).toBeInTheDocument();
  expect(screen.getByText("SECURITY")).toBeInTheDocument();
  expect(screen.getByText("CVE SCANNER")).toBeInTheDocument();
  expect(screen.getByText("KNOWLEDGE")).toBeInTheDocument();
  expect(screen.getByText("GIT AUDIT")).toBeInTheDocument();
});

test("shows done count in header", () => {
  render(
    <AgentPipeline
      status={{ scanner: "done", architecture: "done" }}
      isAnalyzing={true}
      analyzed={false}
      elapsedSec={5}
      repoName="test-repo"
    />,
  );
  expect(screen.getByTestId("pipeline-header")).toHaveTextContent(/2\/7/);
});

test("shows elapsed time on done agents", () => {
  render(
    <AgentPipeline
      status={{ scanner: "done" }}
      isAnalyzing={true}
      analyzed={false}
      elapsedSec={45}
      repoName="test"
    />,
  );
  expect(
    screen
      .getAllByTestId("pipe-time")
      .some((el) => el.textContent.includes("45s")),
  ).toBe(true);
});

test("caps elapsed time at 99s per agent row", () => {
  render(
    <AgentPipeline
      status={{ scanner: "done" }}
      isAnalyzing={true}
      analyzed={false}
      elapsedSec={200}
      repoName="test"
    />,
  );
  expect(
    screen
      .getAllByTestId("pipe-time")
      .some((el) => el.textContent.includes("99s")),
  ).toBe(true);
});

test("shows checkmark for done agent with zero elapsed", () => {
  render(
    <AgentPipeline
      status={{ scanner: "done" }}
      isAnalyzing={false}
      analyzed={true}
      elapsedSec={0}
      repoName="test"
    />,
  );
  expect(
    screen
      .getAllByTestId("pipe-time")
      .some((el) => el.textContent.includes("✓")),
  ).toBe(true);
});

test("shows spinner on running agents", () => {
  render(
    <AgentPipeline
      status={{ scanner: "running" }}
      isAnalyzing={true}
      analyzed={false}
      elapsedSec={5}
      repoName="test"
    />,
  );
  expect(screen.getAllByTestId("agent-spinner").length).toBeGreaterThanOrEqual(
    1,
  );
});
