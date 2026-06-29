"""Channel probe for the panel work-area clamp (user bug: a large panel docked near the top spills off
the top of the screen). Docks the cat near the top-right, sets a MAX panel, expands, and asserts the
panel's SCREEN rect (logged by main, using the SAME panelClamp the renderer uses) stays within the work
area — and that the clamp actually engaged (offset != 0), proving it WOULD have overflowed without it.

Run: py scripts/probe_panel_clamp_ch.py   (or via run_background)
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

        # max panel, then dock the cat near the TOP-RIGHT corner (right edge, near top)
        d._cmd("setpanel 560 720")
        time.sleep(0.3)
        cx, cy = cat_center()
        d.cursor(cx, cy); time.sleep(0.3)
        d.mdown(); time.sleep(0.2)
        tx, ty = wa["x"] + wa["width"] - 25, wa["y"] + 90    # near top-right
        d.drag([(cx + (tx - cx) * i / 12, cy + (ty - cy) * i / 12) for i in range(1, 13)])
        sd = count("snap:done"); d.mup()
        t0 = time.time()
        while count("snap:done") == sd and time.time() - t0 < 6:
            time.sleep(0.1)
        time.sleep(0.6)

        # expand on the cat at its new (near-top) position
        cx2, cy2 = cat_center()
        ep = count("panel:clamp")
        d.cursor(cx2, cy2)
        t0 = time.time()
        while count("panel:clamp") == ep and time.time() - t0 < 5:
            time.sleep(0.1)
        c = last_json("panel:clamp")
        check("expanded near top (clamp logged)", bool(c), json.dumps(c, ensure_ascii=False) if c else "no clamp log")
        if not c:
            return 2

        tol = 2
        check("clamp ENGAGED (would have overflowed)", abs(c["off"]["dy"]) > 30, f"off.dy={c['off']['dy']}")
        check("panel top within work area", c["screenTop"] >= c["waY"] - tol, f"top={c['screenTop']} waY={c['waY']}")
        check("panel bottom within work area", c["screenBottom"] <= c["waBottom"] + tol, f"bottom={c['screenBottom']} waBottom={c['waBottom']}")
        check("panel left within work area", c["screenLeft"] >= c["waX"] - tol, f"left={c['screenLeft']} waX={c['waX']}")
        check("panel right within work area", c["screenRight"] <= c["waRight"] + tol, f"right={c['screenRight']} waRight={c['waRight']}")

        npass = sum(1 for _, ok, _ in results if ok)
        print(f"\n[CLAMP] {npass}/{len(results)} passed")
        return 0 if npass == len(results) else 2
    finally:
        d.close()
        g.kill(proc)


if __name__ == "__main__":
    raise SystemExit(main())
