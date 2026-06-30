"""Channel probe for M5 Slice 2 — the REAL ClaudeRunner pipeline (runThinking -> parseBubbles -> stream),
exercised with MIMIR_FAKE_CLAUDE=1 so NO real Claude call is spent. Verifies: runner runs, fake tagged
output parses to bubbles (0 parse-skips), the bubbles stream as think:bubble events and render, cost=0.

Run (background): py 2_Toolkit/.../run_background.py py scripts/probe_think_ch.py
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
OUT = PROJECT / "_bubble_shots"
OUT.mkdir(exist_ok=True)
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


def cat_center():
    cs = last_json("cat:screen")
    return (cs["x"] + cs["w"] / 2, cs["y"] + cs["h"] / 2) if cs else (768, 432)


def workarea():
    d = last_json("displays:startup")
    return d["displays"][0]["workArea"] if d else {"x": 0, "y": 0, "width": 1536, "height": 864}


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(("PASS " if ok else "FAIL "), name, ("- " + detail) if detail else "")


def main():
    if LOG.exists():
        LOG.unlink()
    pf = PROJECT / "state" / "test_control_port"
    if pf.exists():
        pf.unlink()
    g.free_port(5173)
    os.environ["MIMIR_TEST_CONTROL"] = "1"
    os.environ["MIMIR_FAKE_CLAUDE"] = "1"        # <- no real Claude call
    proc = g.launch("npm run dev", cwd=PROJECT)
    d = TestDriver(PROJECT)
    try:
        win = None
        for _ in range(120):
            time.sleep(0.5)
            win = last_json("win:created")
            if win and pf.exists():
                break
        check("app boots + channel", bool(win) and d.wait_connect(20))
        if not d.sock:
            return 1
        wa = workarea()
        time.sleep(1.6)
        # dock right, then move cursor away so the panel collapses (bubbles show on their own)
        cx, cy = cat_center()
        d.cursor(cx, cy); time.sleep(0.3)
        d.mdown(); time.sleep(0.2)
        tx, ty = wa["x"] + wa["width"] - 30, wa["y"] + wa["height"] // 2
        d.drag([(cx + (tx - cx) * i / 12, cy + (ty - cy) * i / 12) for i in range(1, 13)])
        sd = count("snap:done"); d.mup()
        t0 = time.time()
        while count("snap:done") == sd and time.time() - t0 < 6:
            time.sleep(0.1)
        d.cursor(wa["x"] + 80, wa["y"] + 80); time.sleep(0.6)

        # trigger the REAL pipeline (fake claude)
        bp = count("think:bubble")
        d._cmd("realthink 把季度報告做出來")

        # wait for the runner to finish + bubbles to stream
        t0 = time.time()
        while last_json("think:run-done") is None and time.time() - t0 < 12:
            time.sleep(0.2)
        done = last_json("think:run-done")
        check("runner completed", bool(done), json.dumps(done, ensure_ascii=False) if done else "no run-done")
        check("parsed to bubbles", bool(done) and done.get("nBubbles", 0) >= 9, f"nBubbles={done.get('nBubbles') if done else '?'}")
        # first bubble must be the task-definition ([任務] …) — context-grounded thinking opens by naming the task
        first_b = None
        for ln in lines():
            if "think:bubble" in ln:
                mm = re.search(r"\{.*\}", ln)
                if mm:
                    try:
                        first_b = json.loads(mm.group(0)); break
                    except Exception:
                        pass
        check("first bubble is [任務] task definition", bool(first_b) and first_b.get("idx") == 0 and first_b.get("tag") == "任務", str(first_b))
        check("no real spend (cost 0)", bool(done) and float(done.get("costUsd", -1)) == 0.0, f"costUsd={done.get('costUsd') if done else '?'}")
        check("no parse-skips", count("think:parse-skip") == 0, f"{count('think:parse-skip')} skipped")
        check("no runner error", count("think:run-error") == 0 and count("think:retry") == 0)

        # bubbles actually streamed to the renderer
        t0 = time.time()
        while count("think:bubble") - bp < 7 and time.time() - t0 < 8:
            time.sleep(0.2)
        n = count("think:bubble") - bp
        check("bubbles streamed", n >= 7, f"{n} streamed")
        time.sleep(0.4)

        img = d.shot()
        W, H = img.size
        img.crop((int(W * 0.16), int(H * 0.28), int(W * 0.50), int(H * 0.60))).save(OUT / "think_real.png")
        check("captured", True, f"win={W}x{H}")

        npass = sum(1 for _, ok, _ in results if ok)
        print(f"\n[THINK] {npass}/{len(results)} passed")
        return 0 if npass == len(results) else 2
    finally:
        d.close()
        g.kill(proc)


if __name__ == "__main__":
    raise SystemExit(main())
