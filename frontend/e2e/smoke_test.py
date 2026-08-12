#!/usr/bin/env python3
"""
GitMind frontend smoke test (Playwright).

Verifies the freebuff rebrand renders correctly in a real browser:

  1. Landing page loads with the freebuff hero (gradient title, pill CTA).
  2. Dark-mode tokens apply (canvas #090a0f, electric-blue buttons).
  3. Theme switcher shows "Freebuff" as the default theme.
  4. Theme switching works (Matrix -> green canvas, back to Freebuff).
  5. Daylight (light mode) renders the light slate canvas.
  6. No console/page errors on landing or dashboard.

Browser resolution (first match wins):
  --browser brave     -> Brave executable only (fail if not found)
  --browser chromium  -> Playwright bundled Chromium
  --browser auto      -> Brave if installed, else bundled Chromium  [default]

Server:
  The script spawns `npx serve -s build` on the given port if the port is
  not already serving, and tears it down afterwards. Build first:

      cd frontend && npm run build && python e2e/smoke_test.py

Exit code 0 on success, 1 on failure. Screenshots land in /tmp/gitmind-smoke/.
"""

import argparse
import os
import socket
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
FRONTEND = HERE.parent

BRAVE_PATHS = [
    os.environ.get("BRAVE_PATH"),
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",  # macOS
    "/usr/bin/brave-browser",  # Linux (deb)
    "/usr/bin/brave",  # Linux (snap)
    "/opt/brave.com/brave/brave-browser",  # Linux (rpm)
    r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe",  # Windows
]


def find_brave():
    for p in BRAVE_PATHS:
        if p and Path(p).is_file():
            return p
    return None


def port_open(host, port, timeout=2):
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def wait_until(pred, timeout, interval=0.5, label="condition"):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if pred():
            return True
        time.sleep(interval)
    return False


