#!/usr/bin/env python3
"""Mobile (390x844) layout audit across all dashboard tabs.

Hydrates the dashboard via the mock `?share=` flow at mobile viewport
width and measures, per tab:

  - document / .main / .tab-content horizontal overflow
  - every visible element whose right edge exceeds the viewport
  - per-tab geometry flags (stat grid collapse, node panel overlay,
    health card fit, etc.)

Run:  cd frontend && python3 e2e/mobile_audit.py
"""

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from visual_check import MockBackend, TABS  # noqa: E402
from smoke_test import Server, wait_until  # noqa: E402

VIEWPORT = {"width": 390, "height": 844}

MEASURE = """() => {
  const doc = document.documentElement;
  const main = document.querySelector('.main');
  const tc = document.querySelector('.tab-content');
  const rect = (el) => { const r = el.getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), top: Math.round(r.top), bottom: Math.round(r.bottom) }; };
  const out = {
    viewportW: window.innerWidth,
    docOverflow: doc.scrollWidth - window.innerWidth,
    mainOverflow: main ? main.scrollWidth - main.clientWidth : null,
    tabOverflow: tc ? tc.scrollWidth - tc.clientWidth : null,
    // elements poking past the right edge of the viewport (ignoring fixed
    // bottom nav + offscreen-drawer patterns)
    overflowers: [],
  };
  const els = document.querySelectorAll('body *');
  for (const el of els) {
    const cs = getComputedStyle(el);
    if (cs.position === 'fixed') continue;
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    // The bottom nav rail and command bar are their own scrollable/
    // clipped surfaces; flag real tab-content overflow instead. The
    // repo drawer is intentionally parked off-canvas when closed.
    if (el.closest('.nav-rail')) continue;
    if (el.closest('.command-bar')) continue;
    if (el.closest('.repo-drawer')) continue;
    if (el.closest('.react-flow__viewport')) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right > window.innerWidth + 1 || r.left < -1) {
      const cls = (el.className && typeof el.className === 'string') ? el.className.split(' ').slice(0, 2).join('.') : el.tagName;
      out.overflowers.push({ tag: el.tagName, cls: cls.slice(0, 40), left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) });
    }
  }
  // dedupe by tag+cls+right
  const seen = new Set();
  out.overflowers = out.overflowers.filter((o) => {
    const k = o.tag + '|' + o.cls + '|' + o.right;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 12);
  // per-tab geometry
  const sg = document.querySelector('.stat-grid');
  if (sg) {
    const cols = getComputedStyle(sg).gridTemplateColumns;
    out.statGridCols = cols;
  }
  const sgrid = document.querySelector('.summary-grid');
  if (sgrid) out.summaryGridCols = getComputedStyle(sgrid).gridTemplateColumns;
  const hc = document.querySelector('.health-card');
  if (hc) out.health = rect(hc);
  const panel = document.querySelector('.node-panel');
  if (panel) out.nodePanel = rect(panel);
  const canvas = document.querySelector('.diagram-canvas');
  if (canvas) out.canvas = rect(canvas);
  return out;
}"""


def main():
    with MockBackend(), Server(3000):
        from playwright.sync_api import sync_playwright

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
            page = browser.new_page(viewport=VIEWPORT)
            page.goto(
                "http://localhost:3000/dashboard?share=visual-check",
                wait_until="networkidle",
                timeout=60000,
            )
            wait_until(
                lambda: page.evaluate(
                    "() => !!document.querySelector('.command-bar') && !document.querySelector('.app-loading')"
                ),
                timeout=20,
                label="dashboard",
            )
            page.wait_for_timeout(1800)

            problems = []
            for aria_label, name in TABS:
                page.locator(f".nav-rail .nav-item[aria-label='{aria_label}']").click()
                wait_until(
                    lambda: page.evaluate(
                        "() => !document.querySelector('.tab-loading')"
                    ),
                    timeout=20,
                    label=aria_label,
                )
                page.wait_for_timeout(1100)
                # Leave the bottom nav (hover would re-squash the grid) and
                # reset any scroll before measuring.
                page.mouse.move(195, 420)
                page.wait_for_timeout(250)
                page.evaluate("window.scrollTo(0, 0)")
                page.wait_for_timeout(200)
                d = page.evaluate(MEASURE)
                flags = []
                if d["docOverflow"] > 1:
                    flags.append(f"DOC overflow +{d['docOverflow']}px")
                if d["mainOverflow"] is not None and d["mainOverflow"] > 1:
                    flags.append(f"main overflow +{d['mainOverflow']}px")
                if d["tabOverflow"] is not None and d["tabOverflow"] > 1:
                    flags.append(f"tab-content overflow +{d['tabOverflow']}px")
                if d["overflowers"]:
                    for o in d["overflowers"]:
                        flags.append(
                            f"{o['tag']}.{o['cls']} pokes to x={o['right']} (w={o['width']})"
                        )
                if aria_label == "Summary":
                    if d.get("statGridCols") and " " in d["statGridCols"]:
                        flags.append(f"stat-grid not collapsed ({d['statGridCols']})")
                    if d.get("summaryGridCols") and " " in d["summaryGridCols"]:
                        flags.append(f"summary-grid not collapsed ({d['summaryGridCols']})")
                    if d.get("health") and d["health"]["right"] > 391:
                        flags.append("health-card exceeds viewport")
                if aria_label == "Architecture":
                    page.locator(".react-flow__node").first.click()
                    page.wait_for_timeout(700)
                    d2 = page.evaluate(MEASURE)
                    if d2.get("nodePanel"):
                        np = d2["nodePanel"]
                        if np["right"] > 391:
                            flags.append(f"node panel pokes to x={np['right']}")
                        if d2.get("canvas") and np["left"] < d2["canvas"]["left"]:
                            flags.append("node panel overlays canvas (not overlay mode on mobile)")
                    page.locator(".node-panel .btn-icon").first.click()
                    page.wait_for_timeout(500)
                if flags:
                    problems.append((aria_label, flags))
                    print(f"  !! {aria_label}:")
                    for f in flags:
                        print(f"       {f}")
                else:
                    print(f"  ok — {aria_label}")
                page.screenshot(path=f"/tmp/gitmind-visual/mobile-{name}.png")

            browser.close()

    if problems:
        print(f"\nMOBILE AUDIT: {len(problems)} tab(s) with issues")
        return 1
    print("\nMOBILE AUDIT PASSED — no overflow or cramping detected")
    return 0


if __name__ == "__main__":
    sys.exit(main())
