"""
End-to-end smoke test for the PDF export + share-link flows.

Serves the production build on :3000 (backend calls are mocked at :8002 via
Playwright route interception), then drives the browser:

  1. Share-link success  -> dashboard hydrates -> Export report downloads a PDF
  2. Share-link 404      -> "could not open analysis" overlay + Retry
  3. Share-link 401      -> unlock overlay; entering a token retries and succeeds
  4. Share-link 429      -> rate-limit overlay
  5. Network down        -> backend-unreachable overlay
  6. SummaryTab export   -> "Export summary PDF" downloads a PDF
  7. CrisisChat export   -> WS-driven incident -> report -> Export PDF downloads
  8. Share button        -> canonical `${origin}/?share=<id>` link on clipboard

Every download is verified: filename pattern + %PDF magic bytes + embedded
Geist font names (proves the font pipeline is live in the built bundle).

Usage:
    cd frontend && npm run build   # once
    python3 -m http.server 3000 --directory build &   # or any static host
    python3 e2e/smoke_pdf_share.py
"""
import json
import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "http://localhost:8002"
HERE = Path(__file__).resolve().parent

# Shared analysis fixture (also used by mock_backend.py / visual checks).
# Normalize api_docs `path` -> `route` so the PDF builder renders route cells.
ANALYSIS_PAYLOAD = json.loads(
    (HERE / "fixtures" / "analysis_fixture.json").read_text()
)
for doc in ANALYSIS_PAYLOAD.get("api_docs") or []:
    if "route" not in doc and "path" in doc:
        doc["route"] = doc["path"]

SUMMARY_PAYLOAD = {
    "summary": "Sample app is generally healthy but has critical injection risks.",
    "stats": {"commits": 128, "authors": 23, "loc": 48210, "deployments": 156},
}

INCIDENT_PAYLOAD = {
    "report": (
        "# Incident Report\n\n"
        "A hardcoded API secret was responsibly disclosed and rotated in "
        "40 minutes. No customer data was exposed. The engineering team "
        "added regression coverage and a secrets scan gate."
    )
}


def serve_analysis(route):
    """Serve the shared-analysis endpoint with per-share-id behavior."""
    share_id = route.request.url.split("/")[-1]
    if share_id == "missing":
        route.fulfill(status=404, content_type="application/json",
                      body='{"detail": "Analysis not found"}')
    elif share_id == "locked":
        route.fulfill(status=401, content_type="application/json",
                      body='{"detail": "GitHub token required"}')
    elif share_id == "busy":
        route.fulfill(status=429, content_type="application/json",
                      body='{"detail": "Rate limit exceeded"}')
    else:
        route.fulfill(status=200, content_type="application/json",
                      body=json.dumps(ANALYSIS_PAYLOAD))


def mock_backend(page, *, locked_then_success=False):
    """Install backend mocks. `locked_then_success` flips 401 -> 200 on 2nd call."""
    calls = {"n": 0}

    def on_request(route):
        url = route.request.url
        method = route.request.method
        if url.startswith(f"{BASE}/analysis/"):
            if locked_then_success:
                calls["n"] += 1
                if calls["n"] >= 2:
                    route.fulfill(status=200, content_type="application/json",
                                  body=json.dumps(ANALYSIS_PAYLOAD))
                    return
            serve_analysis(route)
        elif url.startswith(f"{BASE}/summary"):
            route.fulfill(status=200, content_type="application/json",
                          body=json.dumps(SUMMARY_PAYLOAD))
        elif url.startswith(f"{BASE}/incident-report"):
            route.fulfill(status=200, content_type="application/json",
                          body=json.dumps(INCIDENT_PAYLOAD))
        elif url.startswith(f"{BASE}/monitor/status"):
            route.fulfill(status=200, content_type="application/json",
                          body='{"repos": []}')
        else:
            print(f"  [mock] unhandled {method} {url}")
            route.fulfill(status=404, content_type="application/json", body="{}")

    page.route(f"{BASE}/**", on_request)


def mock_crisis_ws(page):
    """Mock the crisis WebSocket: a couple of agent messages then 'resolved'."""
    def on_ws(ws):
        def on_message(msg):
            ws.send(json.dumps({
                "kind": "message", "agent": "CEO",
                "content": "Engineering, what is the exposure window?",
            }))
            ws.send(json.dumps({
                "kind": "message", "agent": "Engineering",
                "content": "We patched the leak; rotating keys now.",
            }))
            ws.send(json.dumps({"kind": "resolved"}))

        ws.on_message(on_message)

    page.route_web_socket("**/ws/crisis", on_ws)


def check_pdf(download, label):
    """Verify filename, %PDF magic bytes, and embedded Geist fonts."""
    assert download.suggested_filename.endswith(".pdf"), (
        f"{label}: bad filename {download.suggested_filename}"
    )
    path = download.path()
    with open(path, "rb") as f:
        head = f.read(5)
        rest = f.read()
    assert head == b"%PDF-", f"{label}: missing %PDF magic (got {head!r})"
    # Font descriptors carry the font names; base64 font data is embedded too.
    joined = rest.decode("latin-1", errors="ignore")
    assert "Geist" in joined, f"{label}: Geist font not embedded in PDF"
    print(f"  PASS {label}: {download.suggested_filename} "
          f"({len(rest) + 5} bytes, Geist embedded)")


