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
import pyautogui  # noqa: E402

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
    # prefer the LIVE cat screen rect (reflects actual rendered position, even when docked)
    cs = last_json("cat:screen")
    if cs:
        return (cs["x"] + cs["w"] / 2, cs["y"] + cs["h"] / 2)
    w = last_json("win:created") or {"x": 700, "y": 360}
    return (w["x"] + 95, w["y"] + 95)


def norm_box(b: dict) -> dict:
    return {"x": b["x"], "y": b["y"], "w": b.get("w", b.get("width")), "h": b.get("h", b.get("height"))}


def inside(b: dict, wa: dict, edge: str = "", tol: int = 2) -> bool:
    # ponytail: snap aligns cat CONTENT to the edge, so the 190×190 transparent window
    # padding extends past the docked side. Allow WIN_W slack on that axis only.
    pad = 190
    lt = pad if edge == "left"   else tol
    rt = pad if edge == "right"  else tol
    tt = pad if edge == "top"    else tol
    bt = pad if edge == "bottom" else tol
    return (b["x"] >= wa["x"] - lt and b["y"] >= wa["y"] - tt and
            b["x"] + b["w"] <= wa["x"] + wa["width"] + rt and
            b["y"] + b["h"] <= wa["y"] + wa["height"] + bt)


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    print(("PASS " if ok else "FAIL "), name, ("- " + detail) if detail else "")


