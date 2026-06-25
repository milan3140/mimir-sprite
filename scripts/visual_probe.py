"""Mimir-Sprite visual self-test probe (thin, project-specific).

Imports the reusable harness from 2_Toolkit/Harness/gui_visual_probe and runs THIS app's
scenario: launch -> locate cat via mimir-debug.log -> hover (expand panel) -> add a todo ->
drag the cat to a corner (snap) -> screenshot burst + grep the log -> kill app.

Run:  py scripts/visual_probe.py
Screenshots go to the scratchpad (printed at the end) for the agent to read, then delete.
Don't touch the mouse for ~25s while it runs (pyautogui FAILSAFE: slam to a corner to abort).
"""
from __future__ import annotations
import json
import re
import sys
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
TOOLKIT = PROJECT.parents[2] / "2_Toolkit" / "Harness" / "gui_visual_probe"
sys.path.insert(0, str(TOOLKIT))
import gui_probe as g  # noqa: E402

LOG = PROJECT / "mimir-debug.log"
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else PROJECT / "_probe_shots"


def last_json(tag: str) -> dict | None:
    """Return the JSON payload of the last log line with `tag`."""
    if not LOG.exists():
        return None
    found = None
    for ln in LOG.read_text(encoding="utf-8", errors="replace").splitlines():
        if tag in ln:
            m = re.search(r"\{.*\}", ln)
            if m:
                try:
                    found = json.loads(m.group(0))
                except Exception:
                    pass
    return found


def wait_for_log(tag: str, timeout: float = 45) -> dict | None:
    import time
    t0 = time.time()
    while time.time() - t0 < timeout:
        d = last_json(tag)
        if d:
            return d
        time.sleep(0.5)
    return None


def cat_center_phys(win: dict) -> tuple[int, int]:
    """Cat ~center in PHYSICAL px from a log line carrying window pos (DIP)."""
    x = win.get("x", win.get("winPos", {}).get("x", 700))
    y = win.get("y", win.get("winPos", {}).get("y", 360))
    # cat sits centered in the 190x190 collapsed window
    return g.to_physical(x + 95, y + 95)


def main() -> int:
    if LOG.exists():
        LOG.unlink()  # fresh log for this run
    scale = g.dpi_scale()
    print(f"[probe] dpi scale = {scale}")
    proc = g.launch("npm run dev", cwd=PROJECT)
    shots = g.Shots(OUT)
    ghost = None
    try:
        try:
            ghost = g.GhostCursor()
            print("[probe] blue ghost cursor ON")
        except Exception as e:
            print("[probe] ghost cursor unavailable:", e)
        win = wait_for_log("win:created", timeout=60)
        if not win:
            print("[probe] FAIL: app never logged win:created (did it launch?)")
            shots.shot("00_no_window")
            return 1
        print("[probe] win:created", win)
        g.wait(1.5)
        shots.shot("01_launch")

        # Tests the reported bug: hover -> expand, move away -> collapse, RE-hover -> expand again.
        cx, cy = cat_center_phys(win)
        away = g.to_physical(120, 120)  # far corner, off the window
        print(f"[probe] cat center physical = ({cx},{cy}); away = {away}")

        g.move_ghosted(ghost, cx, cy, dur=0.8); g.wait(1.0)
        shots.shot("02_hover_expand")          # panel should be OPEN

        g.move_ghosted(ghost, away[0], away[1], dur=0.6); g.wait(0.8)
        shots.shot("03_after_away_collapse")    # panel should be GONE, just the cat, no sliver

        g.move_ghosted(ghost, cx, cy, dur=0.6); g.wait(1.0)
        shots.shot("04_rehover_expand")         # panel should OPEN AGAIN (the bug)

        # --- log truth ---
        print("\n=== window:expand events ===")
        print("\n".join(g.grep_log(LOG, "window:expand")))
        print("\n=== window:collapse events ===")
        print("\n".join(g.grep_log(LOG, "window:collapse")))
        ne = len(g.grep_log(LOG, "window:expand")); nc = len(g.grep_log(LOG, "window:collapse"))
        print(f"\n[probe] expands={ne} collapses={nc} (expect ~2 expands, ~1 collapse)")
        print(f"\n[probe] screenshots in: {OUT}")
        for p in shots.paths:
            print("  ", p)
        return 0
    finally:
        if ghost:
            ghost.destroy()
        g.kill(proc)


if __name__ == "__main__":
    raise SystemExit(main())
