import { vi, describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import OrgAuditModal from "./OrgAuditModal";

vi.mock("../api", () => ({
  orgAudit: vi.fn(),
}));

const { orgAudit } = await import("../api");

const baseProps = {
  repos: [
    { url: "https://github.com/org/repo1", name: "repo1" },
    { url: "https://github.com/org/repo2", name: "repo2" },
  ],
  token: "ghp_test",
  onClose: vi.fn(),
};

beforeEach(() => vi.clearAllMocks());

describe("OrgAuditModal rendering", () => {
  it("renders the modal", () => {
    render(<OrgAuditModal {...baseProps} />);
    expect(screen.getByText("Org-wide CVE Audit")).toBeInTheDocument();
  });

  it("shows repo count", () => {
    render(<OrgAuditModal {...baseProps} />);
    expect(screen.getByText("2 repositories")).toBeInTheDocument();
  });

  it("shows Run Org Audit button", () => {
    render(<OrgAuditModal {...baseProps} />);
    expect(screen.getByText("Run Org Audit")).toBeInTheDocument();
  });

  it("close button calls onClose", () => {
    render(<OrgAuditModal {...baseProps} />);
    fireEvent.click(screen.getByLabelText("Close"));
    expect(baseProps.onClose).toHaveBeenCalled();
  });

  it("backdrop click closes modal", () => {
    render(<OrgAuditModal {...baseProps} />);
    const backdrop = document.querySelector(".crisis-backdrop");
    fireEvent.click(backdrop);
    expect(baseProps.onClose).toHaveBeenCalled();
  });
});

describe("OrgAuditModal audit flow", () => {
  it("shows loading state during audit", async () => {
    orgAudit.mockImplementation(() => new Promise(() => {})); // never resolves
    render(<OrgAuditModal {...baseProps} />);
    fireEvent.click(screen.getByText("Run Org Audit"));
    await waitFor(() =>
      expect(screen.getByText(/Scanning/)).toBeInTheDocument(),
    );
  });

  it("shows results after successful audit", async () => {
    orgAudit.mockResolvedValue({
      stats: { total_repos: 2, total_cves: 3, repos_clean: 1, shared_count: 1 },
      shared_cves: [
        { cve_id: "CVE-2024-0001", repos: ["repo1", "repo2"], repo_count: 2 },
      ],
      repos: [
        {
          repo_name: "repo1",
          cve_count: 2,
          dep_files_found: ["package.json"],
          cve_findings: [
            {
              package: "lodash",
              version: "4.17.20",
              ecosystem: "npm",
              vulns: [
                {
                  id: "CVE-2024-0001",
                  severity: "high",
                  summary: "Prototype pollution",
                },
              ],
            },
          ],
        },
        {
          repo_name: "repo2",
          cve_count: 1,
          dep_files_found: [],
          cve_findings: [
            {
              package: "express",
              version: "4.17.1",
              ecosystem: "npm",
              vulns: [
                {
                  id: "CVE-2024-0002",
                  severity: "medium",
                  summary: "Open redirect",
                },
              ],
            },
          ],
        },
      ],
    });
    render(<OrgAuditModal {...baseProps} />);
    fireEvent.click(screen.getByText("Run Org Audit"));
    await waitFor(() =>
      expect(
        screen.getByText("CROSS-REPO VULNERABILITIES"),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("CVE-2024-0001")).toBeInTheDocument();
    expect(screen.getByText("2 repos")).toBeInTheDocument();
  });

  it("shows error on failure", async () => {
    orgAudit.mockRejectedValue(new Error("Network error"));
    render(<OrgAuditModal {...baseProps} />);
    fireEvent.click(screen.getByText("Run Org Audit"));
    await waitFor(() =>
      expect(screen.getByText("Network error")).toBeInTheDocument(),
    );
    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("retry button re-runs audit", async () => {
    orgAudit.mockRejectedValue(new Error("fail"));
    render(<OrgAuditModal {...baseProps} />);
    fireEvent.click(screen.getByText("Run Org Audit"));
    await waitFor(() => expect(screen.getByText("fail")).toBeInTheDocument());
    orgAudit.mockResolvedValue({
      stats: { total_repos: 2, total_cves: 0, repos_clean: 2, shared_count: 0 },
      shared_cves: [],
      repos: [],
    });
    fireEvent.click(screen.getByText("Retry"));
    await waitFor(() =>
      expect(screen.getByText("PER REPOSITORY")).toBeInTheDocument(),
    );
  });

  it("re-scan button available after results", async () => {
    orgAudit.mockResolvedValue({
      stats: { total_repos: 2, total_cves: 0, repos_clean: 2, shared_count: 0 },
      shared_cves: [],
      repos: [],
    });
    render(<OrgAuditModal {...baseProps} />);
    fireEvent.click(screen.getByText("Run Org Audit"));
    await waitFor(() =>
      expect(screen.getByText("Re-scan")).toBeInTheDocument(),
    );
  });
});

describe("OrgAuditModal repo rows", () => {
  it("shows clean repos", async () => {
    orgAudit.mockResolvedValue({
      stats: { total_repos: 1, total_cves: 0, repos_clean: 1, shared_count: 0 },
      shared_cves: [],
      repos: [{ repo_name: "clean-repo", cve_count: 0, dep_files_found: [] }],
    });
    render(<OrgAuditModal {...baseProps} />);
    fireEvent.click(screen.getByText("Run Org Audit"));
    await waitFor(() =>
      expect(screen.getByText("clean-repo")).toBeInTheDocument(),
    );
    expect(screen.getByText("clean")).toBeInTheDocument();
  });

  it("shows repos with errors", async () => {
    orgAudit.mockResolvedValue({
      stats: { total_repos: 1, total_cves: 0, repos_clean: 0, shared_count: 0 },
      shared_cves: [],
      repos: [{ repo_name: "bad-repo", error: "rate limited" }],
    });
    render(<OrgAuditModal {...baseProps} />);
    fireEvent.click(screen.getByText("Run Org Audit"));
    await waitFor(() =>
      expect(screen.getByText("bad-repo")).toBeInTheDocument(),
    );
    expect(screen.getByText("error")).toBeInTheDocument();
  });
});
