# Autonomous 8-hour run — comprehensive industry-standard quality push

**Goal:** bring everything (Mimir-Sprite + the Obsidian knowledge system) to industry standard across ALL
dimensions — UIUX, functionality, data, system design — with exhaustive cross-product error enumeration
and design review for compatibility, simplicity, and scalability. Finish in 8h.

**⚠️ DISCIPLINE (added after the nub-bob regression):** in this no-Bash mode I CANNOT run the app or probes,
so I cannot verify any VISUAL change. Therefore: **do NOT make speculative visual-polish changes** (added
animations, repositioning, glow, color shifts, sprite/transform changes) — they risk regressions like the
`cat-peek-bob` one that moved the nub off its flush edge (REVERTED; do not re-add a transform to CatPeek).
Only apply changes that are (a) verifiable by typecheck (types/logic/data/security/IPC), or (b) explicitly
requested by the user. Leave the remaining visual LOW items (glow-think, avatar states, etc.) for the user
to review/test — list them in the report instead of shipping them blind.

**Operating constraints (user away; VSCode extension prompts on every non-read Bash):**
- SILENT TOOLS ONLY: Edit, Write, Read, Grep, Glob, WebSearch, WebFetch, TodoWrite, Agent (read-only subagents).
- **NO Bash** — would stall waiting for approval. Collect every Bash step (typecheck, probes, git, ingest) into `_VERIFY_BATCH.sh` for the user to run on return.
- Subagents: instruct "Read/Grep/Glob only, NO shell/Bash" so they don't stall.
- No questions. WebSearch to derive professional judgment criteria, then decide.
- Update PROGRESS every chunk so the loop resumes cleanly.

---

## Phase 1 — Exhaustive multi-dimensional AUDIT (parallel read-only subagents)
Spawn one focused auditor per dimension; each returns structured findings (file:line, severity, fix):
- **A. Functionality / bugs** — cross-product of ALL interaction scenarios (dock×4 edges × hover/drag/snap/hide/restore/resize × detail/attachments/bubbles/thinking). Bugs live at the intersections.
- **B. UIUX / design quality** — every surface (panel, detail accordion, attachments, resize grip, nub, speech bubbles, thinking). Modals-vs-inline, redundancy, transitions/animation, hit-targets, consistency, polish, a11y.
- **C. Data model + persistence** — Todo/ThinkingSession/Notebook/Attachment schema, integrity, migration, lifecycle/cascade, persistence edge cases.
- **D. System architecture** — cat-glued model, main↔renderer split, IPC surface, single-source geometry, dual-source hazards, thinking/retrieval design, error handling.
- **E. Scalability + simplicity** — knowledge index tiering, bubble/thinking scaling, code simplification, dead code, dependency hygiene.

## Phase 2 — Synthesize + prioritize
Dedupe across auditors; rank by severity×impact; produce a fix list with rationale.

## Phase 3 — Apply fixes (Edit/Write)
Work the prioritized list. Each fix: name the correctness criteria (incl. dynamic), apply, add the verify step to `_VERIFY_BATCH.sh`.

## Phase 4 — Build + design completion
- **Task 4: transcript view** — persist `ThinkingSession`, click bubble → inline full stage-1 plan.
- **Obsidian scalable system** — research → derive `knowledge_base_design_criteria.md` (professional judgment criteria) → tiered ingest (per-area `_INDEX.md` + thin root) → scaffold the REAL vault → system design doc.
- **Remaining milestones** — auto-think settings UI, notebooks (M4), design docs.

## Phase 5 — Consolidation
Memory (permission saga + lessons), CLAUDE.md/docs, finalize `_VERIFY_BATCH.sh`, write `_AUTONOMOUS_8H_REPORT.md` (done / needs-verify / decisions + derived criteria).

---

## PROGRESS (updated each chunk)
- [~] Phase 1 — audit: A bugs ✅ · B uiux ✅ · C data ✅ · D arch ✅ · E scale ⏳ (findings in _AUDIT_FINDINGS.md)
- [x] Phase 2 — synthesize: 14 fix-first themes in _AUDIT_FINDINGS.md §SYNTHESIS
- [ ] Phase 3 — apply fixes (start with the 14 synthesis themes, HIGH first). NOTE: many are intertwined in store.ts/claudeRunner.ts/clickThrough.ts — fix coherently, not one-off. Append every verify step to _VERIFY_BATCH.sh.
- [ ] Phase 4 — transcript (depends on C-H1/H2 persist) + Obsidian system + milestones
- [ ] Phase 5 — consolidation + report

