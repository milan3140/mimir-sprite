"""Mimir-Sprite — Notes auto-grow check (+ doubles as the isolated-run notification demo).

Opens a todo detail, pastes a 20-line note, and asserts the notes textarea GREW (field-sizing:content)
instead of staying crammed at 2 lines. Screenshots the detail to look at.

Run isolated:  py 2_Toolkit/Harness/gui_visual_probe/run_isolated.py py scripts/probe_note.py
"""
from __future__ import annotations
import json
import re
import sys
import time
from pathlib import Path

import mss
import numpy as np
import pyperclip
from PIL import Image

PROJECT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str((PROJECT.parents[2] / "2_Toolkit/Harness/gui_visual_probe").resolve()))
import gui_probe as g  # noqa: E402
import pyautogui  # noqa: E402

LOG = PROJECT / "mimir-debug.log"
OUT = PROJECT / "_note_shots"
OUT.mkdir(parents=True, exist_ok=True)
results: list[tuple[str, bool, str]] = []
SCT = mss.mss()
SCALE = 1.0


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


def rects() -> dict:
    return last_json("panel:rects") or {}


def rows_now() -> list[dict]:
    return rects().get("rows") or []


def wait_rows(pred, timeout=5.0):
    t0 = time.time()
    while time.time() - t0 < timeout:
        r = rows_now()
        try:
            if pred(r):
                return r
        except Exception:
            pass
        time.sleep(0.2)
    return rows_now()


def click_dip(x, y, dur=0.3, settle=0.22):
    g.move_ghosted(None, *g.to_physical(x, y, SCALE), dur=dur)
    time.sleep(settle)
    pyautogui.click()


def paste(text: str) -> None:
    pyperclip.copy(text)
    for _ in range(5):
        if pyperclip.paste() == text:
            break
        time.sleep(0.05); pyperclip.copy(text)
    time.sleep(0.05); pyautogui.hotkey("ctrl", "v"); time.sleep(0.12)


def neutral_grab(wa, attempts=4) -> bool:
    for _ in range(attempts):
        cx, cy = cat_center_dip()
        nx = wa["x"] + (wa["width"] - 60 if cx - wa["x"] < wa["width"] / 2 else 60)
        ny = wa["y"] + (wa["height"] - 60 if cy - wa["y"] < wa["height"] / 2 else 60)
        g.move_ghosted(None, *g.to_physical(nx, ny, SCALE), dur=0.3)
        time.sleep(0.5)
        cx, cy = cat_center_dip()
        g.move_ghosted(None, *g.to_physical(cx, cy, SCALE), dur=0.4)
        wait_new("window:expand", count("window:expand"), timeout=4)
        time.sleep(0.3)
        ds = count("drag:start")
        pyautogui.mouseDown()
        if wait_new("drag:start", ds, timeout=3):
            return True
        pyautogui.mouseUp(); time.sleep(0.5)
    return False


def find_or(rows, rid, key):
    r = next((x for x in rows if x["id"] == rid), None)
    return r.get(key) if r else None


def main() -> int:
    global SCALE
    if LOG.exists():
        LOG.unlink()
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
        check("app boots", win is not None)
        if not win:
            return 1
        wa = workarea()
        time.sleep(1.5)
        if not neutral_grab(wa):
            check("dock right", False); return 2
        sd = count("snap:done")
        g.move_ghosted(None, *g.to_physical(wa["x"] + wa["width"] - 30, wa["y"] + wa["height"] // 2, SCALE), dur=0.7)
        pyautogui.mouseUp()
        sc = wait_new("snap:done", sd, timeout=6)
        check("dock right", bool(sc) and sc.get("edge") == "right")
        g.move_ghosted(None, *g.to_physical(wa["x"] + 80, wa["y"] + 80, SCALE), dur=0.3)
        time.sleep(0.6)
        cx, cy = cat_center_dip()
        g.move_ghosted(None, *g.to_physical(cx, cy, SCALE), dur=0.4)
        wait_new("window:expand", count("window:expand"), timeout=5)
        time.sleep(0.6)
        ai = rects().get("addInput")
        if not ai:
            check("panel expanded", False); return 2

        # add a todo
        ids0 = {r["id"] for r in rows_now()}
        click_dip(ai["x"] + ai["w"] / 2, ai["y"] + ai["h"] / 2)
        time.sleep(0.2); paste("note-grow-test"); pyautogui.press("enter")
        r = wait_rows(lambda rs: any(x["id"] not in ids0 for x in rs))
        nid = next((x["id"] for x in r if x["id"] not in ids0), None)
        if not nid:
            check("add todo", False); return 2

        # open its detail
        row = next((x for x in rows_now() if x["id"] == nid), None)
        chev = row.get("chevron") if row else None
        click_dip(chev["x"] + chev["w"] / 2, chev["y"] + chev["h"] / 2)
        wait_rows(lambda rs: (find_or(rs, nid, "detail") or {}).get("h", 0) > 20)
        h0 = find_or(rows_now(), nid, "notesH") or 0

        # click the notes textarea + paste a 20-line note
        row = next((x for x in rows_now() if x["id"] == nid), None)
        det = row.get("detail")
        click_dip(det["x"] + det["w"] / 2, det["y"] + 14)  # near the top of the detail = notes area
        time.sleep(0.2)
        note = "\n".join(f"line {i+1}: the quick brown fox jumps over the lazy dog" for i in range(20))
        paste(note)
        time.sleep(0.6)
        h1 = find_or(rows_now(), nid, "notesH") or 0
        check("notes auto-grow with content (not crammed at 2 lines)", h1 > h0 + 120,
              f"notesH {h0}->{h1}px (20-line note)")

        # screenshot the detail
        pan = rects().get("panel")
        if pan:
            x = int((pan["x"] - 10) * SCALE); y = int((pan["y"] - 10) * SCALE)
            w = int((pan["w"] + 20) * SCALE); h = int((pan["h"] + 20) * SCALE)
            img = np.asarray(SCT.grab({"left": max(0, x), "top": max(0, y), "width": w, "height": h}))[:, :, :3]
            Image.fromarray(img[:, :, ::-1]).save(OUT / "notes_grown.png")

        npass = sum(1 for _, ok, _ in results if ok)
        print(f"\n[NOTE] {npass}/{len(results)} passed")
        return 0 if npass == len(results) else 2
    finally:
        g.kill(proc)


if __name__ == "__main__":
    raise SystemExit(main())
