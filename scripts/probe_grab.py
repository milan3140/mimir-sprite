"""Mimir-Sprite — "hover can't enter grabbable state" repro (user-reported).

After docking, hovering the cat directly (WITHOUT first moving the cursor away) must make the window
interactive so the cat is grabbable. Bug: clickThrough's `interactive` flag desyncs from the window's
actual setIgnoreMouseEvents state after snap/restore (windowManager sets ignore=true on snap:done while
the flag is stale-true), so setInteractive(true) early-returns and never re-enables → not grabbable.

This probe docks (via a reliable neutral-approach grab), then tests a DIRECT hover-grab (no neutral
move) and asserts drag:start fires. Counts successes across edges/cycles.

Run:  py scripts/probe_grab.py
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


def lines() -> list[str]:
    return LOG.read_text(encoding="utf-8", errors="replace").splitlines() if LOG.exists() else []


def count(tag: str) -> int:
    return sum(1 for ln in lines() if tag in ln)


def last_json(tag: str) -> dict | None:
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


def wait_new(tag: str, prev: int, timeout: float = 6) -> dict | None:
    t0 = time.time()
    while time.time() - t0 < timeout:
        if count(tag) > prev:
            return last_json(tag)
        time.sleep(0.1)
    return None


def workarea() -> dict:
    d = last_json("displays:startup")
    return d["displays"][0]["workArea"] if d else {"x": 0, "y": 0, "width": 1536, "height": 864}


def cat_center_dip() -> tuple[float, float]:
    cs = last_json("cat:screen")
    if cs:
        return (cs["x"] + cs["w"] / 2, cs["y"] + cs["h"] / 2)
    w = last_json("win:created") or {"x": 700, "y": 360}
    return (w["x"] + 95, w["y"] + 95)


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    print(("PASS " if ok else "FAIL "), name, ("- " + detail) if detail else "")


def neutral_grab(scale, wa, attempts=4) -> bool:
    """Reliable grab via the neutral-approach workaround (move away, then hover)."""
    for _ in range(attempts):
        cx, cy = cat_center_dip()
        nx = wa["x"] + (wa["width"] - 60 if cx - wa["x"] < wa["width"] / 2 else 60)
        ny = wa["y"] + (wa["height"] - 60 if cy - wa["y"] < wa["height"] / 2 else 60)
        g.move_ghosted(None, *g.to_physical(nx, ny, scale), dur=0.3)
        time.sleep(0.5)
        cx, cy = cat_center_dip()
        g.move_ghosted(None, *g.to_physical(cx, cy, scale), dur=0.4)
        wait_new("window:expand", count("window:expand"), timeout=4)
        time.sleep(0.3)
        ds = count("drag:start")
        pyautogui.mouseDown()
        if wait_new("drag:start", ds, timeout=3):
            return True
        pyautogui.mouseUp()
        time.sleep(0.5)
    return False


def main() -> int:
    if LOG.exists():
        LOG.unlink()
    g.free_port(5173)
    scale = g.dpi_scale()
    proc = g.launch("npm run dev", cwd=PROJECT)
    try:
        win = None
        for _ in range(120):
            time.sleep(0.5)
            win = last_json("win:created")
            if win:
                break
        check("app boots", win is not None)
        if not win:
            return 1
        wa = workarea()
        time.sleep(1.5)
        tp = {
            "right":  (wa["x"] + wa["width"] - 30, wa["y"] + wa["height"] // 2),
            "left":   (wa["x"] + 30, wa["y"] + wa["height"] // 2),
            "top":    (wa["x"] + wa["width"] // 2, wa["y"] + 30),
            "bottom": (wa["x"] + wa["width"] // 2, wa["y"] + wa["height"] - 30),
        }
        for edge in ["right", "top", "left", "bottom"]:
            # dock to edge via reliable neutral grab
            if not neutral_grab(scale, wa):
                check(f"[{edge}] docked for test", False); continue
            sd = count("snap:done")
            g.move_ghosted(None, *g.to_physical(*tp[edge], scale), dur=0.6)
            pyautogui.mouseUp()
            wait_new("snap:done", sd, timeout=6)
            time.sleep(0.8)  # cursor is now ON the cat at the drop point (the bug's trigger state)

            # DIRECT hover-grab: small move onto the cat center, NO neutral approach, then mousedown.
            cx, cy = cat_center_dip()
            g.move_ghosted(None, *g.to_physical(cx, cy, scale), dur=0.3)
            time.sleep(0.4)  # let the 100ms poll act
            ds = count("drag:start")
            pyautogui.mouseDown()
            got = wait_new("drag:start", ds, timeout=2.5) is not None
            pyautogui.mouseUp()
            check(f"[{edge}] DIRECT hover-grab works (no neutral approach)", got)
            if got:
                wait_new("snap:done", count("snap:done") - 1 if count("snap:done") else 0, timeout=4)
            time.sleep(0.6)

        npass = sum(1 for _, ok, _ in results if ok)
        print(f"\n[GRAB] {npass}/{len(results)} passed")
        (PROJECT / "state").mkdir(exist_ok=True)
        (PROJECT / "state" / "probe_grab_report.json").write_text(json.dumps(
            {"pass": npass, "total": len(results),
             "failures": [{"name": n, "detail": d} for n, ok, d in results if not ok]},
            ensure_ascii=False, indent=2), encoding="utf-8")
        return 0 if npass == len(results) else 2
    finally:
        g.kill(proc)


if __name__ == "__main__":
    raise SystemExit(main())
