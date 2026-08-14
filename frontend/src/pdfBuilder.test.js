jest.mock("pdfmake/build/pdfmake", () => ({
  __esModule: true,
  default: {
    vfs: {},
    fonts: {},
    addVirtualFileSystem: jest.fn(),
    addFonts: jest.fn(),
    createPdf: jest.fn(() => ({ download: jest.fn() })),
  },
}));
jest.mock("./pdfFonts", () => ({}));

import {
  highlightCode,
  safeText,
  wrapLong,
  sanitizeFilename,
  downloadPdf,
  getCachedPdf,
  buildAnalysisPdf,
  buildSummaryPdf,
  buildIncidentPdf,
} from "./pdfBuilder";
import pdfMake from "pdfmake/build/pdfmake";

describe("highlightCode", () => {
  it("highlights a number in each line (regression: /g regex statefulness)", () => {
    const out = highlightCode("count = 42\ntotal = 7", "javascript");
    expect(out[0].some((t) => t.text === "42" && t.color === "#ea580c")).toBe(
      true,
    );
    expect(out[1].some((t) => t.text === "7" && t.color === "#ea580c")).toBe(
      true,
    );
  });
  it("highlights keywords, strings and comments", () => {
    const out = highlightCode('const x = "hi"; // note', "javascript");
    const flat = out[0];
    expect(flat.some((t) => t.text === "const" && t.bold)).toBe(true);
    expect(flat.some((t) => t.text === '"hi"' && t.color === "#16a34a")).toBe(
      true,
    );
    expect(flat.some((t) => t.text === "// note" && t.italics)).toBe(true);
  });
});

describe("safeText", () => {
  it("escapes XML entities", () => {
    expect(safeText("a < b & c > d")).toBe("a &lt; b &amp; c &gt; d");
  });
  it("strips emoji and control characters", () => {
    expect(safeText("boom 💥 ok\u0000end")).toBe("boom  okend");
  });
  it("handles null/undefined", () => {
    expect(safeText(null)).toBe("");
    expect(safeText(undefined)).toBe("");
  });
});

describe("wrapLong", () => {
  it("chunks an unbroken long string every 40 chars with \\n", () => {
    const s = "x".repeat(100);
    const out = wrapLong(s);
    expect(out.split("\n").every((line) => line.length <= 40)).toBe(true);
    expect(out.replace(/\n/g, "")).toBe(s);
  });
  it("leaves short strings and existing newlines intact", () => {
    expect(wrapLong("short")).toBe("short");
    expect(wrapLong("a\nb")).toBe("a\nb");
  });
});

describe("sanitizeFilename", () => {
  it("strips path/illegal chars and collapses whitespace", () => {
    expect(sanitizeFilename("foo/bar\\baz:*.pdf")).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(sanitizeFilename("my repo  name")).toBe("my-repo-name");
  });
  it("falls back for empty input", () => {
    expect(sanitizeFilename("")).toBe("gitmind-report");
  });
});

describe("pdf cache", () => {
  it("stores and retrieves docDefs by cacheKey", () => {
    // react-scripts jest runs with resetMocks: true, so factory impls are
    // wiped before each test — set the return value here.
    pdfMake.createPdf.mockReturnValue({ download: jest.fn() });
    const docDef = { content: [{ text: "x" }] };
    downloadPdf(docDef, "x.pdf", "k1");
    expect(getCachedPdf("k1")).toBe(docDef);
    expect(pdfMake.createPdf).toHaveBeenCalledWith(docDef);
  });
});

describe("buildAnalysisPdf", () => {
  it("returns a docDefinition with brand fonts and a cover", () => {
    const doc = buildAnalysisPdf({
      repoName: "acme/app",
      diagram: "graph TD; A-->B;",
      apiDocs: [{ method: "GET", route: "/api/v1/x", description: "Fetch x" }],
      findings: [
        {
          severity: "critical",
          rule: "r1",
          description: "d1",
          file: "src/a.py",
          line_start: 3,
        },
      ],
      cveFindings: [],
      gitAudit: null,
      solidityAudit: null,
      codeAudit: [],
      health: { grade: "B", score: 72, breakdown: { security: 60 } },
      elapsedSec: 42,
    });
    expect(doc.defaultStyle.font).toBe("Geist");
    expect(doc.content.length).toBeGreaterThan(10);
    expect(JSON.stringify(doc.content)).toContain("Repository Analysis Report");
    expect(doc.styles.th.fillColor).toBe("#08090e");
  });
});

describe("buildSummaryPdf", () => {
  it("renders brand fonts and summary content", () => {
    const doc = buildSummaryPdf({
      repoName: "acme/app",
      summary: "All good",
      stats: { commits: 12 },
      health: { grade: "A", score: 91, breakdown: { security: 90 } },
      elapsedSec: 9,
    });
    expect(doc.defaultStyle.font).toBe("Geist");
    expect(JSON.stringify(doc.content)).toContain("ANALYSIS SUMMARY");
  });
});

describe("buildIncidentPdf", () => {
  it("renders a structured incident report", () => {
    const doc = buildIncidentPdf({
      report: {
        summary: "Leak contained",
        timeline: [{ label: "t0", event: "detected" }],
      },
      finding: { title: "API key leak", severity: "high" },
      outcome: "resolved",
      repoName: "acme/app",
    });
    expect(doc.defaultStyle.font).toBe("Geist");
    expect(JSON.stringify(doc.content)).toContain("INCIDENT REPORT");
  });
});
