# Mimir-Sprite — working agreement

## DEFINITION OF DONE (kernel — applies to EVERY change, ~free)
Before claiming anything is done:
- I can **name the correctness criteria, including dynamic ones** (not just "it renders" — also: no flicker, smooth animation, no mid-transition breakage, cat doesn't move).
- I **verified with the matched modality**: numeric/geometry → run the probe; **visual/animation → actually look (screenshot or watch the transition)**, never report on faith.
- If I touched an existing subsystem, I **re-ran ALL of its checks**, not just the new one (catches "fixed A, broke B").

## DESIGN-DECISION GATE (for any UI/interaction — ~free; see [[feedback-proactive-design-quality]])
Don't implement to "it works" and leave design quality for the user to catch. Two quick passes:
- **Before** (30s): name the user's goal/scenario; pick the interaction pattern by heuristics (detail/more → inline disclosure, NOT modal; complex → new screen); apply UX principles (zero redundancy — no repeated title / box-in-box; **every state transition gets a designed animation**, instant swaps are a smell; hit-targets big enough). **If unsure, look up best practice — don't wait to be told.**
- **After** (self-critique, by LOOKING): redundant? right pattern? transitions animated/no flicker? hit-targets reachable? consistent with the rest?

## VERIFICATION-FIDELITY GATE (verify the verifier — this is where the test-infra saga bled)
A green check or a "works/safe" claim is worthless if it doesn't exercise the REAL failure mode:
- **The test's ACTION must match the user's action**, not a convenient variant. (Grab via a "move-away-then-hover" workaround passed while the real direct-hover was broken. A channel that injects clicks BYPASSES OS click-through, so it passes even when a real mouse can't click — use `run_isolated` real-mouse for click/drag/grab.)
- **The oracle must be INDEPENDENT of the code under test** (don't assert main's own `cat:screen`; assert pixels for anything the renderer can draw differently).
- **SAFETY and INFRA claims need the same proof.** "Trap-proof" / "notification shows" / "faithful" are claims — exercise them (I claimed trap-proof twice on reasoning and was wrong; `GetAsyncKeyState` is per-active-desktop, so the escape had to run ON the test desktop and be fired by a real keypress THERE to prove it). If you can't observe the property, you haven't verified it.

## ESCALATION (cheap gut-check)
If the same symptom-class survives **≥2 fixes** → STOP patching code. Suspect the **architecture**, and look up the standard solution. (e.g. flicker from resizing a native window on hover is structural → fixed-size window + CSS animation.)

## WHEN TO WRITE A CONTRACT (L2 only — rare)
Gut-check: *"could this break A-via-B, or is it hard to reverse?"* (multi-component agreement / cross-process / timing / architecture). If yes → write the 3-table contract into `TEST_DESIGN.md` BEFORE coding, and derive code + probe from it. If no (L0/L1 trivial/reversible) → just the kernel above.

The contract = 3 fill-in lists (worked example = the window-geometry system):
1. **State owners / who must agree** — e.g. *main owns window bounds; renderer owns layout; they must agree on the cat's screen position.*
2. **Invariants = the oracle (static AND dynamic, each checkable)** — e.g. static: cat flush at edge; panel width consistent ±16px; centred ±10px; gap 0–45px; all 4 edges. dynamic: **no `setBounds` on the hover path**; disclosure animates smoothly; no clipped/squished mid-frame.
3. **Architectural red lines (never-do)** — e.g. *hover expand/collapse must never resize/move the native window.*

## Project specifics
- Self-test is the norm (user is often away). Probes in `scripts/` — run on **opus**. Reusable harness: `2_Toolkit/Harness/gui_visual_probe`.
- **Geometry is ONE source of truth: `src/shared/geometry.ts`**, imported by main (windowManager) AND renderer (App). Never redeclare. (The old main↔renderer duplication was a dual-source hazard — fixed.)
- **How to run tests without disturbing the user (Windows: one cursor, the active desktop owns it):**
  - `run_background.py <channel-probe>` — runs on a HIDDEN desktop; user STAYS on their desktop with a corner chip; opt-in watch via clicking the chip, Ctrl+Alt+T to return (on-test `escape_helper` via RegisterHotKey). Use for rendering/geometry/logic/`capturePage` checks. **The in-app TEST-CONTROL channel CANNOT drive drag-moves and BYPASSES click-through — NOT faithful for grab/click/drag.**
  - `run_isolated.py <real-mouse-probe>` — real OS mouse on an active separate desktop (faithful for grab/click/drag); takes the screen for the run, auto-returns, Ctrl+Alt+T escapes. Use for anything mouse-fidelity-dependent.
  - Probe runs isolate their store via `MIMIR_TEST_USERDATA` (no polluting the user's todos). Ghost cursor off by default (`GUI_PROBE_GHOST=1` to show).
- Risky/core reworks go on a branch with a clean revert point.
