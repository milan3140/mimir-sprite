"""Mimir-Sprite — todo DETAIL accordion self-test (F7).

Goal of the feature: clicking a row's chevron opens an INLINE animated accordion (no modal, no "Detail"
header, no ×) that pushes the rows below DOWN; clicking again closes it and the rows return. Detail must
stay within the panel (panel scrolls).

Oracle (independent of the renderer's own animation code):
  - functional (panel:rects log): after opening, the row's detail height grows and a row BELOW moves
    DOWN by ~the detail height; after closing, it returns. detailOpen flips true/false.
  - visual (pixels): burst-capture the panel while opening so the agent can SEE it animate (intermediate
    heights, rows sliding) and confirm there is no "Detail" header text and no × button.

Run:  py scripts/probe_detail.py
"""
from __future__ import annotations
import json
import re
import sys
import time
from pathlib import Path

import mss
import numpy as np
from PIL import Image

PROJECT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str((PROJECT.parents[2] / "2_Toolkit/Harness/gui_visual_probe").resolve()))
import gui_probe as g  # noqa: E402
import pyautogui  # noqa: E402

LOG = PROJECT / "mimir-debug.log"
OUT = PROJECT / "_detail_shots"
OUT.mkdir(parents=True, exist_ok=True)
results: list[tuple[str, bool, str]] = []
SCT = mss.mss()
MON = SCT.monitors[1]


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
        time.sleep(0.15)
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
        p = g.to_physical(cx, cy, scale)
        g.move_ghosted(ghost, p[0], p[1], dur=0.4)
        wait_new("window:expand", count("window:expand"), timeout=4)
        time.sleep(0.3)
        ds_prev = count("drag:start")
        pyautogui.mouseDown()
        if wait_new("drag:start", ds_prev, timeout=3):
            return True
        pyautogui.mouseUp()
        time.sleep(0.5)
    return False


def panel_rects() -> dict | None:
    return last_json("panel:rects")


