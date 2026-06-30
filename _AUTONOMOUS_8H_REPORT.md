# Autonomous Quality Run — Report

_Status of the multi-cycle quality push on `fix/flicker-free-expand`. Honest split: **DONE+VERIFIED** vs **NEEDS-VERIFY** (typecheck-clean but not run/looked-at) vs **DEFERRED** (couldn't verify blind, not shipped). Nothing here is committed yet._

---

## 1. Marquee result — thinking feature now does REAL web grounding (VERIFIED)

The thinking feature (🧠) spawns the `claude` CLI to produce a deep "pre-task prep" analysis. Two things were fixed and **verified with real calls**:

- **It now web-searches** for volatile facts (prices, wages, laws, current suppliers) via the **CLI's own WebSearch — no external API** (your hard constraint held). Verified on the 200-person-conference todo: **0 → 5 real searches, all 0–9 sections written, 17 real source citations, ~$0.87, stops on its own at 14 turns.**
- **Root cause was a misread metric, not a broken tool.** `usage.server_tool_use.web_search_requests` counts the *Anthropic API server* web_search tool; Claude Code's `WebSearch` is a **client-side tool** that never increments it. So "0" never meant "didn't search." (Captured durably in memory `reference_claude_cli_websearch` so no future agent re-walks the 5-test dead-end.)
- **The real fix was prompt design** (found via the Debug-by-Delegation method — fresh agents' `system/init` dump cracked it):
  1. Reframed grounding from coercive *"必須立刻呼叫 WebSearch"* (which the model flagged as a **prompt injection** and refused) → *"researcher's standard procedure; your training has a cutoff so volatile facts are stale-by-default."*
  2. **Volatile-class checklist** (price/wage/law/「最新」supplier/dated) → defeats the "I already know 基本工資" confidence-skip.
  3. **Search budget**: cap 6 + explicit phase-switch ("stop searching → write; finishing beats one more search") + `--max-turns` 30→16 as a cost backstop.
  4. **Honesty**: `(來源:URL)` only for真查到的; else `(估,建議自行查證最新)` — no fabricated URLs.
- **Also fixed earlier in the thinking spawn:** `CLAUDECODE`/`CLAUDE_CODE_*` stripped from the child env (else the CLI refuses to launch "nested" when the app starts from a Claude Code terminal → silent failure); `--allowedTools` space→comma; immediate "思考中" placeholder bubble.
- Files: `electron/main/claudeRunner.ts` (`stage1Prompt`, `spawnClaude`), `electron/main/thinking.ts`. **Typecheck-clean.**

**The correct verification oracle** (for any future prompt edit): run via `--output-format stream-json --verbose` and assert `tool_use name=="WebSearch"` count (1–6) + sections 0–9 in the concatenated assistant text — **NOT** the `web_search_requests` counter. (See `_VERIFY_BATCH.sh` §3b.)

---

## 2. Backbone audit-fixes (NEEDS-VERIFY — typecheck-clean, not run/looked-at)

Applied across the data/security/persistence/IPC/UIUX layers (see `_AUDIT_FINDINGS.md` + the Phase-3 fix log in `_AUTONOMOUS_8H.md`):
- **Fix 1–4** types/store/claudeRunner/persistence: `ThinkingSession`/`Notebook` types; atomic+serialized store writes (temp→rename, write-queue), corrupt-recovery, migration runner, full `removeTodo` cascade; prompt-via-stdin (injection-safe); session persistence wiring.
- **Fix 7** speech bubbles keyed by `sessionId+idx` (no cross-session removal bug); tag colors de-collided.
- **Transcript view (Task 4)**: persisted `ThinkingSession` + click-any-bubble→full-text overlay + inline accordion transcript.
- **Fix 8 UIUX**: number ordinals + whole-row drag (your revision), ≥24px hit-targets, stable 2-click delete, chevron rotate, accordion ARIA, empty-state CTA, focus rings.

→ **Verify with `_VERIFY_BATCH.sh`** (typecheck + bubble-timing unit test + probes on opus + the visual eyeball checklist). All typecheck-clean; the probes/visual need the app, which the no-Bash autonomous mode couldn't run.

---

## 3. Knowledge system — Phase 4 (DONE: design + tools; NEEDS-RUN: ingest)

- **`2_Toolkit/Harness/knowledge_base_design/knowledge_base_design_criteria.md`** — professional judgment criteria for a scalable, agent-retrievable vault, synthesized from 45 researched principles (3 read-only research agents across LLM-retrieval / PKM-scalability / agent-readable-IA). MECE criteria A–F + an **audit scorecard** of our actual vault + ranked next-actions. Our `hot→index→pages` + `1_Projects/2_Toolkit/3_Archive` taxonomy is the worked example (and validated as correct, NOT-PARA by design).
- **`…/ingest_index.py`** — rewritten **tiered** (per-area `_INDEX.md` + thin root `index.md`) **+ incremental** (mtime cache → re-parses only changed files). Mechanical, no LLM.
- **NEXT (needs Bash):** run the ingest on the **test vault** first (`_VERIFY_BATCH.sh` §3c), inspect output, then scaffold the **real** vault additively (review-first — do not auto-touch the user's notes).

---

## 4. DEFERRED — not shipped because they can't be verified blind

Per the discipline rule (after the nub-bob regression: never ship unverifiable visual/geometry changes blind):
- **Fix 4b** settings-persist in windowManager (snap/hide → `setSettings`) — logic, but touches geometry; verify with probes.
- **Fix 5** geometry/clickThrough (unify cat-box channel, resizing watchdog, multi-monitor) — multi-component window logic; needs `probe_suite` on opus.
- **Fix 6** teardown (`will-quit` cleanup + drop dead IPC) — safe logic but unverified this run.
- **Fix 8 LOW** (avatar states from mode, glow-think, detail indent, resize-grip a11y) — visual polish; eyeball-only.

These are scoped in `_AUTONOMOUS_8H.md`; pick them up with the app running. (Teardown is multi-file — clickThrough/thinkScheduler/testControl must return cleanup handles, then index wires `will-quit` — best done in one typecheck-able pass, not blind.)

**DONE this run (was deferred):** Fix 9 — `docs/01_architecture.md` reconciled to the fixed-window model (was documenting the old `setBounds`-on-expand flicker model): fixed window + cat-glued + CSS panel growth + snap=move-only + `geometry.ts` single-source + the never-`setBounds`-size red line; click-through rewritten as the single-owner poll; main module table aligned to the real `electron/main/` files; inline transcript (not modal); IPC channels updated. Pure docs, zero runtime risk.

---

## 5. Derived professional criteria (reusable beyond this project)
- **Knowledge-base design** → `knowledge_base_design_criteria.md` (progressive disclosure; tiered index; atomic structured pages; description-frontmatter as the retrieval fuel; grep+index over embeddings for personal KBs; auto-generated incremental index; decay prevention).
- **Spawning the `claude` CLI for grounded generation** → memory `reference_claude_cli_websearch` (client-vs-server WebSearch metric; researcher-framing over coercion; volatile-class trigger; search-cap + phase-switch budget; honesty rule; CLAUDECODE strip).

---

## 6. Commit state
**Everything above is UNCOMMITTED** (you asked to test before committing). Recommended once `_VERIFY_BATCH.sh` is green:
```
git add -A && git commit -m "Mimir-Sprite: thinking web-grounding fix + audit-driven quality pass + KB design criteria"
```
The thinking/web-search work (§1) is already real-call-verified and could be committed on its own as a coherent unit ahead of the app-dependent fixes if you prefer smaller commits.

---

## 7. LIVE VERIFICATION (app + mouse available — the "deferred" items are now mostly VERIFIED)

- **Geometry contract — `probe_suite` 29/29 PASS** (real mouse, isolated desktop, all 4 edges): grab NO-resize, snap, **expand NO-resize (flicker-free, `docked == expand_to`)**, panel centred on cat (≤2px), width consistent (524px, 0px spread), hugs cat. → **Fix 4b/5 geometry verified real.** (Also caught + fixed a doc arithmetic error: window is 1310×1630.)
- **Thinking pipeline — `probe_think_ch` 9/9 PASS**: boots, FAKE runner, **[任務] first bubble**, persistence, streaming, cost 0.
- **Bubble timing — 15/15 PASS** (pure logic). **Typecheck — clean** (whole campaign incl. Fix 6).
- **ConnectionRefused** the user saw = benign: probe's `wait_connect` retry loop hitting the app before `testControl` is listening / a stale portfile. Self-heals. Root (stale portfile) now removed on teardown (Fix 6).

### Thinking — REAL end-to-end run, hardened (two production bugs found + fixed)
Running the real prompt on a real todo ("學習產品 PM…") surfaced two real bugs the FAKE path hid:
1. **Unbounded internal grounding** — with no `hot.md`/`index.md`, the agent rabbit-holed into `Glob×6`/`Bash×5` exploring the vault, hit `error_max_turns`, produced **empty output**. → bounded the grounding (prompt A: ≤1–2 actions, else "none found" → proceed; no dir exploration).
2. **Bash despite `--allowedTools`** — allowedTools is permission, not availability. → added **`--disallowedTools 'Bash,Edit,Write,NotebookEdit'`** (thinking is read-only + web).
- **After the fix (verified):** real todo → **6 localized WebSearches, Bash 0, full 0–9 output (7.5k chars), `(估)` honesty markers, $0.49, 13 turns, stopped on its own.** Output saved to `_THINK_REAL_OUTPUT.md`.

### Fix 6 teardown — DONE + typechecks (was deferred)
`setupClickThrough` + `setupTestControl` now return cleanup fns; `index.ts` collects them and runs a single `app.on('will-quit')` (stop scheduler + clear poll interval + drop ipc listeners + close socket server + **delete stale portfile** → kills the ConnectionRefused root). Quit-path only; typecheck-clean.

### Still open
- Visual bubble-click→transcript (real-mouse) check; Fix 8 LOW visual polish; running the ingest on the test vault. (Lower priority; do with the app.)
- **Not yet committed** — awaiting user review of `_THINK_REAL_OUTPUT.md` + feedback before committing.
