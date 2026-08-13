#!/usr/bin/env python3
"""Architecture node-panel / control-dock overlap regression gate.

Hydrates the dashboard via the mock `?share=` flow (same as visual_check)
and measures the Architecture tab geometry after clicking a diagram node:

  - the node panel must PUSH the canvas (flex sibling), not overlay it
  - the floating control dock must stay clear of the panel
  - the panel must stay inside the window

Two modes:

  default       prints the measurement table (exit 0)
  --check       CI regression gate. Exits 1 on any drift — a panel/dock
                overlap (or a revert to absolute overlay) fails the build.

Run:  cd frontend && python3 e2e/overlap_probe.py [--check]
"""

import argparse
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from visual_check import MockBackend  # noqa: E402
from smoke_test import Server, find_brave, wait_until  # noqa: E402

VIEWPORT = {"width": 1440, "height": 900}

MEASURE_ARCH = """() => {
  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      left: Math.round(r.left), right: Math.round(r.right),
      top: Math.round(r.top), bottom: Math.round(r.bottom),
      width: Math.round(r.width), height: Math.round(r.height),
    };
  };
  const panel = document.querySelector('.node-panel');
  return {
    canvas: rect(document.querySelector('.diagram-canvas')),
    panel: panel ? rect(panel) : null,
    dock: rect(document.querySelector('.diagram-dock')),
    viewportW: window.innerWidth,
  };
}"""

MEASURE_SUMMARY = """() => {
  const root = document.querySelector('.tab-content > .summary');
  if (!root) return null;
  const rect = (el) => {
    const r = el.getBoundingClientRect();
    return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), width: Math.round(r.width), height: Math.round(r.height) };
  };
  const gap = (a, b) => Math.round(b.top - a.bottom);
  const out = {};
  const cards = [...root.querySelectorAll('.summary-card')];
  out.cardCount = cards.length;
  if (cards.length >= 2) {
    out.cardGap = Math.round(rect(cards[1]).left - rect(cards[0]).right);
    out.cardPad = parseFloat(getComputedStyle(cards[0]).paddingTop);
    out.cardInternalGap = parseFloat(getComputedStyle(cards[0]).rowGap || getComputedStyle(cards[0]).gap);
  }
  const sg = document.querySelector('.stat-grid');
  if (sg) {
    const stats = [...sg.children].filter((c) => c.getBoundingClientRect().height > 0);
    out.statGap = stats.length >= 2 ? Math.round(rect(stats[1]).left - rect(stats[0]).right) : null;
  }
  return out;
}"""


def arch_analysis(m):
    """Reduce raw geometry to the assertions that matter."""
    out = {"panelOpen": m["panel"] is not None}
    if not m["panel"] or not m["dock"] or not m["canvas"]:
        return out
    p, d, c = m["panel"], m["dock"], m["canvas"]
    inter_l = max(p["left"], d["left"])
    inter_r = min(p["right"], d["right"])
    out["dockPanelOverlap"] = max(0, inter_r - inter_l)
    out["panelCoversCanvas"] = p["left"] < c["right"]
    out["canvasPanelGap"] = p["left"] - c["right"]
    out["dockRight"] = d["right"]
    out["panelLeft"] = p["left"]
    out["panelRight"] = p["right"]
    out["panelOffWindow"] = p["right"] > m["viewportW"] + 1
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--check", action="store_true", help="CI gate: fail on any panel/dock overlap")
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

            # ── Summary spacing (informational in both modes) ────────────
            print("\n== Summary tab: block spacing (px) ==")
            s = page.evaluate(MEASURE_SUMMARY)
            if s:
                print(f"  card gap (between the 2 cards): {s.get('cardGap')}")
                print(f"  card padding: {s.get('cardPad')} / internal gap: {s.get('cardInternalGap')}")
                print(f"  stat grid gap: {s.get('statGap')}")

            # ── Architecture: open the diagram, click a node ─────────────
            print("\n== Architecture tab: node panel vs canvas / dock ==")
            page.locator(".nav-rail .nav-item[aria-label='Architecture']").click()
            wait_until(
                lambda: page.evaluate("() => !document.querySelector('.tab-loading')"),
                timeout=20,
                label="arch tab",
            )
            page.wait_for_timeout(1200)
            page.mouse.move(720, 450)  # leave the rail so it stays collapsed
            page.wait_for_timeout(400)
            before = arch_analysis(page.evaluate(MEASURE_ARCH))
            print(f"  before click: panelOpen={before['panelOpen']} dock={before.get('dockRight')}")

            page.locator(".react-flow__node").first.click()
            page.wait_for_timeout(1000)  # panel slide-in + dock slide
            after = arch_analysis(page.evaluate(MEASURE_ARCH))
            print(
                f"  after click: panel={after.get('panelLeft')}..{after.get('panelRight')} "
                f"dockOverlap={after.get('dockPanelOverlap')}px "
                f"coversCanvas={after.get('panelCoversCanvas')} gap={after.get('canvasPanelGap')}px"
            )
            browser.close()

    if args.check:
        violations = []
        if not after["panelOpen"]:
            violations.append("node panel did not open after clicking a node")
        elif after["dockPanelOverlap"] > 0:
            violations.append(
                f"control dock is hidden behind the node panel "
                f"({after['dockPanelOverlap']}px overlap)"
            )
        if after.get("panelCoversCanvas"):
            violations.append(
                "node panel overlays the canvas instead of pushing it "
                f"(canvas right={after['canvasPanelGap'] + after['panelLeft']}, panel left={after['panelLeft']})"
            )
        if after.get("panelOffWindow"):
            violations.append(f"node panel extends past the window (right={after['panelRight']})")
        if violations:
            print("\nOVERLAP AUDIT FAILED:")
            for v in violations:
                print(f"  ✗ {v}")
            print("\nFix the regression, then re-run: python3 e2e/overlap_probe.py --check")
            return 1
        print("\nOVERLAP AUDIT PASSED — panel pushes the canvas and the dock stays clear")
        return 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
