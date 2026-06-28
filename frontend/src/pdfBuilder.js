import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";

pdfMake.vfs = pdfFonts;

// ── Color palette ──────────────────────────────────────────────────────────────
const C = {
  primary: "#6366f1",
  primaryDark: "#4f46e5",
  text1: "#1e1e2e",
  text2: "#44475a",
  text3: "#6c7086",
  surface: "#ffffff",
  surface2: "#f8f9fa",
  border: "#dee2e6",
  critical: "#dc2626",
  high: "#ea580c",
  medium: "#ca8a04",
  low: "#6b7280",
  info: "#2563eb",
  success: "#16a34a",
  white: "#ffffff",
};

const SEVERITY_COLORS = {
  critical: C.critical,
  high: C.high,
  medium: C.medium,
  low: C.low,
  info: C.info,
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function severityBadge(text) {
  const s = (text || "info").toLowerCase();
  return {
    text: s.toUpperCase(),
    style: "badge",
    color: SEVERITY_COLORS[s] || C.text3,
  };
}

function sectionHeading(title) {
  return [
    { text: "", margin: [0, 10, 0, 0] },
    { text: title, style: "sectionTitle" },
    {
      canvas: [
        {
          type: "line",
          x1: 0,
          y1: 0,
          x2: 515,
          y2: 0,
          lineWidth: 1,
          lineColor: C.primary,
        },
      ],
      margin: [0, 2, 0, 10],
    },
  ];
}

function emptyState(text) {
  return { text, color: C.text3, margin: [0, 4, 0, 10] };
}

function methodColor(method) {
  const m = (method || "").toUpperCase();
  if (m === "GET") return "#2563eb";
  if (m === "POST") return "#16a34a";
  if (m === "PUT") return "#ca8a04";
  if (m === "DELETE") return "#dc2626";
  if (m === "PATCH") return "#7c3aed";
  return C.text2;
}

// ── Main analysis report ───────────────────────────────────────────────────────

export function buildAnalysisPdf({
  repoName,
  diagram,
  apiDocs,
  findings,
  cveFindings,
  gitAudit,
  solidityAudit,
  codeAudit,
  health,
  elapsedSec,
}) {
  const now = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const content = [];

  // ── Cover page ──────────────────────────────────────────────────────────────
  content.push(
    { text: "", margin: [0, 60, 0, 0] },
    {
      text: "GITMIND",
      fontSize: 12,
      color: C.primary,
      bold: true,
      letterSpacing: 4,
      alignment: "center",
    },
    { text: "", margin: [0, 20, 0, 0] },
    {
      text: "Repository Analysis Report",
      fontSize: 28,
      bold: true,
      color: C.text1,
      alignment: "center",
    },
    { text: "", margin: [0, 12, 0, 0] },
    {
      text: repoName || "Repository",
      fontSize: 20,
      color: C.primary,
      alignment: "center",
    },
    { text: "", margin: [0, 30, 0, 0] },
    {
      table: {
        widths: ["auto", "*"],
        body: [
          [
            { text: "Date:", style: "metaLabel" },
            { text: now, style: "metaValue" },
          ],
          [
            { text: "Scan Duration:", style: "metaLabel" },
            { text: `${elapsedSec || 0}s`, style: "metaValue" },
          ],
          [
            { text: "Sections:", style: "metaLabel" },
            {
              text: [
                findings?.length ? "Security " : "",
                cveFindings?.length ? "CVE " : "",
                gitAudit ? "Git Audit " : "",
                solidityAudit ? "Solidity " : "",
                codeAudit?.length ? "Code Audit " : "",
                health ? "Health " : "",
              ]
                .filter(Boolean)
                .join("/ "),
              style: "metaValue",
            },
          ],
        ],
      },
      layout: "noBorders",
      margin: [100, 0, 100, 0],
    },
    { text: "", margin: [0, 40, 0, 0] },
    {
      text: "Powered by GitMind — AI-powered code analysis",
      fontSize: 9,
      color: C.text3,
      alignment: "center",
      italics: true,
    },
    { text: "", pageBreak: "after" },
  );

  // ── Architecture ─────────────────────────────────────────────────────────────
  if (diagram) {
    content.push(...sectionHeading("Architecture"));
    content.push({
      text: diagram,
      style: "code",
      margin: [0, 4, 0, 10],
    });
  }

  // ── API Endpoints ────────────────────────────────────────────────────────────
  if (apiDocs?.length) {
    content.push(...sectionHeading("API Endpoints"));
    content.push({
      table: {
        widths: [60, 200, 255],
        headerRows: 1,
        body: [
          [
            { text: "Method", style: "th" },
            { text: "Route", style: "th" },
            { text: "Description", style: "th" },
          ],
          ...apiDocs.map((e) => [
            {
              text: (e.method || "GET").toUpperCase(),
              style: "methodCell",
              color: methodColor(e.method),
            },
            { text: e.route || "", style: "codeInline" },
            { text: e.description || "", style: "td" },
          ]),
        ],
      },
      layout: "lightTable",
      margin: [0, 4, 0, 10],
    });
  }

  // ── Security Findings ────────────────────────────────────────────────────────
  content.push(...sectionHeading("Security Findings"));
  if (findings?.length) {
    content.push({
      table: {
        widths: [60, 100, 355],
        headerRows: 1,
        body: [
          [
            { text: "Severity", style: "th" },
            { text: "Rule", style: "th" },
            { text: "Details", style: "th" },
          ],
          ...findings.map((f) => [
            severityBadge(f.severity),
            { text: f.rule || f.check || "—", style: "td" },
            {
              text: [
                {
                  text:
                    (f.description || f.message || f.exploit_story || "") +
                    "\n",
                  fontSize: 9,
                  color: C.text2,
                },
                f.file
                  ? {
                      text: `File: ${f.file}${f.line_start ? `:${f.line_start}` : ""}`,
                      fontSize: 8,
                      color: C.text3,
                      italics: true,
                    }
                  : "",
              ].filter(Boolean),
              style: "td",
            },
          ]),
        ],
      },
      layout: "lightTable",
      margin: [0, 4, 0, 10],
    });
  } else {
    content.push(emptyState("No security findings detected."));
  }

  // ── CVE Vulnerabilities ──────────────────────────────────────────────────────
  content.push(...sectionHeading("CVE Vulnerabilities"));
  if (cveFindings?.length) {
    for (const pkg of cveFindings) {
      content.push({
        text: [
          { text: `${pkg.package} v${pkg.version}`, bold: true },
          { text: ` (${pkg.ecosystem}) — `, color: C.text3 },
          severityBadge(pkg.worst_severity),
        ],
        margin: [0, 6, 0, 2],
      });
      if (pkg.vulns?.length) {
        content.push({
          table: {
            widths: [90, 55, 370],
            headerRows: 1,
            body: [
              [
                { text: "CVE ID", style: "th" },
                { text: "Severity", style: "th" },
                { text: "Summary / Fix", style: "th" },
              ],
              ...pkg.vulns.map((v) => [
                { text: v.id, style: "codeInline", fontSize: 8 },
                severityBadge(v.severity),
                {
                  text: v.fixed_in
                    ? `${v.summary} (fix: ${v.fixed_in})`
                    : v.summary || "",
                  style: "td",
                  fontSize: 8,
                },
              ]),
            ],
          },
          layout: "lightTable",
          margin: [0, 2, 0, 6],
        });
      }
    }
  } else {
    content.push(emptyState("No CVE vulnerabilities found."));
  }

  // ── Git Audit ────────────────────────────────────────────────────────────────
  content.push(...sectionHeading("Git Audit"));
  if (gitAudit) {
    const stats = gitAudit.stats || {};
    content.push({
      table: {
        widths: ["*", "*", "*", "*"],
        body: [
          [
            { text: "Commits", style: "statLabel" },
            { text: "Poor Messages", style: "statLabel" },
            { text: "Secrets Found", style: "statLabel" },
            { text: "Sensitive Files", style: "statLabel" },
          ],
          [
            { text: String(stats.total ?? 0), style: "statValue" },
            {
              text: String(stats.bad_messages ?? 0),
              style: "statValue",
              color: (stats.bad_messages ?? 0) > 0 ? C.high : C.success,
            },
            {
              text: String(stats.secrets_found ?? 0),
              style: "statValue",
              color: (stats.secrets_found ?? 0) > 0 ? C.critical : C.success,
            },
            {
              text: String(stats.sensitive_files ?? 0),
              style: "statValue",
              color: (stats.sensitive_files ?? 0) > 0 ? C.medium : C.success,
            },
          ],
        ],
      },
      layout: "noBorders",
      margin: [0, 4, 0, 8],
    });

    if (gitAudit.secret_findings?.length) {
      content.push({
        text: "Secret Findings",
        bold: true,
        margin: [0, 4, 0, 4],
      });
      content.push({
        table: {
          widths: [60, 120, 335],
          headerRows: 1,
          body: [
            [
              { text: "Severity", style: "th" },
              { text: "Type", style: "th" },
              { text: "Location", style: "th" },
            ],
            ...gitAudit.secret_findings.map((s) => [
              severityBadge(s.severity),
              { text: s.type || "—", style: "td" },
              {
                text: `${s.path || ""}${s.line ? `:${s.line}` : ""}`,
                style: "codeInline",
                fontSize: 8,
              },
            ]),
          ],
        },
        layout: "lightTable",
        margin: [0, 4, 0, 10],
      });
    }

    if (gitAudit.sensitive_files?.length) {
      content.push({
        text: "Sensitive Files",
        bold: true,
        margin: [0, 4, 0, 4],
      });
      content.push({
        table: {
          widths: ["*"],
          body: gitAudit.sensitive_files.map((f) => [
            { text: f.path || f, style: "codeInline", fontSize: 8 },
          ]),
        },
        layout: "lightTable",
        margin: [0, 4, 0, 10],
      });
    }
  } else {
    content.push(emptyState("Git audit not available."));
  }

  // ── Solidity Audit ───────────────────────────────────────────────────────────
  content.push(...sectionHeading("Solidity Audit"));
  if (solidityAudit?.findings?.length) {
    content.push({
      table: {
        widths: [60, 90, 120, 245],
        headerRows: 1,
        body: [
          [
            { text: "Severity", style: "th" },
            { text: "Contract", style: "th" },
            { text: "Title", style: "th" },
            { text: "Description / Remediation", style: "th" },
          ],
          ...solidityAudit.findings.map((f) => [
            severityBadge(f.severity),
            { text: f.contract || "—", style: "td", fontSize: 8 },
            { text: f.title || "—", style: "td", bold: true, fontSize: 8 },
            {
              text: [
                { text: (f.description || "") + "\n", fontSize: 8 },
                f.remediation
                  ? {
                      text: `Remediation: ${f.remediation}`,
                      fontSize: 7,
                      color: C.text3,
                      italics: true,
                    }
                  : "",
              ].filter(Boolean),
              style: "td",
            },
          ]),
        ],
      },
      layout: "lightTable",
      margin: [0, 4, 0, 10],
    });
  } else {
    content.push(emptyState("No Solidity findings."));
  }

  // ── Code Audit ───────────────────────────────────────────────────────────────
  content.push(...sectionHeading("Code Audit"));
  if (codeAudit?.length) {
    for (const langResult of codeAudit) {
      content.push({
        text: langResult.language || "Unknown",
        bold: true,
        margin: [0, 6, 0, 4],
      });
      if (langResult.findings?.length) {
        content.push({
          table: {
            widths: [60, 120, 335],
            headerRows: 1,
            body: [
              [
                { text: "Severity", style: "th" },
                { text: "Title", style: "th" },
                { text: "Details", style: "th" },
              ],
              ...langResult.findings.map((f) => [
                severityBadge(f.severity),
                { text: f.title || "—", style: "td", bold: true, fontSize: 9 },
                {
                  text: [
                    { text: (f.description || "") + "\n", fontSize: 8 },
                    f.file
                      ? {
                          text: `File: ${f.file}${f.line ? `:${f.line}` : ""}`,
                          fontSize: 7,
                          color: C.text3,
                          italics: true,
                        }
                      : "",
                    f.remediation
                      ? {
                          text: `\nRemediation: ${f.remediation}`,
                          fontSize: 7,
                          color: C.text3,
                        }
                      : "",
                  ].filter(Boolean),
                  style: "td",
                },
              ]),
            ],
          },
          layout: "lightTable",
          margin: [0, 2, 0, 10],
        });
      } else {
        content.push(emptyState(`No findings for ${langResult.language}.`));
      }
    }
  } else {
    content.push(emptyState("No code audit findings."));
  }

  // ── Health Score ─────────────────────────────────────────────────────────────
  content.push(...sectionHeading("Health Score"));
  if (health) {
    const gradeColors = {
      A: "#16a34a",
      B: "#2563eb",
      C: "#ca8a04",
      D: "#ea580c",
      F: "#dc2626",
    };
    const gc = gradeColors[health.grade] || C.text2;

    content.push({
      columns: [
        {
          width: 120,
          stack: [
            {
              text: health.grade || "?",
              fontSize: 48,
              bold: true,
              color: gc,
              alignment: "center",
            },
            {
              text: `${health.score || 0}/100`,
              fontSize: 14,
              color: C.text2,
              alignment: "center",
            },
          ],
        },
        {
          width: "*",
          table: {
            widths: [140, 80, "*"],
            body: [
              [
                { text: "Dimension", style: "th" },
                { text: "Score", style: "th" },
                { text: "", style: "th" },
              ],
              ...Object.entries(health.breakdown || {}).map(([k, v]) => [
                {
                  text: k
                    .replace(/_/g, " ")
                    .replace(/\b\w/g, (c) => c.toUpperCase()),
                  style: "td",
                },
                { text: String(v ?? "—"), style: "td", bold: true },
                {
                  canvas: [
                    {
                      type: "rect",
                      x: 0,
                      y: 2,
                      w: (v / 100) * 200,
                      h: 8,
                      r: 4,
                      color:
                        (v ?? 0) >= 70
                          ? C.success
                          : (v ?? 0) >= 40
                            ? C.medium
                            : C.critical,
                    },
                    {
                      type: "rect",
                      x: 0,
                      y: 2,
                      w: 200,
                      h: 8,
                      r: 4,
                      lineWidth: 0,
                      color: C.surface2,
                    },
                  ],
                  width: 200,
                },
              ]),
            ],
          },
          layout: "lightTable",
          margin: [0, 0, 0, 10],
        },
      ],
      margin: [0, 4, 0, 10],
    });
  } else {
    content.push(emptyState("Health score not available."));
  }

  // ── Document definition ──────────────────────────────────────────────────────
  const docDef = {
    content,
    defaultStyle: {
      font: "Roboto",
      fontSize: 10,
      color: C.text1,
    },
    styles: {
      sectionTitle: {
        fontSize: 16,
        bold: true,
        color: C.primary,
        margin: [0, 0, 0, 4],
      },
      th: {
        bold: true,
        fontSize: 9,
        color: C.white,
        fillColor: C.primary,
        margin: [6, 5, 6, 5],
      },
      td: {
        fontSize: 9,
        margin: [6, 4, 6, 4],
        color: C.text2,
      },
      badge: {
        fontSize: 8,
        bold: true,
        margin: [6, 3, 6, 3],
      },
      code: {
        fontSize: 8,
        font: "Courier",
        color: C.text2,
        fillColor: C.surface2,
        margin: [8, 6, 8, 6],
      },
      codeInline: {
        font: "Courier",
        fontSize: 8,
        color: C.primaryDark,
      },
      methodCell: {
        bold: true,
        fontSize: 9,
        margin: [6, 3, 6, 3],
      },
      statLabel: {
        fontSize: 9,
        color: C.text3,
        bold: true,
        alignment: "center",
        margin: [4, 2, 4, 2],
      },
      statValue: {
        fontSize: 18,
        bold: true,
        alignment: "center",
        margin: [4, 4, 4, 4],
      },
      metaLabel: {
        fontSize: 10,
        color: C.text3,
        bold: true,
        margin: [0, 2, 8, 2],
      },
      metaValue: {
        fontSize: 10,
        color: C.text2,
        margin: [0, 2, 0, 2],
      },
    },
    pageMargins: [40, 50, 40, 50],
    header: (currentPage, pageCount) => {
      if (currentPage === 1) return {};
      return {
        columns: [
          {
            text: `GitMind — ${repoName || "Analysis"}`,
            fontSize: 8,
            color: C.text3,
            margin: [40, 10, 0, 0],
          },
          {
            text: `${currentPage} / ${pageCount}`,
            fontSize: 8,
            color: C.text3,
            alignment: "right",
            margin: [0, 10, 40, 0],
          },
        ],
      };
    },
    footer: (currentPage, pageCount) => {
      if (currentPage === 1) return {};
      return {
        canvas: [
          {
            type: "line",
            x1: 40,
            y1: 0,
            x2: 555,
            y2: 0,
            lineWidth: 0.5,
            lineColor: C.border,
          },
        ],
      };
    },
  };

  return docDef;
}

// ── Incident report PDF ────────────────────────────────────────────────────────

export function buildIncidentPdf({ report, finding, outcome, repoName }) {
  const now = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  // Parse the report into sections (## headings)
  const sections = report
    .split(/^## /m)
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n");
      const title = lines[0].replace(/^#+ /, "").trim();
      const body = lines.slice(1).join("\n").trim();
      return { title, body };
    });

  const content = [
    // Header
    {
      text: "GITMIND",
      fontSize: 10,
      color: C.primary,
      bold: true,
      letterSpacing: 3,
    },
    { text: "", margin: [0, 10, 0, 0] },
    { text: "Incident Report", fontSize: 24, bold: true, color: C.text1 },
    { text: "", margin: [0, 8, 0, 0] },
    {
      text: finding?.title || "Security Incident",
      fontSize: 14,
      color: C.primary,
    },
    { text: "", margin: [0, 10, 0, 0] },
    {
      table: {
        widths: ["auto", "*"],
        body: [
          [
            { text: "Date:", style: "metaLabel" },
            { text: now, style: "metaValue" },
          ],
          [
            { text: "Repository:", style: "metaLabel" },
            { text: repoName || "—", style: "metaValue" },
          ],
          [
            { text: "Severity:", style: "metaLabel" },
            {
              text: (finding?.severity || "unknown").toUpperCase(),
              style: "metaValue",
            },
          ],
          [
            { text: "Outcome:", style: "metaLabel" },
            {
              text: outcome === "resolved" ? "CONTAINED" : "LEAKED",
              style: "metaValue",
              color: outcome === "resolved" ? C.success : C.critical,
            },
          ],
        ],
      },
      layout: "noBorders",
      margin: [0, 0, 0, 16],
    },
    {
      canvas: [
        {
          type: "line",
          x1: 0,
          y1: 0,
          x2: 515,
          y2: 0,
          lineWidth: 1,
          lineColor: C.primary,
        },
      ],
      margin: [0, 0, 0, 12],
    },
  ];

  // Render sections
  for (const section of sections) {
    content.push({
      text: section.title,
      fontSize: 14,
      bold: true,
      color: C.primary,
      margin: [0, 12, 0, 6],
    });

    // Split body into lines and render bullet points
    const lines = section.body.split("\n");
    const bullets = [];
    const paragraphs = [];

    for (const line of lines) {
      if (line.trim().startsWith("- ") || line.trim().startsWith("- [")) {
        bullets.push(line.trim());
      } else if (line.trim()) {
        paragraphs.push(line.trim());
      }
    }

    if (paragraphs.length) {
      content.push({
        text: paragraphs.join("\n\n"),
        fontSize: 10,
        color: C.text2,
        margin: [0, 0, 0, 6],
      });
    }

    if (bullets.length) {
      content.push({
        ul: bullets.map((b) => {
          const text = b.replace(/^-\s*\[?\]?\s*/, "");
          return { text, margin: [0, 2, 0, 2] };
        }),
        margin: [0, 0, 0, 8],
        fontSize: 10,
        color: C.text2,
      });
    }
  }

  // Footer
  content.push(
    { text: "", margin: [0, 20, 0, 0] },
    {
      canvas: [
        {
          type: "line",
          x1: 0,
          y1: 0,
          x2: 515,
          y2: 0,
          lineWidth: 0.5,
          lineColor: C.border,
        },
      ],
      margin: [0, 0, 0, 6],
    },
    {
      text: "Generated by GitMind — AI-powered incident response",
      fontSize: 8,
      color: C.text3,
      italics: true,
    },
  );

  return {
    content,
    defaultStyle: { font: "Roboto", fontSize: 10, color: C.text1 },
    styles: {
      metaLabel: {
        fontSize: 10,
        color: C.text3,
        bold: true,
        margin: [0, 2, 8, 2],
      },
      metaValue: { fontSize: 10, color: C.text2, margin: [0, 2, 0, 2] },
    },
    pageMargins: [40, 50, 40, 50],
    header: (currentPage, pageCount) => {
      if (currentPage === 1) return {};
      return {
        columns: [
          {
            text: "GitMind — Incident Report",
            fontSize: 8,
            color: C.text3,
            margin: [40, 10, 0, 0],
          },
          {
            text: `${currentPage} / ${pageCount}`,
            fontSize: 8,
            color: C.text3,
            alignment: "right",
            margin: [0, 10, 40, 0],
          },
        ],
      };
    },
  };
}

// ── Summary PDF ────────────────────────────────────────────────────────────────

export function buildSummaryPdf({
  repoName,
  summary,
  stats,
  health,
  elapsedSec,
}) {
  const now = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const content = [
    {
      text: "GITMIND",
      fontSize: 10,
      color: C.primary,
      bold: true,
      letterSpacing: 3,
    },
    { text: "", margin: [0, 12, 0, 0] },
    { text: "Analysis Summary", fontSize: 24, bold: true, color: C.text1 },
    { text: "", margin: [0, 8, 0, 0] },
    { text: repoName || "Repository", fontSize: 16, color: C.primary },
    { text: "", margin: [0, 10, 0, 0] },
    { text: now, fontSize: 10, color: C.text3 },
    { text: "", margin: [0, 16, 0, 0] },
    {
      canvas: [
        {
          type: "line",
          x1: 0,
          y1: 0,
          x2: 515,
          y2: 0,
          lineWidth: 1,
          lineColor: C.primary,
        },
      ],
      margin: [0, 0, 0, 12],
    },
  ];

  // Health score card
  if (health) {
    const gradeColors = {
      A: "#16a34a",
      B: "#2563eb",
      C: "#ca8a04",
      D: "#ea580c",
      F: "#dc2626",
    };
    const gc = gradeColors[health.grade] || C.text2;

    content.push({
      columns: [
        {
          width: 80,
          stack: [
            {
              text: health.grade || "?",
              fontSize: 42,
              bold: true,
              color: gc,
              alignment: "center",
            },
            {
              text: `${health.score || 0}/100`,
              fontSize: 12,
              color: C.text2,
              alignment: "center",
            },
          ],
        },
        {
          width: "*",
          table: {
            widths: [140, 80],
            body: [
              [
                { text: "Dimension", style: "th" },
                { text: "Score", style: "th" },
              ],
              ...Object.entries(health.breakdown || {}).map(([k, v]) => [
                {
                  text: k
                    .replace(/_/g, " ")
                    .replace(/\b\w/g, (c) => c.toUpperCase()),
                  style: "td",
                },
                { text: String(v ?? "—"), style: "td", bold: true },
              ]),
            ],
          },
          layout: "lightTable",
        },
      ],
      margin: [0, 0, 0, 16],
    });
  }

  // AI Summary
  if (summary) {
    content.push({
      text: "AI Summary",
      fontSize: 14,
      bold: true,
      color: C.primary,
      margin: [0, 8, 0, 6],
    });
    content.push({
      text: summary,
      fontSize: 10,
      color: C.text2,
      margin: [0, 0, 0, 12],
    });
  }

  // Quick stats
  if (stats) {
    content.push({
      text: "Quick Stats",
      fontSize: 14,
      bold: true,
      color: C.primary,
      margin: [0, 8, 0, 6],
    });
    content.push({
      table: {
        widths: ["*", "*"],
        body: Object.entries(stats).map(([k, v]) => [
          {
            text: k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
            style: "td",
          },
          { text: String(v), style: "td", bold: true },
        ]),
      },
      layout: "lightTable",
      margin: [0, 0, 0, 12],
    });
  }

  // Footer
  content.push(
    { text: "", margin: [0, 20, 0, 0] },
    {
      canvas: [
        {
          type: "line",
          x1: 0,
          y1: 0,
          x2: 515,
          y2: 0,
          lineWidth: 0.5,
          lineColor: C.border,
        },
      ],
      margin: [0, 0, 0, 6],
    },
    {
      text: `Scanned in ${elapsedSec || 0}s by GitMind`,
      fontSize: 8,
      color: C.text3,
      italics: true,
    },
  );

  return {
    content,
    defaultStyle: { font: "Roboto", fontSize: 10, color: C.text1 },
    styles: {
      th: {
        bold: true,
        fontSize: 9,
        color: C.white,
        fillColor: C.primary,
        margin: [6, 5, 6, 5],
      },
      td: { fontSize: 9, margin: [6, 4, 6, 4], color: C.text2 },
    },
    pageMargins: [40, 50, 40, 50],
  };
}

// ── Download helper ────────────────────────────────────────────────────────────

export function downloadPdf(docDef, filename) {
  const pdf = pdfMake.createPdf(docDef);
  pdf.getBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "gitmind-report.pdf";
    a.click();
    URL.revokeObjectURL(url);
  });
}
