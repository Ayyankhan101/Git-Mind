import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "./pdfFonts";

// pdfmake 0.3.11 registers fonts via the virtual-fs + fonts APIs (plain
// `vfs`/`fonts` property assignment is ignored and silently falls back to
// Helvetica). Keep these calls before any createPdf.
pdfMake.addVirtualFileSystem(pdfFonts);
pdfMake.addFonts({
  Geist: {
    normal: "Geist-Regular",
    bold: "Geist-Bold",
    italics: "Geist-Regular",
    bolditalics: "Geist-Bold",
  },
  GeistMono: {
    normal: "GeistMono-Regular",
    bold: "GeistMono-Bold",
    italics: "GeistMono-Regular",
    bolditalics: "GeistMono-Bold",
  },
});

// ── PDF Cache (Phase 3a) ─────────────────────────────────────────────────────
// Keyed by `${session_id}:${report_type}` → docDefinition.
// Avoids re-generating identical PDF definitions for repeated downloads.
const _pdfCache = new Map();
const PDF_CACHE_MAX = 20;

// eslint-disable-next-line no-unused-vars
function _cacheKey(sessionId, type) {
  return `${sessionId || ""}:${type}`;
}

function cacheDocDef(key, docDef) {
  if (_pdfCache.size >= PDF_CACHE_MAX) {
    const first = _pdfCache.keys().next().value;
    _pdfCache.delete(first);
  }
  _pdfCache.set(key, docDef);
}

function getCachedDocDef(key) {
  return _pdfCache.get(key) || null;
}

// ── Syntax Highlighting (Phase 3b) ───────────────────────────────────────────
const _KW = {
  python: new Set([
    "def",
    "class",
    "import",
    "from",
    "return",
    "if",
    "elif",
    "else",
    "for",
    "while",
    "try",
    "except",
    "finally",
    "with",
    "as",
    "yield",
    "raise",
    "pass",
    "break",
    "continue",
    "and",
    "or",
    "not",
    "in",
    "is",
    "None",
    "True",
    "False",
    "lambda",
    "async",
    "await",
    "global",
    "nonlocal",
    "assert",
    "del",
    "print",
  ]),
  javascript: new Set([
    "function",
    "const",
    "let",
    "var",
    "if",
    "else",
    "for",
    "while",
    "do",
    "switch",
    "case",
    "break",
    "continue",
    "return",
    "try",
    "catch",
    "finally",
    "throw",
    "new",
    "delete",
    "typeof",
    "instanceof",
    "in",
    "of",
    "class",
    "extends",
    "super",
    "import",
    "export",
    "default",
    "from",
    "async",
    "await",
    "yield",
    "true",
    "false",
    "null",
    "undefined",
    "this",
    "self",
  ]),
  typescript: new Set([
    "function",
    "const",
    "let",
    "var",
    "if",
    "else",
    "for",
    "while",
    "do",
    "switch",
    "case",
    "break",
    "continue",
    "return",
    "try",
    "catch",
    "finally",
    "throw",
    "new",
    "delete",
    "typeof",
    "instanceof",
    "in",
    "of",
    "class",
    "extends",
    "super",
    "import",
    "export",
    "default",
    "from",
    "async",
    "await",
    "yield",
    "type",
    "interface",
    "enum",
    "namespace",
    "declare",
    "public",
    "private",
    "protected",
    "readonly",
    "abstract",
    "implements",
    "true",
    "false",
    "null",
    "undefined",
    "this",
    "self",
    "any",
    "unknown",
    "never",
    "void",
  ]),
  go: new Set([
    "func",
    "package",
    "import",
    "return",
    "if",
    "else",
    "for",
    "range",
    "switch",
    "case",
    "default",
    "break",
    "continue",
    "go",
    "select",
    "chan",
    "defer",
    "map",
    "struct",
    "interface",
    "type",
    "var",
    "const",
    "nil",
    "true",
    "false",
    "make",
    "new",
    "len",
    "cap",
    "append",
  ]),
  rust: new Set([
    "fn",
    "let",
    "mut",
    "const",
    "struct",
    "enum",
    "impl",
    "trait",
    "pub",
    "use",
    "mod",
    "crate",
    "self",
    "super",
    "return",
    "if",
    "else",
    "for",
    "while",
    "loop",
    "match",
    "break",
    "continue",
    "move",
    "ref",
    "async",
    "await",
    "where",
    "type",
    "as",
    "in",
    "true",
    "false",
    "Some",
    "None",
    "Ok",
    "Err",
    "Self",
  ]),
  java: new Set([
    "public",
    "private",
    "protected",
    "static",
    "final",
    "abstract",
    "class",
    "interface",
    "extends",
    "implements",
    "new",
    "return",
    "if",
    "else",
    "for",
    "while",
    "do",
    "switch",
    "case",
    "break",
    "continue",
    "try",
    "catch",
    "finally",
    "throw",
    "throws",
    "void",
    "int",
    "long",
    "double",
    "float",
    "boolean",
    "char",
    "byte",
    "short",
    "String",
    "null",
    "true",
    "false",
    "this",
    "super",
    "import",
    "package",
  ]),
};

