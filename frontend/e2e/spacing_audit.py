#!/usr/bin/env python3
"""Spacing audit across all dashboard tabs.

Hydrates the dashboard via the mock `?share=` flow (same as visual_check.py)
and measures per-tab geometry so spacing inconsistencies are data, not
opinion:

  - hasHeader / header icon+title+sub sizes  (do all tabs use .tab-header?)
  - gutter: first body block left padding + its left edge vs .main padding
  - vertical rhythm: gaps between the top stacked blocks of each tab
  - header → first body gap

Two modes:

  default            prints the measurement table (exit 0)
  --check            CI regression gate. Compares every tab against the
                     EXPECTED spec below and exits 1 on any drift, so a
                     spacing/header regression fails the build.

Run:  cd frontend && python3 e2e/spacing_audit.py [--check]
"""

import argparse
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
FRONTEND = HERE.parent
sys.path.insert(0, str(HERE))

from visual_check import MockBackend, TABS  # noqa: E402
from smoke_test import Server, find_brave, wait_until  # noqa: E402

# ── CI spec (--check) ──────────────────────────────────────────────────────
# Every tab's geometry must match these values (px, ± tolerance). Every tab
# now uses the standard .tab-header; gutter applies to row/filter-based tabs
# (canvas + chat surfaces have no row container).
#   header:  tab uses the standard .tab-header pattern
#   icon:    .tab-header-icon width
#   sub:     .tab-header-sub font-size
#   gutter:  padding-left of the first row/filter container — the shared
#            content gutter that must stay at 28px across row-based tabs
EXPECTED = {
    "Summary": {"header": True, "icon": 32, "sub": 12},
    "Architecture": {"header": True, "icon": 32, "sub": 12},
    "API Docs": {"header": True, "icon": 32, "sub": 12, "gutter": 28},
    "Security": {"header": True, "icon": 32, "sub": 12, "gutter": 28},
    "CVE": {"header": True, "icon": 32, "sub": 12, "gutter": 28},
    "Git Audit": {"header": True, "icon": 32, "sub": 12, "gutter": 28},
    "Solidity": {"header": True, "icon": 32, "sub": 12, "gutter": 28},
    "Code Audit": {"header": True, "icon": 32, "sub": 12, "gutter": 28},
    "PR Review": {"header": True, "icon": 32, "sub": 12},
    "Watch": {"header": True, "icon": 32, "sub": 12},
    "Chat": {"header": True, "icon": 32, "sub": 12},
}

TOLERANCE = {"header": 0, "icon": 2, "sub": 1, "gutter": 2}

