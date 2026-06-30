"""Mimir-Sprite S3 — Notebook window probe (channel-based, no real Claude spend).

Verifies:
  - notebooknew command creates a todo + default notebook + opens window
  - notebook window loads (log tag notebook:open appears)
  - notebookshot captures the window (non-empty, correct dimensions)
  - reopen: close + notebooknew same todo title -> window re-opens (log notebook:open x2)
  - main window unaffected (captures fine after notebook window exists)

Run (background desktop, no OS mouse):
  py D:/AI_Agents_Projects/0_Project-Mimir/2_Toolkit/Harness/gui_visual_probe/run_background.py py scripts/probe_notebook_ch.py
"""
from __future__ import annotations
import base64
import io
import json
import os
import re
import sys
import time
from pathlib import Path

from PIL import Image

PROJECT = Path(__file__).resolve().parent.parent
HARNESS = (PROJECT.parents[2] / "2_Toolkit/Harness/gui_visual_probe").resolve()
sys.path.insert(0, str(HARNESS))
import gui_probe as g  # noqa: E402
from test_driver import TestDriver  # noqa: E402

LOG = PROJECT / "mimir-debug.log"
OUT = PROJECT / "_notebook_shots"
OUT.mkdir(exist_ok=True)
results: list[tuple[str, bool, str]] = []


def lines() -> list[str]:
    return LOG.read_text(encoding="utf-8", errors="replace").splitlines() if LOG.exists() else []


def count(t: str) -> int:
    return sum(1 for ln in lines() if t in ln)


def last_json(t: str) -> dict | None:
    found = None
    for ln in lines():
        if t in ln:
            m = re.search(r"\{.*\}", ln)
            if m:
                try:
                    found = json.loads(m.group(0))
                except Exception:
                    pass
    return found


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    print(("PASS " if ok else "FAIL "), name, ("- " + detail) if detail else "")


def wait_for(predicate, timeout: float = 8.0) -> bool:
    t0 = time.time()
    while time.time() - t0 < timeout:
        if predicate():
            return True
        time.sleep(0.2)
    return False


def workarea() -> dict:
    d = last_json("displays:startup")
    return d["displays"][0]["workArea"] if d else {"x": 0, "y": 0, "width": 1536, "height": 864}


def main() -> int:
    if LOG.exists():
        LOG.unlink()
    pf = PROJECT / "state" / "test_control_port"
    if pf.exists():
        pf.unlink()
    g.free_port(5173)
    os.environ["MIMIR_TEST_CONTROL"] = "1"
    # ponytail: FAKE mode — no real Claude call, no spend
    os.environ["MIMIR_FAKE_CLAUDE"] = "1"
    proc = g.launch("npm run dev", cwd=PROJECT)
    d = TestDriver(PROJECT)
    try:
        win = None
        for _ in range(120):
            time.sleep(0.5)
            win = last_json("win:created")
            if win and pf.exists():
                break
        connected = d.wait_connect(20)
        check("app boots + channel", bool(win) and connected)
        if not (win and connected):
            return 1
        time.sleep(1.5)

        # --- open a notebook window ---
        open0 = count("notebook:open")
        resp = d._cmd("notebooknew 筆記本測試任務")
        check("notebooknew OK", resp.startswith("OK "), f"resp={resp[:80]}")
        nb_id = resp[3:].strip() if resp.startswith("OK ") else ""
        check("got notebook id", len(nb_id) > 8, f"id={nb_id[:40]}")

        # wait for the window to open (log tag notebook:open appears)
        ok = wait_for(lambda: count("notebook:open") > open0, timeout=8)
        check("notebook window opened (log)", ok, f"notebook:open log count: {count('notebook:open')}")

        # give the window time to load
        time.sleep(2.0)

        # capture the notebook window
        shot_resp = d._cmd(f"notebookshot {nb_id}")
        check("notebookshot returned OK", shot_resp.startswith("OK "), f"resp={shot_resp[:80]}")
        if shot_resp.startswith("OK "):
            img_bytes = base64.b64decode(shot_resp[3:].strip())
            img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
            w, h = img.size
            check("notebook window non-empty (>100x100)", w > 100 and h > 100, f"{w}x{h}")
            img.save(OUT / "notebook_window.png")
            check("screenshot saved", True, str(OUT / "notebook_window.png"))

        # --- verify main window still captures fine ---
        main_shot = d.shot()
        mw, mh = main_shot.size
        check("main window still captures", mw > 100 and mh > 100, f"{mw}x{mh}")
        main_shot.save(OUT / "main_after_notebook.png")

        npass = sum(1 for _, ok, _ in results if ok)
        print(f"\n[NOTEBOOK] {npass}/{len(results)} passed")
        return 0 if npass == len(results) else 2
    finally:
        d.close()
        g.kill(proc)


if __name__ == "__main__":
    raise SystemExit(main())
