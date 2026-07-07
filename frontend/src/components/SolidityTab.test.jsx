import { vi, describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SolidityTab from "./SolidityTab";

vi.mock("lucide-react", async () => {
  const icons = {};
  for (const name of ["ShieldAlert", "Wrench"]) {
    icons[name] = (props) => <svg data-testid={`icon-${name}`} {...props} />;
  }
  return icons;
});

const baseProps = {
  solAudit: null,
  onFix: null,
  fixLoading: null,
  fixResult: null,
};

beforeEach(() => vi.clearAllMocks());

describe("SolidityTab empty state", () => {
  it("shows empty state when no solAudit", () => {
    render(<SolidityTab {...baseProps} />);
    expect(screen.getByText(/No Solidity/)).toBeInTheDocument();
  });
});

describe("SolidityTab with findings", () => {
  const findings = [
    {
      id: "f1",
      severity: "critical",
      title: "Reentrancy",
      contract: "Vault",
      function: "withdraw",
      description: "Reentrancy attack possible",
      remediation: "Use reentrancy guard",
      swc: "SWC-107",
    },
    {
      id: "f2",
      severity: "high",
      title: "Unchecked call",
      contract: "Token",
      description: "Return value not checked",
      remediation: "Check return value",
      swc: "SWC-104",
    },
    {
      id: "f3",
      severity: "medium",
      title: "Timestamp",
      contract: "Lottery",
      description: "Block timestamp dependency",
      remediation: "Avoid using timestamps",
      swc: "SWC-116",
    },
    {
      id: "f4",
      severity: "low",
      title: "Pragma",
      contract: "Token",
      description: "Floating pragma",
      remediation: "Pin pragma version",
      swc: "SWC-103",
    },
  ];

  it("shows finding count", () => {
    render(
      <SolidityTab {...baseProps} solAudit={{ findings, contracts: [] }} />,
    );
    expect(screen.getByText("4 findings")).toBeInTheDocument();
  });

  it("renders critical and high risk section", () => {
    render(
      <SolidityTab {...baseProps} solAudit={{ findings, contracts: [] }} />,
    );
    expect(screen.getByText("Critical & High Risk")).toBeInTheDocument();
  });

  it("renders medium and low section", () => {
    render(
      <SolidityTab {...baseProps} solAudit={{ findings, contracts: [] }} />,
    );
    expect(screen.getByText("Medium & Low")).toBeInTheDocument();
  });

  it("finding row expands on click", () => {
    render(
      <SolidityTab {...baseProps} solAudit={{ findings, contracts: [] }} />,
    );
    fireEvent.click(screen.getByText("Reentrancy"));
    expect(screen.getByText("Reentrancy attack possible")).toBeInTheDocument();
    expect(screen.getByText("Use reentrancy guard")).toBeInTheDocument();
  });

  it("shows Generate Fix button when onFix provided", () => {
    const onFix = vi.fn();
    render(
      <SolidityTab
        {...baseProps}
        solAudit={{ findings, contracts: [] }}
        onFix={onFix}
      />,
    );
    fireEvent.click(screen.getByText("Reentrancy"));
    expect(screen.getByText("Generate Fix")).toBeInTheDocument();
  });

  it("onFix called with finding on generate fix", () => {
    const onFix = vi.fn();
    render(
      <SolidityTab
        {...baseProps}
        solAudit={{ findings, contracts: [] }}
        onFix={onFix}
      />,
    );
    fireEvent.click(screen.getByText("Reentrancy"));
    fireEvent.click(screen.getByText("Generate Fix"));
    expect(onFix).toHaveBeenCalledWith(findings[0]);
  });

  it("shows Fix ready when fixResult matches", () => {
    render(
      <SolidityTab
        {...baseProps}
        solAudit={{ findings, contracts: [] }}
        onFix={vi.fn()}
        fixResult={{ finding_id: "f1" }}
      />,
    );
    fireEvent.click(screen.getByText("Reentrancy"));
    expect(screen.getByText("Fix ready")).toBeInTheDocument();
  });
});

describe("SolidityTab contracts", () => {
  const contracts = [
    {
      name: "Vault",
      functions: [
        { name: "withdraw", visibility: "public", modifiers: ["nonReentrant"] },
      ],
      state_variables: [
        {
          typ: "uint256",
          name: "balance",
          visibility: "private",
          is_constant: false,
        },
      ],
      events: [{ name: "Withdraw" }],
    },
  ];

  it("shows contracts section", () => {
    render(
      <SolidityTab {...baseProps} solAudit={{ findings: [], contracts }} />,
    );
    expect(screen.getByText("Contracts")).toBeInTheDocument();
  });

  it("expands contract details", () => {
    render(
      <SolidityTab {...baseProps} solAudit={{ findings: [], contracts }} />,
    );
    fireEvent.click(screen.getByText("📄 Vault"));
    expect(screen.getByText("withdraw")).toBeInTheDocument();
    expect(screen.getByText(/nonReentrant/)).toBeInTheDocument();
    expect(screen.getByText("balance")).toBeInTheDocument();
    expect(screen.getByText("emit Withdraw")).toBeInTheDocument();
  });
});