### Fix-campaign order (Phase 3) — derived, do roughly in this order:
1. **types.ts** — add ThinkingSession/Notebook/NoteMessage; type DB.settings.think; DB.thinkingSessions/notebooks. (foundation for many)
2. **store.ts** — write-queue serialization + atomic write + try/catch corrupt-recovery + migration runner + setSettings + addThinkingSession + cascadeDeleteTodo + crypto.randomUUID. 
3. **claudeRunner.ts** — spawn without shell:true (security) + fix timeout msg + fresh-uuid retry + KNOWLEDGE_VAULT config (not author path) + return persistable session.
4. **thinking.ts + ipc.ts** — thread todoId → persist ThinkingSession; single thinking mutex.
5. **clickThrough.ts + windowManager.ts** — unify cat-box channel (getCatRect) + resizing watchdog + transition push-reassert + multi-monitor display-from-content-rect + display-metrics-changed resend.
6. **index.ts** — one will-quit teardown (clear intervals/socket/handlers); drop dead IPC (preload).
7. **useAppStore.ts + SpeechBubbles.tsx** — bubble key sessionId+idx; cancel deferred removal on clear; ≤3-visible contract.
8. **UIUX batch (TodoPanel/SpeechBubbles/index.css/App/SpriteAvatar)** — hit-targets ≥24, stable delete+confirm, drag grip, tag colors token+distinct, focus-ring textarea, instant-swap animations, ARIA, avatar states.
9. **docs/01** reconcile to fixed-window.

### Phase 3 fix progress
- [x] **Fix 1 types.ts** — ThinkingSession/Notebook/NoteMessage/ThinkSettings types; DB.thinkingSessions/notebooks typed; settings.think + knowledgeVaultPath; AppMode lastThinkAt/nextThinkAt.
- [x] **Fix 2 store.ts** — atomic+serialized save (temp→rename, write-queue); corrupt-recovery; mergeDefaults; migration runner (v1→v2); setSettings/getSettings; addThinkingSession/getThinkingSessions/getThinkingSession; full removeTodo cascade; crypto.randomUUID; completion log computes cost/transcripts from sessions + writes after save. **NEW EXPORTS: setSettings, getSettings, addThinkingSession, getThinkingSessions, getThinkingSession.**
- [x] **Fix 3 claudeRunner.ts** — prompt via STDIN not shell arg (injection fix D-H1/A-L4); timeout msg uses constant; knowledgeVault() from env→settings (no author path); cwd fallback.
- [x] **Fix 4 (persistence wiring)** — streamRealThinking(…, todoId?, trigger) builds+persists ThinkingSession; ipc think:now passes todoId; scheduler passes todoId+'auto'; ipc `think:sessions` handler added (for Task 4).
- [ ] **Fix 4b settings persistence** — windowManager must call `setSettings({anchorEdge, hidden, position})` on snap/hide/move (C-H3); then collapse the dual sync channel (C-M5). NOT done.
- [ ] **Fix 5 geometry/clickThrough** — unify cat-box (windowManager.getCatRect the poll calls; drop cat:rect dup) D-H3; resizing watchdog A-H3; transition push-reassert D-H4; multi-monitor display-from-content-rect A-M3/D-M9; resend panelGeo on display-metrics-changed. NOT done.
- [x] **Fix 6 teardown** — DONE + typechecks: `setupClickThrough`/`setupTestControl` now return cleanup fns; `index.ts` collects them + one `app.on('will-quit')` (stopThinkScheduler + clearInterval poll + ipcMain.removeAllListeners cat/bubbles/panel rects + server.close() + **unlink stale `state/test_control_port`** → fixes the ConnectionRefused root). thinkScheduler already had stopThinkScheduler. (Dead-IPC removal in preload still pending — minor.)
- [x] **Fix 7 bubbles** — DONE: keyed by sessionId+idx across thinking.ts (think:remove sends {idx,sid}) + preload + global.d.ts + App handler + useAppStore (push/fade/remove match session+idx) + SpeechBubbles key; cap lowered 8→6 (overflow). Also DONE the quick UIUX: bubble tag colors de-collided+contrast (SpeechBubbles), focus-ring on textarea (index.css).
- [~] **Fix 8 UIUX batch** — DONE (cycle 3): GripVertical drag handle (only-draggable element, fixes drag/rename collision); `.row-btn` ≥24px hit boxes on all icon buttons; stable delete (always mounted, opacity on hover/focus-within) + 2-click confirm + keyboard-reachable; chevron single-icon rotate animation; accordion ARIA (aria-expanded/controls + role=region); title 13px (type hierarchy); Brain turns brand when a transcript exists; nub `cat-peek-bob` applied + hover-brighten; empty-state CTA. Earlier (cycle 2): tag colors, focus-ring. REMAINING (smaller, next cycle): avatar states from appMode.mode (SpriteAvatar only idle/alert); `--glow-think` on bubbles; detail-accordion 26px magic indent → shared layout; resize grip keyboard/ARIA; instant-swap on title↔edit + pending-thumbs strip.
- [x] **Fix 9 docs/01_architecture.md** — DONE: reconciled to the fixed-window model (固定 990×1230、貓黏住、CSS panel 內長、snap=只 move 不 resize、geometry.ts 單一真相、never-`setBounds`-size 紅線);click-through→單一擁有者輪詢 (over=onCat||onPanel||resizing||onBubbles + rect 回報);main 模組表對齊實際 `electron/main/`(移除不存在的 foregroundWatcher/completionLogger/notebookManager;補 index/attachments/testControl/debugLog/thinkScheduler/thinking);renderer TranscriptModal→inline overlay+accordion;IPC 更新 think:meta/remove/sessions + cat/bubbles:rect。純文件,零執行風險。

