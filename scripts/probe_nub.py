"""Nub recall self-test: for each docked edge, hide the sprite, then CLICK where the nub should be
and confirm it restores. This proves the nub is (a) on-screen (not in the off-screen transparent
margin) and (b) clickable — the exact failure the user hit ("hidden -> can't find how to recall").

Signal-driven (see feedback_self_test_gui): act with the real mouse, wait for log events, assert
the nub rect sits inside the screen workArea, then verify a click on it triggers restore.

Run:  py scripts/probe_nub.py [out_dir]
"""
from __future__ import annotations
import json, re, sys, time
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str((PROJECT.parents[2] / "2_Toolkit/Harness/gui_visual_probe").resolve()))
import gui_probe as g  # noqa: E402
import pyautogui  # noqa: E402

LOG = PROJECT / "mimir-debug.log"
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else PROJECT / "_nub_shots"
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


def wait_new(tag: str, prev: int, timeout: float = 8) -> dict | None:
    t0 = time.time()
    while time.time() - t0 < timeout:
        if count(tag) > prev:
            return last_json(tag)
        time.sleep(0.2)
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


def grab_cat(ghost, scale, attempts: int = 3) -> bool:
    for _ in range(attempts):
        cx, cy = cat_center_dip()
        p = g.to_physical(cx, cy, scale)
        exp_prev = count("window:expand")
        g.move_ghosted(ghost, p[0], p[1], dur=0.4)
        wait_new("window:expand", exp_prev, timeout=4)
        time.sleep(0.3)
        ds_prev = count("drag:start")
        pyautogui.mouseDown()
        if wait_new("drag:start", ds_prev, timeout=3):
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
            win = last_json("win:created")
            if win:
                break
        check("app boots", win is not None)
        if not win:
            return 1
        wa = workarea()
        g.wait(1.0)

        targets = {
            "top":    g.to_physical(wa["x"] + wa["width"] // 2, wa["y"] + 25, scale),
            "left":   g.to_physical(wa["x"] + 25, wa["y"] + wa["height"] // 2, scale),
            "bottom": g.to_physical(wa["x"] + wa["width"] // 2, wa["y"] + wa["height"] - 25, scale),
            "right":  g.to_physical(wa["x"] + wa["width"] - 25, wa["y"] + wa["height"] // 2, scale),
        }

        for edge in ["right", "top", "left", "bottom"]:
            # 1) dock cat to this edge
            if not grab_cat(ghost, scale):
                check(f"[{edge}] grabbed cat", False)
                continue
            sd_prev = count("snap:done")
            g.move_ghosted(ghost, targets[edge][0], targets[edge][1], dur=0.8)
            pyautogui.mouseUp()
            sc = wait_new("snap:done", sd_prev, timeout=6)
            if not (sc and sc.get("edge") == edge):
                check(f"[{edge}] docked", False, f"edge={sc.get('edge') if sc else None}")
                continue
            # move cursor away so we don't sit on the cat
            away = g.to_physical(wa["x"] + wa["width"] // 2, wa["y"] + wa["height"] // 2, scale)
            g.move_ghosted(ghost, away[0], away[1], dur=0.3)
            g.wait(0.6)

            # 2) hide -> nub  (Ctrl+Alt+Space toggles; from visible => hideToNub)
            hp = count("window:hideToNub")
            pyautogui.hotkey("ctrl", "alt", "space")
            nub = wait_new("window:hideToNub", hp, timeout=5)
            check(f"[{edge}] hides to nub", bool(nub))
            if not nub:
                continue
            nb = nub["nub"]
            # 3) assert nub fully ON-SCREEN (the off-screen-margin bug)
            on = (nb["x"] >= wa["x"] - 1 and nb["y"] >= wa["y"] - 1 and
                  nb["x"] + nb["w"] <= wa["x"] + wa["width"] + 1 and
                  nb["y"] + nb["h"] <= wa["y"] + wa["height"] + 1)
            check(f"[{edge}] nub ON-SCREEN", on, f"nub={nb} wa={wa}")
            g.wait(0.4)
            shots.shot(f"{edge}_nub")

            # 4) CLICK the nub -> must restore (proves visible + clickable)
            ncx = nb["x"] + nb["w"] / 2
            ncy = nb["y"] + nb["h"] / 2
            pc = g.to_physical(ncx, ncy, scale)
            rp = count("window:restoreFromNub")
            g.move_ghosted(ghost, pc[0], pc[1], dur=0.4)
            pyautogui.click()
            rest = wait_new("window:restoreFromNub", rp, timeout=5)
            check(f"[{edge}] click nub restores", bool(rest))
            g.wait(0.5)

        npass = sum(1 for _, ok, _ in results if ok)
        print(f"\n[NUB SUITE] {npass}/{len(results)} passed")
        report = {
            "ts": time.strftime("%Y-%m-%d %H:%M:%S"),
            "pass": npass, "total": len(results),
            "failures": [{"name": n, "detail": d} for n, ok, d in results if not ok],
        }
        (PROJECT / "state").mkdir(exist_ok=True)
        (PROJECT / "state" / "probe_nub_report.json").write_text(
            json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        return 0 if npass == len(results) else 2
    finally:
        if ghost:
            ghost.destroy()
        g.kill(proc)
        g.free_port(5173)


if __name__ == "__main__":
    raise SystemExit(main())
