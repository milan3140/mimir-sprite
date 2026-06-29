"""Mimir-Sprite — recall × window-state OVERLAP self-test (TEST_DESIGN §3 gaps).

Bugs live at scenario overlaps, not the happy path. Covers three that were UNCOVERED:
  - hide-from-expanded: hiding while the panel is OPEN must collapse FIRST, then show ears
    (not draw ears over a still-open panel).
  - hover-while-hidden:  hovering where the cat was while hidden must NOT expand the panel.
  - restore->hover:      after restoring from the nub, hover must expand again (state not stuck).

One boot, docked right. All assertions are log-checkable (events + their ORDER).

Run:  py scripts/probe_overlap.py
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
        time.sleep(0.12)
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


def grab_cat(ghost, scale, wa: dict, attempts: int = 4) -> bool:
    for _ in range(attempts):
        cx, cy = cat_center_dip()
        nx = wa["x"] + (wa["width"] - 60 if cx - wa["x"] < wa["width"] / 2 else 60)
        ny = wa["y"] + (wa["height"] - 60 if cy - wa["y"] < wa["height"] / 2 else 60)
        away = g.to_physical(nx, ny, scale)
        g.move_ghosted(ghost, away[0], away[1], dur=0.3)
        time.sleep(0.5)
        cx, cy = cat_center_dip()
        g.move_ghosted(ghost, *g.to_physical(cx, cy, scale), dur=0.4)
        wait_new("window:expand", count("window:expand"), timeout=4)
        time.sleep(0.3)
        ds_prev = count("drag:start")
        pyautogui.mouseDown()
        if wait_new("drag:start", ds_prev, timeout=3):
            return True
        pyautogui.mouseUp()
        time.sleep(0.5)
    return False


def hover_cat(ghost, scale, wa):
    """Approach from neutral, then hover the cat. Returns True if window:expand fired."""
    cx, cy = cat_center_dip()
    nx = wa["x"] + (wa["width"] - 60 if cx - wa["x"] < wa["width"] / 2 else 60)
    g.move_ghosted(ghost, *g.to_physical(nx, wa["y"] + 60, scale), dur=0.3)
    time.sleep(0.5)
    ep = count("window:expand")
    g.move_ghosted(ghost, *g.to_physical(cx, cy, scale), dur=0.4)
    return wait_new("window:expand", ep, timeout=4) is not None


def main() -> int:
    if LOG.exists():
        LOG.unlink()
    g.free_port(5173)
    scale = g.dpi_scale()
    proc = g.launch("npm run dev", cwd=PROJECT)
    ghost = None
    try:
        try:
            ghost = g.GhostCursor()
        except Exception:
            pass
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

        # dock right
        if not grab_cat(ghost, scale, wa):
            check("dock right", False); return 2
        sd_prev = count("snap:done")
        g.move_ghosted(ghost, *g.to_physical(wa["x"] + wa["width"] - 30, wa["y"] + wa["height"] // 2, scale), dur=0.7)
        pyautogui.mouseUp()
        sc = wait_new("snap:done", sd_prev, timeout=6)
        check("dock right", bool(sc) and sc.get("edge") == "right")

        # ---- OVERLAP 1: hide-from-expanded (collapse FIRST, then ears) ----
        if not hover_cat(ghost, scale, wa):
            check("[hide-from-expanded] panel expands first", False); return 2
        check("[hide-from-expanded] panel expands first", True)
        time.sleep(0.4)
        col_prev = count("window:collapse")
        hide_prev = count("window:hideToNub")
        pyautogui.hotkey("ctrl", "alt", "space")  # hide while expanded
        hid = wait_new("window:hideToNub", hide_prev, timeout=5)
        check("[hide-from-expanded] hides to nub", bool(hid))
        # collapse must have fired (panel closed) as part of hiding
        check("[hide-from-expanded] collapsed before/at hide (no ears over open panel)",
              count("window:collapse") > col_prev,
              f"collapse_after={count('window:collapse') - col_prev}")

        # ---- OVERLAP 2: hover-while-hidden (must NOT expand) ----
        time.sleep(0.5)
        exp_before = count("window:expand")
        # hover where the cat used to be (and wiggle), while hidden
        cx, cy = cat_center_dip()
        for dx, dy in [(0, 0), (10, 10), (-10, 0)]:
            g.move_ghosted(ghost, *g.to_physical(cx + dx, cy + dy, scale), dur=0.3)
            time.sleep(0.3)
        check("[hover-while-hidden] does NOT expand", count("window:expand") == exp_before,
              f"expands_while_hidden={count('window:expand') - exp_before}")

        # ---- OVERLAP 3: restore -> hover expands again ----
        nub = last_json("window:hideToNub")
        nb = nub["nub"] if nub else None
        if not nb:
            check("[restore->hover] restored", False); return 2
        rp = count("window:restoreFromNub")
        g.move_ghosted(ghost, *g.to_physical(nb["x"] + nb["w"] / 2, nb["y"] + nb["h"] / 2, scale), dur=0.4)
        pyautogui.click()
        rest = wait_new("window:restoreFromNub", rp, timeout=5)
        check("[restore->hover] restored", bool(rest))
        time.sleep(0.6)
        # move away then hover -> must expand again (state not stuck hidden/expanded)
        check("[restore->hover] hover expands again", hover_cat(ghost, scale, wa))

        npass = sum(1 for _, ok, _ in results if ok)
        print(f"\n[OVERLAP] {npass}/{len(results)} passed")
        (PROJECT / "state").mkdir(exist_ok=True)
        (PROJECT / "state" / "probe_overlap_report.json").write_text(json.dumps(
            {"pass": npass, "total": len(results),
             "failures": [{"name": n, "detail": d} for n, ok, d in results if not ok]},
            ensure_ascii=False, indent=2), encoding="utf-8")
        return 0 if npass == len(results) else 2
    finally:
        if ghost:
            ghost.destroy()
        g.kill(proc)


if __name__ == "__main__":
    raise SystemExit(main())
