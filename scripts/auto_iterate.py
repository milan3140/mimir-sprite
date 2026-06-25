"""Overnight self-iteration loop (runs in BACKGROUND, non-blocking to the main agent).

Each cycle: typecheck -> (if needed) ponytail-fix -> probe_suite -> (if failures) ponytail-fix ->
typecheck-GATE -> commit on branch `auto/overnight` (NEVER master). Emits a heartbeat signal to
state/auto_status.json every phase so the main agent can read a tiny file instead of re-ingesting
probe output. Safety: branch-only, typecheck-gated commits, capped cycles + wall-clock, stop when
no progress, full log. User reviews the branch in the morning.
"""
import json
import os
import subprocess
import time
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
PONYTAIL = PROJECT.parents[2] / "2_Toolkit" / "Output" / "1D" / "Code" / "ponytail"
STATE = PROJECT / "state"
STATE.mkdir(exist_ok=True)
STATUS = STATE / "auto_status.json"
LOGF = STATE / "auto_iterate.log"
REPORT = STATE / "probe_report.json"
BRANCH = "auto/overnight"
MAX_CYCLES = 6
MAX_SECONDS = 3 * 3600
PY = "py"
START = time.time()


def log(m: str) -> None:
    line = f"[{time.strftime('%H:%M:%S')}] {m}"
    with open(LOGF, "a", encoding="utf-8") as f:
        f.write(line + "\n")
    print(line, flush=True)


def beat(cycle: int, phase: str, extra: dict | None = None) -> None:
    d = {"ts": time.strftime("%Y-%m-%d %H:%M:%S"), "cycle": cycle, "phase": phase,
         "elapsed_min": round((time.time() - START) / 60, 1)}
    if extra:
        d.update(extra)
    STATUS.write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")


def run(cmd, env_extra=None, timeout=600, scrub=()):
    e = dict(os.environ)
    e["PYTHONIOENCODING"] = "utf-8"
    e.update(env_extra or {})
    for k in scrub:
        e.pop(k, None)
    return subprocess.run(cmd, cwd=str(PROJECT), env=e, shell=isinstance(cmd, str),
                          capture_output=True, text=True, timeout=timeout)


def git(*a):
    return run(["git", *a], timeout=120)


def typecheck():
    r = run("npm run typecheck", timeout=180)
    return r.returncode == 0, (r.stdout + r.stderr)[-1500:]


def probe():
    if REPORT.exists():
        REPORT.unlink()
    run([PY, "scripts/probe_suite.py"], timeout=420)
    try:
        return json.loads(REPORT.read_text(encoding="utf-8"))
    except Exception as ex:
        return {"pass": 0, "total": 0, "failures": [{"name": "probe-did-not-report", "detail": str(ex)}]}


def ponytail_fix(brief: str) -> None:
    # ELECTRON_RUN_AS_NODE/CLAUDECODE must be scrubbed so the child Claude + any Electron behave.
    subprocess.run([PY, "ponytail_orchestrator.py", "continue", str(PROJECT), brief],
                   cwd=str(PONYTAIL),
                   env={**{k: v for k, v in os.environ.items()
                           if k not in ("CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT", "ELECTRON_RUN_AS_NODE")},
                        "PYTHONIOENCODING": "utf-8"},
                   capture_output=True, text=True, timeout=1500)


def main() -> None:
    log("=== auto_iterate START ===")
    git("checkout", "-B", BRANCH)
    prev_key = None
    stuck = 0
    for cyc in range(1, MAX_CYCLES + 1):
        if time.time() - START > MAX_SECONDS:
            log("wall-clock cap reached"); beat(cyc, "time-cap"); break

        beat(cyc, "typecheck")
        ok, tc = typecheck()
        if not ok:
            log(f"cycle {cyc}: typecheck FAIL -> fixing")
            beat(cyc, "fix-typecheck", {"typecheck": False})
            ponytail_fix("`npm run typecheck` fails. Fix ALL TypeScript errors without changing "
                         "behavior. Keep it minimal. Errors:\n" + tc)
            ok2, _ = typecheck()
            if ok2:
                git("add", "-A"); git("commit", "-q", "-m", f"auto: fix typecheck (cycle {cyc})")
                log("typecheck fixed + committed")
            else:
                git("checkout", "--", "."); log("typecheck fix failed -> reverted")
            continue

        beat(cyc, "probe", {"typecheck": True})
        rep = probe()
        fails = rep.get("failures", [])
        names = [f["name"] for f in fails]
        beat(cyc, "probed", {"typecheck": True, "pass": rep.get("pass"),
                             "total": rep.get("total"), "failures": names})
        log(f"cycle {cyc}: probe {rep.get('pass')}/{rep.get('total')}  fails={names}")

        if not fails:
            log("ALL GREEN — done"); beat(cyc, "done-green", {"pass": rep.get("pass"), "total": rep.get("total")})
            break

        key = tuple(sorted(names))
        stuck = stuck + 1 if key == prev_key else 0
        prev_key = key
        if stuck >= 2:
            log("no progress for 3 cycles — stopping"); beat(cyc, "stuck-stop", {"failures": list(key)}); break

        beat(cyc, "fixing", {"failures": names})
        ponytail_fix(
            "The Mimir-Sprite self-test probe reports these failures. Diagnose from the code "
            "(electron/main/windowManager.ts, clickThrough.ts; src/App.tsx, src/components/TodoPanel.tsx) "
            "and docs/. Note some failures may be in the PROBE itself (scripts/probe_suite.py grab/timing) "
            "rather than the app — judge which, and fix the right one. Keep `npm run typecheck` clean and "
            "DO NOT break drag / four-side snap / click-through / window size-pinning / the expand geometry. "
            "Do NOT launch the GUI. Failures:\n" + json.dumps(fails, ensure_ascii=False, indent=2))
        ok3, _ = typecheck()
        if ok3:
            git("add", "-A"); git("commit", "-q", "-m", f"auto: fix attempt {list(key)} (cycle {cyc})")
            log(f"cycle {cyc}: fix attempt committed")
        else:
            git("checkout", "--", "."); log(f"cycle {cyc}: fix broke typecheck -> reverted")

    log("=== auto_iterate END ===")
    beat(-1, "end")


if __name__ == "__main__":
    try:
        main()
    except Exception as ex:
        log(f"FATAL: {ex}")
        beat(-1, "fatal", {"error": str(ex)})
