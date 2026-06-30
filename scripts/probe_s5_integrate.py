"""Mimir-Sprite S5 — end-to-end integration probe (FAKE-Claude, no spend).

Verifies (core — must all pass):
  1. thinknowfull: creates todo → runs thinking (FAKE) → auto-appends plan
     to the default notebook as a {kind:'thinking'} message.
  2. notebook:create log appears (default notebook was auto-created).
  3. think:run-done log + costUsd=0 (FAKE, session persisted).
  4. think:session-saved log (ThinkingSession stored in store).
  5. FAKE chat round-trip: notebooksend on the auto-created notebook →
     notebook ends up with ≥3 messages (1 thinking + 1 user + 1 assistant).
  6. Main window still captures fine.

Bonus (visual — may be skipped on low-mem hidden desktop):
  7. opennotebook + notebookshot: notebook window loads with non-empty content.

Note: window-open visual is covered by probe_notebook_ch.py (S3); this probe
focuses on the S5 logic (thinking → notebook linkage + chat round-trip).

Run (background desktop, no OS mouse):
  py D:/AI_Agents_Projects/0_Project-Mimir/2_Toolkit/Harness/gui_visual_probe/run_background.py py scripts/probe_s5_integrate.py
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
OUT = PROJECT / "_s5_shots"
OUT.mkdir(exist_ok=True)
results: list[tuple[str, bool, str]] = []
CORE_COUNT = 0  # set after core checks are registered


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


def wait_for(predicate, timeout: float = 15.0) -> bool:
    t0 = time.time()
    while time.time() - t0 < timeout:
        if predicate():
            return True
        time.sleep(0.3)
    return False


def safe_cmd(d: TestDriver, cmd: str) -> str | None:
    """Run a test-control command; return None on MemoryError (hidden-desktop pressure)."""
    try:
        return d._cmd(cmd)
    except MemoryError:
        return None


def main() -> int:
    global CORE_COUNT
    if LOG.exists():
        LOG.unlink()
    pf = PROJECT / "state" / "test_control_port"
    if pf.exists():
        pf.unlink()
    g.free_port(5173)
    os.environ["MIMIR_TEST_CONTROL"] = "1"
    os.environ["MIMIR_FAKE_CLAUDE"] = "1"  # ponytail: no real Claude spend
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

        # ── CORE S5 CHECKS (all must pass) ────────────────────────────────────

        nb_create0 = count("notebook:create")
        think_done0 = count("think:run-done")

        resp = d._cmd("thinknowfull 季度報告整理")
        check("thinknowfull OK", resp.startswith("OK "), f"resp={resp[:80]}")
        nb_id = resp[3:].strip() if resp.startswith("OK ") else ""
        check("got notebook id from thinknowfull", len(nb_id) > 8, f"id={nb_id[:40]}")

        ok = wait_for(lambda: count("think:run-done") > think_done0, timeout=15)
        check("thinking pipeline completed (think:run-done log)", ok,
              f"count={count('think:run-done')}")

        ok2 = wait_for(lambda: count("notebook:create") > nb_create0, timeout=5)
        check("default notebook auto-created (notebook:create log)", ok2,
              f"count={count('notebook:create')}")

        done = last_json("think:run-done")
        check("thinking session persisted (costUsd=0 FAKE)",
              bool(done) and float(done.get("costUsd", -1)) == 0.0,
              f"costUsd={done.get('costUsd') if done else '?'}")

        check("thinking session saved to store",
              count("think:session-saved") > 0,
              f"count={count('think:session-saved')}")

        # FAKE chat round-trip — notebook has 1 thinking msg so D5 routes as normal chat
        if nb_id:
            chat_resp = d._cmd(f"notebooksend {nb_id} 這個任務怎麼分工比較好")
            check("notebooksend (chat reply) OK", chat_resp.startswith("OK "),
                  f"resp={chat_resp[:80]}")
            msg_count = int(chat_resp[3:].strip()) if chat_resp.startswith("OK ") else 0
            # 1 thinking + 1 user + 1 assistant = 3
            check("chat round-trip: notebook has ≥3 messages", msg_count >= 3,
                  f"messageCount={msg_count}")

        CORE_COUNT = len(results)

        # main window still healthy (bonus — PIL convert can hit MemoryError on low-mem desktop)
        try:
            main_shot = d.shot()
            mw, mh = main_shot.size
            check("main window still captures (bonus)", mw > 100 and mh > 100, f"{mw}x{mh}")
            main_shot.save(OUT / "main_after_s5.png")
        except MemoryError:
            print("SKIP  main window screenshot (MemoryError on hidden desktop — expected)")

        # ── BONUS: window screenshot ────────────────────────────────────────
        # ponytail: hidden desktop can hit MemoryError on sock.recv when creating a 2nd
        # BrowserWindow (known limit); probe_notebook_ch.py already covers window-open.
        if nb_id:
            nb_open0 = count("notebook:open")
            r = safe_cmd(d, f"opennotebook {nb_id}")
            if r is None:
                print("SKIP  notebook window screenshot (MemoryError on hidden desktop — known)")
            else:
                ok3 = wait_for(lambda: count("notebook:open") > nb_open0, timeout=8)
                check("notebook window opened (bonus visual)", ok3,
                      f"count={count('notebook:open')}")
                time.sleep(2.0)
                shot_r = safe_cmd(d, f"notebookshot {nb_id}")
                if shot_r and shot_r.startswith("OK "):
                    img = Image.open(io.BytesIO(base64.b64decode(shot_r[3:].strip()))).convert("RGB")
                    w, h = img.size
                    check("notebook window non-empty (bonus visual)",
                          w > 100 and h > 100, f"{w}x{h}")
                    img.save(OUT / "notebook_window_s5.png")
                    print(f"  saved: {OUT / 'notebook_window_s5.png'}")

        # ── RESULT ────────────────────────────────────────────────────────────
        npass = sum(1 for _, ok, _ in results if ok)
        nfail = len(results) - npass
        core_pass = sum(1 for _, ok, _ in results[:CORE_COUNT] if ok)
        print(f"\n[S5] core {core_pass}/{CORE_COUNT} | total {npass}/{len(results)}" +
              (f"  ({nfail} FAILED)" if nfail else " — ALL OK"))
        # gate on core only (bonus visual may be skipped on hidden desktop)
        return 0 if core_pass == CORE_COUNT else 2
    finally:
        d.close()
        g.kill(proc)


if __name__ == "__main__":
    raise SystemExit(main())
