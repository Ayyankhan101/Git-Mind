import { vi, describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CveTab from "./CveTab";

vi.mock("lucide-react", async () => {
  const icons = {};
  for (const name of ["Lock", "ExternalLink"]) {
    icons[name] = (props) => <svg data-testid={`icon-${name}`} {...props} />;
  }
  return icons;
});

const baseProps = {
  findings: [],
  isAnalyzing: false,
  analyzed: false,
};

beforeEach(() => vi.clearAllMocks());

describe("CveTab empty states", () => {
  it("shows empty state when not analyzed", () => {
    render(<CveTab {...baseProps} />);
    expect(screen.getByText("CVE Scanner not available")).toBeInTheDocument();
  });

  it("shows skeleton when analyzing", () => {
    render(<CveTab {...baseProps} isAnalyzing={true} />);
    expect(document.querySelector(".sk-row")).toBeInTheDocument();
  });

  it("shows no vulnerabilities when analyzed but empty", () => {
    render(<CveTab {...baseProps} analyzed={true} />);
    expect(screen.getByText("No vulnerable dependencies")).toBeInTheDocument();
  });
});

describe("CveTab with findings", () => {
  const findings = [
    {
      package: "lodash",
      version: "4.17.20",
      ecosystem: "npm",
      worst_severity: "high",
      vulns: [
        {
          id: "CVE-2024-0001",
          url: "https://osv.dev/CVE-2024-0001",
          summary: "Prototype pollution",
          fixed_in: "4.17.21",
        },
      ],
    },
    {
      package: "minimist",
      version: "1.2.5",
      ecosystem: "npm",
      worst_severity: "medium",
      vulns: [{ id: "CVE-2024-0002", summary: "Prototype pollution" }],
    },
    {
      package: "express",
      version: "4.17.1",
      ecosystem: "npm",
      worst_severity: "critical",
      vulns: [{ id: "CVE-2024-0003", summary: "Remote code execution" }],
    },
  ];

  it("shows package count", () => {
    render(<CveTab {...baseProps} findings={findings} analyzed={true} />);
    expect(screen.getByText("3 vulnerable packages")).toBeInTheDocument();
  });

  it("renders findings", () => {
    render(<CveTab {...baseProps} findings={findings} analyzed={true} />);
    expect(screen.getByText("lodash@4.17.20")).toBeInTheDocument();
    expect(screen.getByText("minimist@1.2.5")).toBeInTheDocument();
    expect(screen.getByText("express@4.17.1")).toBeInTheDocument();
  });

  it("shows filter buttons", () => {
    render(<CveTab {...baseProps} findings={findings} analyzed={true} />);
    expect(screen.getByText(/All/)).toBeInTheDocument();
    expect(screen.getByText(/Critical/)).toBeInTheDocument();
    expect(screen.getByText(/High/)).toBeInTheDocument();
    expect(screen.getByText(/Medium/)).toBeInTheDocument();
  });

  it("expands vulnerability details", () => {
    render(<CveTab {...baseProps} findings={findings} analyzed={true} />);
    fireEvent.click(screen.getByText("lodash@4.17.20"));
    expect(screen.getByText("CVE-2024-0001")).toBeInTheDocument();
    expect(screen.getByText("Prototype pollution")).toBeInTheDocument();
    expect(screen.getByText("Fix → 4.17.21")).toBeInTheDocument();
  });

  it("shows OSV link when url provided", () => {
    render(<CveTab {...baseProps} findings={findings} analyzed={true} />);
    fireEvent.click(screen.getByText("lodash@4.17.20"));
    const links = screen.getAllByRole("link");
    const osvLink = links.find(
      (a) => a.href === "https://osv.dev/CVE-2024-0001",
    );
    expect(osvLink).toBeTruthy();
  });

  it("filters by severity", () => {
    render(<CveTab {...baseProps} findings={findings} analyzed={true} />);
    fireEvent.click(screen.getByText(/Critical/));
    expect(screen.getByText("express@4.17.1")).toBeInTheDocument();
    expect(screen.queryByText("lodash@4.17.20")).not.toBeInTheDocument();
  });

  it("sorts by severity", () => {
    render(<CveTab {...baseProps} findings={findings} analyzed={true} />);
    const rows = document.querySelectorAll(".row-title");
    expect(rows[0].textContent).toContain("express");
    expect(rows[1].textContent).toContain("lodash");
    expect(rows[2].textContent).toContain("minimist");
  });
});
