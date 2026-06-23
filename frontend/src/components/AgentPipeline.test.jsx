import React from "react";
import { render, screen } from "@testing-library/react";
import AgentPipeline from "./AgentPipeline";

test("renders all agent labels", () => {
  render(
    <AgentPipeline
      status={{}}
      isAnalyzing={false}
      analyzed={false}
      elapsedSec={0}
      repoName=""
    />,
  );
  expect(screen.getByText("REPO SCANNER")).toBeInTheDocument();
  expect(screen.getByText("ARCHITECTURE")).toBeInTheDocument();
  expect(screen.getByText("API DOCS")).toBeInTheDocument();
  expect(screen.getByText("SECURITY")).toBeInTheDocument();
  expect(screen.getByText("CVE SCANNER")).toBeInTheDocument();
  expect(screen.getByText("KNOWLEDGE")).toBeInTheDocument();
  expect(screen.getByText("GIT AUDIT")).toBeInTheDocument();
});

test("shows done count in header", () => {
  const { container } = render(
    <AgentPipeline
      status={{ scanner: "done", architecture: "done" }}
      isAnalyzing={true}
      analyzed={false}
      elapsedSec={5}
      repoName="test-repo"
    />,
  );
  const header = container.querySelector(".pipeline-header");
  expect(header.textContent).toMatch(/2\/7/);
});

test("shows elapsed time on done agents", () => {
  const { container } = render(
    <AgentPipeline
      status={{ scanner: "done" }}
      isAnalyzing={true}
      analyzed={false}
      elapsedSec={45}
      repoName="test"
    />,
  );
  const timeSpans = container.querySelectorAll(".pipe-time");
  const scannerTime = Array.from(timeSpans).find((el) =>
    el.textContent.includes("45s"),
  );
  expect(scannerTime).toBeTruthy();
});

test("caps elapsed time at 99s per agent row", () => {
  const { container } = render(
    <AgentPipeline
      status={{ scanner: "done" }}
      isAnalyzing={true}
      analyzed={false}
      elapsedSec={200}
      repoName="test"
    />,
  );
  const timeSpans = container.querySelectorAll(".pipe-time");
  const scannerTime = Array.from(timeSpans).find((el) =>
    el.textContent.includes("99s"),
  );
  expect(scannerTime).toBeTruthy();
});

test("shows checkmark for done agent with zero elapsed", () => {
  const { container } = render(
    <AgentPipeline
      status={{ scanner: "done" }}
      isAnalyzing={false}
      analyzed={true}
      elapsedSec={0}
      repoName="test"
    />,
  );
  const timeSpans = container.querySelectorAll(".pipe-time");
  const scannerTime = Array.from(timeSpans).find((el) =>
    el.textContent.includes("✓"),
  );
  expect(scannerTime).toBeTruthy();
});

test("shows spinner on running agents", () => {
  const { container } = render(
    <AgentPipeline
      status={{ scanner: "running" }}
      isAnalyzing={true}
      analyzed={false}
      elapsedSec={5}
      repoName="test"
    />,
  );
  const spinners = container.querySelectorAll(".spinner");
  expect(spinners.length).toBeGreaterThanOrEqual(1);
});
