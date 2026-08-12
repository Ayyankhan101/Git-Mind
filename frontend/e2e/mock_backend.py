#!/usr/bin/env python3
"""Tiny mock backend for frontend visual checks.

Serves the analysis fixture on GET /analysis/<id> so the SPA hydrates the
full dashboard via the `?share=` flow, plus stubs for the few other
endpoints the dashboard calls on mount (summary, monitor status).

Run:  python3 e2e/mock_backend.py [--port 8002]
"""

import argparse
import json
import os
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
FIXTURE = json.loads((HERE / "fixtures" / "analysis_fixture.json").read_text())

ALLOW_ORIGIN = "*"


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", ALLOW_ORIGIN)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-GH-Token")
        self.send_header("Access-Control-Max-Age", "86400")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        if os.environ.get("MOCK_VERBOSE"):
            sys.stderr.write("MOCKREQ " + (fmt % args) + "\n")

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", ALLOW_ORIGIN)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-GH-Token")
        self.send_header("Access-Control-Max-Age", "86400")
        self.end_headers()

    def do_GET(self):
        path = self.path.split("?")[0]
        if re.match(r"^/analysis/[^/]+$", path):
            return self._send(200, FIXTURE)
        if path == "/monitor/status":
            return self._send(200, {"repos": []})
        if path == "/health":
            # "mock" marker lets visual_check verify a reused port is really us
            return self._send(200, {"status": "ok", "mock": True})
        self._send(404, {"error": f"mock: no GET route for {path}"})

    def do_POST(self):
        path = self.path.split("?")[0]
        if path == "/summary":
            return self._send(
                200,
                {
                    "summary": (
                        "This is a mock executive summary for the sample application. "
                        "The service is a FastAPI + React monorepo with a Postgres "
                        "database and a Redis-backed worker queue. Overall health is B "
                        "with 5 security findings and 7 API endpoints discovered. "
                        "Maintenance debt is concentrated in the backend proxy layer."
                    )
                },
            )
        if path == "/monitor/subscribe":
            return self._send(200, {"ok": True, "monitor_id": "mock-1"})
        if path == "/fix":
            return self._send(
                200,
                {
                    "title": "Mock fix",
                    "fix": "TODO: replace with a real LLM-generated patch.",
                },
            )
        # Interactive endpoints — return minimal 200s so any accidental click
        # during a visual pass doesn't render an error state.
        if path in ("/fix/pr", "/incident-report", "/org-audit"):
            return self._send(200, {"ok": True})
        if path == "/pr-list/x/x" or path.startswith("/pr-list/"):
            return self._send(200, {"prs": []})
        self._send(404, {"error": f"mock: no POST route for {path}"})

    def do_DELETE(self):
        self._send(200, {"ok": True})


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--port", type=int, default=8002)
    args = ap.parse_args()
    srv = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"[mock-backend] listening on http://localhost:{args.port}", flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