def run_suite(page):
    results = []

    # WS route must be registered before any navigation for Playwright to pick
    # up the crisis socket created later in the session.
    mock_crisis_ws(page)

    # ── 1. Share success -> dashboard -> Export report ────────────────────────
    print("[1] Share-link success -> export analysis PDF")
    mock_backend(page)
    page.goto("http://localhost:3000/?share=demo123")
    page.wait_for_load_state("networkidle")
    page.wait_for_selector("text=gitmind/sample-app", timeout=15_000)
    export_btn = page.get_by_role("button", name="Export report")
    export_btn.wait_for(state="visible", timeout=10_000)
    with page.expect_download(timeout=30_000) as dl:
        export_btn.click()
    check_pdf(dl.value, "analysis PDF")
    results.append("analysis export")

    # ── 6. SummaryTab export ─────────────────────────────────────────────────
    print("[6] Summary tab -> export summary PDF")
    page.wait_for_load_state("networkidle")
    summary_btn = page.get_by_role("button", name="Export summary PDF")
    summary_btn.wait_for(state="visible", timeout=15_000)
    with page.expect_download(timeout=30_000) as dl:
        summary_btn.click()
    check_pdf(dl.value, "summary PDF")
    results.append("summary export")

    # ── 8. Share button -> canonical link on clipboard ────────────────────────
    print("[8] Share button copies canonical /?share= link")
    share_btn = page.get_by_role("button", name="Share analysis")
    share_btn.wait_for(state="visible", timeout=10_000)
    share_btn.click()
    page.wait_for_timeout(500)
    clip = page.evaluate("navigator.clipboard.readText()")
    assert re.fullmatch(
        r"http://localhost:3000/\?share=[a-f0-9-]{36}", clip
    ), f"share link not canonical: {clip!r}"
    print(f"  PASS canonical link: {clip}")
    results.append("canonical share link")

    # ── 7. CrisisChat incident export ─────────────────────────────────────────
    print("[7] Crisis room -> incident report -> export PDF")
    # The finding row is a collapsible card; expand the critical finding to
    # reveal its actions, then open the crisis simulation.
    page.get_by_role("button", name="Security").first.click(timeout=10_000)
    row = page.get_by_role("button", name=re.compile(r"G401", re.I)).first
    row.wait_for(state="visible", timeout=10_000)
    row.click()
    page.get_by_role("button", name="Simulate Crisis").first.click(timeout=10_000)
    # WS mock resolves immediately -> "Generate incident report" appears
    gen_btn = page.get_by_role("button", name="Generate incident report")
    gen_btn.wait_for(state="visible", timeout=15_000)
    gen_btn.click()
    export_incident = page.get_by_role("button", name="Export incident report PDF")
    export_incident.wait_for(state="visible", timeout=15_000)
    with page.expect_download(timeout=30_000) as dl:
        export_incident.click()
    check_pdf(dl.value, "incident PDF")
    results.append("incident export")
    page.keyboard.press("Escape")  # CrisisChat closes on Escape

    # ── 2. Share 404 ──────────────────────────────────────────────────────────
    print("[2] Share-link 404 overlay")
    page.goto("http://localhost:3000/?share=missing")
    page.wait_for_selector("text=could not open analysis", timeout=15_000)
    assert page.get_by_role("button", name="Retry").is_visible()
    print("  PASS 404 overlay + Retry")
    results.append("share 404")

    # ── 4. Share 429 ──────────────────────────────────────────────────────────
    print("[4] Share-link 429 overlay")
    page.goto("http://localhost:3000/?share=busy")
    page.wait_for_selector("text=Too many requests", timeout=15_000)
    print("  PASS 429 overlay")
    results.append("share 429")

    # ── 5. Network down ───────────────────────────────────────────────────────
    print("[5] Share-link network down")
    page.unroute(f"{BASE}/**")
    page.route(f"{BASE}/**", lambda r: r.abort())
    page.goto("http://localhost:3000/?share=demo123")
    page.wait_for_selector("text=/backend/i", timeout=15_000)
    print("  PASS network-down overlay")
    results.append("share network")
    page.unroute(f"{BASE}/**")

    # ── 3. Share 401 -> unlock with token -> retry succeeds ───────────────────
    print("[3] Share-link 401 -> unlock -> retry succeeds")
    mock_backend(page, locked_then_success=True)
    page.goto("http://localhost:3000/?share=locked")
    unlock_btn = page.get_by_role("button", name="Unlock")
    unlock_btn.wait_for(state="visible", timeout=15_000)
    token_input = page.get_by_role("textbox", name="GitHub token")
    token_input.fill("ghp_smoke_test_token_1234567890")
    unlock_btn.click()
    page.wait_for_selector("text=gitmind/sample-app", timeout=15_000)
    print("  PASS 401 unlock -> retry loaded dashboard")
    results.append("share 401 unlock")

    return results


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            permissions=["clipboard-read", "clipboard-write"],
        )
        page = context.new_page()
        results = run_suite(page)
        browser.close()
    print(f"\nSMOKE PASS — {len(results)}/8 flows verified: {', '.join(results)}")


if __name__ == "__main__":
    main()
