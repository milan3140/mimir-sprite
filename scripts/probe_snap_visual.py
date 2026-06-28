"""Mimir-Sprite PIXEL-SPACE visual probe — the matched-modality oracle the log suite lacked.

WHY: probe_suite asserts only on the LOG (main's own computed geometry: cat:screen = tx+sc.x).
A log oracle is main's self-report; it is STRUCTURALLY BLIND to (a) a renderer that draws the cat
somewhere other than where main computed it, and (b) the cat TELEPORTING mid-snap when the renderer
re-anchors to the new edge before the window has moved. Both reported bugs live exactly there.

WHAT THIS DOES (matched modality = real pixels):
  For each edge transition (cross edges, since the teleport only fires when edge CHANGES):
    1. capture a BACKGROUND frame with the cat docked on the far side (region is cat-free)
    2. grab the cat, drag to the new edge, mouseUp, and BURST-capture the screen (mss, ~15ms/frame)
       through the whole snap animation
    3. bg-diff every burst frame -> cat centroid trajectory  -> detect a non-monotonic JUMP (teleport)
    4. after snap:done, bg-diff the settled frame -> cat bbox -> measure the FLUSH GAP to the edge
  Saves keyframes for a human (the agent) to actually LOOK at.

Run:  py scripts/probe_snap_visual.py [out_dir]
"""
from __future__ import annotations
import json
import re
import sys
import time
from pathlib import Path

import numpy as np
import mss
from PIL import Image

PROJECT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str((PROJECT.parents[2] / "2_Toolkit/Harness/gui_visual_probe").resolve()))
import gui_probe as g  # noqa: E402
import pyautogui  # noqa: E402

LOG = PROJECT / "mimir-debug.log"
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else PROJECT / "_snap_shots"
OUT.mkdir(parents=True, exist_ok=True)

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


def grab_cat(ghost, scale, attempts: int = 4) -> bool:
    for _ in range(attempts):
        cx, cy = cat_center_dip()
        p = g.to_physical(cx, cy, scale)
        exp_prev = count("window:expand")
        g.move_ghosted(ghost, p[0], p[1], dur=0.4)
        wait_new("window:expand", exp_prev, timeout=4)
        time.sleep(0.3)
        ds_prev = count("drag:start")
        pyautogui.mouseDown()
        if wait_new("drag:start", ds_prev, timeout=3):
            return True
        pyautogui.mouseUp()
        time.sleep(0.5)
    return False


# ----------------------------------------------------------------- pixel tools
SCT = mss.mss()
MON = SCT.monitors[1]  # primary physical monitor (physical px)


def grab_frame() -> np.ndarray:
    img = np.asarray(SCT.grab(MON))[:, :, :3]  # BGRA -> BGR, physical px
    return img


def cat_bbox(frame: np.ndarray, bg: np.ndarray, thresh: int = 38, min_area: int = 120):
    """bg-diff -> mask of changed pixels -> bbox + centroid of the largest dense blob.
    Returns (cx, cy, x0, y0, x1, y1, area) in PHYSICAL px, or None if nothing significant."""
    d = np.abs(frame.astype(np.int16) - bg.astype(np.int16)).sum(axis=2)
    mask = d > thresh
    # kill row/col noise: require a column/row to have enough hits to count
    col = mask.sum(axis=0)
    row = mask.sum(axis=1)
    cthr = max(3, int(0.02 * mask.shape[0]))
    rthr = max(3, int(0.02 * mask.shape[1]))
    cols = np.where(col > cthr)[0]
    rows = np.where(row > rthr)[0]
    if len(cols) == 0 or len(rows) == 0:
        return None
    x0, x1 = int(cols[0]), int(cols[-1])
    y0, y1 = int(rows[0]), int(rows[-1])
    sub = mask[y0:y1 + 1, x0:x1 + 1]
    area = int(sub.sum())
    if area < min_area:
        return None
    ys, xs = np.where(sub)
    cx = x0 + xs.mean()
    cy = y0 + ys.mean()
    return (cx, cy, x0, y0, x1, y1, area)


def save(frame: np.ndarray, name: str) -> None:
    Image.fromarray(frame[:, :, ::-1]).save(OUT / f"{name}.png")  # BGR->RGB


def save_small(frame: np.ndarray, name: str, scale: float = 0.5) -> None:
    im = Image.fromarray(frame[:, :, ::-1])
    im = im.resize((int(im.width * scale), int(im.height * scale)))
    im.save(OUT / f"{name}.png")


