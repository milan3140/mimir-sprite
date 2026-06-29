"""Real-mouse panel resize probe (run via run_isolated for a faithful drag — the channel can't drive
drag-moves). Docks right, expands, drags the corner grip outward, asserts the panel grows + persists +
clamps to max.

Run:  py 2_Toolkit/Harness/gui_visual_probe/run_isolated.py py scripts/probe_resize.py
"""
from __future__ import annotations
import json
import re
import sys
import time
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str((PROJECT.parents[2] / "2_Toolkit/Harness/gui_visual_probe").resolve()))
import gui_probe as g  # noqa: E402
import pyautogui  # noqa: E402

LOG = PROJECT / "mimir-debug.log"
results: list[tuple[str, bool, str]] = []
SCALE = 1.0


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


def neutral_grab(wa, attempts=4):
    for _ in range(attempts):
        cx, cy = cat_center()
        nx = wa["x"] + (wa["width"] - 60 if cx - wa["x"] < wa["width"] / 2 else 60)
        ny = wa["y"] + (wa["height"] - 60 if cy - wa["y"] < wa["height"] / 2 else 60)
        g.move_ghosted(None, *g.to_physical(nx, ny, SCALE), dur=0.3)
        time.sleep(0.5)
        cx, cy = cat_center()
        g.move_ghosted(None, *g.to_physical(cx, cy, SCALE), dur=0.4)
        wait_new("window:expand", count("window:expand"), 4)
        time.sleep(0.3)
        ds = count("drag:start")
        pyautogui.mouseDown()
        if wait_new("drag:start", ds, 3):
            return True
        pyautogui.mouseUp(); time.sleep(0.5)
    return False


def main():
    global SCALE
    if LOG.exists():
        LOG.unlink()
    import shutil
    shutil.rmtree(PROJECT / "_probe_userdata", ignore_errors=True)  # fresh store -> default panel size
    g.free_port(5173)
    SCALE = g.dpi_scale()
    proc = g.launch("npm run dev", cwd=PROJECT)
    try:
        win = None
        for _ in range(120):
            time.sleep(0.5)
            win = last_json("win:created")
            if win:
                break
        check("app boots", bool(win))
        if not win:
            return 1
        wa = workarea()
        time.sleep(1.6)
        if not neutral_grab(wa):
            check("dock right", False); return 2
        sd = count("snap:done")
        g.move_ghosted(None, *g.to_physical(wa["x"] + wa["width"] - 30, wa["y"] + wa["height"] // 2, SCALE), dur=0.7)
        pyautogui.mouseUp()
        wait_new("snap:done", sd, 6)
        check("dock right", True)
        g.move_ghosted(None, *g.to_physical(wa["x"] + 80, wa["y"] + 80, SCALE), dur=0.3)
        time.sleep(0.6)
        cx, cy = cat_center()
        g.move_ghosted(None, *g.to_physical(cx, cy, SCALE), dur=0.4)
        wait_new("window:expand", count("window:expand"), 5)
        time.sleep(0.7)

        pr = rects()
        grip, panel0 = pr.get("grip"), pr.get("panel")
        check("grip present", bool(grip) and bool(panel0), f"grip={grip}")
        if not (grip and panel0):
            return 2
        w0, h0 = panel0["w"], panel0["h"]

        # drag the grip outward (right dock: bottom-left grip -> drag LEFT + DOWN to grow)
        gx, gy = grip["x"] + grip["w"] / 2, grip["y"] + grip["h"] / 2
        gp = g.to_physical(gx, gy, SCALE)
        tp = g.to_physical(gx - 110, gy + 70, SCALE)
        rp = count("panel:resize")
        g.move_ghosted(None, gp[0], gp[1], dur=0.3)
        time.sleep(0.2)
        pyautogui.mouseDown()
        g.move_ghosted(None, tp[0], tp[1], dur=0.6)
        pyautogui.mouseUp()
        time.sleep(0.5)
        check("resize persisted", count("panel:resize") > rp, f"events={count('panel:resize') - rp}")
        rsz = last_json("panel:resize")
        check("persisted size is bigger", bool(rsz) and rsz.get("w", 0) > w0 + 40,
              f"stored={rsz}")

        # the cursor ended off-panel (it collapses) — re-hover the cat to re-expand, then measure the
        # RENDERED panel so we confirm the store update actually grew the visible panel.
        g.move_ghosted(None, *g.to_physical(wa["x"] + 80, wa["y"] + 80, SCALE), dur=0.3)
        time.sleep(0.5)
        cx, cy = cat_center()
        g.move_ghosted(None, *g.to_physical(cx, cy, SCALE), dur=0.4)
        wait_new("window:expand", count("window:expand"), 5)
        time.sleep(0.7)
        p2 = rects().get("panel") or {}
        check("rendered panel grew", p2.get("w", 0) > w0 + 40 and p2.get("h", 0) > h0 + 40,
              f"{w0}x{h0} -> {p2.get('w')}x{p2.get('h')}")
        # screenshot the (bigger) panel to LOOK at
        try:
            import mss as _m, numpy as _np
            from PIL import Image as _I
            pan = p2 or rects().get("panel")
            if pan:
                with _m.mss() as s:
                    x = int((pan["x"] - 12) * SCALE); y = int((pan["y"] - 12) * SCALE)
                    w = int((pan["w"] + 24) * SCALE); h = int((pan["h"] + 24) * SCALE)
                    im = _np.asarray(s.grab({"left": max(0, x), "top": max(0, y), "width": w, "height": h}))[:, :, :3]
                    out = PROJECT / "_resize_shots"; out.mkdir(exist_ok=True)
                    _I.fromarray(im[:, :, ::-1]).save(out / "panel_resized.png")
        except Exception as _e:
            print("shot err", _e)

        npass = sum(1 for _, ok, _ in results if ok)
        print(f"\n[RESIZE] {npass}/{len(results)} passed")
        return 0 if npass == len(results) else 2
    finally:
        g.kill(proc)


if __name__ == "__main__":
    raise SystemExit(main())
