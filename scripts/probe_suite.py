"""Mimir-Sprite signal-driven self-test suite.

Approach (see feedback_self_test_gui): locate via the app's LOG (ground truth) -> act with the
real mouse -> WAIT for the expected log event (no fixed sleeps) -> assert geometry from the log +
screenshots for visuals -> cleanup.

Covers the window/expand contract across all 4 docked edges (the high-risk geometry):
  boots, drag-snaps to each edge, hover expands toward center, panel stays ON-SCREEN, collapses.

Run:  py scripts/probe_suite.py [out_dir]
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

LOG = PROJECT / "mimir-debug.log"
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else PROJECT / "_probe_shots"
OPP = {"top": "bottom", "bottom": "top", "left": "right", "right": "left"}

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
    sc = last_json("snap:compute")
    if sc and "target" in sc and "catRect" in sc:
        t, cr = sc["target"], sc["catRect"]
        return (t["x"] + cr["x"] + cr["w"] / 2, t["y"] + cr["y"] + cr["h"] / 2)
    w = last_json("win:created") or {"x": 700, "y": 360}
    return (w["x"] + 95, w["y"] + 95)


def norm_box(b: dict) -> dict:
    return {"x": b["x"], "y": b["y"], "w": b.get("w", b.get("width")), "h": b.get("h", b.get("height"))}


def inside(b: dict, wa: dict, tol: int = 2) -> bool:
    return (b["x"] >= wa["x"] - tol and b["y"] >= wa["y"] - tol and
            b["x"] + b["w"] <= wa["x"] + wa["width"] + tol and
            b["y"] + b["h"] <= wa["y"] + wa["height"] + tol)


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    print(("PASS " if ok else "FAIL "), name, ("- " + detail) if detail else "")


def main() -> int:
    if LOG.exists():
        LOG.unlink()
    g.free_port(5173)  # kill any stray dev server so this instance actually boots
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
            # drag the cat to this edge
            ccx, ccy = cat_center_dip()
            c = g.to_physical(ccx, ccy, scale)
            snap_prev = count("snap:compute")
            g.drag_ghosted(ghost, c[0], c[1], targets[edge][0], targets[edge][1], dur=0.9)
            sc = wait_new("snap:compute", snap_prev, timeout=8)
            check(f"[{edge}] snapped", bool(sc) and sc.get("edge") == edge,
                  f"edge={sc.get('edge') if sc else None}")
            g.wait(0.4)

            # hover the (new) cat position -> expand
            ccx, ccy = cat_center_dip()
            c = g.to_physical(ccx, ccy, scale)
            exp_prev = count("window:expand")
            g.move_ghosted(ghost, c[0], c[1], dur=0.5)
            ev = wait_new("window:expand", exp_prev, timeout=6)
            check(f"[{edge}] expands", bool(ev) and ev.get("edge") == edge)
            if ev and "to" in ev:
                b = norm_box(ev["to"])
                check(f"[{edge}] panel ON-SCREEN", inside(b, wa), f"to={b}")
            g.wait(0.4)
            shots.shot(f"{edge}_expanded")

            # move to the OPPOSITE edge -> definitely outside -> collapse
            col_prev = count("window:collapse")
            opp = targets[OPP[edge]]
            g.move_ghosted(ghost, opp[0], opp[1], dur=0.5)
            cev = wait_new("window:collapse", col_prev, timeout=4)
            check(f"[{edge}] collapses", bool(cev))
            g.wait(0.3)

        npass = sum(1 for _, ok, _ in results if ok)
        print(f"\n[SUITE] {npass}/{len(results)} passed")
        print("screenshots:", OUT)
        for p in shots.paths:
            print("  ", p)
        return 0 if npass == len(results) else 2
    finally:
        if ghost:
            ghost.destroy()
        g.kill(proc)


if __name__ == "__main__":
    raise SystemExit(main())
