"""Channel probe for the M5 auto-think SCHEDULER — two launches:
  Phase A (default, no env)      → the gate is OFF: NO schedule, NO fire even with a todo present (the
                                   safety guarantee — the cat never auto-spends a Claude call by default).
  Phase B (MIMIR_THINK_AUTO=1 +  → enabled + fast cadence + fake claude: it schedules, fires on an
           MIMIR_FAKE_CLAUDE=1)    incomplete todo, runs the pipeline, costs $0.

Run (background): py 2_Toolkit/.../run_background.py py scripts/probe_think_sched_ch.py
"""
from __future__ import annotations
import json
import os
import re
import sys
import time
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
HARNESS = (PROJECT.parents[2] / "2_Toolkit/Harness/gui_visual_probe").resolve()
sys.path.insert(0, str(HARNESS))
import gui_probe as g  # noqa: E402
from test_driver import TestDriver  # noqa: E402

LOG = PROJECT / "mimir-debug.log"
results: list[tuple[str, bool, str]] = []


def lines():
    return LOG.read_text(encoding="utf-8", errors="replace").splitlines() if LOG.exists() else []


def count(t):
    return sum(1 for ln in lines() if t in ln)


def last_json(t):
    f = None
    for ln in lines():
        if t in ln:
            m = re.search(r"\{.*\}", ln)
            if m:
                try:
                    f = json.loads(m.group(0))
                except Exception:
                    pass
    return f


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(("PASS " if ok else "FAIL "), name, ("- " + detail) if detail else "")


def boot(env_extra):
    if LOG.exists():
        LOG.unlink()
    pf = PROJECT / "state" / "test_control_port"
    if pf.exists():
        pf.unlink()
    g.free_port(5173)
    os.environ.pop("MIMIR_THINK_AUTO", None)
    os.environ["MIMIR_TEST_CONTROL"] = "1"
    for k, v in env_extra.items():
        os.environ[k] = v
    proc = g.launch("npm run dev", cwd=PROJECT)
    d = TestDriver(PROJECT)
    win = None
    for _ in range(120):
        time.sleep(0.5)
        win = last_json("win:created")
        if win and pf.exists():
            break
    return proc, d, bool(win)


def main():
    # ---- Phase A: default OFF ----
    proc, d, ok = boot({})
    try:
        ok = ok and d.wait_connect(20)
        check("[A] boots (default/off)", ok)
        if d.sock:
            d._cmd("addtodo 季度報告")     # a candidate exists, so 'no todos' isn't why it stays quiet
            time.sleep(7)                  # well past the fast check interval
            sched = last_json("think:sched-start")
            check("[A] scheduler started", bool(sched), json.dumps(sched, ensure_ascii=False) if sched else "")
            check("[A] auto OFF by default", bool(sched) and sched.get("autoEnabled") is False, f"autoEnabled={sched.get('autoEnabled') if sched else '?'}")
            check("[A] did NOT schedule", count("think:sched ") == 0 and count('"nextInMs"') == 0, f"sched={count(chr(34)+'nextInMs'+chr(34))}")
            check("[A] did NOT fire", count("think:sched-fire") == 0 and count("think:run-start") == 0, "no auto spend")
    finally:
        d.close(); g.kill(proc); time.sleep(1.5)

    # ---- Phase B: enabled + fast + fake claude ----
    proc, d, ok = boot({"MIMIR_THINK_AUTO": "1", "MIMIR_FAKE_CLAUDE": "1"})
    try:
        ok = ok and d.wait_connect(20)
        check("[B] boots (auto on)", ok)
        if d.sock:
            sched = last_json("think:sched-start")
            check("[B] auto ON", bool(sched) and sched.get("autoEnabled") is True, f"autoEnabled={sched.get('autoEnabled') if sched else '?'}")
            d._cmd("addtodo 把季度報告做出來")
            # wait for a scheduled fire + the pipeline to complete
            t0 = time.time()
            while last_json("think:run-done") is None and time.time() - t0 < 20:
                time.sleep(0.3)
            fire = last_json("think:sched-fire")
            done = last_json("think:run-done")
            check("[B] scheduled a think", count('"nextInMs"') >= 1, f"sched={count(chr(34)+'nextInMs'+chr(34))}")
            check("[B] fired on a todo", bool(fire), json.dumps(fire, ensure_ascii=False) if fire else "no fire")
            check("[B] pipeline ran", bool(done) and done.get("nBubbles", 0) >= 8, f"nBubbles={done.get('nBubbles') if done else '?'}")
            check("[B] $0 (fake)", bool(done) and float(done.get("costUsd", -1)) == 0.0, f"cost={done.get('costUsd') if done else '?'}")
            # bubbles stream AFTER run-done, one per pace interval — wait for them to accumulate
            t0 = time.time()
            while count("think:bubble") < 7 and time.time() - t0 < 8:
                time.sleep(0.3)
            check("[B] bubbles streamed", count("think:bubble") >= 7, f"{count('think:bubble')} bubbles")
    finally:
        d.close(); g.kill(proc)

    npass = sum(1 for _, ok, _ in results if ok)
    print(f"\n[SCHED] {npass}/{len(results)} passed")
    return 0 if npass == len(results) else 2


if __name__ == "__main__":
    raise SystemExit(main())
