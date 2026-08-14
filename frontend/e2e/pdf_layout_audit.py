#!/usr/bin/env python3
"""PDF export layout audit (Playwright + pymupdf).

Generates the three GitMind PDF exports through the real built app
(mock backend, same share-link flow as smoke_pdf_share.py), then
inspects the rendered PDFs with pymupdf and verifies the layout
against the web aesthetic:

  - every text span and drawing stays inside the printable content
    area (right edge = page width - 40pt right margin, ± tolerance) —
    catches pdfmake tables that render wider than their declared
    widths and bleed off the page
  - Geist + Geist Mono fonts are embedded and actually used
  - the cover carries the electric-blue accent (#3b82f6) wordmark bar
  - severity chips / table headers paint their fills (not falling back
    to a plain text table)
  - the expected sections/content appear (cover, security, health,
    incident header, summary header)

Two modes:

  default     prints the audit table (exit 0)
  --check     CI regression gate. Exits 1 on any violation — a table
              overflow or a lost font/accent fails the build.

Run:  cd frontend && npm run build && python3 e2e/pdf_layout_audit.py [--check]

Requires: pip install playwright pymupdf
"""

import argparse
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import fitz  # pymupdf  # noqa: E402

from smoke_test import Server  # noqa: E402
from smoke_pdf_share import (  # noqa: E402
    mock_backend,
    mock_crisis_ws,
)

OUT_DIR = Path("/tmp/gitmind-pdf-audit")

# Content area: A4 (595.28pt) with pageMargins [40, 50, 40, 50].
RIGHT_EDGE = 595.28 - 40
TOL = 0.6  # border strokes land at half-width offsets

ACCENT = "#3b82f6"  # web --primary (electric blue)
SEV_FILLS = {  # severity chip fills that must paint
    "critical": "#dc2626",
    "high": "#ea580c",
    "medium": "#ca8a04",
}


def hex_of(c):
    if not c:
        return None
    if isinstance(c, int):
        return "#%06x" % c
    try:
        return "#%02x%02x%02x" % tuple(int(round(v * 255)) for v in c)
    except Exception:
        return None


def fonts_used(doc):
    """Set of base font names embedded + used anywhere in the doc."""
    out = set()
    for page in doc:
        for f in page.get_fonts():
            out.add(re.sub(r"^[A-Z]+\+", "", f[3]))
    return out


def fill_colors(doc):
    out = set()
    for page in doc:
        for dr in page.get_drawings():
            if dr["type"] in ("f", "fs"):
                c = hex_of(dr.get("fill"))
                if c:
                    out.add(c)
    return out


def text_colors(doc):
    """Set of colors used by text spans (accent also shows as wordmark text)."""
    out = set()
    for page in doc:
        d = page.get_text("dict")
        for block in d["blocks"]:
            for line in block.get("lines", []):
                for span in line.get("spans", []):
                    c = hex_of(span.get("color"))
                    if c:
                        out.add(c)
    return out


def overflow_issues(doc):
    """Any drawing or text span past the printable right edge."""
    issues = []
    for pno, page in enumerate(doc):
        for dr in page.get_drawings():
            if dr["rect"].x1 > RIGHT_EDGE + TOL:
                issues.append(
                    f"page {pno + 1}: drawing x1={dr['rect'].x1:.1f} "
                    f"past content edge {RIGHT_EDGE:.0f}"
                )
        d = page.get_text("dict")
        for block in d["blocks"]:
            for line in block.get("lines", []):
                for span in line.get("spans", []):
                    if span["bbox"][2] > RIGHT_EDGE + TOL:
                        issues.append(
                            f"page {pno + 1}: text x1={span['bbox'][2]:.1f} "
                            f"({span['text'][:40]!r})"
                        )
    return issues


def page_text(doc):
    return "\n".join(p.get_text() for p in doc)


