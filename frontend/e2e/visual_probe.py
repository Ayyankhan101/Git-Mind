#!/usr/bin/env python3
"""
Visual probe: floating shapes (SummaryTab) + sidebar collapse (drawer).

Serves the production build, fakes the backend (HTTP routes + a scripted
WebSocket that replays an analysis), then asserts in a real browser:

  1. Analysis completes -> Summary tab renders with 4 visible float shapes.
  2. GSAP is actually animating them (computed transform changes over time).
  3. Float shape 3D geometry is real (perspective, preserve-3d, painted faces).
  4. stat-trend color modifiers (--danger / --ok) differ from base.
  5. Sidebar sections collapse/expand on header click (display:none + chevron).
  6. Saved-views toggle shows/hides its body.
  7. Workspace switcher dropdown anchors to the switcher (position:relative).
  8. No console/page errors.
"""
import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from smoke_test import Server, check  # noqa: E402

REPOS = {
    "repos": [
        {
            "url": "https://github.com/octocat/Hello-World",
            "full_name": "octocat/Hello-World",
            "name": "Hello-World",
            "description": "My first repository on GitHub",
            "language": "Python",
            "stars": 1234,
            "pushed_at": "2026-06-01T10:00:00Z",
            "updated_at": "2026-06-01T10:00:00Z",
            "private": False,
            "fork": False,
        },
        {
            "url": "https://github.com/octocat/Spoon-Knife",
            "full_name": "octocat/Spoon-Knife",
            "name": "Spoon-Knife",
            "description": "This repo is for demonstration purposes only.",
            "language": "JavaScript",
            "stars": 9876,
            "pushed_at": "2026-05-20T08:30:00Z",
            "updated_at": "2026-05-20T08:30:00Z",
            "private": False,
            "fork": True,
        },
        {
            "url": "https://github.com/octocat/private-repo",
            "full_name": "octocat/private-repo",
            "name": "private-repo",
            "description": "A private repo",
            "language": "Go",
            "stars": 0,
            "pushed_at": "2026-04-10T12:00:00Z",
            "updated_at": "2026-04-10T12:00:00Z",
            "private": True,
            "fork": False,
        },
    ]
}

# Replayed over the fake WebSocket once the app sends its analyze payload.
WS_MESSAGES = [
    {
        "health": {
            "grade": "B",
            "score": 82,
            "breakdown": {
                "security": 80,
                "documentation": 75,
                "api_coverage": 90,
                "dependency_freshness": 60,
                "code_quality": 85,
            },
        },
        "security_findings": [
            {
                "id": "f1",
                "severity": "critical",
                "rule": "sql-injection",
                "title": "SQL injection in query",
                "file": "app/db.py",
                "line": 42,
            },
            {
                "id": "f2",
                "severity": "high",
                "rule": "hardcoded-secret",
                "title": "Hardcoded API key",
                "file": "app/config.py",
                "line": 7,
            },
            {
                "id": "f3",
                "severity": "low",
                "rule": "deprecated-api",
                "title": "Deprecated API usage",
                "file": "app/main.py",
                "line": 3,
            },
        ],
        "api_docs": [{"name": "GET /api/v1/users", "method": "GET"}],
    },
    {"done": True},
]

