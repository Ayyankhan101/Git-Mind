import React, { useEffect, useMemo, useState } from "react";
import { FileText, ExternalLink, Copy, X } from "lucide-react";

const LANG_EXT = {
  py: "Python",
  js: "JavaScript",
  ts: "TypeScript",
  tsx: "TypeScript",
  jsx: "JavaScript",
  go: "Go",
  rb: "Ruby",
  rs: "Rust",
  java: "Java",
  cs: "C#",
  cpp: "C++",
  c: "C",
};

export default function FilePreviewDrawer({
  path,
  line,
  repoUrl,
  ghToken,
  onClose,
}) {
  const [codeLines, setCodeLines] = useState(null);
  const [fetchLoading, setFetchLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [lang, setLang] = useState("");

  useEffect(() => {
    if (!path) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [path, onClose]);

  useEffect(() => {
    if (!path) {
      setCodeLines(null);
      setFetchError(null);
      return;
    }

    const ext = path.split(".").pop().toLowerCase();

    if (!repoUrl) return;

    const ghMatch = repoUrl.match(/github\.com\/([^/?#]+\/[^/?#]+)/);
    if (!ghMatch) return;

    const ownerRepo = ghMatch[1].replace(/\.git$/, "");
    setFetchLoading(true);
    setFetchError(null);
    setCodeLines(null);
    setLang(LANG_EXT[ext] || ext.toUpperCase());

    const controller = new AbortController();
    const headers = { Accept: "application/vnd.github.v3+json" };
    if (ghToken) headers["Authorization"] = `Bearer ${ghToken}`;
    fetch(`https://api.github.com/repos/${ownerRepo}/contents/${path}`, {
      headers,
      signal: controller.signal,
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (!data.content) throw new Error("empty");
        const raw = atob(data.content.replace(/\n/g, ""));
        const allLines = raw.split("\n");
        const targetLine = line ? parseInt(line, 10) : 1;
        const start = Math.max(0, targetLine - 6);
        const end = Math.min(allLines.length, targetLine + 5);
        setCodeLines(
          allLines.slice(start, end).map((text, i) => ({
            n: start + i + 1,
            text,
            hl: start + i + 1 === targetLine,
          })),
        );
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        setFetchError(err.message);
      })
      .finally(() => setFetchLoading(false));
    return () => controller.abort();
  }, [path, repoUrl, line, ghToken]);

  const ghUrl = useMemo(() => {
    if (!repoUrl || !path) return null;
    const m = repoUrl.match(/github\.com\/([^/?#]+\/[^/?#]+)/);
    if (!m) return null;
    return `https://github.com/${m[1].replace(/\.git$/, "")}/blob/main/${path}${line ? `#L${line}` : ""}`;
  }, [repoUrl, path, line]);

  if (!path) return null;

  const firstLine = codeLines?.[0]?.n ?? "?";
  const lastLine = codeLines?.[codeLines.length - 1]?.n ?? "?";

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-header">
          <span className="drawer-icon">
            <FileText size={14} strokeWidth={1.5} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="drawer-title">
              {path}
              {line ? `:${line}` : ""}
            </div>
            <div className="drawer-sub">
              {fetchLoading
                ? "Fetching from GitHub…"
                : lang && codeLines
                  ? `${lang} · lines ${firstLine}–${lastLine}`
                  : "snippet not available"}
            </div>
          </div>
          {ghUrl && (
            <a
              href={ghUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-icon"
              title="Open on GitHub"
            >
              <ExternalLink size={13} strokeWidth={1.5} />
            </a>
          )}
          <button
            className="btn-icon"
            title="Copy path"
            onClick={() => navigator.clipboard.writeText(path).catch(() => {})}
          >
            <Copy size={13} strokeWidth={1.5} />
          </button>
          <button className="btn-icon" onClick={onClose}>
            <X size={13} strokeWidth={1.5} />
          </button>
        </div>

        <div className="drawer-body">
          {fetchLoading ? (
            <div
              style={{
                padding: "20px 22px",
                display: "flex",
                flexDirection: "column",
                gap: 9,
              }}
            >
              {Array.from({ length: 9 }, (_, i) => (
                <div
                  key={i}
                  style={{ display: "flex", gap: 18, alignItems: "center" }}
                >
                  <span
                    className="sk"
                    style={{ width: 28, height: 13, flexShrink: 0 }}
                  />
                  <span
                    className="sk"
                    style={{
                      height: 13,
                      width: `${45 + ((i * 19 + 7) % 45)}%`,
                    }}
                  />
                </div>
              ))}
            </div>
          ) : codeLines ? (
            <div className="code-block">
              {codeLines.map((l, i) => (
                <div key={i} className={`code-line${l.hl ? " hl" : ""}`}>
                  <span className="lineno">{l.n}</span>
                  <span className="src">{l.text || " "}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty" style={{ padding: "48px 32px" }}>
              <FileText size={20} className="empty-icon" strokeWidth={1.5} />
              <div className="empty-title">Preview not available</div>
              <div className="empty-sub">
                {fetchError ? `Fetch failed (${fetchError}). ` : ""}
                {ghUrl ? (
                  <a
                    href={ghUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "var(--primary)" }}
                  >
                    Open on GitHub ↗
                  </a>
                ) : (
                  "Analyze a repository to preview files."
                )}
              </div>
            </div>
          )}
        </div>

        <div className="drawer-footer">
          <span>
            Press <span className="kbd">Esc</span> to close
          </span>
          <span>{codeLines ? `${codeLines.length} lines shown` : ""}</span>
        </div>
      </div>
    </>
  );
}