### Phase 4 (after fixes)
- [x] **Transcript view (Task 4)** — DONE two ways: (a) inline `ThinkingTranscript` in the detail accordion (persisted sessions); (b) **click ANY bubble → full-text overlay** — DONE: main sends `think:meta {sid,rawAnswer}`; renderer store holds it; bubbles are clickable (`.bubble-clickable`) → `TranscriptOverlay` (full stage-1 plan, scrollable, close X) where the bubbles were; SpeechBubbleStack reports its window-rect → clickThrough makes that region interactive (`onBubbles`). Also fixed: Ctrl+Alt+B mock now opens with `[任務]` + carries a MOCK_RAW plan; bubble stack switched to bottom/edge-anchored auto-height (fixes A-M6 clip). Typecheck PASSES. NEEDS: real-mouse click test (channel can't click through) — user/verify batch.
- [~] **Obsidian scalable system** — DONE: (a) 3 read-only research agents → 45 principles synthesized into `2_Toolkit/Harness/knowledge_base_design/knowledge_base_design_criteria.md` (MECE criteria A–F + audit scorecard of our vault + ranked next-actions; our `hot→index→pages` + `1_Projects/2_Toolkit/3_Archive` as worked example). (b) `ingest_index.py` rewritten = **tiered** (per-area `_INDEX.md` + thin root `index.md`) **+ incremental** (mtime cache, re-parses only changed files) — in the same toolkit folder. STILL TODO: actually RUN ingest on the test vault (queued _VERIFY_BATCH.sh 3c, needs Bash) → generate hot.md/index.md; then scaffold the REAL vault (additive, review-first — do NOT auto-touch user's notes).
- [ ] **Milestone design docs** — auto-think settings UI, notebooks (M4).

### Phase 5
- [ ] memory (permission saga + audit-driven-quality method) ; CLAUDE.md/docs ; finalize _VERIFY_BATCH.sh ; write _AUTONOMOUS_8H_REPORT.md.

_INTERACTIVE FINDINGS (user-driven, Bash now works in-project):_
- **Bash works in-project** (prompts were only for EXTERNAL paths). Typecheck of the whole blind backbone PASSES.
- **Thinking REAL-CALL VERIFIED**: `claude -p` + stdin spawn works → JSON result. Fixed a CRITICAL bug: claude CLI refuses to run nested in a Claude Code session (`CLAUDECODE` env) → claudeRunner now strips CLAUDECODE/CLAUDE_CODE_* from the child env, else thinking silently fails when the app is launched from a Claude Code terminal.
- **Thinking prompt UPGRADED** (user spec): deep analysis — dual grounding (vault + web), per-dimension verify, multi-case + conditional advice, how-to-test-which-case, ranges (下限/最佳/上限), first-principles step-chain, Taiwan-localized. Tools += WebSearch/WebFetch; max-turns 30; timeout 300s; userContext setting; immediate "思考中" placeholder bubble.
- **Real deep-think tested** (200-person conference todo): fresh agent UNDERSTOOD the prompt fully + produced excellent ranged/multi-case/localized/first-principles output. → so the prompt is self-sufficient for a fresh agent.
- **WebSearch DOES NOT FIRE in spawned `claude -p`** (CONCLUSIVE, 3 tests, always `web_search_requests: 0`): optional→agent used parametric knowledge; MANDATORY→agent looped 23 turns + produced EMPTY result; minimal→agent FABRICATED a `(來源:勞動部 URL)` citation it never fetched. Fixes: (a) `--allowedTools` space→COMMA separated (was one invalid tool-name string); (b) prompt B rewritten to HONEST mode — only cite real searches, FORBID fabricated URLs, mark volatile facts `(估,建議自行查證最新)`. Net: deep-think = high-quality EXPERT-KNOWLEDGE coaching, NOT live-verified; volatile specifics honestly flagged. True web-verify in the spawned CLI is a separate investigation (CLI version/config/plan) — flagged, not chased. ~$2.7 spent on real-call tests; paused paid testing.
- **Phase 4 Obsidian (THIS cycle):** dispatched 3 read-only research agents (LLM retrieval / PKM scalability / agent-readable IA) to DERIVE professional judgment criteria → will write `knowledge_base_design_criteria.md` + improved tiered `_ingest_index.py`. Current vault scaffolding = `.claude/skills/{wiki-query,wiki-ingest}` only; index.md/hot.md NOT yet generated (ingest needs Bash → in _VERIFY_BATCH.sh).
- **Click-bubble→full-text DONE + typechecks**; Ctrl+Alt+B mock opens with [任務]; nub-bob regression REVERTED (do not re-add a transform to CatPeek); chevron rotation fixed (wrapper span). NONE of these committed yet (user testing live).

_Last update (cycle 4): THINKING WEB-SEARCH SAGA RESOLVED + VERIFIED (real calls). Root cause was a MISREAD METRIC — `web_search_requests` counts the API server tool; Claude Code's WebSearch is a CLIENT tool that doesn't increment it. WebSearch was never broken. Real fix = prompt design (Debug-by-Delegation: fresh agents' `system/init` dump cracked it): reframed grounding as researcher-standard-procedure (coercive "必須呼叫" tripped injection-defense), volatile-class checklist (beats confidence-skip), search cap 6 + phase-switch, --max-turns 30→16, honesty (only cite real searches else (估)). Verified: 0→5 real searches, full 0-9 output, 17 real citations, $0.87, stops on its own. Memory saved (reference_claude_cli_websearch). ALSO Phase 4 Obsidian: knowledge_base_design_criteria.md + tiered/incremental ingest_index.py written (in 2_Toolkit/Harness/knowledge_base_design/). All typecheck-clean, UNCOMMITTED._
_Next cycle: run ingest on test vault (gen hot.md/index.md) → Phase 5 (CLAUDE.md/docs + _AUTONOMOUS_8H_REPORT.md). DEFERRED (need app/Bash, can't verify blind): Fix 4b/5/6 geometry/teardown, UIUX LOW (avatar/glow), Fix 9 docs — list in report for user to verify, don't ship visual blind._

_(older) cycle 2: Fix 7 (bubble session-keying) + bubble tag colors + focus-ring + Transcript view Task 4 all DONE. So far DONE: Fixes 1-4, 7, transcript, 2 UIUX. Still TODO: Fix 4b (settings persist in windowManager) · Fix 5 (geometry/clickThrough: unify cat-box, resizing watchdog, multi-monitor) · Fix 6 (teardown will-quit + dead IPC) · Fix 8 rest of UIUX batch (hit-targets ≥24, stable delete+confirm, drag grip, chevron+other animations, accordion ARIA, avatar states, glow-think, nub bob, empty-state CTA, type scale) · Fix 9 docs/01 · Phase 4 Obsidian tiered system + knowledge_base_design_criteria.md + scaffold real vault · Phase 5 memory+report. ALL UNVERIFIED until _VERIFY_BATCH.sh. SILENT TOOLS ONLY._
