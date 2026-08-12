import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import SolidityTab from "./SolidityTab";

const SAMPLE_AUDIT = {
  contracts: [
    {
      name: "Token.sol",
      functions: [
        { name: "transfer", visibility: "public", modifiers: ["onlyOwner"] },
        { name: "mint", visibility: "public", modifiers: [] },
      ],
      state_variables: [
        { typ: "uint256", name: "totalSupply", visibility: "public" },
        {
          typ: "bool",
          name: "paused",
          visibility: "private",
          is_constant: true,
        },
      ],
      events: [{ name: "Transfer" }],
    },
    {
      name: "Vault.sol",
      functions: [{ name: "withdraw", visibility: "external", modifiers: [] }],
      state_variables: [],
      events: [],
    },
  ],
  findings: [
    {
      id: "sol-1",
      severity: "critical",
      title: "Reentrancy in withdraw",
      contract: "Vault.sol",
      function: "withdraw",
      swc: "SWC-107",
      description: "External call before state update.",
      remediation: "Use checks-effects-interactions.",
    },
    {
      id: "sol-2",
      severity: "medium",
      title: "Unchecked return value",
      contract: "Token.sol",
      function: "transfer",
      swc: "SWC-104",
      description: "transfer return value not checked.",
      remediation: "Use SafeERC20.",
    },
    {
      id: "sol-3",
      severity: "low",
      title: "Floating pragma",
      contract: "Token.sol",
      swc: "SWC-103",
      description: "Pragma not pinned.",
      remediation: "Pin the compiler version.",
    },
  ],
};

test("shows skeleton while analyzing", () => {
  render(
    <SolidityTab solAudit={null} isAnalyzing={true} />,
  );
  expect(document.querySelectorAll(".sk").length).toBeGreaterThan(0);
  expect(
    screen.queryByText("No Solidity (.sol) files found in this repository."),
  ).not.toBeInTheDocument();
});

test("shows empty state when no sol files", () => {
  render(
    <SolidityTab solAudit={null} isAnalyzing={false} />,
  );
  expect(
    screen.getByText("No Solidity (.sol) files found in this repository."),
  ).toBeInTheDocument();
});

test("renders finding count and sections", () => {
  render(<SolidityTab solAudit={SAMPLE_AUDIT} isAnalyzing={false} />);
  expect(screen.getByText("Solidity Audit")).toBeInTheDocument();
  // Counts are consolidated in the standard tab-header sub line.
  expect(screen.getByText(/3 findings/)).toBeInTheDocument();
  expect(screen.getByText(/2 contracts/)).toBeInTheDocument();
  expect(screen.getByText("Critical & High Risk")).toBeInTheDocument();
  expect(screen.getByText("Medium & Low")).toBeInTheDocument();
});

test("lists critical/high findings in the top section and medium/low below", () => {
  render(<SolidityTab solAudit={SAMPLE_AUDIT} isAnalyzing={false} />);

  expect(screen.getByText("Reentrancy in withdraw")).toBeInTheDocument();
  expect(screen.getByText("Unchecked return value")).toBeInTheDocument();
  expect(screen.getByText("Floating pragma")).toBeInTheDocument();

  // Severity badges
  expect(screen.getByText("CRITICAL")).toBeInTheDocument();
  expect(screen.getByText("MEDIUM")).toBeInTheDocument();
  expect(screen.getByText("LOW")).toBeInTheDocument();

  // File + function chips
  expect(screen.getByText("Vault.sol.withdraw()")).toBeInTheDocument();
  expect(screen.getByText("Token.sol.transfer()")).toBeInTheDocument();
  // SWC ids
  expect(screen.getByText("SWC-107")).toBeInTheDocument();
  expect(screen.getByText("SWC-104")).toBeInTheDocument();
});

test("expanding a finding row reveals description, remediation, and fix button", () => {
  render(
    <SolidityTab
      solAudit={SAMPLE_AUDIT}
      isAnalyzing={false}
      onFix={jest.fn()}
      fixLoading={null}
      fixResult={null}
    />,
  );

  const row = screen.getByText("Reentrancy in withdraw");
  fireEvent.click(row);

  expect(screen.getByText("External call before state update.")).toBeInTheDocument();
  expect(
    screen.getByText("Use checks-effects-interactions."),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Generate Fix/i }));
});

test("finding rows are keyboard-accessible", () => {
  render(<SolidityTab solAudit={SAMPLE_AUDIT} isAnalyzing={false} />);

  const row = screen.getByRole("button", {
    name: /Reentrancy in withdraw/,
  });
  expect(row).toHaveAttribute("tabindex", "0");
  expect(row).toHaveAttribute("aria-expanded", "false");

  fireEvent.keyDown(row, { key: "Enter" });
  expect(screen.getByText("External call before state update.")).toBeInTheDocument();
  expect(row).toHaveAttribute("aria-expanded", "true");

  fireEvent.keyDown(row, { key: " " });
  expect(
    screen.queryByText("External call before state update."),
  ).not.toBeInTheDocument();
});

test("calls onFix with the finding", () => {
  const onFix = jest.fn();
  render(
    <SolidityTab
      solAudit={SAMPLE_AUDIT}
      isAnalyzing={false}
      onFix={onFix}
      fixLoading={null}
      fixResult={null}
    />,
  );

  fireEvent.click(screen.getByText("Reentrancy in withdraw"));
  fireEvent.click(screen.getByRole("button", { name: /Generate Fix/i }));

  expect(onFix).toHaveBeenCalledWith(
    expect.objectContaining({ id: "sol-1", title: "Reentrancy in withdraw" }),
  );
});

test("shows fix loading state and disables the button", () => {
  render(
    <SolidityTab
      solAudit={SAMPLE_AUDIT}
      isAnalyzing={false}
      onFix={jest.fn()}
      fixLoading="sol-1"
      fixResult={null}
    />,
  );

  fireEvent.click(screen.getByText("Reentrancy in withdraw"));
  const btn = screen.getByRole("button", { name: /Generating/i });
  expect(btn).toBeDisabled();
});

test("shows fix-ready state when fixResult matches", () => {
  render(
    <SolidityTab
      solAudit={SAMPLE_AUDIT}
      isAnalyzing={false}
      onFix={jest.fn()}
      fixLoading={null}
      fixResult={{ finding_id: "sol-1" }}
    />,
  );

  fireEvent.click(screen.getByText("Reentrancy in withdraw"));
  expect(screen.getByText("Fix ready")).toBeInTheDocument();
  // Generate Fix is no longer offered for this finding
  expect(
    screen.queryByRole("button", { name: /Generate Fix/i }),
  ).not.toBeInTheDocument();
});

test("expanding a contract shows functions, state variables, and events", () => {
  render(<SolidityTab solAudit={SAMPLE_AUDIT} isAnalyzing={false} />);

  fireEvent.click(screen.getByText(/📄 Token\.sol/));
  expect(screen.getByText("transfer")).toBeInTheDocument();
  expect(screen.getByText("mint")).toBeInTheDocument();
  expect(screen.getByText("@onlyOwner")).toBeInTheDocument();
  expect(screen.getByText("totalSupply")).toBeInTheDocument();
  expect(screen.getByText("paused")).toBeInTheDocument();
  expect(screen.getByText("constant")).toBeInTheDocument();
  expect(screen.getByText(/emit Transfer/)).toBeInTheDocument();
});

test("does not render contract list when there are no contracts", () => {
  render(
    <SolidityTab
      solAudit={{ contracts: [], findings: [] }}
      isAnalyzing={false}
    />,
  );
  expect(screen.queryByText("Contracts")).not.toBeInTheDocument();
});