const _STR_RE = /(["'`])(?:(?!\1|\\).|\\.)*\1/g;
const _COMMENT_RE = /(\/\/.*$|#.*$|\/\*[\s\S]*?\*\/)/gm;

// ── Text safety (pdfmake/Geist glyph coverage) ───────────────────────────────
export function safeText(s) {
  if (s == null) return "";
  return (
    String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      // Emoji + dingbats + variation selectors + ZWJ sequences
      .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, "")
      // Control characters (keeps \n and \t)
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
  );
}

// Long unbroken tokens (URLs, file paths) overflow fixed table widths; chunk them.
export function wrapLong(s, maxLen = 40) {
  if (s == null) return s;
  const str = String(s);
  if (str.length <= maxLen) return str;
  return str.replace(/[^\s]{40,}/g, (m) => m.match(/.{1,40}/g).join("\n"));
}

export function sanitizeFilename(name) {
  return (
    String(name || "gitmind-report")
      .replace(/[/\\:*?"<>|]/g, "-")
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001F\u007F]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 120)
  );
}

export function highlightCode(code, lang) {
  if (!code) return [];
  const keywords = _KW[lang] || _KW.javascript;
  const lines = code.split("\n");
  const result = [];

  for (const line of lines) {
    const tokens = [];
    let remaining = line;

    // Extract strings first, replace with placeholders
    const strings = [];
    remaining = remaining.replace(_STR_RE, (m) => {
      const idx = strings.length;
      strings.push(m);
      return `\x00S${idx}\x00`;
    });

    // Extract comments
    const comments = [];
    remaining = remaining.replace(_COMMENT_RE, (m) => {
      const idx = comments.length;
      comments.push(m);
      return `\x00C${idx}\x00`;
    });

    // Tokenize remaining
    const parts = remaining.split(/(\s+|[{}()[\];,.:])/);
    for (const part of parts) {
      if (!part) continue;
      if (part.startsWith("\x00S")) {
        const idx = parseInt(part.slice(2, -1));
        tokens.push({ text: strings[idx], color: "#16a34a" }); // green = string
      } else if (part.startsWith("\x00C")) {
        const idx = parseInt(part.slice(2, -1));
        tokens.push({ text: comments[idx], color: "#6c7086", italics: true }); // gray = comment
      } else if (keywords.has(part)) {
        tokens.push({ text: part, color: "#6366f1", bold: true }); // indigo = keyword
      } else if (/^\d+(\.\d+)?$/.test(part)) {
        tokens.push({ text: part, color: "#ea580c" }); // orange = number
      } else {
        tokens.push({ text: part });
      }
    }

    result.push(tokens);
  }
  return result;
}

// eslint-disable-next-line no-unused-vars
function codeBlockWithHighlight(code, lang) {
  const highlighted = highlightCode(code, lang);
  if (!highlighted.length) return { text: code || "", style: "code" };

  const stack = [];
  for (let i = 0; i < highlighted.length; i++) {
    const lineTokens = highlighted[i];
    const lineText = lineTokens.map((t) => ({
      text: t.text,
      color: t.color,
      bold: t.bold,
      italics: t.italics,
    }));
    stack.push({ text: lineText, margin: [0, 0, 0, 0] });
    if (i < highlighted.length - 1) {
      stack.push({ text: "", margin: [0, 2, 0, 0] });
    }
  }

  return {
    stack,
    margin: [8, 6, 8, 6],
    background: "#f8f9fa",
    border: [1, 1, 1, 1],
    borderColor: "#dee2e6",
    borderRadius: 2,
  };
}

// ── Color palette ──────────────────────────────────────────────────────────────
const C = {
  primary: "#3b82f6", // electric blue (web --primary)
  primaryDark: "#2f6fe4", // deeper blue for small mono text (web --primary-strong)
  ink: "#08090e",
  text1: "#1c1c1e",
  text2: "#3d3d40",
  text3: "#73737a",
  surface: "#ffffff",
  surface2: "#f6f5f2",
  border: "#111113",
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
  // Web --sev-low is the accent (var(--accent) = electric blue).
  low: C.primary,
  info: C.info,
};

// Progress-bar width for the health breakdown table. The bar lives in a
// star column of a table nested in a `columns` wrapper (grade numeral takes
// 120pt), so the column only gets ~140pt. A fixed 200pt canvas makes
// pdfmake expand the table past the right page edge — keep it well under.
const HEALTH_BAR_W = 120;

// ── Brutalist layout primitives ────────────────────────────────────────────────
function sectionHeader(num, title) {
  return [
    { text: "", margin: [0, 14, 0, 0] },
    {
      // Echoes the web's numbered eyebrow ("01 — Summary": mono, tracked,
      // accent) over a heavier sans title — inline runs share a baseline,
      // so the two sizes align without the old columns offset.
      text: [
        {
          text: `${String(num).padStart(2, "0")} — `,
          font: "GeistMono",
          fontSize: 10,
          bold: true,
          color: C.primary,
          letterSpacing: 1.5,
        },
        {
          text: String(title).toUpperCase(),
          font: "Geist",
          fontSize: 15,
          bold: true,
          color: C.ink,
        },
      ],
      margin: [0, 0, 0, 6],
    },
    {
      canvas: [
        {
          type: "line",
          x1: 0,
          y1: 0,
          x2: 515,
          y2: 0,
          lineWidth: 2,
          lineColor: C.ink,
        },
      ],
      margin: [0, 0, 0, 10],
    },
  ];
}

function chip(severity) {
  const s = (severity || "info").toLowerCase();
  const color = SEVERITY_COLORS[s] || C.text3;
  return {
    text: s.toUpperCase(),
    font: "GeistMono",
    fontSize: 7.5,
    bold: true,
    color: C.white,
    background: color, // solid block — border on inline text is unreliable in pdfmake
    margin: [4, 2, 4, 2],
  };
}

function _cell(c) {
  if (c != null && typeof c === "object" && !Array.isArray(c)) {
    return { ...c, style: "td" };
  }
  return { text: c, style: "td" };
}

function hardTable(headers, rows, widths) {
  return {
    table: {
      widths,
      headerRows: 1,
      body: [
        headers.map((h) => ({ text: String(h).toUpperCase(), style: "th" })),
        ...rows.map((r) => r.map(_cell)),
      ],
    },
    layout: {
      hLineWidth: () => 1,
      vLineWidth: () => 1,
      hLineColor: () => C.ink,
      vLineColor: () => C.ink,
      paddingLeft: () => 6,
      paddingRight: () => 6,
      paddingTop: () => 4,
      paddingBottom: () => 4,
    },
    margin: [0, 4, 0, 10],
  };
}

function monoLabel(text, opts = {}) {
  return {
    text: String(text).toUpperCase(),
    font: "GeistMono",
    fontSize: opts.fontSize || 8,
    bold: opts.bold != null ? opts.bold : true,
    color: opts.color || C.text3,
    letterSpacing: opts.letterSpacing != null ? opts.letterSpacing : 0.8,
    ...(opts.margin ? { margin: opts.margin } : {}),
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

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
    { text: "", margin: [0, 70, 0, 0] },
    {
      columns: [
        {
          text: "GITMIND",
          width: "*",
          font: "GeistMono",
          fontSize: 13,
          bold: true,
          letterSpacing: 6,
          color: C.primary,
        },
        {
          text: now.toUpperCase(),
          font: "GeistMono",
          fontSize: 8,
          color: C.text3,
        },
      ],
      margin: [0, 0, 0, 34],
    },
    {
      canvas: [{ type: "rect", x: 0, y: 0, w: 96, h: 10, color: C.primary }],
      margin: [0, 0, 0, 18],
    },
    {
      text: repoName || "Repository",
      font: "Geist",
      fontSize: 34,
      bold: true,
      color: C.ink,
    },
    {
      text: "Repository Analysis Report",
      font: "GeistMono",
      fontSize: 12,
      letterSpacing: 2,
      color: C.text3,
      margin: [0, 8, 0, 26],
    },
    {
      canvas: [
        {
          type: "line",
          x1: 0,
          y1: 0,
          x2: 515,
          y2: 0,
          lineWidth: 2,
          lineColor: C.ink,
        },
      ],
      margin: [0, 0, 0, 14],
    },
    {
      table: {
        widths: [150, "*"],
        body: [
          [monoLabel("Date"), { text: now, style: "metaValue" }],
          [
            monoLabel("Scan Duration"),
            { text: `${elapsedSec || 0}s`, style: "metaValue" },
          ],
          [
            monoLabel("Sections"),
            {
              text: [
                findings?.length ? "SECURITY " : "",
                cveFindings?.length ? "CVE " : "",
                gitAudit ? "GIT AUDIT " : "",
                solidityAudit ? "SOLIDITY " : "",
                codeAudit?.length ? "CODE AUDIT " : "",
                health ? "HEALTH " : "",
              ]
                .filter(Boolean)
                .join("/ "),
              font: "GeistMono",
              fontSize: 8,
              color: C.text2,
            },
          ],
        ],
      },
      layout: "noBorders",
      margin: [0, 12, 0, 0],
    },
    { text: "", pageBreak: "after" },
  );

  // ── Architecture ─────────────────────────────────────────────────────────────
  if (diagram) {
    content.push(...sectionHeader(1, "Architecture"));
    content.push({
      text: wrapLong(safeText(diagram)),
      font: "GeistMono",
      fontSize: 8,
      color: C.text2,
      fillColor: C.surface2,
      border: [1, 1, 1, 1],
      borderColor: C.border,
      margin: [8, 6, 8, 10],
    });
  }

  // ── API Endpoints ────────────────────────────────────────────────────────────
  if (apiDocs?.length) {
    content.push(...sectionHeader(2, "API Endpoints"));
    content.push(
      hardTable(
        ["Method", "Route", "Description"],
        apiDocs.map((e) => [
          {
            text: (e.method || "GET").toUpperCase(),
            font: "GeistMono",
            fontSize: 8,
            bold: true,
            color: methodColor(e.method),
          },
          wrapLong(safeText(e.route || "")),
          wrapLong(safeText(e.description || "")),
        ]),
        [60, 190, "*"],
      ),
    );
  }

  // ── Security Findings ────────────────────────────────────────────────────────
  content.push(...sectionHeader(3, "Security Findings"));
  if (findings?.length) {
    content.push(
      hardTable(
        ["Severity", "Rule", "Details"],
        findings.map((f) => [
          chip(f.severity),
          wrapLong(safeText(f.rule || f.check || "—")),
          {
            text: [
              {
                text: wrapLong(
                  safeText(f.description || f.message || f.exploit_story || ""),
                ),
                fontSize: 9,
                color: C.text2,
              },
              f.file
                ? {
                    text: `\nFile: ${wrapLong(safeText(f.file))}${f.line_start ? `:${f.line_start}` : ""}`,
                    font: "GeistMono",
                    fontSize: 7,
                    color: C.text3,
                  }
                : "",
            ].filter(Boolean),
          },
        ]),
        [70, 120, "*"],
      ),
    );
  } else {
    content.push(emptyState("No security findings detected."));
  }

  // ── CVE Vulnerabilities ──────────────────────────────────────────────────────
  content.push(...sectionHeader(4, "CVE Vulnerabilities"));
  if (cveFindings?.length) {
    for (const pkg of cveFindings) {
      content.push({
        text: [
          {
            text: safeText(`${pkg.package} v${pkg.version}`),
            font: "GeistMono",
            fontSize: 10,
            bold: true,
            color: C.ink,
          },
          {
            text: ` (${safeText(pkg.ecosystem)}) — `,
            color: C.text3,
            fontSize: 9,
          },
          chip(pkg.worst_severity),
        ],
        margin: [0, 6, 0, 2],
      });
      if (pkg.vulns?.length) {
        content.push(
          hardTable(
            ["CVE ID", "Severity", "Summary / Fix"],
            pkg.vulns.map((v) => [
              {
                text: safeText(v.id),
                font: "GeistMono",
                fontSize: 7.5,
                color: C.primaryDark,
              },
              chip(v.severity),
              wrapLong(
                safeText(
                  v.fixed_in
                    ? `${v.summary} (fix: ${v.fixed_in})`
                    : v.summary || "",
                ),
              ),
            ]),
            [95, 60, "*"],
          ),
        );
      }
    }
  } else {
    content.push(emptyState("No CVE vulnerabilities found."));
  }

  // ── Git Audit ────────────────────────────────────────────────────────────────
  content.push(...sectionHeader(5, "Git Audit"));
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
      layout: {
        hLineWidth: () => 1,
        vLineWidth: () => 1,
        hLineColor: () => C.ink,
        vLineColor: () => C.ink,
        paddingTop: () => 8,
        paddingBottom: () => 8,
      },
      margin: [0, 4, 0, 8],
    });

    if (gitAudit.secret_findings?.length) {
      content.push({
        text: "SECRET FINDINGS",
        font: "GeistMono",
        fontSize: 9,
        bold: true,
        letterSpacing: 1,
        color: C.ink,
        margin: [0, 6, 0, 4],
      });
      content.push(
        hardTable(
          ["Severity", "Type", "Location"],
          gitAudit.secret_findings.map((s) => [
            chip(s.severity),
            wrapLong(safeText(s.type || "—")),
            {
              text: wrapLong(
                safeText(`${s.path || ""}${s.line ? `:${s.line}` : ""}`),
              ),
              font: "GeistMono",
              fontSize: 7.5,
              color: C.primaryDark,
            },
          ]),
          [60, 120, "*"],
        ),
      );
    }

    if (gitAudit.sensitive_files?.length) {
      content.push({
        text: "SENSITIVE FILES",
        font: "GeistMono",
        fontSize: 9,
        bold: true,
        letterSpacing: 1,
        color: C.ink,
        margin: [0, 6, 0, 4],
      });
      content.push(
        hardTable(
          ["File"],
          gitAudit.sensitive_files.map((f) => [
            {
              text: wrapLong(safeText(f.path || f)),
              font: "GeistMono",
              fontSize: 7.5,
              color: C.primaryDark,
            },
          ]),
          ["*"],
        ),
      );
    }
  } else {
    content.push(emptyState("Git audit not available."));
  }

  // ── Solidity Audit ───────────────────────────────────────────────────────────
  content.push(...sectionHeader(6, "Solidity Audit"));
  if (solidityAudit?.findings?.length) {
    content.push(
      hardTable(
        ["Severity", "Contract", "Title", "Description / Remediation"],
        solidityAudit.findings.map((f) => [
          chip(f.severity),
          wrapLong(safeText(f.contract || "—")),
          {
            text: safeText(f.title || "—"),
            bold: true,
            fontSize: 8,
          },
          {
            text: [
              { text: wrapLong(safeText(f.description || "")), fontSize: 8 },
              f.remediation
                ? {
                    text: `\nRemediation: ${wrapLong(safeText(f.remediation))}`,
                    fontSize: 7,
                    color: C.text3,
                    italics: true,
                  }
                : "",
            ].filter(Boolean),
          },
        ]),
        [60, 90, 120, "*"],
      ),
    );
  } else {
    content.push(emptyState("No Solidity findings."));
  }

  // ── Code Audit ───────────────────────────────────────────────────────────────
  content.push(...sectionHeader(7, "Code Audit"));
  if (codeAudit?.length) {
    for (const langResult of codeAudit) {
      content.push({
        text: String(langResult.language || "Unknown").toUpperCase(),
        font: "GeistMono",
        fontSize: 9,
        bold: true,
        letterSpacing: 1,
        color: C.ink,
        margin: [0, 6, 0, 4],
      });
      if (langResult.findings?.length) {
        content.push(
          hardTable(
            ["Severity", "Title", "Details"],
            langResult.findings.map((f) => [
              chip(f.severity),
              { text: safeText(f.title || "—"), bold: true, fontSize: 8.5 },
              {
                text: [
                  {
                    text: wrapLong(safeText(f.description || "")),
                    fontSize: 8,
                  },
                  f.file
                    ? {
                        text: `\nFile: ${wrapLong(safeText(f.file))}${f.line ? `:${f.line}` : ""}`,
                        font: "GeistMono",
                        fontSize: 7,
                        color: C.text3,
                      }
                    : "",
                  f.remediation
                    ? {
                        text: `\nRemediation: ${wrapLong(safeText(f.remediation))}`,
                        fontSize: 7,
                        color: C.text3,
                      }
                    : "",
                ].filter(Boolean),
              },
            ]),
            [60, 130, "*"],
          ),
        );
      } else {
        content.push(emptyState(`No findings for ${langResult.language}.`));
      }
    }
  } else {
    content.push(emptyState("No code audit findings."));
  }

  // ── Health Score ─────────────────────────────────────────────────────────────
  content.push(...sectionHeader(8, "Health Score"));
  if (health) {
    // Mirrors the web HealthCard: A/B are passing (success), C/D are
    // caution (warning), F fails (danger) — print variants on white.
    const gradeColors = {
      A: "#16a34a",
      B: "#16a34a",
      C: "#d97706",
      D: "#d97706",
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
              font: "GeistMono",
              fontSize: 48,
              bold: true,
              color: gc,
              alignment: "center",
            },
            {
              text: `${health.score || 0}/100`,
              font: "GeistMono",
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
                      w: (v / 100) * HEALTH_BAR_W,
                      h: 8,
                      r: 4,
                      // Same split as the web HealthCard MiniBar: >=80
                      // success, >=60 caution, below danger.
                      color:
                        (v ?? 0) >= 80
                          ? C.success
                          : (v ?? 0) >= 60
                            ? C.medium
                            : C.critical,
                    },
                    {
                      type: "rect",
                      x: 0,
                      y: 2,
                      w: HEALTH_BAR_W,
                      h: 8,
                      r: 4,
                      lineWidth: 0,
                      color: C.surface2,
                    },
                  ],
                  width: HEALTH_BAR_W,
                },
              ]),
            ],
          },
          layout: {
            hLineWidth: () => 1,
            vLineWidth: () => 1,
            hLineColor: () => C.ink,
            vLineColor: () => C.ink,
          },
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
      font: "Geist",
      fontSize: 10,
      color: C.text1,
    },
    styles: {
      sectionTitle: {
        font: "Geist",
        fontSize: 16,
        bold: true,
        color: C.primary,
        margin: [0, 0, 0, 4],
      },
      th: {
        font: "GeistMono",
        bold: true,
        fontSize: 8,
        letterSpacing: 1,
        color: C.white,
        fillColor: C.ink,
        margin: [6, 5, 6, 5],
      },
      td: {
        font: "Geist",
        fontSize: 8.5,
        margin: [6, 4, 6, 4],
        color: C.text2,
      },
      badge: {
        font: "GeistMono",
        fontSize: 7.5,
        bold: true,
        margin: [4, 2, 4, 2],
      },
      code: {
        font: "GeistMono",
        fontSize: 8,
        color: C.text2,
        fillColor: C.surface2,
        margin: [8, 6, 8, 6],
      },
      codeInline: {
        font: "GeistMono",
        fontSize: 8,
        color: C.primaryDark,
      },
      methodCell: {
        font: "GeistMono",
        bold: true,
        fontSize: 8,
        margin: [6, 3, 6, 3],
      },
      statLabel: {
        font: "GeistMono",
        fontSize: 8,
        color: C.text3,
        bold: true,
        alignment: "center",
        margin: [4, 2, 4, 2],
      },
      statValue: {
        font: "GeistMono",
        fontSize: 18,
        bold: true,
        alignment: "center",
        margin: [4, 4, 4, 4],
      },
      metaLabel: {
        font: "GeistMono",
        fontSize: 8,
        color: C.text3,
        bold: true,
        letterSpacing: 1,
        margin: [0, 2, 8, 2],
      },
      metaValue: {
        font: "Geist",
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
            font: "GeistMono",
            fontSize: 8,
            color: C.text3,
            margin: [40, 10, 0, 0],
          },
          {
            text: `${currentPage} / ${pageCount}`,
            font: "GeistMono",
            fontSize: 8,
            color: C.text3,
            alignment: "right",
            margin: [0, 10, 40, 0],
          },
        ],
      };
    },
    footer: (currentPage, pageCount) => {
      if (currentPage === 1) {
        // Bottom-anchored credit line instead of a mid-page float.
        return {
          text: "POWERED BY GITMIND — AI-POWERED CODE ANALYSIS",
          font: "GeistMono",
          fontSize: 8,
          letterSpacing: 1.5,
          color: C.text3,
          alignment: "center",
        };
      }
      return {
        canvas: [
          {
            type: "line",
            x1: 40,
            y1: 0,
            x2: 555,
            y2: 0,
            lineWidth: 0.5,
            lineColor: C.ink,
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

  const content = [
    // Header
    {
      columns: [
        {
          text: "GITMIND",
          width: "*",
          font: "GeistMono",
          fontSize: 13,
          bold: true,
          letterSpacing: 6,
          color: C.primary,
        },
        {
          text: now.toUpperCase(),
          font: "GeistMono",
          fontSize: 8,
          color: C.text3,
        },
      ],
      margin: [0, 0, 0, 22],
    },
    {
      canvas: [{ type: "rect", x: 0, y: 0, w: 96, h: 10, color: C.primary }],
      margin: [0, 0, 0, 14],
    },
    {
      text: "INCIDENT REPORT",
      font: "Geist",
      fontSize: 24,
      bold: true,
      color: C.ink,
    },
    { text: "", margin: [0, 8, 0, 0] },
    {
      text: safeText(finding?.title || "Security Incident"),
      font: "Geist",
      fontSize: 14,
      bold: true,
      color: C.primary,
    },
    { text: "", margin: [0, 12, 0, 0] },
    {
      table: {
        widths: [150, "*"],
        body: [
          [monoLabel("Date"), { text: now, style: "metaValue" }],
          [
            monoLabel("Repository"),
            { text: safeText(repoName || "—"), style: "metaValue" },
          ],
          [
            monoLabel("Severity"),
            {
              text: (finding?.severity || "unknown").toUpperCase(),
              font: "GeistMono",
              fontSize: 8,
              bold: true,
              color:
                SEVERITY_COLORS[(finding?.severity || "").toLowerCase()] ||
                C.text2,
            },
          ],
          [
            monoLabel("Outcome"),
            {
              text: outcome === "resolved" ? "CONTAINED" : "LEAKED",
              font: "GeistMono",
              fontSize: 8,
              bold: true,
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
          lineWidth: 2,
          lineColor: C.ink,
        },
      ],
      margin: [0, 0, 0, 12],
    },
  ];

  // Phase 3c: handle structured JSON report (new) or markdown string (legacy)
  if (report && typeof report === "object" && report.summary) {
    // ── Structured JSON report ────────────────────────────────────────────
    const r = report;

    // Summary
    content.push(
      monoLabel("Incident Summary", {
        fontSize: 12,
        color: C.primary,
        margin: [0, 12, 0, 6],
      }),
    );
    content.push({
      text: safeText(r.summary),
      fontSize: 10,
      color: C.text2,
      margin: [0, 0, 0, 10],
    });

    // Timeline
    if (r.timeline?.length) {
      content.push(
        monoLabel("Timeline", {
          fontSize: 12,
          color: C.primary,
          margin: [0, 12, 0, 6],
        }),
      );
      content.push(
        hardTable(
          ["Time", "Event"],
          r.timeline.map((t) => [
            { text: safeText(t.label || ""), bold: true },
            wrapLong(safeText(t.event || "")),
          ]),
          [80, "*"],
        ),
      );
    }

    // Impact
    if (
      r.impact &&
      (r.impact.systems_at_risk ||
        r.impact.exposure_window ||
        r.impact.affected_users)
    ) {
      content.push(
        monoLabel("Impact Assessment", {
          fontSize: 12,
          color: C.primary,
          margin: [0, 12, 0, 6],
        }),
      );
      const impactRows = [];
      if (r.impact.systems_at_risk)
        impactRows.push(["Systems at Risk", r.impact.systems_at_risk]);
      if (r.impact.exposure_window)
        impactRows.push(["Exposure Window", r.impact.exposure_window]);
      if (r.impact.affected_users)
        impactRows.push(["Affected Users", r.impact.affected_users]);
      if (impactRows.length) {
        content.push({
          table: {
            widths: [150, "*"],
            body: impactRows.map(([k, v]) => [
              monoLabel(k),
              { text: safeText(v), style: "metaValue" },
            ]),
          },
          layout: "noBorders",
          margin: [0, 4, 0, 10],
        });
      }
    }

    // Stakeholder Statement
    if (r.stakeholder_statement) {
      content.push(
        monoLabel("Stakeholder Communication", {
          fontSize: 12,
          color: C.primary,
          margin: [0, 12, 0, 6],
        }),
      );
      content.push({
        text: safeText(r.stakeholder_statement),
        fontSize: 10,
        color: C.text2,
        italics: true,
        margin: [0, 0, 0, 10],
      });
    }

    // Remediation
    if (r.remediation) {
      content.push(
        monoLabel("Remediation Checklist", {
          fontSize: 12,
          color: C.primary,
          margin: [0, 12, 0, 6],
        }),
      );
      for (const [phase, items] of Object.entries(r.remediation)) {
        if (!items?.length) continue;
        const label = phase
          .replace(/_/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());
        content.push({
          text: label.toUpperCase(),
          font: "GeistMono",
          fontSize: 9,
          bold: true,
          letterSpacing: 1,
          color: C.ink,
          margin: [0, 6, 0, 4],
        });
        content.push({
          ul: items.map((item) => ({
            text: safeText(String(item)),
            margin: [0, 2, 0, 2],
          })),
          margin: [0, 0, 0, 6],
          fontSize: 10,
          color: C.text2,
        });
      }
    }

    // Lessons Learned
    if (r.lessons_learned?.length) {
      content.push(
        monoLabel("Lessons Learned", {
          fontSize: 12,
          color: C.primary,
          margin: [0, 12, 0, 6],
        }),
      );
      content.push({
        ul: r.lessons_learned.map((l) => ({
          text: safeText(String(l)),
          margin: [0, 2, 0, 2],
        })),
        margin: [0, 0, 0, 8],
        fontSize: 10,
        color: C.text2,
      });
    }
  } else {
    // ── Legacy markdown report ─────────────────────────────────────────────
    let md = typeof report === "string" ? report : "";
    // The cover already displays "INCIDENT REPORT" — drop a leading H1
    // document title so it never renders as a duplicate body section.
    md = md.replace(/^#\s+[^\n]*\n+/, "");
    const hasSections = /^## /m.test(md);
    const sections = hasSections
      ? md
          .split(/^## /m)
          .filter(Boolean)
          .map((block) => {
            const lines = block.split("\n");
            const title = lines[0].replace(/^#+ /, "").trim();
            const body = lines.slice(1).join("\n").trim();
            return { title, body };
          })
      : [{ title: null, body: md.trim() }];

    for (const section of sections) {
      if (section.title) {
        content.push(
          monoLabel(section.title, {
            fontSize: 12,
            color: C.primary,
            margin: [0, 12, 0, 6],
          }),
        );
      }

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
          text: safeText(paragraphs.join("\n\n")),
          fontSize: 10,
          color: C.text2,
          margin: [0, 0, 0, 6],
        });
      }

      if (bullets.length) {
        content.push({
          ul: bullets.map((b) => {
            const text = b.replace(/^-\s*\[?\]?\s*/, "");
            return { text: safeText(text), margin: [0, 2, 0, 2] };
          }),
          margin: [0, 0, 0, 8],
          fontSize: 10,
          color: C.text2,
        });
      }
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
          lineColor: C.ink,
        },
      ],
      margin: [0, 0, 0, 6],
    },
    {
      text: "GENERATED BY GITMIND — AI-POWERED INCIDENT RESPONSE",
      font: "GeistMono",
      fontSize: 8,
      letterSpacing: 1,
      color: C.text3,
    },
  );

  return {
    content,
    defaultStyle: { font: "Geist", fontSize: 10, color: C.text1 },
    styles: {
      metaLabel: {
        font: "GeistMono",
        fontSize: 8,
        color: C.text3,
        bold: true,
        letterSpacing: 1,
        margin: [0, 2, 8, 2],
      },
      metaValue: {
        font: "Geist",
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
            text: "GitMind — Incident Report",
            font: "GeistMono",
            fontSize: 8,
            color: C.text3,
            margin: [40, 10, 0, 0],
          },
          {
            text: `${currentPage} / ${pageCount}`,
            font: "GeistMono",
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
      columns: [
        {
          text: "GITMIND",
          width: "*",
          font: "GeistMono",
          fontSize: 13,
          bold: true,
          letterSpacing: 6,
          color: C.primary,
        },
        {
          text: now.toUpperCase(),
          font: "GeistMono",
          fontSize: 8,
          color: C.text3,
        },
      ],
      margin: [0, 0, 0, 26],
    },
    {
      canvas: [{ type: "rect", x: 0, y: 0, w: 96, h: 10, color: C.primary }],
      margin: [0, 0, 0, 14],
    },
    {
      text: safeText(repoName || "Repository"),
      font: "Geist",
      fontSize: 24,
      bold: true,
      color: C.ink,
    },
    {
      // Matches the web Summary tab title ("Executive Summary").
      text: "EXECUTIVE SUMMARY",
      font: "GeistMono",
      fontSize: 11,
      letterSpacing: 2,
      color: C.text3,
      margin: [0, 6, 0, 18],
    },
    {
      canvas: [
        {
          type: "line",
          x1: 0,
          y1: 0,
          x2: 515,
          y2: 0,
          lineWidth: 2,
          lineColor: C.ink,
        },
      ],
      margin: [0, 0, 0, 12],
    },
  ];

  // Health score card
  if (health) {
    // Mirrors the web HealthCard: A/B are passing (success), C/D are
    // caution (warning), F fails (danger) — print variants on white.
    const gradeColors = {
      A: "#16a34a",
      B: "#16a34a",
      C: "#d97706",
      D: "#d97706",
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
              font: "GeistMono",
              fontSize: 42,
              bold: true,
              color: gc,
              alignment: "center",
            },
            {
              text: `${health.score || 0}/100`,
              font: "GeistMono",
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
          layout: {
            hLineWidth: () => 1,
            vLineWidth: () => 1,
            hLineColor: () => C.ink,
            vLineColor: () => C.ink,
          },
        },
      ],
      margin: [0, 0, 0, 16],
    });
  }

  // AI Summary
  if (summary) {
    content.push(
      monoLabel("AI Summary", {
        fontSize: 11,
        color: C.primary,
        margin: [0, 8, 0, 6],
      }),
    );
    content.push({
      text: safeText(summary),
      fontSize: 10,
      color: C.text2,
      margin: [0, 0, 0, 12],
    });
  }

  // Quick stats
  if (stats) {
    content.push(
      monoLabel("Quick Stats", {
        fontSize: 11,
        color: C.primary,
        margin: [0, 8, 0, 6],
      }),
    );
    content.push(
      hardTable(
        ["Metric", "Value"],
        Object.entries(stats).map(([k, v]) => [
          k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
          { text: String(v), bold: true },
        ]),
        ["*", 80],
      ),
    );
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
          lineColor: C.ink,
        },
      ],
      margin: [0, 0, 0, 6],
    },
    {
      text: `SCANNED IN ${elapsedSec || 0}S BY GITMIND`,
      font: "GeistMono",
      fontSize: 8,
      letterSpacing: 1,
      color: C.text3,
    },
  );

  return {
    content,
    defaultStyle: { font: "Geist", fontSize: 10, color: C.text1 },
    styles: {
      th: {
        font: "GeistMono",
        bold: true,
        fontSize: 8,
        letterSpacing: 1,
        color: C.white,
        fillColor: C.ink,
        margin: [6, 5, 6, 5],
      },
      td: {
        font: "Geist",
        fontSize: 8.5,
        margin: [6, 4, 6, 4],
        color: C.text2,
      },
    },
    pageMargins: [40, 50, 40, 50],
  };
}

// ── Download helper ────────────────────────────────────────────────────────────

export function downloadPdf(docDef, filename, cacheKey) {
  // Phase 3a: cache doc definition for instant re-download
  if (cacheKey) {
    cacheDocDef(cacheKey, docDef);
  }
  pdfMake.createPdf(docDef).download(filename || "gitmind-report.pdf");
}

// ── Retrieve cached PDF (for instant re-render) ────────────────────────────────

export function getCachedPdf(cacheKey) {
  return getCachedDocDef(cacheKey);
}
