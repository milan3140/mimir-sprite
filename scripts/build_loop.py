"""Local CLI build loop — drives the Notebook feature build via headless `claude -p --resume`,
plan-guided, one slice per iteration, typecheck-gated, committing on feat/notebook. No MCP / no cron:
this python loop IS the scheduler. Heartbeat -> state/build_status.json; full log -> state/build_loop.log.

Safety: branch-only (the agent is told NEVER to touch main), per-iter timeout, max iters + wall-clock +
a total-cost ceiling, stop when the plan's PROGRESS shows S6 done or no progress for 2 iters.

Run (from Mimir-Sprite/):  py scripts/build_loop.py
Env: BUILD_MODEL (default claude-sonnet-4-6), BUILD_MAX_USD (default 30), BUILD_MAX_ITERS (default 14).
"""
import json
import os
import re
import subprocess
import time
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
PLAN = PROJECT / "_NOTEBOOK_8H_PLAN.md"
STATE = PROJECT / "state"; STATE.mkdir(exist_ok=True)
STATUS = STATE / "build_status.json"
LOGF = STATE / "build_loop.log"
SESSION_FILE = STATE / "build_session"

MODEL = os.environ.get("BUILD_MODEL", "claude-sonnet-4-6")
MAX_USD = float(os.environ.get("BUILD_MAX_USD", "30"))
MAX_ITERS = int(os.environ.get("BUILD_MAX_ITERS", "14"))
MAX_SECONDS = 8 * 3600
START = time.time()

BRIEF = """Continue the Mimir-Sprite NOTEBOOK feature build. You are already on branch feat/notebook (S0 types + S1 store are committed). Read _NOTEBOOK_8H_PLAN.md fully — the PROGRESS line, the design decisions D1-D8, and the slice specs S0-S6 — and read CLAUDE.md for the working discipline.

Do the NEXT undone slice ONLY (one slice per run), then stop:
- Implement by editing files. Reuse the existing patterns (store CRUD already exists; claudeRunner.spawnClaude is the hardened Claude spawn to reuse for chat turns — strip CLAUDECODE, --disallowedTools Bash,Edit,Write,NotebookEdit, prompt via stdin; FAKE mode MIMIR_FAKE_CLAUDE=1 for no-spend tests).
- Run `npm run typecheck` — it MUST pass before committing; fix every error.
- Verify with the MATCHED modality: logic/data/IPC -> a FAKE-claude check or a small node/probe script (MIMIR_FAKE_CLAUDE=1, no real spend); a notebook floating window or any visual -> launch + screenshot via the gui_visual_probe harness (run_isolated.py, user is asleep so taking the screen is fine); geometry -> re-run scripts/probe_suite.py and confirm it stays 29/29 (NO regression to the cat/panel).
- Commit the slice: `git add -A && git commit -m "Mimir-Sprite notebook <slice>: ..."` (footer: Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>). NEVER checkout/commit main.
- Update the PROGRESS line in _NOTEBOOK_8H_PLAN.md: mark the finished slice [x].

Rules: do exactly ONE slice, then end your turn. Don't ask questions (the user is asleep) — make + document sensible decisions. If a symptom survives >=2 fixes, question the architecture. If blocked on a slice, write the blocker into the PROGRESS line and do the next independent slice instead."""

ENV = {k: v for k, v in os.environ.items()
       if k not in ("CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT", "CLAUDE_CODE_SSE_PORT")}
ENV["PYTHONIOENCODING"] = "utf-8"


def log(m):
    line = f"[{time.strftime('%H:%M:%S')}] {m}"
    with open(LOGF, "a", encoding="utf-8") as f:
        f.write(line + "\n")
    print(line, flush=True)


def progress_done():
    try:
        txt = PLAN.read_text(encoding="utf-8")
    except Exception:
        return False
    tail = txt[txt.rfind("## PROGRESS"):] if "## PROGRESS" in txt else txt
    return "[x] S6" in tail


def beat(d):
    d = {"ts": time.strftime("%Y-%m-%d %H:%M:%S"), "elapsed_min": round((time.time() - START) / 60, 1), **d}
    STATUS.write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")


def main():
    log(f"=== build_loop START (model={MODEL}, cap=${MAX_USD}, maxIters={MAX_ITERS}) ===")
    session = SESSION_FILE.read_text(encoding="utf-8").strip() if SESSION_FILE.exists() else ""
    spent = 0.0
    prev_done = None
    stuck = 0
    for i in range(1, MAX_ITERS + 1):
        if time.time() - START > MAX_SECONDS:
            log("wall-clock cap"); beat({"phase": "time-cap", "iter": i}); break
        if spent >= MAX_USD:
            log(f"cost cap reached (${spent:.2f})"); beat({"phase": "cost-cap", "spentUsd": round(spent, 2)}); break
        if progress_done():
            log("PROGRESS shows S6 done — finished"); beat({"phase": "done", "iter": i}); break

        beat({"phase": "building", "iter": i, "spentUsd": round(spent, 2)})
        args = ["claude", "-p", "--output-format", "json", "--model", MODEL,
                "--max-turns", "140", "--dangerously-skip-permissions"]
        if session:
            args += ["--resume", session]
        log(f"iter {i}: launching build agent" + (f" (resume {session[:8]})" if session else " (new session)"))
        try:
            r = subprocess.run(args, input=BRIEF, cwd=str(PROJECT), env=ENV,
                               capture_output=True, text=True, timeout=2400, shell=True)
        except subprocess.TimeoutExpired:
            log(f"iter {i}: TIMEOUT (40min) — continuing"); continue
        try:
            j = json.loads(r.stdout)
            session = j.get("session_id") or session
            SESSION_FILE.write_text(session, encoding="utf-8")
            cost = float(j.get("total_cost_usd", 0)); spent += cost
            log(f"iter {i}: done, cost ${cost:.2f} (total ${spent:.2f}); result: {str(j.get('result',''))[:160]}")
        except Exception as ex:
            log(f"iter {i}: could not parse output ({ex}); stderr: {r.stderr[:200]}")

        done = progress_done()
        # crude no-progress guard: same PROGRESS done-state + nothing newly committed
        key = PLAN.read_text(encoding="utf-8")[-400:] if PLAN.exists() else ""
        stuck = stuck + 1 if key == prev_done else 0
        prev_done = key
        if stuck >= 2:
            log("no PROGRESS change for 2 iters — stopping"); beat({"phase": "stuck", "iter": i}); break

    log("=== build_loop END ===")
    beat({"phase": "end", "spentUsd": round(spent, 2)})


if __name__ == "__main__":
    main()