# ----------------------------------------------------------------- the test
def drag_release_burst(ghost, scale, tgt_phys, burst_ms: int = 650) -> tuple[list, list]:
    """Drag from current cursor to tgt, mouseUp, then burst-capture frames+timestamps."""
    g.move_ghosted(ghost, tgt_phys[0], tgt_phys[1], dur=0.7)
    frames, ts = [], []
    pyautogui.mouseUp()
    t0 = time.time()
    while (time.time() - t0) * 1000 < burst_ms:
        frames.append(grab_frame())
        ts.append((time.time() - t0) * 1000)
    return frames, ts


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
        time.sleep(1.5)  # let initial dock settle

        # physical-px edge target points (where to drop the cat)
        tgt = {
            "top":    g.to_physical(wa["x"] + wa["width"] // 2, wa["y"] + 30, scale),
            "left":   g.to_physical(wa["x"] + 30, wa["y"] + wa["height"] // 2, scale),
            "bottom": g.to_physical(wa["x"] + wa["width"] // 2, wa["y"] + wa["height"] - 30, scale),
            "right":  g.to_physical(wa["x"] + wa["width"] - 30, wa["y"] + wa["height"] // 2, scale),
        }
        # workArea edges in PHYSICAL px (for flush-gap measurement)
        wa_phys = {
            "left":   wa["x"] * scale,
            "right":  (wa["x"] + wa["width"]) * scale,
            "top":    wa["y"] * scale,
            "bottom": (wa["y"] + wa["height"]) * scale,
        }

        # cross-edge sequence so the edge CHANGES every time (teleport only fires on edge change)
        seq = ["right", "bottom", "left", "top", "right"]
        for i in range(1, len(seq)):
            frm, to = seq[i - 1], seq[i]

            # 1) make sure the cat is docked at `frm` (background for the `to` region is then clean)
            if not grab_cat(ghost, scale):
                check(f"[{frm}->{to}] grabbed", False); continue
            sd_prev = count("snap:done")
            drag_release_burst(ghost, scale, tgt[frm], burst_ms=50)  # just move it there
            wait_new("snap:done", sd_prev, timeout=6)
            time.sleep(0.6)
            # escape hover so it collapses, then grab background
            g.move_ghosted(ghost, *(g.to_physical(wa["x"] + wa["width"] // 2,
                                                   wa["y"] + wa["height"] // 2, scale)), dur=0.3)
            time.sleep(0.6)
            bg = grab_frame()

            # 2) grab + drag to `to`, burst-capture the snap
            if not grab_cat(ghost, scale):
                check(f"[{frm}->{to}] grabbed", False); continue
            check(f"[{frm}->{to}] grabbed", True)
            sd_prev = count("snap:done")
            frames, tss = drag_release_burst(ghost, scale, tgt[to], burst_ms=650)
            sc = wait_new("snap:done", sd_prev, timeout=6)

            # 3) trajectory from bg-diff
            traj = []
            for f, tms in zip(frames, tss):
                bb = cat_bbox(f, bg)
                if bb:
                    traj.append((tms, bb[0], bb[1], bb[6]))
            # save a few keyframes for the agent to LOOK at
            keep = [0, len(frames) // 4, len(frames) // 2, 3 * len(frames) // 4, len(frames) - 1]
            for k in keep:
                if 0 <= k < len(frames):
                    save_small(frames[k], f"{frm}_to_{to}_f{k:02d}_{int(tss[k])}ms")

            # 4) teleport metric: biggest single-frame centroid jump (px) during the burst
            max_jump = 0.0
            for a, b in zip(traj, traj[1:]):
                jump = ((a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2) ** 0.5
                max_jump = max(max_jump, jump)
            # path non-monotonicity: does the centroid move AWAY from final before settling?
            # (a clean snap is monotone toward the dock; a teleport overshoots then returns)
            final_cx = traj[-1][1] if traj else 0
            final_cy = traj[-1][2] if traj else 0
            dists = [((cx - final_cx) ** 2 + (cy - final_cy) ** 2) ** 0.5 for _, cx, cy, _ in traj]
            # backtrack = total distance the centroid moves AWAY from final after having gotten closer
            backtrack = 0.0
            best = float("inf")
            for dd in dists:
                if dd < best:
                    best = dd
                elif dd - best > 0:
                    backtrack = max(backtrack, dd - best)

            # 5) settled flush gap
            time.sleep(0.5)
            settled = grab_frame()
            save_small(settled, f"{frm}_to_{to}_settled")
            bb = cat_bbox(settled, bg)
            gap = None
            if bb:
                cx, cy, x0, y0, x1, y1, area = bb
                if to == "right":
                    gap = wa_phys["right"] - x1
                elif to == "left":
                    gap = x0 - wa_phys["left"]
                elif to == "bottom":
                    gap = wa_phys["bottom"] - y1
                else:
                    gap = y0 - wa_phys["top"]
                gap = gap / scale  # report in DIP

            print(f"  [{frm}->{to}] frames={len(frames)} traj_pts={len(traj)} "
                  f"max_jump={max_jump:.0f}px backtrack={backtrack:.0f}px gap={gap}")

            # ORACLE (pixel-space):
            # (a) SMOOTH: no teleport -> bounded per-frame jump and little backtracking.
            #     a clean ~320ms/20-frame ease covers maybe ~600px over ~30 frames => <~80px/frame.
            check(f"[{frm}->{to}] snap SMOOTH (no teleport)",
                  max_jump < 140 and backtrack < 90,
                  f"max_jump={max_jump:.0f}px backtrack={backtrack:.0f}px (teleport => big jump+backtrack)")
            # (b) FLUSH: settled cat sits on the edge (small gap).
            check(f"[{frm}->{to}] cat FLUSH to {to} edge",
                  gap is not None and -6 <= gap <= 16,
                  f"gap={gap if gap is None else round(gap,1)}px to {to}")

        npass = sum(1 for _, ok, _ in results if ok)
        print(f"\n[SNAP-VISUAL] {npass}/{len(results)} passed")
        report = {
            "ts": time.strftime("%Y-%m-%d %H:%M:%S"),
            "pass": npass, "total": len(results),
            "failures": [{"name": n, "detail": d} for n, ok, d in results if not ok],
        }
        (PROJECT / "state").mkdir(exist_ok=True)
        (PROJECT / "state" / "snap_visual_report.json").write_text(
            json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        return 0 if npass == len(results) else 2
    finally:
        if ghost:
            ghost.destroy()
        g.kill(proc)


if __name__ == "__main__":
    raise SystemExit(main())