class Server:
    """Spawns `npx serve -s build` unless something already listens on the port."""

    def __init__(self, port):
        self.port = port
        self.proc = None

    def __enter__(self):
        if port_open("127.0.0.1", self.port):
            print(f"[server] port {self.port} already serving — reusing")
            return self
        build_dir = FRONTEND / "build"
        if not build_dir.is_dir():
            print("error: frontend/build missing. Run `npm run build` first.", file=sys.stderr)
            sys.exit(1)
        print("[server] starting `npx serve -s build`...")
        self.proc = subprocess.Popen(
            ["npx", "serve", "-s", "build", "-l", str(self.port)],
            cwd=FRONTEND,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        if not wait_until(lambda: port_open("127.0.0.1", self.port), timeout=45, label="server"):
            print("error: server did not start in time", file=sys.stderr)
            self.proc.kill()
            sys.exit(1)
        print(f"[server] ready on http://localhost:{self.port}")
        return self

    def __exit__(self, *exc):
        if self.proc:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.proc.kill()
            print("[server] stopped")


def grab_style(page, selector, props):
    return page.evaluate(
        """([sel, props]) => {
            const el = document.querySelector(sel);
            if (!el) return null;
            const cs = getComputedStyle(el);
            const out = {};
            for (const p of props) out[p] = cs.getPropertyValue(p);
            return out;
        }""",
        [selector, props],
    )


def fail(msg):
    print(f"FAIL: {msg}", file=sys.stderr)
    raise AssertionError(msg)


def check(cond, msg):
    if not cond:
        fail(msg)
    print(f"  ok — {msg}")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--port", type=int, default=3000)
    ap.add_argument("--browser", choices=["auto", "brave", "chromium"], default="auto")
    ap.add_argument("--screenshot-dir", default="/tmp/gitmind-smoke")
    args = ap.parse_args()

    base = f"http://localhost:{args.port}"
    shot_dir = Path(args.screenshot_dir)
    shot_dir.mkdir(parents=True, exist_ok=True)

    # ---- Browser resolution -------------------------------------------------
    brave = find_brave()
    if args.browser == "brave":
        if not brave:
            fail("--browser brave but no Brave executable found")
        executable_path, label = brave, f"Brave ({brave})"
    elif args.browser == "chromium":
        executable_path, label = None, "bundled Chromium"
    else:  # auto
        if brave:
            executable_path, label = brave, f"Brave ({brave})"
        else:
            executable_path, label = None, "bundled Chromium (Brave not found)"
    print(f"[browser] using {label}")

    from playwright.sync_api import sync_playwright

    console_errors = []

    with Server(args.port):
        with sync_playwright() as p:
            launch_kwargs = {"headless": True, "args": ["--no-sandbox"]}
            if executable_path:
                launch_kwargs["executable_path"] = executable_path
            browser = p.chromium.launch(**launch_kwargs)
            page = browser.new_page(viewport={"width": 1440, "height": 900})
            page.on(
                "console",
                lambda m: console_errors.append(m.text)
                if m.type == "error"
                else None,
            )
            page.on("pageerror", lambda e: console_errors.append(f"PAGEERROR: {e}"))

            # ── Landing page ────────────────────────────────────────────────
            print("\n== landing page ==")
            page.goto(base, wait_until="networkidle", timeout=60000)
            page.wait_for_timeout(2000)

            check(
                page.locator(".lp-hero-title").count() == 1,
                "hero title renders",
            )
            check(
                page.locator(".lp-hero-btn").count() == 1,
                "hero CTA button renders",
            )
            body = grab_style(page, "body", ["background-color", "color", "font-family"])
            check(
                body and body["background-color"] == "rgb(9, 10, 15)",
                f"dark canvas #090a0f (got {body and body['background-color']})",
            )
            check(
                body and "Inter" in (body.get("font-family") or ""),
                "Inter font loaded",
            )
            title = grab_style(page, ".lp-title-accent", ["background-image"])
            check(
                title and title["background-image"] and "linear-gradient" in title["background-image"],
                "hero title uses gradient text",
            )
            cta = grab_style(page, ".lp-hero-btn", ["background-image", "border-radius"])
            check(
                cta and "linear-gradient" in cta["background-image"],
                "hero CTA uses blue->violet gradient",
            )
            check(
                cta and cta["border-radius"] == "999px",
                "hero CTA is a pill button",
            )
            page.screenshot(path=str(shot_dir / "01-landing.png"))

            # ── Below-fold sections scroll + reveal ────────────────────────
            # Regression guard: the landing page must scroll with the window
            # and every section (features/stats/how) must fade in from
            # opacity 0 via the lp-visible reveal when scrolled into view.
            print("\n== below-fold sections ==")
            check(
                page.evaluate("document.documentElement.scrollHeight") > 900,
                "document is taller than the viewport",
            )

            def section_reveals(sel, label):
                page.evaluate(f"document.querySelector('{sel}').scrollIntoView()")
                page.wait_for_timeout(1200)
                revealed = page.evaluate(
                    """(sel) => {
                        const el = document.querySelector(sel);
                        return !!el && el.classList.contains('lp-visible') &&
                               parseFloat(getComputedStyle(el).opacity) > 0.9;
                    }""",
                    sel,
                )
                check(revealed, label)

            section_reveals(".lp-feature-card", "feature cards reveal (lp-visible, opacity 1)")
            section_reveals(".lp-stat-item", "stat items reveal (lp-visible, opacity 1)")
            section_reveals(".lp-how-step", "how-it-works steps reveal (lp-visible, opacity 1)")
            page.screenshot(path=str(shot_dir / "01b-sections.png"))

            # ── Nav anchors scroll to sections ──────────────────────────────
            # Lenis anchors: true should scroll each nav link's target into
            # view with the 80px scroll-margin offset respected.
            print("\n== nav anchor navigation ==")
            for name, sel in [
                ("Features", "#features"),
                ("Stats", "#stats"),
                ("How it works", "#how-it-works"),
            ]:
                page.evaluate("window.scrollTo(0, 0)")
                page.wait_for_timeout(600)
                page.get_by_role("link", name=name).first.click()
                # Lenis duration is 1.2s; poll until the target position is
                # stable across two samples (robust against slow CI where rAF
                # may be throttled). Stops at the true resting position.
                stable = False
                prev = -1
                deadline = time.time() + 8
                while time.time() < deadline:
                    cur = page.evaluate(
                        """(sel) => Math.round(document.querySelector(sel).getBoundingClientRect().top)""",
                        sel,
                    )
                    if abs(cur - prev) <= 1:
                        stable = True
                        break
                    prev = cur
                    time.sleep(0.15)
                landed = page.evaluate(
                    """(sel) => Math.round(document.querySelector(sel).getBoundingClientRect().top)""",
                    sel,
                )
                check(stable and 0 <= landed <= 90, f"'{name}' anchor lands near section (top={landed})")

            # ── Dashboard + theme switcher ──────────────────────────────────
            print("\n== dashboard + theme switcher ==")
            page.goto(base + "/dashboard", wait_until="networkidle", timeout=60000)
            page.wait_for_timeout(2000)

            check(
                page.locator(".theme-btn").count() == 1,
                "theme switcher button renders",
            )
            check(
                "Freebuff" in page.locator(".theme-btn").first.inner_text(),
                "default theme labelled Freebuff",
            )

            page.locator(".theme-btn").first.click()
            page.wait_for_timeout(400)
            opts = page.locator(".theme-opt-name").all_inner_texts()
            check("Freebuff" in opts and "Daylight" in opts, "theme list includes Freebuff + Daylight")

            # Switch to Matrix
            page.locator(".theme-opt", has_text="Matrix").first.click()
            page.wait_for_timeout(500)
            matrix_bg = grab_style(page, "body", ["background-color"])
            check(
                matrix_bg and matrix_bg["background-color"] == "rgb(10, 15, 10)",
                f"Matrix theme switches canvas (got {matrix_bg and matrix_bg['background-color']})",
            )

            # Switch to Daylight (light mode)
            page.locator(".theme-btn").first.click()
            page.wait_for_timeout(300)
            page.locator(".theme-opt", has_text="Daylight").first.click()
            page.wait_for_timeout(500)
            light_bg = grab_style(page, "body", ["background-color"])
            check(
                light_bg and light_bg["background-color"] == "rgb(248, 250, 252)",
                f"Daylight renders light canvas #f8fafc (got {light_bg and light_bg['background-color']})",
            )
            page.screenshot(path=str(shot_dir / "02-daylight-dashboard.png"))

            # Switch back to Freebuff
            page.locator(".theme-btn").first.click()
            page.wait_for_timeout(300)
            page.locator(".theme-opt", has_text="Freebuff").first.click()
            page.wait_for_timeout(500)
            dark_bg = grab_style(page, "body", ["background-color"])
            check(
                dark_bg and dark_bg["background-color"] == "rgb(9, 10, 15)",
                "switching back to Freebuff restores dark canvas",
            )

            # ── Console errors ──────────────────────────────────────────────
            print("\n== console ==")
            if console_errors:
                print("console errors:\n  " + "\n  ".join(console_errors[:10]))
                fail(f"{len(console_errors)} console error(s) detected")
            check(True, "no console/page errors")

            browser.close()

    print("\nALL SMOKE CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
