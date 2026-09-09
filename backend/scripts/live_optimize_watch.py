"""Background watcher: retry `live_dspy_e2e.py --optimize <agent>` until the
Groq daily window has refilled enough for a full compile.

The on-demand window (100K TPD) refills slowly (~70-150 tok/min, sometimes
faster) and a full ``auto="light"`` compile needs tens of thousands of tokens
(baseline eval over the gold valset + bootstrap + candidate search). There is
no usage API — the only reliable window gauge is a real agent call, whose TPD
refusal message carries the exact ``Used`` figure (probes with a tiny prompt
are misleading: Groq bills prompt + actual output, not ``max_tokens``).

So this watcher simply re-runs the e2e on a poll interval and parses the log:

- ``Used`` < threshold ⇒ still capped; note avail and wait.
- ``promoted`` / ``optimize: live_ok`` ⇒ pipeline completed end-to-end (a
  promotion, or the gate rejecting — both are valid confirmations); exit 0.
- Any other terminal error ⇒ report and exit non-zero.

Each attempt burns only the few hundred tokens of the baseline before the cap
bites, which is negligible next to the ~35K the compile needs.

Usage:

    nohup venv/bin/python live_optimize_watch.py --agent security \\
        --poll 600 --log .optimize_watch.log &

    tail -f .optimize_watch.log
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
import time
from pathlib import Path

# This script lives in backend/scripts/ and drives live_dspy_e2e.py, which
# expects to run with the backend root as its working directory.
_BACKEND = Path(__file__).resolve().parent.parent

_TPD_LIMIT = 100_000
_TARGET_FREE = 35_000  # baseline (~8K) + bootstrap + candidate search


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--agent", required=True)
    ap.add_argument("--poll", type=int, default=600, help="seconds between e2e attempts")
    ap.add_argument(
        "--max-attempts",
        type=int,
        default=120,
        help="max e2e attempts before giving up",
    )
    ap.add_argument(
        "--target-free",
        type=int,
        default=_TARGET_FREE,
        help="min free tokens before expecting success",
    )
    ap.add_argument("--log", default=_BACKEND / ".optimize_watch.log")
    args = ap.parse_args()

    log = Path(args.log)
    log.parent.mkdir(exist_ok=True)
    e2e_log = log.with_name(log.stem + ".e2e.log")

    def note(msg: str) -> None:
        line = f"{time.strftime('%Y-%m-%d %H:%M:%S')} {msg}"
        with open(log, "a", encoding="utf-8") as f:
            f.write(line + "\n")
        print(line, flush=True)

    cmd = [sys.executable, str(Path(__file__).resolve().parent / "live_dspy_e2e.py"), "--optimize", args.agent]
    note(f"watcher started: agent={args.agent} poll={args.poll}s target_free={args.target_free}")

    for attempt in range(1, args.max_attempts + 1):
        note(f"[{attempt}] attempting e2e ($ {' '.join(cmd)})")
        with open(e2e_log, "w", encoding="utf-8") as f:
            proc = subprocess.run(cmd, cwd=str(_BACKEND), stdout=f, stderr=subprocess.STDOUT)

        text = e2e_log.read_text(encoding="utf-8", errors="replace")
        used_values = sorted({int(m) for m in re.findall(r"Used (\d+)", text)}, reverse=True)
        used = used_values[0] if used_values else None

        if "promoted" in text or "optimize: live_ok" in text:
            note(f"[{attempt}] SUCCESS — e2e completed (promoted or gate-rejected); rc={proc.returncode}")
            note("--- tail of e2e log ---")
            note("\n".join(text.splitlines()[-15:]))
            return 0

        if used is not None:
            avail = _TPD_LIMIT - used
            wait = re.findall(r"try again in ([\d.]+)m", text)
            note(
                f"[{attempt}] still capped: Used={used}, avail≈{avail} "
                f"(retry-in {wait[0] if wait else '?'}m) — waiting {args.poll}s"
            )
            if avail >= args.target_free:
                note(f"[{attempt}] NOTE: avail {avail} ≥ target {args.target_free} but e2e failed — inspect {e2e_log}")
        else:
            note(
                f"[{attempt}] e2e failed without a TPD Used figure "
                f"(rc={proc.returncode}) — inspect {e2e_log}; waiting {args.poll}s"
            )
        time.sleep(args.poll)

    note("watcher gave up — max attempts reached")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
