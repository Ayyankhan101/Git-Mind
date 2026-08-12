#!/usr/bin/env python3
"""GitMind frontend visual check (Playwright).

Screenshots the landing page (desktop + mobile) and every dashboard tab.
The dashboard is hydrated WITHOUT a real backend: a mock API server
(e2e/mock_backend.py) serves an analysis fixture via the `?share=` flow,
so every tab renders real content.

Also runs programmatic layout checks per tab:
  - horizontal overflow inside .main and the document
  - blank tab content (no text)
  - tab-loading fallback stuck visible
  - console / page errors

Browser resolution (first match wins):
  --browser brave     -> Brave executable only (fail if not found)
  --browser chromium  -> Playwright bundled Chromium
  --browser auto      -> Brave if installed, else bundled Chromium  [default]

Run:
  cd frontend && npm run build && python3 e2e/visual_check.py

Exit code 0 on success (or 2 when only cosmetic issues are flagged),
1 on hard failures. Screenshots land in /tmp/gitmind-visual/.
"""

import argparse
import os
import socket
import subprocess
import sys
import time
from pathlib import Path

from smoke_test import Server, find_brave, port_open, wait_until

HERE = Path(__file__).resolve().parent
FRONTEND = HERE.parent
SHOT_DIR = Path(os.environ.get("SHOT_DIR", "/tmp/gitmind-visual"))
MOCK_PORT = 8002

# (nav aria-label, screenshot name)
TABS = [
    ("Summary", "tab-01-summary"),
    ("Architecture", "tab-02-architecture"),
    ("API Docs", "tab-03-docs"),
    ("Security", "tab-04-security"),
    ("CVE", "tab-05-cve"),
    ("Git Audit", "tab-06-git-audit"),
    ("Solidity", "tab-07-solidity"),
    ("Code Audit", "tab-08-code-audit"),
    ("PR Review", "tab-09-pr"),
    ("Watch", "tab-10-watch"),
    ("Chat", "tab-11-chat"),
]

# Per-tab content markers: (selector, min count) — proves the tab rendered
# its real data, not just a shell. Empty tuple = text-based check via marker.
CONTENT_MARKERS = {
    "Summary": [(".health-card", 1), (".summary-card", 1)],
    "Architecture": [(".arch-node-card", 3)],
    "API Docs": [(".endpoint", 4)],
    "Security": [(".finding-card, .row", 4)],
    "CVE": [(".row", 2)],
    "Git Audit": [(".row", 6)],
    "Solidity": [(".row", 2)],
    "Code Audit": [(".row", 2)],
    "PR Review": [(".pr-input", 1)],
    "Watch": [(".mon-empty, .mon-row", 1)],
    "Chat": [(".chat-input", 1)],
}



class MockBackend:
    """Spawns e2e/mock_backend.py unless the mock is already on 8002."""

    def __init__(self):
        self.proc = None

    def _is_mock(self):
        try:
            import json as _json
            import urllib.request as _url

            with _url.urlopen("http://127.0.0.1:%d/health" % MOCK_PORT, timeout=3) as r:
                return _json.loads(r.read().decode()).get("mock") is True
        except Exception:
            return False

    def __enter__(self):
        if port_open("127.0.0.1", MOCK_PORT):
            if self._is_mock():
                print(f"[mock] port {MOCK_PORT} already serving the mock — reusing")
                return self
            print(
                "error: port %d is occupied by something that is NOT the mock "
                "backend (e.g. the real GitMind backend). Stop it or run the "
                "visual check on another machine setup." % MOCK_PORT,
                file=sys.stderr,
            )
            sys.exit(1)
        print("[mock] starting mock backend...")
        env = dict(os.environ)
        env["MOCK_VERBOSE"] = "1"
        self.proc = subprocess.Popen(
            [sys.executable, str(HERE / "mock_backend.py"), "--port", str(MOCK_PORT)],
            stdout=subprocess.DEVNULL,
            stderr=open("/tmp/gitmind-mock.log", "w"),
            env=env,
        )
        if not wait_until(lambda: port_open("127.0.0.1", MOCK_PORT), timeout=30, label="mock"):
            print("error: mock backend did not start", file=sys.stderr)
            self.proc.kill()
            sys.exit(1)
        print("[mock] ready")
        return self

    def __exit__(self, *exc):
        if self.proc:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.proc.kill()


class Auditor:
    """Collects console/page errors and layout checks, prints at the end."""

    def __init__(self):
        self.console_errors = []
        self.layout_flags = []

    def attach(self, page):
        def on_console(m):
            if m.type != "error":
                return
            loc = m.location()
            self.console_errors.append(
                f"[console] {m.text} @ {loc.get('url', '?')}:{loc.get('lineNumber', '?')}"
            )

        page.on("console", on_console)
        page.on(
            "pageerror",
            lambda e: self.console_errors.append(f"[pageerror] {e}"),
        )

    def flag(self, msg):
        self.layout_flags.append(msg)
        print(f"  !! {msg}")