MEASURE = """() => {
  const tc = document.querySelector('.tab-content');
  if (!tc) return { hasHeader: null };
  const root = tc.firstElementChild;
  const main = document.querySelector('.main');
  const header = root && root.querySelector(':scope > .tab-header');
  const mainPadLeft = main ? parseFloat(getComputedStyle(main).paddingLeft) : null;
  const rect = (el) => { const r = el.getBoundingClientRect(); return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), bottom: Math.round(r.bottom) }; };
  const out = {
    hasHeader: !!header,
    mainPadLeft,
  };
  if (header) {
    out.header = rect(header);
    const icon = header.querySelector('.tab-header-icon');
    out.iconSize = icon ? Math.round(icon.getBoundingClientRect().width) : null;
    const t = header.querySelector('.tab-header-title');
    out.titleSize = t ? parseFloat(getComputedStyle(t).fontSize) : null;
    const s = header.querySelector('.tab-header-sub');
    out.subSize = s ? parseFloat(getComputedStyle(s).fontSize) : null;
    const body = header.nextElementSibling;
    out.bodyGap = body ? Math.round(body.getBoundingClientRect().top - header.getBoundingClientRect().bottom) : null;
    out.body = body ? rect(body) : null;
    out.bodyPadLeft = body ? parseFloat(getComputedStyle(body).paddingLeft) : null;
  } else {
    const first = root ? root.firstElementChild : null;
    if (first) {
      out.body = rect(first);
      out.bodyPadLeft = parseFloat(getComputedStyle(first).paddingLeft);
      out.firstTop = Math.round(first.getBoundingClientRect().top - tc.getBoundingClientRect().top);
    }
  }
  // shared content gutter: padding-left of the first row/filter container.
  // Grid columns (method badges, severity labels) shift inner text, so the
  // container padding is the layout-agnostic invariant to guard.
  if (root) {
    const box = root.querySelector('.row, .endpoint, .sev-filter');
    out.gutter = box ? parseFloat(getComputedStyle(box).paddingLeft) : null;
  }
  // vertical rhythm: gaps between top stacked children of the root
  if (root) {
    const kids = [...root.children].slice(0, 6);
    out.stackGaps = [];
    for (let i = 1; i < kids.length; i++) {
      out.stackGaps.push(Math.round(kids[i].getBoundingClientRect().top - kids[i - 1].getBoundingClientRect().bottom));
    }
  }
  return out;
}"""


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--check", action="store_true", help="CI gate: fail on drift from EXPECTED spec")
    ap.add_argument("--browser", choices=["auto", "brave", "chromium"], default="auto")
    args = ap.parse_args()

    brave = find_brave()
    if args.browser == "chromium":
        brave = None
    print(f"[browser] using {'Brave' if brave else 'bundled Chromium'}")
    with MockBackend(), Server(3000):
        from playwright.sync_api import sync_playwright

        with sync_playwright() as p:
            launch_kwargs = {"headless": True, "args": ["--no-sandbox"]}
            if brave:
                launch_kwargs["executable_path"] = brave
            browser = p.chromium.launch(**launch_kwargs)
            page = browser.new_page(viewport={"width": 1440, "height": 900})
            page.goto("http://localhost:3000/dashboard?share=visual-check",
                      wait_until="networkidle", timeout=60000)
            wait_until(lambda: page.evaluate(
                "() => !!document.querySelector('.command-bar') && !document.querySelector('.app-loading')"),
                timeout=20, label="dashboard")
            page.wait_for_timeout(1500)

            rows = []
            for aria_label, _name in TABS:
                page.locator(f".nav-rail .nav-item[aria-label='{aria_label}']").click()
                wait_until(lambda: page.evaluate(
                    "() => !document.querySelector('.tab-loading')"),
                    timeout=20, label=aria_label)
                page.wait_for_timeout(900)
                d = page.evaluate(MEASURE)
                d["tab"] = aria_label
                rows.append(d)
            browser.close()

    if args.check:
        violations = []
        for r in rows:
            exp = EXPECTED.get(r["tab"])
            if exp is None:
                continue
            if r.get("hasHeader") is None:
                violations.append(f"{r['tab']}: tab content did not render")
                continue
            if r["hasHeader"] != exp["header"]:
                violations.append(
                    f"{r['tab']}: header expected {'yes' if exp['header'] else 'no'}, got "
                    f"{'yes' if r['hasHeader'] else 'no'}"
                )
            if exp.get("icon") is not None and r.get("iconSize") is not None:
                if abs(r["iconSize"] - exp["icon"]) > TOLERANCE["icon"]:
                    violations.append(
                        f"{r['tab']}: header icon {r['iconSize']}px (expected ~{exp['icon']}px)"
                    )
            if exp.get("sub") is not None and r.get("subSize") is not None:
                if abs(r["subSize"] - exp["sub"]) > TOLERANCE["sub"]:
                    violations.append(
                        f"{r['tab']}: header sub {r['subSize']}px (expected ~{exp['sub']}px)"
                    )
            if exp.get("gutter") is not None and r.get("gutter") is not None:
                if abs(r["gutter"] - exp["gutter"]) > TOLERANCE["gutter"]:
                    violations.append(
                        f"{r['tab']}: content gutter {r['gutter']}px (expected ~{exp['gutter']}px)"
                    )

        if violations:
            print("\nSPACING AUDIT FAILED:")
            for v in violations:
                print(f"  ✗ {v}")
            print("\nFix the regressions, then re-run: python3 e2e/spacing_audit.py --check")
            return 1
        print("\nSPACING AUDIT PASSED — all tabs match the expected geometry")
        return 0

    # ── Human-readable table ──────────────────────────────────────────
    print(f"\n{'tab':<14}{'hdr':<5}{'icon':<6}{'t-sub':<7}{'gutter':<8}{'hdrGap':<8}stackGaps")
    for r in rows:
        if r.get("hasHeader") is None:
            print(f"{r['tab']:<14}  (no tab-content)")
            continue
        icon = r.get("iconSize") or "-"
        sub = r.get("subSize") or "-"
        gut = r.get("gutter") if r.get("gutter") is not None else "-"
        hgap = r.get("bodyGap") if r.get("bodyGap") is not None else "-"
        gaps = ",".join(str(g) for g in (r.get("stackGaps") or [])) or "-"
        print(f"{r['tab']:<14}{'Y' if r['hasHeader'] else 'N':<5}{icon:<6}{sub:<7}{gut:<8}{hgap:<8}{gaps}")
    print(f"\nmain padding-left: {rows[0].get('mainPadLeft')}px")
    return 0


if __name__ == "__main__":
    sys.exit(main())
