"""⚠️ MECHANISM SMOKE TEST ONLY — NOT a faithful grab test. This drives the app via injected input,
which BYPASSES the OS click-through (setIgnoreMouseEvents) and GetCursorPos. So it proves the channel
works, but it would PASS even if a real mouse couldn't grab the cat. For a FAITHFUL grab test (real OS
mouse through real click-through) use scripts/probe_grab.py via run_isolated.py. See testControl.ts.

Channel-driven grab probe — driven through the in-app TEST-CONTROL channel (injected cursor, no OS
mouse) and capturePage (no screen grab).

Run (foreground): py scripts/probe_grab_ch.py
Run (background):  py 2_Toolkit/.../run_background.py py scripts/probe_grab_ch.py
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


def count(tag):
    return sum(1 for ln in lines() if tag in ln)


def last_json(tag):
    found = None
    for ln in lines():
        if tag in ln:
            m = re.search(r"\{.*\}", ln)
            if m:
                try:
                    found = json.loads(m.group(0))
                except Exception:
                    pass
    return found


def wait_new(tag, prev, timeout=6):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if count(tag) > prev:
            return last_json(tag)
        time.sleep(0.1)
    return None


def workarea():
    d = last_json("displays:startup")
    return d["displays"][0]["workArea"] if d else {"x": 0, "y": 0, "width": 1536, "height": 864}


def cat_center():
    cs = last_json("cat:screen")
    if cs:
        return cs["x"] + cs["w"] / 2, cs["y"] + cs["h"] / 2
    return 768, 432


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
        check("app boots + control channel", bool(win) and d.wait_connect(20))
        if not d.sock:
            return 1
        wa = workarea()
        time.sleep(1.6)  # initial dock

        tp = {
            "right": (wa["x"] + wa["width"] - 30, wa["y"] + wa["height"] // 2),
            "left": (wa["x"] + 30, wa["y"] + wa["height"] // 2),
            "top": (wa["x"] + wa["width"] // 2, wa["y"] + 30),
            "bottom": (wa["x"] + wa["width"] // 2, wa["y"] + wa["height"] - 30),
        }
        for edge in ["right", "top", "left", "bottom"]:
            # dock to edge: hover cat -> expand, mdown -> drag:start, drag to edge, mup -> snap
            cx, cy = cat_center()
            d.cursor(cx, cy)
            wait_new("window:expand", count("window:expand"), timeout=4)
            time.sleep(0.2)
            ds = count("drag:start")
            d.mdown()
            if not wait_new("drag:start", ds, timeout=3):
                check(f"[{edge}] dock grab", False)
                d.mup()
                continue
            tx, ty = tp[edge]
            steps = [(cx + (tx - cx) * i / 12, cy + (ty - cy) * i / 12) for i in range(1, 13)]
            sd = count("snap:done")
            d.drag(steps)
            d.mup()
            wait_new("snap:done", sd, timeout=6)
            time.sleep(0.7)

            # DIRECT hover-grab (the user-reported bug path): cursor onto cat, mdown -> drag:start
            cx, cy = cat_center()
            d.cursor(cx, cy)
            wait_new("window:expand", count("window:expand"), timeout=4)
            time.sleep(0.3)
            ds = count("drag:start")
            d.mdown()
            ok = wait_new("drag:start", ds, timeout=2.5) is not None
            d.mup()
            check(f"[{edge}] DIRECT hover-grab (no OS mouse)", ok)
            time.sleep(0.6)

        npass = sum(1 for _, ok, _ in results if ok)
        print(f"\n[GRAB-CH] {npass}/{len(results)} passed")
        return 0 if npass == len(results) else 2
    finally:
        d.close()
        g.kill(proc)


if __name__ == "__main__":
    raise SystemExit(main())