def shot_region(name: str, rect: dict, scale: float, pad: int = 16) -> None:
    """Screenshot a DIP rect (panel:rects screen coords) -> save."""
    x = int((rect["x"] - pad) * scale); y = int((rect["y"] - pad) * scale)
    w = int((rect["w"] + 2 * pad) * scale); h = int((rect["h"] + 2 * pad) * scale)
    x = max(0, x); y = max(0, y)
    img = np.asarray(SCT.grab({"left": x, "top": y, "width": w, "height": h}))[:, :, :3]
    Image.fromarray(img[:, :, ::-1]).save(OUT / f"{name}.png")


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

        # dock RIGHT (panel opens to the left — widest, clearest view)
        if not grab_cat(ghost, scale, wa):
            check("dock right", False); return 2
        sd_prev = count("snap:done")
        tgt = g.to_physical(wa["x"] + wa["width"] - 30, wa["y"] + wa["height"] // 2, scale)
        g.move_ghosted(ghost, tgt[0], tgt[1], dur=0.7)
        pyautogui.mouseUp()
        sc = wait_new("snap:done", sd_prev, timeout=6)
        check("dock right", bool(sc) and sc.get("edge") == "right")
        # escape + re-hover to expand
        g.move_ghosted(ghost, *g.to_physical(wa["x"] + 80, wa["y"] + 80, scale), dur=0.3)
        time.sleep(0.6)
        ccx, ccy = cat_center_dip()
        g.move_ghosted(ghost, *g.to_physical(ccx, ccy, scale), dur=0.4)
        wait_new("window:expand", count("window:expand"), timeout=5)
        time.sleep(0.5)

        pr = panel_rects()
        if not (pr and pr.get("addInput")):
            check("panel expanded w/ add-input", False, f"pr={bool(pr)}"); return 2
        check("panel expanded w/ add-input", True)

        # add 3 todos (1 long + 2 short) so there are rows BELOW the first to watch get pushed
        ai = pr["addInput"]
        aic = g.to_physical(ai["x"] + ai["w"] / 2, ai["y"] + ai["h"] / 2, scale)
        items = ["This is a deliberately long todo title to exercise multi-line detail wrapping and scroll",
                 "second task", "third task"]
        for it in items:
            g.move_ghosted(ghost, aic[0], aic[1], dur=0.3)
            pyautogui.click()
            time.sleep(0.2)
            n_prev = count("todo:add") if count("todo:add") else 0
            pyautogui.typewrite(it, interval=0.005)
            pyautogui.press("enter")
            time.sleep(0.5)
        time.sleep(0.6)
        pr = panel_rects()
        rows = (pr or {}).get("rows") or []
        check("rows added", len(rows) >= 3, f"rows={len(rows)}")
        if len(rows) < 2:
            return 2

        # locate row[0] chevron + a row BELOW it
        r0 = rows[0]
        chev = r0.get("chevron")
        below_y0 = rows[1]["rect"]["y"]
        det0_h = (r0.get("detail") or {}).get("h", 0)
        if not chev:
            check("row chevron present", False); return 2
        check("row chevron present", True)

        # screenshot BEFORE open
        shot_region("01_before", pr["panel"], scale)

        # CLICK chevron -> open, burst-capture the panel animating
        chc = g.to_physical(chev["x"] + chev["w"] / 2, chev["y"] + chev["h"] / 2, scale)
        g.move_ghosted(ghost, chc[0], chc[1], dur=0.3)
        prect = pr["panel"]
        px = int((prect["x"] - 16) * scale); py = int((prect["y"] - 16) * scale)
        pw = int((prect["w"] + 32) * scale); ph = int((prect["h"] + 32) * scale)
        reg = {"left": max(0, px), "top": max(0, py), "width": pw, "height": ph}
        pyautogui.click()
        t0 = time.time()
        i = 0
        while (time.time() - t0) * 1000 < 520:
            img = np.asarray(SCT.grab(reg))[:, :, :3]
            Image.fromarray(img[:, :, ::-1]).save(OUT / f"open_{i:02d}.png")
            i += 1
            time.sleep(0.05)
        time.sleep(0.5)

        # AFTER open: assert detail grew + a row below moved DOWN
        pr2 = panel_rects()
        rows2 = (pr2 or {}).get("rows") or []
        r0b = next((r for r in rows2 if r["id"] == r0["id"]), None)
        below_y1 = next((r["rect"]["y"] for r in rows2 if r["id"] == rows[1]["id"]), below_y0)
        det1_h = (r0b.get("detail") or {}).get("h", 0) if r0b else 0
        open_flag = (r0b or {}).get("detailOpen") == "true"
        shot_region("02_open", pr2["panel"], scale)
        check("detail OPENS (accordion grew)", det1_h > det0_h + 20 and open_flag,
              f"detail_h {det0_h}->{det1_h} open={open_flag}")
        check("opening PUSHES rows below down", below_y1 > below_y0 + 15,
              f"row-below y {below_y0}->{below_y1} (Δ={below_y1 - below_y0})")
        # detail stays within panel (bottom not past panel bottom + small tol)
        pbot = pr2["panel"]["y"] + pr2["panel"]["h"]
        dbot = (r0b.get("detail") or {}).get("y", 0) + det1_h if r0b else 0
        check("detail within panel (scrolls, not overflowing)", dbot <= pbot + 4,
              f"detail_bottom={dbot} panel_bottom={pbot}")

        # CLICK chevron again -> close, rows return
        pr3 = panel_rects()
        r0c = next((r for r in (pr3 or {}).get("rows", []) if r["id"] == r0["id"]), None)
        chev2 = (r0c or {}).get("chevron") or chev
        ch2 = g.to_physical(chev2["x"] + chev2["w"] / 2, chev2["y"] + chev2["h"] / 2, scale)
        g.move_ghosted(ghost, ch2[0], ch2[1], dur=0.3)
        pyautogui.click()
        time.sleep(0.6)
        pr4 = panel_rects()
        rows4 = (pr4 or {}).get("rows") or []
        r0d = next((r for r in rows4 if r["id"] == r0["id"]), None)
        below_y2 = next((r["rect"]["y"] for r in rows4 if r["id"] == rows[1]["id"]), below_y1)
        closed = (r0d or {}).get("detailOpen") == "false"
        shot_region("03_closed", pr4["panel"], scale)
        check("detail CLOSES (rows return)", closed and below_y2 < below_y1 - 15,
              f"open={not closed} row-below y {below_y1}->{below_y2}")

        npass = sum(1 for _, ok, _ in results if ok)
        print(f"\n[DETAIL] {npass}/{len(results)} passed")
        (PROJECT / "state").mkdir(exist_ok=True)
        (PROJECT / "state" / "probe_detail_report.json").write_text(json.dumps(
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
