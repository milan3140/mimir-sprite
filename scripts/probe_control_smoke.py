"""Smoke test for the in-app TEST-CONTROL channel (MIMIR_TEST_CONTROL=1).

Drives the app with NO OS mouse (the user's cursor is never touched): inject a cursor position over the
cat -> the main-process clickThrough poll should expand; inject mouseDown -> the renderer's sprite
onMouseDown should fire drag:start; capturePage should return the window image. Proves the app can be
fully driven without the OS cursor/screen — the basis for background testing on a hidden desktop.

Run:  py scripts/probe_control_smoke.py
"""
from __future__ import annotations
import base64
import json
import re
import socket
import sys
import time
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str((PROJECT.parents[2] / "2_Toolkit/Harness/gui_visual_probe").resolve()))
import gui_probe as g  # noqa: E402

LOG = PROJECT / "mimir-debug.log"
PORTFILE = PROJECT / "state" / "test_control_port"
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


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    print(("PASS " if ok else "FAIL "), name, ("- " + detail) if detail else "")


def main() -> int:
    if LOG.exists():
        LOG.unlink()
    if PORTFILE.exists():
        PORTFILE.unlink()
    g.free_port(5173)
    import os
    os.environ["MIMIR_TEST_CONTROL"] = "1"
    proc = g.launch("npm run dev", cwd=PROJECT)
    try:
        win = None
        for _ in range(120):
            time.sleep(0.5)
            win = last_json("win:created")
            if win and PORTFILE.exists():
                break
        check("app boots + control channel up", bool(win) and PORTFILE.exists())
        if not (win and PORTFILE.exists()):
            return 1
        port = int(PORTFILE.read_text().strip())
        s = socket.create_connection(("127.0.0.1", port), timeout=5)

        def cmd(c: str) -> str:
            s.sendall((c + "\n").encode())
            buf = b""
            while not buf.endswith(b"\n"):
                chunk = s.recv(1 << 20)
                if not chunk:
                    break
                buf += chunk
            return buf.decode("utf-8", "replace").strip()

        b = cmd("bounds")
        check("bounds responds", b.startswith("OK"), b[:60])
        time.sleep(1.6)  # initial dock

        cs = last_json("cat:screen")
        check("cat:screen present", bool(cs), str(cs))
        if not cs:
            return 2
        cx, cy = cs["x"] + cs["w"] / 2, cs["y"] + cs["h"] / 2

        # inject cursor over the cat -> expand (NO OS mouse moved)
        ep = count("window:expand")
        cmd(f"cursor {cx} {cy}")
        ok = False
        for _ in range(50):
            if count("window:expand") > ep:
                ok = True
                break
            time.sleep(0.1)
        check("hover via INJECTED cursor -> expand (no OS mouse)", ok)

        # inject mouseDown on the cat -> renderer sprite onMouseDown -> drag:start
        dp = count("drag:start")
        cmd("mdown")
        ds = False
        for _ in range(40):
            if count("drag:start") > dp:
                ds = True
                break
            time.sleep(0.1)
        check("INJECTED mouseDown -> drag:start", ds)
        cmd("mup")
        time.sleep(0.5)

        # capturePage (offscreen window capture; no screen grab)
        r = cmd("shot")
        data = b""
        if r.startswith("OK "):
            try:
                data = base64.b64decode(r[3:])
            except Exception:
                data = b""
        if data[:8] == b"\x89PNG\r\n\x1a\n":
            (PROJECT / "_control_shot.png").write_bytes(data)
        check("capturePage returns a PNG", data[:8] == b"\x89PNG\r\n\x1a\n", f"{len(data)} bytes")

        npass = sum(1 for _, ok, _ in results if ok)
        print(f"\n[CONTROL] {npass}/{len(results)} passed")
        return 0 if npass == len(results) else 2
    finally:
        g.kill(proc)


if __name__ == "__main__":
    raise SystemExit(main())
