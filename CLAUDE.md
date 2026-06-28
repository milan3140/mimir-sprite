# Mimir-Sprite — working agreement

## DEFINITION OF DONE (kernel — applies to EVERY change, ~free)
Before claiming anything is done:
- I can **name the correctness criteria, including dynamic ones** (not just "it renders" — also: no flicker, smooth animation, no mid-transition breakage, cat doesn't move).
- I **verified with the matched modality**: numeric/geometry → run the probe; **visual/animation → actually look (screenshot or watch the transition)**, never report on faith.
- If I touched an existing subsystem, I **re-ran ALL of its checks**, not just the new one (catches "fixed A, broke B").

## ESCALATION (cheap gut-check)
If the same symptom-class survives **≥2 fixes** → STOP patching code. Suspect the **architecture**, and look up the standard solution. (e.g. flicker from resizing a native window on hover is structural → fixed-size window + CSS animation.)

## WHEN TO WRITE A CONTRACT (L2 only — rare)
Gut-check: *"could this break A-via-B, or is it hard to reverse?"* (multi-component agreement / cross-process / timing / architecture). If yes → write the 3-table contract into `TEST_DESIGN.md` BEFORE coding, and derive code + probe from it. If no (L0/L1 trivial/reversible) → just the kernel above.

The contract = 3 fill-in lists (worked example = the window-geometry system):
1. **State owners / who must agree** — e.g. *main owns window bounds; renderer owns layout; they must agree on the cat's screen position.*
2. **Invariants = the oracle (static AND dynamic, each checkable)** — e.g. static: cat flush at edge; panel width consistent ±16px; centred ±10px; gap 0–45px; all 4 edges. dynamic: **no `setBounds` on the hover path**; disclosure animates smoothly; no clipped/squished mid-frame.
3. **Architectural red lines (never-do)** — e.g. *hover expand/collapse must never resize/move the native window.*

## Project specifics
- Self-test is the norm (user is often away). Probes in `scripts/` (`probe_suite.py`, `probe_nub.py`) — run on **opus**. Reusable harness: `2_Toolkit/Harness/gui_visual_probe`.
- Geometry constants are duplicated main↔renderer (PANEL_W, HUG, cat dims) — change BOTH and keep them equal (a dual-source-of-truth hazard).
- Risky/core reworks go on a branch with a clean revert point.
