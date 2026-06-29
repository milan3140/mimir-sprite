"""Mimir-Sprite — panel CRUD × 4 edges self-test (TEST_DESIGN §3: F5/F6/F8/F9/F10 + F7).

Goal: the panel must be EQUALLY usable docked on every edge — rows + buttons reachable and working.
Per edge {right, top, left, bottom}, docked + expanded, drive via the REAL mouse and assert effects
through panel:rects (the renderer's reported row/button rects + titles — todo ops are ipc.handle with
no log event, so panel:rects state IS the oracle here):

  add -> rename -> detail open/close (F7) -> start -> pause -> complete -> add2 -> remove
  net-zero: visible row count returns to the per-edge baseline.

Run:  py scripts/probe_panel.py
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


# Type via CLIPBOARD paste, NOT pyautogui.typewrite: a Chinese (Bopomofo/注音) IME is active on this
# machine and intercepts typed lowercase Latin letters into composition garbage ("PB-right-1"->"PBㄅㄦ").
# Paste bypasses the IME entirely. Use pyperclip (the tkinter clipboard dropped values flakily — only
# ~1 of 4 pastes landed, giving false add failures).
import pyperclip  # noqa: E402


def paste(text: str) -> None:
    pyperclip.copy(text)
    # verify the clipboard actually holds it before pasting (retry — clipboard sets can race)
    for _ in range(5):
        if pyperclip.paste() == text:
            break
        time.sleep(0.05)
        pyperclip.copy(text)
    time.sleep(0.05)
    pyautogui.hotkey("ctrl", "v")
    time.sleep(0.12)


def rows_now() -> list[dict]:
    return (last_json("panel:rects") or {}).get("rows") or []


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


def add_input_rect() -> dict | None:
    return (last_json("panel:rects") or {}).get("addInput")


SCALE = 1.0


def click_dip(ghost, x, y, dur=0.3, settle=0.22):
    # settle AFTER arriving so the clickThrough 100ms poll marks the window interactive before we
    # click — clicking the instant we arrive races the poll and the click falls through to desktop.
    p = g.to_physical(x, y, SCALE)
    g.move_ghosted(ghost, p[0], p[1], dur=dur)
    time.sleep(settle)
    pyautogui.click()


def grab_cat(ghost, wa, attempts=4) -> bool:
    for _ in range(attempts):
        cx, cy = cat_center_dip()
        nx = wa["x"] + (wa["width"] - 60 if cx - wa["x"] < wa["width"] / 2 else 60)
        ny = wa["y"] + (wa["height"] - 60 if cy - wa["y"] < wa["height"] / 2 else 60)
        g.move_ghosted(ghost, *g.to_physical(nx, ny, SCALE), dur=0.3)
        time.sleep(0.5)
        cx, cy = cat_center_dip()
        g.move_ghosted(ghost, *g.to_physical(cx, cy, SCALE), dur=0.4)
        wait_new("window:expand", count("window:expand"), timeout=4)
        time.sleep(0.3)
        ds_prev = count("drag:start")
        pyautogui.mouseDown()
        if wait_new("drag:start", ds_prev, timeout=3):
            return True
        pyautogui.mouseUp()
        time.sleep(0.5)
    return False


def dock_and_expand(ghost, wa, edge) -> bool:
    if not grab_cat(ghost, wa):
        return False
    sd_prev = count("snap:done")
    tp = {
        "right":  (wa["x"] + wa["width"] - 30, wa["y"] + wa["height"] // 2),
        "left":   (wa["x"] + 30, wa["y"] + wa["height"] // 2),
        "top":    (wa["x"] + wa["width"] // 2, wa["y"] + 30),
        "bottom": (wa["x"] + wa["width"] // 2, wa["y"] + wa["height"] - 30),
    }[edge]
    g.move_ghosted(ghost, *g.to_physical(*tp, SCALE), dur=0.7)
    pyautogui.mouseUp()
    sc = wait_new("snap:done", sd_prev, timeout=6)
    if not (sc and sc.get("edge") == edge):
        return False
    # escape, re-hover to expand
    g.move_ghosted(ghost, *g.to_physical(wa["x"] + wa["width"] // 2, wa["y"] + wa["height"] // 2, SCALE), dur=0.3)
    time.sleep(0.6)
    cx, cy = cat_center_dip()
    g.move_ghosted(ghost, *g.to_physical(cx, cy, SCALE), dur=0.4)
    wait_new("window:expand", count("window:expand"), timeout=5)
    time.sleep(0.6)
    return add_input_rect() is not None


def find_row(rid):
    return next((r for r in rows_now() if r["id"] == rid), None)


def btn_center(row, name):
    b = row.get(name)
    return (b["x"] + b["w"] / 2, b["y"] + b["h"] / 2) if b else None


def test_edge(ghost, wa, edge) -> None:
    if not dock_and_expand(ghost, wa, edge):
        check(f"[{edge}] dock+expand", False)
        return
    check(f"[{edge}] dock+expand", True)

    base = rows_now()
    ids0 = {r["id"] for r in base}
    C0 = len(base)

    # ADD
    ai = add_input_rect()
    click_dip(ghost, ai["x"] + ai["w"] / 2, ai["y"] + ai["h"] / 2)
    time.sleep(0.2)
    paste(f"PB-{edge}-1")
    time.sleep(0.35)
    pyautogui.press("enter")
    r = wait_rows(lambda rs: len(rs) == C0 + 1)
    new_ids = [x["id"] for x in r if x["id"] not in ids0]
    check(f"[{edge}] add", len(r) == C0 + 1 and len(new_ids) == 1, f"rows {C0}->{len(r)}")
    if not new_ids:
        return
    rid = new_ids[0]

    # RENAME (double-click title region -> type -> enter)
    row = find_row(rid)
    chev = row.get("chevron")
    tx = (chev["x"] + chev["w"] + 10) if chev else row["rect"]["x"] + 30
    ty = row["rect"]["y"] + row["rect"]["h"] / 2
    p = g.to_physical(tx, ty, SCALE)
    g.move_ghosted(ghost, p[0], p[1], dur=0.3)
    time.sleep(0.22)  # let clickThrough mark interactive before the double-click
    pyautogui.doubleClick()
    time.sleep(0.3)
    paste(f"RN-{edge}")
    pyautogui.press("enter")
    r = wait_rows(lambda rs: (find_or(rs, rid, "title") or "").startswith("RN-"))
    check(f"[{edge}] rename", (find_or(r, rid, "title") or "").startswith("RN-"),
          f"title={find_or(r, rid, 'title')!r}")

    # DETAIL open (F7) -> grows + closes
    row = find_row(rid)
    d0 = (row.get("detail") or {}).get("h", 0)
    cc = btn_center(row, "chevron")
    if cc:
        click_dip(ghost, *cc)
        r = wait_rows(lambda rs: ((find_or(rs, rid, "detail") or {}).get("h", 0) > d0 + 20))
        d1 = (find_or(r, rid, "detail") or {}).get("h", 0)
        check(f"[{edge}] detail opens (F7)", d1 > d0 + 20, f"detail_h {d0}->{d1}")
        row = find_row(rid)
        cc = btn_center(row, "chevron")
        click_dip(ghost, *cc)  # close
        wait_rows(lambda rs: ((find_or(rs, rid, "detail") or {}).get("h", 999) < d1 - 10))

    # START -> PAUSE -> COMPLETE
    row = find_row(rid)
    sc = btn_center(row, "start")
    if sc:
        click_dip(ghost, *sc)
        r = wait_rows(lambda rs: find_or(rs, rid, "pause") is not None)
        check(f"[{edge}] start (->active, pause shows)", find_or(r, rid, "pause") is not None)
    row = find_row(rid)
    pc = btn_center(row, "pause")
    if pc:
        click_dip(ghost, *pc)
        r = wait_rows(lambda rs: find_or(rs, rid, "start") is not None)
        check(f"[{edge}] pause (->paused, start shows)", find_or(r, rid, "start") is not None)
    row = find_row(rid)
    kc = btn_center(row, "complete")
    if kc:
        click_dip(ghost, *kc)
        r = wait_rows(lambda rs: find_row_in(rs, rid) is None)
        check(f"[{edge}] complete (row leaves visible)", find_row_in(r, rid) is None, f"rows={len(r)}")

    # ADD2 + REMOVE (hover reveals delete)
    ai = add_input_rect()
    click_dip(ghost, ai["x"] + ai["w"] / 2, ai["y"] + ai["h"] / 2)
    time.sleep(0.2)
    paste(f"PB-{edge}-2")
    pyautogui.press("enter")
    r = wait_rows(lambda rs: len(rs) == C0 + 1)
    nid = next((x["id"] for x in r if x["id"] not in ids0), None)
    if nid:
        row = find_row(nid)
        # hover the row (left area, not a button) to reveal the delete button
        hx = row["rect"]["x"] + 30
        hy = row["rect"]["y"] + row["rect"]["h"] / 2
        g.move_ghosted(ghost, *g.to_physical(hx, hy, SCALE), dur=0.3)
        r = wait_rows(lambda rs: find_or(rs, nid, "delete") is not None, timeout=3)
        dc = btn_center(find_row(nid) or {}, "delete")
        if dc:
            click_dip(ghost, *dc)
            r = wait_rows(lambda rs: len(rs) == C0)
            check(f"[{edge}] remove (hover->delete, row gone)", len(r) == C0, f"rows={len(r)}")
        else:
            check(f"[{edge}] remove (hover->delete, row gone)", False, "delete btn never appeared")

    # NET-ZERO on visible count
    final = wait_rows(lambda rs: len(rs) == C0, timeout=2)
    check(f"[{edge}] net-zero visible count (=={C0})", len(final) == C0, f"final={len(final)}")
    # collapse before next edge
    g.move_ghosted(ghost, *g.to_physical(wa["x"] + wa["width"] // 2, wa["y"] + wa["height"] // 2, SCALE), dur=0.3)
    time.sleep(0.6)


def find_or(rows, rid, key):
    r = next((x for x in rows if x["id"] == rid), None)
    return r.get(key) if r else None


def find_row_in(rows, rid):
    return next((x for x in rows if x["id"] == rid), None)


def main() -> int:
    global SCALE
    if LOG.exists():
        LOG.unlink()
    g.free_port(5173)
    SCALE = g.dpi_scale()
    proc = g.launch("npm run dev", cwd=PROJECT)
    # NO GhostCursor here: this probe TYPES into focused fields, and the ghost (a topmost tkinter
    # overlay at the cursor) steals keyboard focus on click, so typed text is lost and add/rename
    # silently no-op. (Cosmetic only; safe to drop.)
    ghost = None
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
        for edge in ["right", "top", "left", "bottom"]:
            test_edge(ghost, wa, edge)

        npass = sum(1 for _, ok, _ in results if ok)
        print(f"\n[PANEL] {npass}/{len(results)} passed")
        (PROJECT / "state").mkdir(exist_ok=True)
        (PROJECT / "state" / "probe_panel_report.json").write_text(json.dumps(
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