def fail(msg):
    print(f"FAIL: {msg}", file=sys.stderr)
    raise AssertionError(msg)


def check(cond, msg):
    if not cond:
        fail(msg)
    print(f"  ok — {msg}")


def layout_diag(page):
    return page.evaluate(
        """() => {
            const main = document.querySelector('.main');
            const tc = document.querySelector('.tab-content');
            const doc = document.documentElement;
            return {
                mainOverflow: main ? main.scrollWidth - main.clientWidth : 0,
                docOverflow: doc.scrollWidth - window.innerWidth,
                tabText: tc ? tc.innerText.trim().length : -1,
                hasTabLoading: !!document.querySelector('.tab-loading'),
                hasTabContent: !!document.querySelector('.tab-content > div:not(.tab-loading)'),
            };
        }"""
    )


def audit_tab_layout(page, auditor, label):
    diag = layout_diag(page)
    if diag["hasTabLoading"]:
        auditor.flag(f"{label}: tab-loading fallback still visible")
    if not diag["hasTabContent"]:
        auditor.flag(f"{label}: no tab content node rendered")
    elif diag["tabText"] < 8:
        auditor.flag(f"{label}: tab content appears blank (text len={diag['tabText']})")
    if diag["mainOverflow"] > 1:
        auditor.flag(f"{label}: horizontal overflow in .main (+{diag['mainOverflow']}px)")
    if diag["docOverflow"] > 1:
        auditor.flag(f"{label}: document horizontal overflow (+{diag['docOverflow']}px)")
    for sel, min_count in CONTENT_MARKERS.get(label, []):
        if page.locator(sel).count() < min_count:
            auditor.flag(
                f"{label}: expected ≥{min_count} of '{sel}' but found "
                f"{page.locator(sel).count()}"
            )


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--port", type=int, default=3000)
    ap.add_argument("--browser", choices=["auto", "brave", "chromium"], default="auto")
    args = ap.parse_args()

    base = f"http://localhost:{args.port}"
    SHOT_DIR.mkdir(parents=True, exist_ok=True)

    brave = find_brave()
    if args.browser == "brave":
        if not brave:
            fail("--browser brave but no Brave executable found")
        executable_path, label = brave, f"Brave ({brave})"
    elif args.browser == "chromium":
        executable_path, label = None, "bundled Chromium"
    else:
        if brave:
            executable_path, label = brave, f"Brave ({brave})"
        else:
            executable_path, label = None, "bundled Chromium (Brave not found)"
    print(f"[browser] using {label}")

    from playwright.sync_api import sync_playwright

    auditor = Auditor()

    with MockBackend(), Server(args.port):
        with sync_playwright() as p:
            launch_kwargs = {"headless": True, "args": ["--no-sandbox"]}
            if executable_path:
                launch_kwargs["executable_path"] = executable_path
            browser = p.chromium.launch(**launch_kwargs)

            # ── LANDING (desktop) ────────────────────────────────────────
            print("\n== landing · desktop 1440x900 ==")
            page = browser.new_page(viewport={"width": 1440, "height": 900})
            auditor.attach(page)
            page.goto(base, wait_until="networkidle", timeout=60000)
            page.wait_for_timeout(2000)

            check(
                page.locator(".lp-hero-title").count() == 1,
                "hero title renders",
            )
            check(
                page.locator(".lp-hero-sub").count() >= 1,
                "hero subhead renders",
            )
            check(
                page.locator(".lp-hero-btn").count() == 1,
                "hero CTA renders",
            )
            diag = layout_diag(page)
            if diag["docOverflow"] > 1:
                auditor.flag(f"landing: document overflow +{diag['docOverflow']}px")
            page.screenshot(path=str(SHOT_DIR / "01-landing-hero-desktop.png"))
            # scroll through sections
            for name, sel in [
                ("features", ".lp-feature-card"),
                ("stats", ".lp-stat-item"),
                ("how", ".lp-how-step"),
            ]:
                page.evaluate(f"document.querySelector('{sel}').scrollIntoView()")
                page.wait_for_timeout(900)
                page.screenshot(path=str(SHOT_DIR / f"01b-landing-{name}.png"))
            page.close()

            # ── LANDING (mobile) ─────────────────────────────────────────
            print("\n== landing · mobile 390x844 ==")
            page = browser.new_page(viewport={"width": 390, "height": 844})
            auditor.attach(page)
            page.goto(base, wait_until="networkidle", timeout=60000)
            page.wait_for_timeout(2000)
            page.screenshot(path=str(SHOT_DIR / "02-landing-hero-mobile.png"))
            page.evaluate("document.querySelector('.lp-feature-card').scrollIntoView()")
            page.wait_for_timeout(900)
            page.screenshot(path=str(SHOT_DIR / "02b-landing-mobile-sections.png"))
            diag = layout_diag(page)
            if diag["docOverflow"] > 1:
                auditor.flag(f"landing-mobile: document overflow +{diag['docOverflow']}px")
            page.close()

            # ── DASHBOARD (hydrated via ?share=) ─────────────────────────
            print("\n== dashboard · all tabs ==")
            page = browser.new_page(viewport={"width": 1440, "height": 900})
            auditor.attach(page)
            page.goto(f"{base}/dashboard?share=visual-check", wait_until="networkidle", timeout=60000)
            # wait for the lazy dashboard chunk + summary fetch
            ok = wait_until(
                lambda: page.evaluate(
                    "() => !!document.querySelector('.command-bar') && "
                    "!document.querySelector('.app-loading')"
                ),
                timeout=20,
                label="dashboard",
            )
            check(ok, "dashboard shell rendered (lazy chunk loaded)")
            page.wait_for_timeout(1800)

            check(
                page.locator(".theme-btn").count() == 1,
                "command bar rendered",
            )
            check(
                page.locator(".nav-rail .nav-item").count() >= 11,
                "nav rail shows all tab items",
            )
            # Summary tab is the default after LOAD_SHARED_ANALYSIS
            check(
                page.locator(".health-card, .summary").count() >= 1,
                "summary tab content present",
            )
            # (full layout audit for Summary runs in the TABS loop below)
            page.screenshot(path=str(SHOT_DIR / "03-tab-01-summary.png"))

            for aria_label, name in TABS:
                nav = page.locator(f".nav-rail .nav-item[aria-label='{aria_label}']")
                nav.click()
                # wait for the tab's lazy chunk + render
                ok = wait_until(
                    lambda: page.evaluate(
                        "() => !document.querySelector('.tab-loading') && "
                        "!!document.querySelector('.tab-content > div:not(.tab-loading)')"
                    ),
                    timeout=20,
                    label=f"tab {aria_label}",
                )
                if not ok:
                    auditor.flag(f"{aria_label}: tab did not finish loading in 20s")
                page.wait_for_timeout(1200)
                audit_tab_layout(page, auditor, aria_label)
                page.screenshot(path=str(SHOT_DIR / f"{name}.png"))
                # also capture the expanded nav rail (labels visible)
                page.locator(".nav-rail").hover()
                page.wait_for_timeout(700)
                page.screenshot(path=str(SHOT_DIR / f"{name}-navlabels.png"))
                # nav labels must actually be visible while the rail is hovered
                label_opacity = page.evaluate(
                    "() => getComputedStyle(document.querySelector('.nav-label')).opacity"
                )
                if float(label_opacity) < 0.9:
                    auditor.flag(f"{aria_label}: nav labels not visible on hover (opacity={label_opacity})")
                page.mouse.move(720, 450)  # leave the rail so it collapses
                page.wait_for_timeout(500)
                print(f"  ✓ {aria_label}")

            # ── DASHBOARD (mobile, bottom nav) ────────────────────────────
            print("\n== dashboard · mobile 390x844 ==")
            m = browser.new_page(viewport={"width": 390, "height": 844})
            auditor.attach(m)
            m.goto(f"{base}/dashboard?share=visual-check", wait_until="networkidle", timeout=60000)
            wait_until(
                lambda: m.evaluate(
                    "() => !!document.querySelector('.command-bar')"
                ),
                timeout=20,
                label="dashboard-mobile",
            )
            m.wait_for_timeout(2000)
            audit_tab_layout(m, auditor, "Summary (mobile)")
            # bottom nav must not overlap content: .main needs bottom padding
            pad = m.evaluate(
                "() => parseFloat(getComputedStyle(document.querySelector('.main')).paddingBottom)"
            )
            if pad < 56:
                auditor.flag(f"mobile: .main bottom padding only {pad}px (bottom nav may cover content)")
            m.screenshot(path=str(SHOT_DIR / "04-dashboard-mobile-summary.png"))
            m.close()

            # ── REPORT ───────────────────────────────────────────────────
            print("\n== report ==")
            if auditor.console_errors:
                print("console errors:")
                for e in auditor.console_errors[:15]:
                    print(f"  {e}")
                print(f"  ({len(auditor.console_errors)} total)")
            else:
                print("  ok — no console/page errors")

            if auditor.layout_flags:
                print("layout flags:")
                for f_ in auditor.layout_flags:
                    print(f"  {f_}")
            else:
                print("  ok — no layout flags")

            browser.close()

    print(f"\nscreenshots → {SHOT_DIR}")
    n_errors = len(auditor.console_errors)
    n_flags = len(auditor.layout_flags)
    if n_errors:
        fail(f"{n_errors} console error(s)")
    if n_flags:
        print(f"\nVISUAL CHECK DONE — {n_flags} layout flag(s) to review (see above)")
        return 2
    print("\nALL VISUAL CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
