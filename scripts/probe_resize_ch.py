"""Channel-driven resize probe — verifies the draggable panel resize (logic + persist + clamp) on the
hidden desktop (no OS mouse, no screen grab). The resize grip is a panel-internal pointer drag (no OS
click-through involved), so the channel faithfully exercises the real drag handlers + math.

Run (background, user undisturbed): py 2_Toolkit/.../run_background.py py scripts/probe_resize_ch.py
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
    found = None
    for ln in lines():
        if t in ln:
            m = re.search(r"\{.*\}", ln)
            if m:
                try:
                    found = json.loads(m.group(0))
                except Exception:
                    pass
    return found


def wait_new(t, prev, timeout=6):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if count(t) > prev:
            return last_json(t)
        time.sleep(0.1)
    return None


def workarea():
    d = last_json("displays:startup")
    return d["displays"][0]["workArea"] if d else {"x": 0, "y": 0, "width": 1536, "height": 864}


def cat_center():
    cs = last_json("cat:screen")
    return (cs["x"] + cs["w"] / 2, cs["y"] + cs["h"] / 2) if cs else (768, 432)


def rects():
    return last_json("panel:rects") or {}


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
        time.sleep(1.6)

        # dock right + expand
        cx, cy = cat_center()
        d.cursor(cx, cy)
        wait_new("window:expand", count("window:expand"), 4)
        time.sleep(0.2)
        ds = count("drag:start"); d.mdown()
        wait_new("drag:start", ds, 3)
        tx, ty = wa["x"] + wa["width"] - 30, wa["y"] + wa["height"] // 2
        d.drag([(cx + (tx - cx) * i / 12, cy + (ty - cy) * i / 12) for i in range(1, 13)])
        sd = count("snap:done"); d.mup()
        wait_new("snap:done", sd, 6)
        time.sleep(0.6)
        # re-hover to expand the panel
        cx, cy = cat_center()
        d.cursor(cx, cy)
        wait_new("window:expand", count("window:expand"), 4)
        time.sleep(0.7)

        pr = rects()
        grip = pr.get("grip")
        panel0 = pr.get("panel")
        check("panel expanded + grip present", bool(grip) and bool(panel0), f"grip={grip}")
        if not (grip and panel0):
            return 2
        w0, h0 = panel0["w"], panel0["h"]

        # GROW: right-dock grip is at panel bottom-left; growing = drag LEFT + DOWN
        gx, gy = grip["x"] + grip["w"] / 2, grip["y"] + grip["h"] / 2
        d.cursor(gx, gy)
        time.sleep(0.05)
        d.mdown()
        rp = count("panel:resize")
        steps = [(gx - 110 * i / 10, gy + 70 * i / 10) for i in range(1, 11)]
        for (x, y) in steps:
            d.move(x, y)
            time.sleep(0.02)
        d.mup()
        time.sleep(0.5)
        pr2 = rects()
        p2 = pr2.get("panel") or {}
        check("drag grows the panel", p2.get("w", 0) > w0 + 40 and p2.get("h", 0) > h0 + 40,
              f"{w0}x{h0} -> {p2.get('w')}x{p2.get('h')}")
        check("resize persisted (panel:resize logged)", count("panel:resize") > rp,
              f"resize events={count('panel:resize') - rp}")

        # CLAMP: drag far beyond max -> panel clamps, doesn't exceed the window
        d.cursor(gx, gy); time.sleep(0.05); d.mdown()
        big = [(gx - 900 * i / 10, gy + 900 * i / 10) for i in range(1, 11)]
        for (x, y) in big:
            d.move(x, y)
            time.sleep(0.02)
        d.mup()
        time.sleep(0.5)
        p3 = rects().get("panel") or {}
        # MAX_PANEL_W=400, MAX_PANEL_H=520 (allow a couple px tolerance)
        check("clamps to max (no runaway)", p3.get("w", 999) <= 404 and p3.get("h", 999) <= 524,
              f"clamped={p3.get('w')}x{p3.get('h')}")

        npass = sum(1 for _, ok, _ in results if ok)
        print(f"\n[RESIZE-CH] {npass}/{len(results)} passed")
        return 0 if npass == len(results) else 2
    finally:
        d.close()
        g.kill(proc)


if __name__ == "__main__":
    raise SystemExit(main())
