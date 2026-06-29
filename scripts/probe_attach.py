"""Mimir-Sprite — M3b paste-screenshot attachment + redesigned detail self-test.

Verifies the full roundtrip with the MATCHED modality:
  - put a distinctive image on the Windows clipboard (CF_DIB)
  - focus the add-todo box, Ctrl+V  -> a PENDING thumbnail queues
  - submit -> a new todo gets a 📎 indicator
  - open its detail -> the thumbnail RENDERS (loaded back from disk = save+read roundtrip works)
  - screenshot the open detail so the agent can SEE the redesign (no card/box, no repeated title)

Run:  py scripts/probe_attach.py
"""
from __future__ import annotations
import io
import json
import re
import sys
import time
from pathlib import Path

import mss
import numpy as np
from PIL import Image, ImageDraw
import win32clipboard

PROJECT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str((PROJECT.parents[2] / "2_Toolkit/Harness/gui_visual_probe").resolve()))
import gui_probe as g  # noqa: E402
import pyautogui  # noqa: E402

LOG = PROJECT / "mimir-debug.log"
OUT = PROJECT / "_attach_shots"
OUT.mkdir(parents=True, exist_ok=True)
results: list[tuple[str, bool, str]] = []
SCT = mss.mss()


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


def wait_rows(pred, timeout: float = 5.0) -> list[dict]:
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


SCALE = 1.0


def click_dip(x, y, dur=0.3, settle=0.22):
    p = g.to_physical(x, y, SCALE)
    g.move_ghosted(None, p[0], p[1], dur=dur)
    time.sleep(settle)
    pyautogui.click()


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


def set_clipboard_image(img: Image.Image) -> None:
    out = io.BytesIO()
    img.convert("RGB").save(out, "BMP")
    dib = out.getvalue()[14:]  # strip 14-byte BMP file header -> DIB for CF_DIB
    out.close()
    for _ in range(3):
        try:
            win32clipboard.OpenClipboard()
            win32clipboard.EmptyClipboard()
            win32clipboard.SetClipboardData(win32clipboard.CF_DIB, dib)
            win32clipboard.CloseClipboard()
            return
        except Exception:
            time.sleep(0.1)


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

        # dock right + expand
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
        check("panel expanded", True)

        # distinctive clipboard image (red bg, green diagonal, blue corner)
        im = Image.new("RGB", (120, 90), (200, 40, 40))
        d = ImageDraw.Draw(im)
        d.line((0, 0, 120, 90), fill=(40, 200, 60), width=8)
        d.rectangle((0, 0, 30, 30), fill=(40, 60, 220))
        set_clipboard_image(im)

        # focus add box, paste -> pending thumbnail
        click_dip(ai["x"] + ai["w"] / 2, ai["y"] + ai["h"] / 2)
        time.sleep(0.2)
        save_prev = count("attachment:save")
        pyautogui.hotkey("ctrl", "v")
        time.sleep(0.8)
        pend = rects().get("pendingThumbs", 0)
        check("paste queues a pending thumbnail", pend >= 1, f"pendingThumbs={pend}")

        # submit -> new todo with 📎
        ids_before = {r["id"] for r in rows_now()}
        pyautogui.press("enter")
        r = wait_rows(lambda rs: any(x["id"] not in ids_before and x.get("hasAttach") for x in rs), timeout=6)
        newrow = next((x for x in r if x["id"] not in ids_before), None)
        check("submit creates todo with attachment (📎)", bool(newrow) and newrow.get("hasAttach"),
              f"hasAttach={newrow.get('hasAttach') if newrow else None}")
        saved = wait_new("attachment:save", save_prev, timeout=4)
        check("main saved the attachment to disk", bool(saved), f"rel={saved.get('rel') if saved else None}")
        if not newrow:
            return 2
        nid = newrow["id"]

        # open its detail -> thumbnail renders (loaded back from disk)
        row = next((x for x in rows_now() if x["id"] == nid), None)
        chev = row.get("chevron") if row else None
        if chev:
            click_dip(chev["x"] + chev["w"] / 2, chev["y"] + chev["h"] / 2)
            r = wait_rows(lambda rs: next((x for x in rs if x["id"] == nid), {}).get("thumbLoaded") is True, timeout=5)
            row = next((x for x in r if x["id"] == nid), {})
            check("detail thumbnail RENDERS (disk roundtrip)", row.get("thumbLoaded") is True,
                  f"thumbs={row.get('thumbs')} loaded={row.get('thumbLoaded')}")
            # screenshot the open detail for the agent to LOOK at the redesign
            time.sleep(0.4)
            pan = rects().get("panel")
            if pan:
                x = int((pan["x"] - 10) * SCALE); y = int((pan["y"] - 10) * SCALE)
                w = int((pan["w"] + 20) * SCALE); h = int((pan["h"] + 20) * SCALE)
                img = np.asarray(SCT.grab({"left": max(0, x), "top": max(0, y), "width": w, "height": h}))[:, :, :3]
                Image.fromarray(img[:, :, ::-1]).save(OUT / "detail_redesign.png")

        npass = sum(1 for _, ok, _ in results if ok)
        print(f"\n[ATTACH] {npass}/{len(results)} passed")
        (PROJECT / "state").mkdir(exist_ok=True)
        (PROJECT / "state" / "probe_attach_report.json").write_text(json.dumps(
            {"pass": npass, "total": len(results),
             "failures": [{"name": n, "detail": d} for n, ok, d in results if not ok]},
            ensure_ascii=False, indent=2), encoding="utf-8")
        return 0 if npass == len(results) else 2
    finally:
        g.kill(proc)


if __name__ == "__main__":
    raise SystemExit(main())