def grab_cat(ghost, scale, attempts: int = 3) -> bool:
    """Locate cat from LIVE cat:screen log, hover (wait for expand), mousedown at same spot
    (cat screen position is stable across expand by design), confirm via drag:start.
    Retry from a fresh live position if the grab didn't register."""
    for _ in range(attempts):
        cx, cy = cat_center_dip()
        p = g.to_physical(cx, cy, scale)
        exp_prev = count("window:expand")
        g.move_ghosted(ghost, p[0], p[1], dur=0.4)
        wait_new("window:expand", exp_prev, timeout=4)   # window now interactive
        time.sleep(0.3)                                   # let interactive mode settle
        # ponytail: don't re-move cursor — cat stays at same screen pos during expand;
        # re-moving risked exiting the window (150ms collapse grace) before mouseDown.
        ds_prev = count("drag:start")
        pyautogui.mouseDown()
        if wait_new("drag:start", ds_prev, timeout=3):
            return True                                   # grabbed
        pyautogui.mouseUp()
        time.sleep(0.5)                                   # wait for any unexpected snap to finish
    return False


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
        panel_widths: dict[str, float] = {}
        panel_gaps: dict[str, float] = {}

        targets = {
            "top":    g.to_physical(wa["x"] + wa["width"] // 2, wa["y"] + 25, scale),
            "left":   g.to_physical(wa["x"] + 25, wa["y"] + wa["height"] // 2, scale),
            "bottom": g.to_physical(wa["x"] + wa["width"] // 2, wa["y"] + wa["height"] - 25, scale),
            "right":  g.to_physical(wa["x"] + wa["width"] - 25, wa["y"] + wa["height"] // 2, scale),
        }

        for edge in ["right", "top", "left", "bottom"]:
            grabbed = grab_cat(ghost, scale)
            check(f"[{edge}] grabbed cat", grabbed)
            if not grabbed:
                continue
            # DYNAMIC INVARIANT (grab path): grabbing must NOT resize the native window — the old code
            # shrank the docked (expanded) window to 190 on drag:start, which flashed. The window is
            # dragged at its current (expanded) size, so drag:start sees a >190 window.
            ds = last_json("drag:start")
            if ds and isinstance(ds.get("winSize"), dict):
                s = ds["winSize"]
                check(f"[{edge}] grab NO-resize (no flash)", s.get("w", 0) > 190 or s.get("h", 0) > 190,
                      f"winSize={s} (should be the expanded size, not 190×190)")
            sd_prev = count("snap:done")
            g.move_ghosted(ghost, targets[edge][0], targets[edge][1], dur=0.8)
            pyautogui.mouseUp()
            sc = wait_new("snap:done", sd_prev, timeout=6)
            check(f"[{edge}] snapped", bool(sc) and sc.get("edge") == edge,
                  f"edge={sc.get('edge') if sc else None}")

            # ponytail: cursor is ON the cat after snap → accidental expand.  For
            # vertical edges the expanded window (190×550) covers the workarea center,
            # so move to the DIAGONAL-OPPOSITE corner to guarantee escaping the bounds.
            safe_corners = {
                "right":  (wa["x"] + 25,                wa["y"] + 25),
                "left":   (wa["x"] + wa["width"] - 25,  wa["y"] + 25),
                "top":    (wa["x"] + 25,                wa["y"] + wa["height"] - 25),
                "bottom": (wa["x"] + 25,                wa["y"] + 25),
            }
            safe = g.to_physical(*safe_corners[edge], scale)
            g.move_ghosted(ghost, safe[0], safe[1], dur=0.3)
            g.wait(0.6)  # let accidental expand/collapse settle + catRect refresh (400ms interval)

            # hover the (new) cat position -> expand
            # Use snap target (ground truth) not potentially-stale cat:screen log
            if sc and "target" in sc:
                cat_cx = sc["target"]["x"] + 95  # center of 190x190 window
                cat_cy = sc["target"]["y"] + 95
            else:
                cat_cx, cat_cy = cat_center_dip()
            c = g.to_physical(cat_cx, cat_cy, scale)
            exp_prev = count("window:expand")
            g.move_ghosted(ghost, c[0], c[1], dur=0.5)
            ev = wait_new("window:expand", exp_prev, timeout=6)
            check(f"[{edge}] expands", bool(ev) and ev.get("edge") == edge)
            # DYNAMIC INVARIANT (the flicker fix): hover expand must NOT resize/move the native window
            # — the docked window is already the expanded size. Assert expand bounds == docked bounds.
            if ev and "to" in ev and sc and "expanded" in sc:
                same = (ev["to"] == sc["expanded"])
                check(f"[{edge}] expand NO-resize (flicker-free)", same,
                      f"docked={sc['expanded']} expand_to={ev['to']}")
            if ev and "to" in ev:
                b = norm_box(ev["to"])
                check(f"[{edge}] panel ON-SCREEN", inside(b, wa, edge), f"to={b}")
            g.wait(0.6)  # let panel:rects emit (400ms interval) for the width-consistency check
            # GOAL check (not just on-screen): capture the real rendered panel width on this edge.
            pr = last_json("panel:rects")
            ai = (pr or {}).get("addInput") if isinstance(pr, dict) else None
            if ai and ai.get("w"):
                panel_widths[edge] = ai["w"]
            # ORACLE dimension #2 — POSITION: top/bottom panel must be CENTRED on the cat (the panel
            # is full-window-width there, so panel centre == window centre). Catches the "shoved to
            # one side" bug that width-consistency alone sailed past.
            if edge in ("top", "bottom") and ev and "to" in ev:
                b = norm_box(ev["to"])
                cs = last_json("cat:screen")
                if cs:
                    cat_cx = cs["x"] + cs["w"] / 2
                    panel_cx = b["x"] + b["w"] / 2
                    check(f"[{edge}] panel CENTRED on cat", abs(cat_cx - panel_cx) <= 10,
                          f"cat_cx={cat_cx:.0f} panel_cx={panel_cx:.0f} off={cat_cx - panel_cx:.0f}")
            # ORACLE dimension #3 — HUG: gap between the panel's cat-facing edge and the visible cat
            # must be small (the cat box used to leave ~64h/~74v of dead space). pr.panel = card rect.
            pan = (pr or {}).get("panel") if isinstance(pr, dict) else None
            cs2 = last_json("cat:screen")
            if pan and cs2 and cs2.get("w") and cs2["w"] < 100:  # content rect (63), not the 150 box
                if edge == "right":
                    gap = cs2["x"] - (pan["x"] + pan["w"])
                elif edge == "left":
                    gap = pan["x"] - (cs2["x"] + cs2["w"])
                elif edge == "bottom":
                    gap = cs2["y"] - (pan["y"] + pan["h"])
                else:  # top
                    gap = pan["y"] - (cs2["y"] + cs2["h"])
                panel_gaps[edge] = round(gap)
            shots.shot(f"{edge}_expanded")

            # move to the OPPOSITE edge -> definitely outside -> collapse
            col_prev = count("window:collapse")
            opp = targets[OPP[edge]]
            g.move_ghosted(ghost, opp[0], opp[1], dur=0.5)
            cev = wait_new("window:collapse", col_prev, timeout=4)
            check(f"[{edge}] collapses", bool(cev))
            g.wait(0.3)

        # GOAL: the panel must be EQUALLY usable on every edge — assert its rendered width is
        # consistent across all 4 docked edges (catches the "top/bottom panel too narrow" bug that
        # a mere on-screen check sailed past).
        if len(panel_widths) == 4:
            ws = list(panel_widths.values())
            spread = max(ws) - min(ws)
            check("panel width CONSISTENT across edges", spread <= 16,
                  f"widths={panel_widths} spread={spread}px")
        else:
            check("panel width CONSISTENT across edges", False,
                  f"missing panel:rects for some edges: {panel_widths}")

        # ORACLE dimension #3 — HUG: panel sits close to the visible cat on every edge (no big dead
        # gap), and never overlaps it (gap >= 0). Was ~64-74px before the hug.
        if len(panel_gaps) == 4:
            check("panel HUGS cat (small gap, no overlap) all edges",
                  all(0 <= gpx <= 45 for gpx in panel_gaps.values()),
                  f"gaps={panel_gaps}")
        else:
            check("panel HUGS cat (small gap, no overlap) all edges", False,
                  f"missing gap for some edges: {panel_gaps}")

        npass = sum(1 for _, ok, _ in results if ok)
        print(f"\n[SUITE] {npass}/{len(results)} passed")
        # emit a concise machine-readable report (the "signal" for the auto-iterate loop)
        report = {
            "ts": time.strftime("%Y-%m-%d %H:%M:%S"),
            "pass": npass, "total": len(results),
            "failures": [{"name": n, "detail": d} for n, ok, d in results if not ok],
        }
        (PROJECT / "state").mkdir(exist_ok=True)
        (PROJECT / "state" / "probe_report.json").write_text(
            json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        return 0 if npass == len(results) else 2
    finally:
        if ghost:
            ghost.destroy()
        g.kill(proc)


if __name__ == "__main__":
    raise SystemExit(main())
