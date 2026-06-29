"""Channel probe for the M5 thinking bubbles UI — triggers the mock stream and capturePages the result
(runs on the hidden desktop, no disturbance; rendering via capturePage is faithful). Saves a crop of
the cat + bubble stack to LOOK at.

Run (background): py 2_Toolkit/.../run_background.py py scripts/probe_bubbles_ch.py
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


def wait_new(t, prev, timeout=6):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if count(t) > prev:
            return last_json(t)
        time.sleep(0.1)
    return None


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
        # dock right
        cx, cy = cat_center()
        d.cursor(cx, cy); wait_new("window:expand", count("window:expand"), 4); time.sleep(0.2)
        ds = count("drag:start"); d.mdown(); wait_new("drag:start", ds, 3)
        tx, ty = wa["x"] + wa["width"] - 30, wa["y"] + wa["height"] // 2
        d.drag([(cx + (tx - cx) * i / 12, cy + (ty - cy) * i / 12) for i in range(1, 13)])
        sd = count("snap:done"); d.mup(); wait_new("snap:done", sd, 6); time.sleep(0.6)
        # move cursor away so the panel collapses (bubbles show on their own)
        d.cursor(wa["x"] + 80, wa["y"] + 80); time.sleep(0.6)

        # trigger the mock thinking stream (fast pacing)
        bp = count("think:bubble")
        d._cmd("think 320")
        # let ~7 bubbles stream in
        t0 = time.time()
        while count("think:bubble") - bp < 7 and time.time() - t0 < 8:
            time.sleep(0.2)
        n = count("think:bubble") - bp
        check("bubbles streamed", n >= 7, f"{n} bubbles")
        time.sleep(0.4)

        # capturePage (full window) + crop to the cat + bubble area to LOOK at
        img = d.shot()  # PIL Image, full window
        W, H = img.size
        # cat is centred; bubbles are left of it (right dock). Crop the centre-left block.
        crop = img.crop((int(W * 0.18), int(H * 0.30), int(W * 0.50), int(H * 0.58)))
        crop.save(OUT / "bubbles.png")
        img.crop((int(W * 0.30), int(H * 0.40), int(W * 0.46), int(H * 0.50))).save(OUT / "cat_area.png")
        check("captured", True, f"win={W}x{H}")

        npass = sum(1 for _, ok, _ in results if ok)
        print(f"\n[BUBBLES] {npass}/{len(results)} passed")
        return 0 if npass == len(results) else 2
    finally:
        d.close()
        g.kill(proc)


if __name__ == "__main__":
    raise SystemExit(main())
