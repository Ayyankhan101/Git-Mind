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
  // A4 (595.28pt) minus pageMargins [40, 50, 40, 50] = 515.28pt of content.
  const CONTENT_WIDTH = 595.28 - 40 - 40;

  // pdfmake adds per-column paddings (6+6) and 1pt vLines on top of fixed
  // widths: offsets.total = 7 + 13*(n-1) + 7 for a table with n columns
  // (paddingLeft/Right 6, vLineWidth 1 — the hardTable layout).
  const offsetsFor = (n) => 7 + 13 * (n - 1) + 7;

  // Walks a docDef node collecting every `table.widths` array.
  function collectTables(node, out = []) {
    if (!node || typeof node !== "object") return out;
    if (Array.isArray(node)) {
      node.forEach((n) => collectTables(n, out));
      return out;
    }
    if (node.table && Array.isArray(node.table.widths)) {
      out.push(node.table.widths);
    }
    Object.entries(node).forEach(([k, v]) => {
      if (k.startsWith("_")) return;
      collectTables(v, out);
    });
    return out;
  }

  it("renders every table inside the printable content area", () => {
    const doc = buildAnalysisPdf({
      repoName: "acme/app",
      diagram: "graph TD; A-->B;",
      apiDocs: [
        { method: "GET", route: "/api/v1/x", description: "Fetch x" },
        { method: "POST", route: "/api/v1/y", description: "Create y" },
      ],
      findings: [
        {
          severity: "critical",
          rule: "r1",
          description: "d1",
          file: "src/a.py",
          line_start: 3,
        },
        { severity: "low", rule: "r2", description: "d2" },
      ],
      cveFindings: [
        {
          package: "urllib3",
          version: "1.26.9",
          ecosystem: "PyPI",
          worst_severity: "critical",
          vulns: [
            {
              id: "GHSA-x",
              severity: "high",
              summary: "smuggling",
              fixed_in: "1.26.12",
            },
          ],
        },
      ],
      gitAudit: {
        stats: {
          total: 1,
          bad_messages: 1,
          secrets_found: 1,
          sensitive_files: 1,
        },
        secret_findings: [
          { severity: "high", type: "AWS Key", path: ".env", line: 3 },
        ],
        sensitive_files: [{ path: "config/credentials.json" }],
      },
      solidityAudit: {
        findings: [
          {
            severity: "medium",
            contract: "Token.sol",
            title: "t",
            description: "d",
            remediation: "r",
          },
        ],
      },
      codeAudit: [
        {
          language: "python",
          findings: [
            { severity: "low", title: "t", description: "d", file: "a.py" },
          ],
        },
      ],
      health: { grade: "B", score: 72, breakdown: { security: 60 } },
      elapsedSec: 42,
    });

    const tables = collectTables(doc.content);
    expect(tables.length).toBeGreaterThan(5);
    for (const widths of tables) {
      const n = widths.length;
      const fixed = widths
        .filter((w) => typeof w === "number")
        .reduce((a, b) => a + b, 0);
      const rendered = fixed + offsetsFor(n);
      expect(rendered).toBeLessThanOrEqual(CONTENT_WIDTH + 0.01);
    }
    // Low-severity chips paint the web accent (--sev-low = #3b82f6).
    expect(JSON.stringify(doc.content)).toContain('"background":"#3b82f6"');
  });

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
    // Accent follows the web palette: electric blue, not the old indigo.
    expect(JSON.stringify(doc.content)).toContain("#3b82f6");
    expect(JSON.stringify(doc.content)).not.toContain("#7c6fe0");
    // Grade B is success-green like the web HealthCard, not a stray blue.
    expect(JSON.stringify(doc.content)).toContain('"color":"#16a34a"');
  });

  it("section headers echo the web eyebrow: mono accent numeral + sans title", () => {
    const doc = buildAnalysisPdf({
      repoName: "acme/app",
      diagram: "graph TD; A-->B;",
      apiDocs: [],
      findings: [],
      cveFindings: [],
      gitAudit: null,
      solidityAudit: null,
      codeAudit: [],
      health: null,
      elapsedSec: 0,
    });
    const headers = doc.content.filter(
      (c) => Array.isArray(c.text) && c.text[0]?.text === "01 — ",
    );
    expect(headers.length).toBe(1);
    const [num, title] = headers[0].text;
    expect(num.font).toBe("GeistMono");
    expect(num.fontSize).toBe(10);
    expect(num.color).toBe("#3b82f6");
    expect(title.font).toBe("Geist");
    expect(title.fontSize).toBe(15);
    expect(title.text).toBe("ARCHITECTURE");
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
    expect(JSON.stringify(doc.content)).toContain("EXECUTIVE SUMMARY");
    // Grade color follows web HealthCard semantics: B is success-green.
    expect(JSON.stringify(doc.content)).toContain('"text":"A"');
    expect(JSON.stringify(doc.content)).toContain('"color":"#16a34a"');
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
    // Severity in the cover meta row is tinted by severity, not plain gray.
    expect(JSON.stringify(doc.content)).toContain('"text":"HIGH"');
    expect(JSON.stringify(doc.content)).toContain("#ea580c");
  });

  it("drops the markdown H1 document title (no duplicate INCIDENT REPORT)", () => {
    const doc = buildIncidentPdf({
      report:
        "# Incident Report\n\nA hardcoded API secret was rotated in 40 minutes.",
      finding: { title: "API key leak", severity: "high" },
      outcome: "resolved",
      repoName: "acme/app",
    });
    const json = JSON.stringify(doc.content);
    // Cover heading only — the body must not repeat it as a section label.
    expect(json.split('"INCIDENT REPORT"').length - 1).toBe(1);
    expect(json).toContain("A hardcoded API secret was rotated");
  });
});