def grab_downloads(page, out_dir):
    """Export the three PDFs via the UI, return [(label, path)]."""
    print("[1/3] analysis report export")
    page.goto("http://localhost:3000/?share=demo123")
    page.wait_for_load_state("networkidle")
    page.wait_for_selector("text=gitmind/sample-app", timeout=20_000)
    btn = page.get_by_role("button", name="Export report")
    btn.wait_for(state="visible", timeout=15_000)
    with page.expect_download(timeout=30_000) as dl:
        btn.click()
    path = out_dir / "01-analysis.pdf"
    dl.value.save_as(path)

    print("[2/3] summary export")
    page.wait_for_load_state("networkidle")
    btn = page.get_by_role("button", name="Export summary PDF")
    btn.wait_for(state="visible", timeout=15_000)
    with page.expect_download(timeout=30_000) as dl:
        btn.click()
    path = out_dir / "02-summary.pdf"
    dl.value.save_as(path)

    print("[3/3] incident report export")
    page.get_by_role("button", name="Security").first.click(timeout=10_000)
    row = page.get_by_role("button", name=re.compile(r"G401", re.I)).first
    row.wait_for(state="visible", timeout=10_000)
    row.click()
    page.get_by_role("button", name="Simulate Crisis").first.click(timeout=10_000)
    gen = page.get_by_role("button", name="Generate incident report")
    gen.wait_for(state="visible", timeout=15_000)
    gen.click()
    export = page.get_by_role("button", name="Export incident report PDF")
    export.wait_for(state="visible", timeout=15_000)
    with page.expect_download(timeout=30_000) as dl:
        export.click()
    path = out_dir / "03-incident.pdf"
    dl.value.save_as(path)

    return [("analysis", out_dir / "01-analysis.pdf"),
            ("summary", out_dir / "02-summary.pdf"),
            ("incident", out_dir / "03-incident.pdf")]


def audit_analysis(doc):
    issues = []
    text = page_text(doc)
    if doc.page_count < 2:
        issues.append(f"analysis: expected ≥2 pages, got {doc.page_count}")
    if "Repository Analysis Report" not in text:
        issues.append("analysis: cover title missing")
    if "HEALTH SCORE" not in text and "SECURITY FINDINGS" not in text:
        issues.append("analysis: no section content found")
    fills = fill_colors(doc)
    if ACCENT not in fills:
        issues.append("analysis: electric-blue accent fill missing (cover bar)")
    for sev, col in SEV_FILLS.items():
        if col not in fills:
            issues.append(f"analysis: {sev} chip fill missing")
    issues += overflow_issues(doc)
    return issues


def audit_summary(doc):
    issues = []
    text = page_text(doc)
    if "ANALYSIS SUMMARY" not in text:
        issues.append("summary: header missing")
    if "AI SUMMARY" not in text:
        issues.append("summary: AI summary label missing")
    issues += overflow_issues(doc)
    return issues


def audit_incident(doc):
    issues = []
    text = page_text(doc)
    if "INCIDENT REPORT" not in text:
        issues.append("incident: header missing")
    if ACCENT not in (fill_colors(doc) | text_colors(doc)):
        issues.append("incident: electric-blue accent missing")
    issues += overflow_issues(doc)
    return issues


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--check", action="store_true", help="CI gate: fail on any layout violation")
    args = ap.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    from playwright.sync_api import sync_playwright

    with Server(3000):
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
            context = browser.new_context(accept_downloads=True)
            page = context.new_page()
            mock_crisis_ws(page)
            mock_backend(page)
            downloads = grab_downloads(page, OUT_DIR)
            browser.close()

    print("\n== PDF layout audit ==")
    all_issues = []
    for label, path in downloads:
        doc = fitz.open(path)
        fonts = fonts_used(doc)
        f_ok = {"Geist-Regular", "Geist-Bold"}.issubset(fonts) and \
            {"GeistMono-Regular", "GeistMono-Bold"}.issubset(fonts)
        audit = {"analysis": audit_analysis, "summary": audit_summary,
                 "incident": audit_incident}[label]
        issues = audit(doc)
        if not f_ok:
            issues.append(f"{label}: Geist fonts not embedded/used ({sorted(fonts)})")
        print(f"\n[{label}] {path.name} — {doc.page_count} page(s), {path.stat().st_size} bytes")
        print(f"  fonts: {', '.join(sorted(fonts))} {'✓' if f_ok else '✗'}")
        for issue in issues:
            print(f"  ✗ {issue}")
        all_issues += issues
        doc.close()

    if args.check:
        if all_issues:
            print("\nPDF LAYOUT AUDIT FAILED:")
            for i in all_issues:
                print(f"  ✗ {i}")
            print("\nFix the regression, then re-run: python3 e2e/pdf_layout_audit.py --check")
            return 1
        print("\nPDF LAYOUT AUDIT PASSED — exports stay in-bounds with the brand fonts/accent")
        return 0

    if all_issues:
        print(f"\n{len(all_issues)} issue(s) found (run with --check to gate on these)")
    else:
        print("\nno layout issues")
    return 0


if __name__ == "__main__":
    sys.exit(main())