INIT_SCRIPT = """
// Seed recent-history so the RECENT sidebar section renders.
try {
  localStorage.setItem("gitmind_history", JSON.stringify([
    {
      url: "https://github.com/octocat/Hello-World",
      name: "Hello-World",
      ts: 1750000000000,
    },
  ]));
} catch (e) {}
window.__gmWsMsgs = %s;
window.WebSocket = class {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    setTimeout(() => {
      this.readyState = 1;
      if (this.onopen) this.onopen();
    }, 80);
  }
  send() {
    const msgs = window.__gmWsMsgs;
    msgs.forEach((m, i) => {
      setTimeout(() => {
        if (this.onmessage) this.onmessage({ data: JSON.stringify(m) });
      }, 200 + i * 250);
    });
    setTimeout(() => {
      if (this.onclose) this.onclose({ wasClean: true });
    }, 200 + msgs.length * 250 + 60);
  }
  close() {}
};
""" % json.dumps(WS_MESSAGES)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--port", type=int, default=3141)
    ap.add_argument("--shot-dir", default="/tmp/gitmind-visual")
    args = ap.parse_args()

    shot_dir = Path(args.shot_dir)
    shot_dir.mkdir(parents=True, exist_ok=True)
    base = f"http://localhost:{args.port}"

    from playwright.sync_api import sync_playwright

    console_errors = []

    with Server(args.port):
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
            page = browser.new_page(viewport={"width": 1440, "height": 900})
            page.on(
                "console",
                lambda m: console_errors.append(m.text)
                if m.type == "error"
                else None,
            )
            page.on("pageerror", lambda e: console_errors.append(f"PAGEERROR: {e}"))

            def json_route(route, payload):
                route.fulfill(
                    status=200,
                    content_type="application/json",
                    body=json.dumps(payload),
                )

            page.route("**/repos/*", lambda r: json_route(r, REPOS))
            page.route(
                "**/summary",
                lambda r: json_route(
                    r,
                    {"summary": "Mocked executive summary for the visual probe."},
                ),
            )
            page.route("**/monitor/status", lambda r: json_route(r, {"repos": []}))

            page.add_init_script(INIT_SCRIPT)
            page.goto(base + "/dashboard", wait_until="networkidle", timeout=60000)
            page.wait_for_timeout(1500)

            print("\n== load users (fake API) ==")
            user_input = page.locator('input[aria-label="GitHub username"]')
            user_input.fill("octocat")
            user_input.press("Enter")
            page.wait_for_timeout(1200)
            user_input.fill("torvalds")
            user_input.press("Enter")
            page.wait_for_timeout(1200)
            n_repos = page.locator(".repo-drawer .repo-card").count()
            check(n_repos >= 1, f"repos loaded into sidebar ({n_repos} cards)")

            # ── Open the drawer ────────────────────────────────────────────
            if page.locator(".repo-drawer.open").count() == 0:
                page.locator('button[aria-label="Repositories"]').first.click()
                page.wait_for_timeout(700)
            check(
                page.locator(".repo-drawer.open").count() == 1,
                "sidebar drawer opens from nav rail",
            )

            # ── Workspace switcher anchoring ───────────────────────────────
            print("\n== workspace switcher ==")
            ws_pos = page.evaluate(
                """() => {
                    const el = document.querySelector('.workspace-switcher');
                    return el ? getComputedStyle(el).position : null;
                }"""
            )
            check(ws_pos == "relative", f".workspace-switcher anchors dropdown (position={ws_pos})")
            page.locator(".ws-btn").first.click()
            page.wait_for_timeout(400)
            pop_pos = page.evaluate(
                """() => {
                    const el = document.querySelector('.ws-pop');
                    return el ? getComputedStyle(el).position : null;
                }"""
            )
            check(pop_pos == "absolute", f".ws-pop is absolutely positioned (got {pop_pos})")
            check(page.locator(".ws-pop").is_visible(), "workspace dropdown is visible")
            page.screenshot(path=str(shot_dir / "04-workspace-pop.png"))
            page.mouse.click(700, 450)  # dismiss
            page.wait_for_timeout(300)

            # ── Sidebar collapse ───────────────────────────────────────────
            print("\n== sidebar collapse ==")
            sections = page.locator(".repo-drawer .sb-section")
            n_sec = sections.count()
            check(n_sec >= 2, f"two collapsible sections (RECENT + REPOSITORIES, got {n_sec})")

            def section_state(idx):
                return page.evaluate(
                    """(i) => {
                        const sec = document.querySelectorAll('.repo-drawer .sb-section')[i];
                        const body = sec.querySelector('.sb-section-body');
                        const chv = sec.querySelector('.chevron');
                        const cs = getComputedStyle(body);
                        return {
                            collapsed: sec.classList.contains('collapsed'),
                            bodyDisplay: cs.display,
                            chevron: chv ? getComputedStyle(chv).transform : null,
                            expanded: sec.querySelector('.sb-section-header').getAttribute('aria-expanded'),
                        };
                    }""",
                    idx,
                )

            # REPOSITORIES section = last .sb-section
            repo_sec = n_sec - 1
            st = section_state(repo_sec)
            check(
                not st["collapsed"] and st["bodyDisplay"] != "none",
                "repositories section starts expanded (body visible)",
            )
            page.locator(".repo-drawer .sb-section").nth(repo_sec).locator(
                ".sb-section-header"
            ).click()
            page.wait_for_timeout(450)
            st = section_state(repo_sec)
            check(
                st["collapsed"] and st["bodyDisplay"] == "none",
                "click collapses section (collapsed class + body display:none)",
            )
            # rotate(-90deg) computes to this exact matrix
            check(
                st["chevron"] == "matrix(0, -1, 1, 0, 0, 0)",
                f"chevron rotates -90deg on collapse (got {st['chevron']})",
            )
            page.screenshot(path=str(shot_dir / "03-repos-collapsed.png"))
            page.locator(".repo-drawer .sb-section").nth(repo_sec).locator(
                ".sb-section-header"
            ).click()
            page.wait_for_timeout(450)
            st = section_state(repo_sec)
            check(
                not st["collapsed"] and st["bodyDisplay"] != "none",
                "second click re-expands section",
            )

            # RECENT section too
            rec_sec = 0
            st = section_state(rec_sec)
            check(st["bodyDisplay"] != "none", "recent section starts expanded")
            page.locator(".repo-drawer .sb-section").nth(rec_sec).locator(
                ".sb-section-header"
            ).click()
            page.wait_for_timeout(450)
            st = section_state(rec_sec)
            check(
                st["collapsed"] and st["bodyDisplay"] == "none",
                "recent section collapses on click",
            )
            page.locator(".repo-drawer .sb-section").nth(rec_sec).locator(
                ".sb-section-header"
            ).click()
            page.wait_for_timeout(450)

            # Saved views toggle
            sv_header = page.locator(
                ".repo-drawer .sb-section-header", has_text="SAVED VIEWS"
            )
            check(sv_header.count() == 1, "saved views header present")
            sv_header.click()
            page.wait_for_timeout(400)
            check(
                page.locator(".repo-drawer .saved-views-body").count() == 1
                and page.locator(".repo-drawer .saved-views-body").is_visible(),
                "saved views body shows on toggle",
            )
            sv_header.click()
            page.wait_for_timeout(400)
            check(
                page.locator(".repo-drawer .saved-views-body").count() == 0,
                "saved views body hides on second toggle",
            )
            page.screenshot(path=str(shot_dir / "02-sidebar-open.png"))

            # ── Trigger analysis by selecting a repo ───────────────────────
            print("\n== analysis (fake WebSocket) ==")
            page.locator(".repo-drawer .repo-card").first.click()
            page.wait_for_timeout(2500)
            # Summary tab renders the float shapes once analyzed
            shapes = page.locator(".float-shapes-container .float-shape")
            ok = False
            deadline = time.time() + 10
            while time.time() < deadline:
                if shapes.count() == 4 and page.locator(
                    ".float-shapes-container"
                ).is_visible():
                    ok = True
                    break
                page.wait_for_timeout(500)
            check(ok, "summary tab renders 4 float shapes after analysis")
            page.screenshot(path=str(shot_dir / "01-summary-float-shapes.png"))

            # ── Float shapes: real geometry ────────────────────────────────
            print("\n== float shapes ==")
            geom = page.evaluate(
                """() => {
                    const c = document.querySelector('.float-shapes-container');
                    const cs = getComputedStyle(c);
                    const shapes = [...document.querySelectorAll('.float-shape')];
                    return {
                        container: {
                            position: cs.position,
                            perspective: cs.perspective,
                            zIndex: cs.zIndex,
                            overflow: cs.overflow,
                        },
                        shapes: shapes.map((s) => {
                            const r = s.getBoundingClientRect();
                            const sscs = getComputedStyle(s);
                            const inner = s.querySelector('.float-shape-inner');
                            const ics = inner ? getComputedStyle(inner) : null;
                            const face = s.querySelector('.float-face');
                            const fcs = face ? getComputedStyle(face) : null;
                            const facePainted = fcs &&
                                (fcs.borderTopWidth !== '0px' ||
                                 fcs.backgroundColor !== 'rgba(0, 0, 0, 0)' ||
                                 fcs.backgroundImage !== 'none');
                            // Face-less shapes (ring) paint on .float-shape-inner
                            const innerPainted = ics &&
                                (ics.borderTopWidth !== '0px' ||
                                 ics.boxShadow !== 'none' ||
                                 ics.backgroundImage !== 'none' ||
                                 ics.backgroundColor !== 'rgba(0, 0, 0, 0)');
                            return {
                                w: Math.round(r.width), h: Math.round(r.height),
                                transformStyle: sscs.transformStyle,
                                innerPreserve3d: ics ? ics.transformStyle : null,
                                faceW: fcs ? Math.round(face.getBoundingClientRect().width) : null,
                                painted: fcs ? facePainted : innerPainted,
                            };
                        }),
                    };
                }"""
            )
            c = geom["container"]
            check(
                c["position"] == "absolute" and c["perspective"] == "900px",
                f"container anchored with perspective 900px (pos={c['position']})",
            )
            check(
                c["overflow"] == "hidden",
                "shapes clipped to the summary area (overflow hidden)",
            )
            for i, s in enumerate(geom["shapes"]):
                check(
                    s["w"] > 5 and s["h"] > 5,
                    f"shape {i} has real size ({s['w']}x{s['h']}px)",
                )
                check(
                    s["transformStyle"] == "preserve-3d" and s["innerPreserve3d"] == "preserve-3d",
                    f"shape {i} uses preserve-3d chain (outer={s['transformStyle']}, inner={s['innerPreserve3d']})",
                )
                check(s["painted"], f"shape {i} faces/ring are painted")
            check(
                geom["shapes"][1]["faceW"] and geom["shapes"][1]["faceW"] > 5,
                "cube faces have real size",
            )

            # ── GSAP animation actually running ────────────────────────────
            t1 = page.evaluate(
                """() => {
                    const el = document.querySelector('.float-shape');
                    return getComputedStyle(el).transform;
                }"""
            )
            page.wait_for_timeout(600)
            t2 = page.evaluate(
                """() => {
                    const el = document.querySelector('.float-shape');
                    return getComputedStyle(el).transform;
                }"""
            )
            check(
                t1 != t2 and "matrix" in t1,
                f"GSAP animates shapes (transform changed: {t1[:28]}… -> {t2[:28]}…)",
            )

            # ── stat-trend color modifiers ─────────────────────────────────
            colors = page.evaluate(
                """() => {
                    const g = (sel) => {
                        const el = document.querySelector(sel);
                        return el ? getComputedStyle(el).color : null;
                    };
                    return {
                        base: g('.stat-grid .stat-trend'),
                        danger: g('.stat-trend--danger'),
                        ok: g('.stat-trend--ok'),
                    };
                }"""
            )
            check(
                colors["danger"] and colors["danger"] != colors["base"],
                f"stat-trend--danger differs from base ({colors['base']} vs {colors['danger']})",
            )
            check(
                colors["ok"] and colors["ok"] != colors["base"],
                f"stat-trend--ok differs from base ({colors['base']} vs {colors['ok']})",
            )

            # HealthCard glow backdrop paints
            glow = page.evaluate(
                """() => {
                    const el = document.querySelector('.health-card-glow');
                    if (!el) return null;
                    const cs = getComputedStyle(el);
                    return {
                        position: cs.position,
                        bg: cs.backgroundImage,
                        w: Math.round(el.getBoundingClientRect().width),
                    };
                }"""
            )
            check(
                glow
                and glow["position"] == "absolute"
                and "radial-gradient" in glow["bg"]
                and glow["w"] > 0,
                f"health card glow backdrop is painted (pos={glow and glow['position']}, bg={glow and glow['bg'][:48]!r}, w={glow and glow['w']})",
            )

            # ── Console errors ─────────────────────────────────────────────
            print("\n== console ==")
            if console_errors:
                print("console errors:\n  " + "\n  ".join(console_errors[:10]))
                check(False, f"{len(console_errors)} console error(s) detected")
            check(True, "no console/page errors")

            browser.close()

    print("\nALL VISUAL CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
