"""Design self-audit probe: capture key UI states for strict visual review (no assertions —
the agent reads the screenshots and judges against design standards)."""
import json, re, sys, time
from pathlib import Path
PROJECT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str((PROJECT.parents[2] / "2_Toolkit/Harness/gui_visual_probe").resolve()))
import gui_probe as g
import pyautogui

LOG = PROJECT / "mimir-debug.log"
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else PROJECT / "_audit"


def lastj(tag):
    found = None
    if LOG.exists():
        for ln in LOG.read_text(encoding="utf-8", errors="replace").splitlines():
            if tag in ln:
                m = re.search(r"\{.*\}", ln)
                if m:
                    try:
                        found = json.loads(m.group(0))
                    except Exception:
                        pass
    return found


def main():
    if LOG.exists():
        LOG.unlink()
    g.free_port(5173)
    scale = g.dpi_scale()
    proc = g.launch("npm run dev", cwd=PROJECT)
    ghost = None
    shots = g.Shots(OUT)
    try:
        try:
            ghost = g.GhostCursor()
        except Exception:
            pass
        win = None
        for _ in range(120):
            time.sleep(0.5)
            win = lastj("win:created")
            if win:
                break
        if not win:
            print("NO BOOT")
            return 1
        time.sleep(1.5)
        shots.shot("A_collapsed")

        cs = lastj("cat:screen") or {"x": win["x"] + 28, "y": win["y"] + 20, "w": 150, "h": 150}
        cc = g.to_physical(cs["x"] + cs["w"] / 2, cs["y"] + cs["h"] / 2, scale)
        g.move_ghosted(ghost, cc[0], cc[1], dur=0.5)
        time.sleep(1.3)
        shots.shot("B_expanded")

        pr = lastj("panel:rects")
        print("panel:rects =", json.dumps(pr)[:600] if pr else None)
        # click first row's chevron to open detail (structure-tolerant)
        rows = (pr or {}).get("rows") or []
        if rows:
            r0 = rows[0]
            ch = r0.get("chevron") or r0.get("rect") or r0
            if isinstance(ch, dict) and "x" in ch:
                p = g.to_physical(ch["x"] + ch.get("w", 14) / 2, ch["y"] + ch.get("h", 14) / 2, scale)
                g.move_ghosted(ghost, p[0], p[1], dur=0.3)
                pyautogui.click()
                time.sleep(0.7)
                shots.shot("C_detail_open")
        print("shots:", [str(p) for p in shots.paths])
    finally:
        if ghost:
            ghost.destroy()
        g.kill(proc)
        g.free_port(5173)


if __name__ == "__main__":
    raise SystemExit(main())
