"""Mimir-Sprite S4 — Row UI probe (channel-based, FAKE claude, no spend).

Verifies:
  - App boots with the todo panel visible
  - After addtodo, a row appears; capturePage shows the panel (proxy for Notebook icon visible)
  - notebooknew creates a notebook window
  - notebooksend sends a message and the notebook gains 2+ messages (user+assistant)
  - Main window unaffected

Run (background desktop):
  py D:/AI_Agents_Projects/0_Project-Mimir/2_Toolkit/Harness/gui_visual_probe/run_background.py py scripts/probe_s4_row_ui.py
"""
from __future__ import annotations
import base64, io, json, os, re, sys, time
from pathlib import Path

from PIL import Image

PROJECT = Path(__file__).resolve().parent.parent
HARNESS = (PROJECT.parents[2] / "2_Toolkit/Harness/gui_visual_probe").resolve()
sys.path.insert(0, str(HARNESS))
import gui_probe as g  # noqa: E402
from test_driver import TestDriver  # noqa: E402

OUT = PROJECT / "_s4_shots"; OUT.mkdir(exist_ok=True)
LOG = PROJECT / "mimir-debug.log"
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
                try: found = json.loads(m.group(0))
                except Exception: pass
    return found

def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    print(("PASS" if ok else "FAIL"), name, ("— " + detail) if detail else "")

def wait_for(predicate, timeout: float = 10.0) -> bool:
    t0 = time.time()
    while time.time() - t0 < timeout:
        if predicate(): return True
        time.sleep(0.2)
    return False


def main() -> int:
    if LOG.exists(): LOG.unlink()
    pf = PROJECT / "state" / "test_control_port"
    if pf.exists(): pf.unlink()
    g.free_port(5173)
    os.environ["MIMIR_TEST_CONTROL"] = "1"
    os.environ["MIMIR_FAKE_CLAUDE"] = "1"
    proc = g.launch("npm run dev", cwd=PROJECT)
    d = TestDriver(PROJECT)
    try:
        win = None
        for _ in range(120):
            time.sleep(0.5)
            win = last_json("win:created")
            if win and pf.exists(): break
        connected = d.wait_connect(20)
        check("app boots + channel", bool(win) and connected)
        if not (win and connected): return 1
        time.sleep(1.5)

        # Add a todo so a row is visible
        d._cmd("addtodo S4-測試任務")
        time.sleep(0.5)
        shot0 = d.shot()
        shot0.save(OUT / "panel_with_row.png")
        check("panel screenshot non-empty", shot0.size[0] > 100 and shot0.size[1] > 100,
              str(shot0.size))

        # Create notebook + open window
        open0 = count("notebook:open")
        resp = d._cmd("notebooknew S4-筆記本任務")
        check("notebooknew OK", resp.startswith("OK "), f"resp={resp[:80]}")
        nb_id = resp[3:].strip() if resp.startswith("OK ") else ""
        check("got notebook id", len(nb_id) > 8, f"id={nb_id[:40]}")
        ok = wait_for(lambda: count("notebook:open") > open0, timeout=8)
        check("notebook window opened", ok)
        time.sleep(2.0)

        # Send a chat message (FAKE — no spend)
        resp2 = d._cmd(f"notebooksend {nb_id} 幫我想一下這個任務怎麼做")
        check("notebooksend OK", resp2.startswith("OK "), f"resp={resp2[:80]}")
        msg_count = int(resp2[3:].strip()) if resp2.startswith("OK ") else 0
        # user + assistant = 2 messages minimum
        check("notebook has ≥2 messages after send", msg_count >= 2, f"count={msg_count}")

        # Screenshot the notebook window
        shot_resp = d._cmd(f"notebookshot {nb_id}")
        if shot_resp.startswith("OK "):
            img = Image.open(io.BytesIO(base64.b64decode(shot_resp[3:].strip()))).convert("RGB")
            w, h = img.size
            check("notebook window non-empty", w > 100 and h > 100, f"{w}x{h}")
            img.save(OUT / "notebook_after_send.png")
        else:
            check("notebook screenshot", False, shot_resp[:80])

        # Main window still responds
        main_shot = d.shot()
        check("main window still captures", main_shot.size[0] > 100)
        main_shot.save(OUT / "main_after_s4.png")

        npass = sum(1 for _, ok, _ in results if ok)
        print(f"\n[S4] {npass}/{len(results)} passed — screenshots in {OUT}")
        return 0 if npass == len(results) else 2
    finally:
        d.close()
        g.kill(proc)


if __name__ == "__main__":
    raise SystemExit(main())
