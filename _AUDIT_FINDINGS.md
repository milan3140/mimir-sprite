# Audit findings (Phase 1) — working fix-list

Collected from parallel read-only auditors. Status per finding: [ ] todo · [x] fixed (+ verify step in _VERIFY_BATCH.sh).
Apply fixes only AFTER all 5 auditors report (avoid editing files they're still reading) + dedupe across dimensions.

## B. UIUX / design quality  ✅ reported

### HIGH
- [ ] **Delete button hover-only + moving target** `TodoPanel.tsx:297-301` — Trash2 only in DOM on row hover → no keyboard path, instant appearance reflows the Play/Brain cluster (misclick hazard), destructive w/o confirm/undo. Fix: keep always mounted, reserve width, opacity 0→1 on hover/focus-within, add focus-within reveal + undo toast or 2-step confirm.
- [ ] **Hit-targets ~14×14 (spec says 24×24)** `TodoPanel.tsx:237-301,436-457,505-507`, `App.tsx:35` — bare 14px icons at gap-0.5. WCAG 2.5.8 needs 24×24. Fix: wrap each icon in ≥24 (ideally 28) padded hit box, icon stays 14px.
- [ ] **No dedicated drag grip** `TodoPanel.tsx:226-232` — listeners on whole row → no affordance + drag/rename intent collision. Fix: add GripVertical as the only drag handle (cursor:grab), remove listeners from row body.
- [ ] **Bubble stack can exceed designed ≤3 visible** `SpeechBubbles.tsx:24-43` + `useAppStore.ts:55` — store caps at 8; wireframe (04_wireframes.md:43) says max 3 visible. dwell up to 24s + gap 1.5s → 6-8 alive → overflow fixed height 460 (top edge unbounded). Fix: enforce ≤3-visible in the TIMING layer (don't show N+3 until N faded) or hard-cap 3 + tune dwell/gap.

### MED
- [ ] **Bubble tag colors: weak contrast + collisions + hardcoded** `SpeechBubbles.tsx:9-12` — 時間=fg-faint (fails contrast), 資源 & 第一步 both --success (identical), 準備/時程 near-identical cyans; hardcoded hex violates no-hardcode rule + won't follow --hue. Fix: distinct ≥3:1 token-derived color per tag, no reuse.
- [ ] **Redundant "Mimir" title** `TodoPanel.tsx:438` — app name beside the cat = redundant chrome, wastes a header row. Fix: drop it (CLAUDE.md zero-redundancy gate).
- [ ] **Instant un-animated swaps** — chevron `:244` (rotate instead), title↔EditableTitle `:248-259` (cross-fade), pending thumbs strip `:475-487` (animate height/opacity), Play/Pause/Check `:271-301`. Design gate: every transition animated.
- [ ] **Focus ring misses the add textarea** `index.css:75` rule is `input:focus` but add box is a `<textarea>` → primary field has no focus ring. Fix: `input:focus, textarea:focus` (or :focus-visible). WCAG 2.4.7.
- [ ] **Think button: no result/error/empty feedback at origin** `TodoPanel.tsx:286-296` — busy pulse only; failure ("我想得不太順") + success (has-transcript) not surfaced on the row. Fix: per-row marker when transcript exists + transient error.
- [ ] **Detail accordion hardcoded 26px indent fragile** `index.css:128-135` + `TodoPanel.tsx:159-163` — magic indent breaks when icon sizes change (esp. after hit-target fix). Fix: derive from shared grid/token.
- [ ] **Accordion ARIA incomplete** `TodoPanel.tsx:237-245,307` — chevron lacks aria-expanded/aria-controls; region not labeled. Fix: aria-expanded + aria-controls + role=region. WCAG 4.1.2.

### LOW
- [ ] **Only 2 avatar states wired** `SpriteAvatar.tsx:18` — only idle/alert; spec has idle/furball/working/talking/resting. Rest toggle + active todo don't change pose. Fix: drive animState from appMode.mode + active-todo.
- [ ] **--glow-think defined but unused** `SpeechBubbles`/`index.css:196-212` — bubbles lose the "Claude thinking" glow. Fix: add box-shadow var(--glow-think).
- [ ] **No type scale + reduced-motion gaps** — everything text-xs; sprite/cat-peek-bob loops ignore prefers-reduced-motion. Fix: title 13px/medium; gate loops behind reduced-motion.
- [ ] **Hide-nub no hover affordance + bob not wired** `App.tsx:84-88` + `index.css:227-232` — cat-peek-bob class never applied; no hover feedback. Fix: apply bob + hover scale/brighten.
- [ ] **Empty state bare** `TodoPanel.tsx:467-468` — "No todos yet" w/o CTA. Fix: hint pointing at add box.
- [ ] **Resize grip no keyboard/ARIA + faint** `TodoPanel.tsx:65-67` + `index.css:178-193` — div, mouse-only. Fix: role=separator + aria + arrow-key resize + raise resting opacity.

### Notes
- Inline detail accordion is well-executed (anti-modal, no repeated title) — keep.
- Transcript view (Task 4) is the ONE justified modal per docs/04 §81.
- Token discipline good in panel; bubble palette is the main hardcode offender.

## A. Functionality / bugs  ✅ reported

### HIGH
- [ ] **A-H1 dead hover IPC** `preload:10-11` + `SpriteAvatar:102-103` send `mouse:enter-cat`/`leave-cat` but NO `ipcMain.on` handler → hover relies solely on the 100ms clickThrough poll. Fix: delete the dead enterCat/leaveCat API (or wire it).
- [ ] **A-H2 stale catRect on flip** `clickThrough:60-66` hit-tests `catRect` re-sent only every 400ms; on `anchor:changed` the sprite flips → up to 400ms grabbing the wrong sub-region. Fix: push `cat:rect` immediately on anchor change.
- [ ] **A-H3 `resizing` can stick true → window never collapses, eats desktop clicks** `clickThrough:44` + `TodoPanel:44-50` — onUp is a window mouseup; if release happens off-window / during ignoreMouseEvents flip, it never fires. Fix: main-side watchdog (clear if no `panel:resizing(true)` refresh within N ms, or on blur) + document-level mouseup + safety timeout. **(top-value fix)**
- [ ] **A-H4 bubble idx reuse across sessions ghosts new bubbles** `SpeechBubbles:52` keys by idx; `App:78-79` defers removeBubble 420ms uncancelled → on rapid re-trigger the prior session's removeBubble(0) deletes the NEW bubble 0. Fix: key by `sessionId+idx`; deferred removal no-ops if sessionId≠current; cancel pending timers on clearBubbles.
- [ ] **A-H5 no cross-row/cross-trigger think mutex → double-spend + interleave** `TodoPanel:286-291` only per-row thinkBusy; scheduler `running` is independent. Two rows / manual+scheduler → 2 Claude calls each + global clearTimers clobbers streams. Fix: single main-side thinking mutex shared by streamRealThinking + scheduler.

### MED
- [ ] **A-M1 snap not cancelled on new drag** `windowManager:148,94` — snapInterval + dragInterval both setBounds → tug-of-war. Fix: drag:start clears snapInterval; snap loop bails if dragging.
- [ ] **A-M2 hit-rect lags live resize** main `getPanelHitRect` uses persisted size, renderer uses livePanel → cursor leaves hit-rect while over visible panel → collapse mid-resize (only `resizing` masks it). Fix: send live size to main during resize.
- [ ] **A-M3 multi-monitor: getDisplayMatching(full window) picks wrong display** `windowManager:166,202,225,260` — 990×1230 window overhangs monitors. Fix: compute display from the cat CONTENT screen rect, not full bounds.
- [ ] **A-M4 restoreFromNub doesn't re-clamp** `windowManager:243-249` — display change while hidden → restore off-screen. Fix: clamp preHideBounds to current work area on restore.
- [ ] **A-M6 bubble stack fixed H=460 clips on small edges** `SpeechBubbles:30,33,39`. Fix: compute H from available per-edge space.
- [ ] **A-M7 add-todo double-submit dup** `TodoPanel:408-416` stale pending closure. Fix: in-flight ref/disable Add.
- [ ] **A-M8 timeout msg "90s" but 120s; retry → up to ~8min silent hang** `claudeRunner:106,17,124-129` + `thinking:84` no placeholder. Fix: fix msg + overall budget + immediate "thinking…" placeholder bubble.

### LOW
- [ ] A-L2 panelClamp margin 6 vs hit-rect M=14 (8px clicks outside visible panel). A-L3 easeOut comment "cubic"=quadratic. **A-L4 shell:true + user title → arg/cmd injection** (`foo" & calc & "bar`) — fix: spawn claude.cmd directly (no shell) or prompt via stdin. A-M5 outsideSince not reset on restore. A-L6 reorderTodos order collision w/ done todos.

## C. Data model + persistence  ✅ reported

### HIGH
- [ ] **C-H1 ThinkResult never persisted** `claudeRunner:132`/`thinking:84-89` — sessions discarded; thinkingSessions/thinkingSessionIds stay []; completion log hollow; transcript view has no source. Fix: `store.addThinkingSession(session)` from streamRealThinking (pass todoId from ipc:39), append to todo.thinkingSessionIds, capture transcriptPath + costUsd. **(headline gap — needed for Task 4)**
- [ ] **C-H2 type the `unknown[]` placeholders** `types.ts:58-59`. Add `ThinkingSession{id,todoId,trigger,createdAt,status,model,costUsd,rawAnswer,bubbles,transcriptPath?,error?}`, `Notebook{...messages}`, `NoteMessage{...}`; `DB.thinkingSessions: ThinkingSession[]`, `DB.notebooks: Notebook[]`. ThinkResult(transient) vs ThinkingSession(persisted) — don't drift.
- [ ] **C-H3 settings edge/position/hidden/alwaysOnTop never persisted** (only panelW/H). Sprite resets to default edge each launch. Fix: `setSettings(patch)` called from windowManager edge/hide/move handlers (throttled).
- [ ] **C-H4 no migration runner / backup despite schemaVersion** `initStore` just read()s. Fix: version check → backup db.bak.<ts> → run migrations → defensively merge missing top-level keys (lowdb only defaults on absent file).

### MED
- [ ] **C-M1 removeTodo cascade incomplete** — drops attachments but not thinkingSessions/notebooks/their files → orphans. Fix: cascadeDeleteTodo(id).
- [ ] **C-M2 non-atomic writes → corrupt db on crash, no recovery** (`initStore:46` no try/catch). Fix: try/catch read→rename corrupt→fallback; temp-then-rename writes.
- [ ] **C-M3 no write serialization** — concurrent mutators race; `await import('uuid')` widens window. Fix: write queue/mutex; use crypto.randomUUID everywhere.
- [ ] **C-M4 completion log hardcoded empties + not transactional** `store:235-252`. Fix: compute cost/transcriptPaths from linked sessions; write jsonl after save() succeeds.
- [ ] **C-M5 dual sync channels for edge/hidden** (snapshot vs anchor:changed/window:hidden events) — pick one owner once settings persist.
- [ ] **C-M6 attachment path-traversal** `attachments:44-56` unvalidated relPath. Fix: assert resolved path stays under attachments root.

### LOW
- [ ] C-L1 settings missing typed `think`/`log` sub-objects (getThinkSettings casts to Record). C-L2 AppMode missing lastThinkAt/nextThinkAt. C-L4 MIME→ext fallback mislabels bmp/svg. C-L5 timeout msg 90s vs 120s (dup A-M8). C-L6 pushBubble dedupe by idx not sessionId+idx (dup A-H4). C-L7 getters return live arrays (copy on read).

### Keep (good): binary-on-disk/metadata-in-db; relative normalized paths; attachment cascade (partial); single-source geometry; auto-think off-by-default.

## D. System architecture  ✅ reported

### HIGH
- [ ] **D-H1 shell:true + unsanitized user prompt = injection** `claudeRunner:104` — title/notes w/ `& | > ^ " %VAR%` break/inject via cmd.exe; breaks on ordinary punctuation too. Fix: spawn claude WITHOUT shell (resolve claude.cmd path / cross-spawn) or pass prompt via stdin. **(= A-L4; HIGH security + correctness)**
- [ ] **D-H2 no teardown; intervals/handlers/socket never cleared; `stopThinkScheduler` is dead code** `index.ts:23-46` — clickThrough + scheduler setInterval never cleared on quit; ipcMain handlers global+once; no app.on('activate'). Fix: one `app.on('will-quit')` teardown (clear poll interval [return handle from setupClickThrough], stopThinkScheduler, server.close, removeHandlers) — mirror tray.ts:31.
- [ ] **D-H3 dual-source cat-box: `cat:rect` (clickThrough) vs `cat:content` (windowManager)** — two independent copies of the cat box; disagree → hit-rect vs dock drift (the desync class the refactor targeted, relocated). Also boot-dock depends on a `tight` report ever arriving → no-dock hang if missed. Fix: ONE cat-box channel both read (windowManager.getCatRect() the poll calls); + fallback dock timer.
- [ ] **D-H4 two timer loops co-mutate interactivity; sub-100ms transitions can dodge the skippedLast re-assert** `clickThrough:54-91` vs windowManager 16ms timers. Fix: windowManager PUSHES a re-assert request on transition completion instead of the poll inferring from sampled booleans.

### MED
- [ ] **D-M3 store writes unserialized → lost updates / corrupt JSON** (= C-M2/M3). Fix: single async write queue.
- [ ] **D-M5 test-control socket no auth; `realthink` spawns real claude (spend + vault read); port file in cwd** `testControl:31-57`. Fix: assert !app.isPackaged, token, port under userData, gate realthink.
- [ ] **D-M6 `MIMIR_KNOWLEDGE_VAULT` hardcoded author path** `claudeRunner:21` `D:/.../0_Project-Mimir_ObsidianTest` — every other machine silently falls back to "no context". Fix: config, surface "no vault" in UI, never ship author-absolute default.
- [ ] **D-M2 timeout 90s msg vs 120s + sequential retries → up to ~8min silent hang; retry may reuse session-id** (= A-M8). Fix: msg, overall budget, immediate placeholder bubble, fresh uuid on retry.
- [ ] **D-M4 getThinkSettings casts to Record (untyped), no migration** (= C-H4/L1). Fix: type think settings into DB + migration.
- [ ] **D-M1 did-finish-load re-broadcast is additive on reload; two ready-owners** — prefer renderer pull (storeGet on mount, already exists) + drop push-on-load.
- [ ] **D-M8 dead IPC channels** (enterCat/leaveCat, windowExpand/windowCollapse have no main handler) + 3 snapshot paths. Fix: delete dead bridge methods, one canonical snapshot path. (= A-H1)
- [ ] **D-M9 clamp inputs (winX/winY/wa) cached in renderer panelGeo → stale on display-metrics-changed → clamp drift** (= A-M3 multi-monitor). Fix: resend panelGeo on display-metrics-changed, or main sends final dx/dy (single computation).

### LOW
- [ ] D-L1 debug log in app bundle dir (read-only when packaged). D-L2 logging ON by default → ~60 sync appendFileSync/sec on drag hot path (jank). D-L3 env flags read ad-hoc in 3 modules (centralize config). D-L4 parseBubbles drops nonconforming silently. D-L7 **docs/01_architecture.md STALE** (describes the abandoned setBounds-resize model → could re-introduce flicker; lists nonexistent modules). D-L8 costUsd computed then dropped (not persisted). D-L9 fixed 22-frame snap regardless of distance.

### Keep: cat-glued fixed-window model sound; TEST_DESIGN §6 is a good L2 contract; geometry.ts shared-module is right.

## E. Scalability + simplicity — ⚠️ killed (spun on sibling-vault glob); covered by D-arch + self-derived below
- [ ] **E-1 knowledge index doesn't scale flat** — the 1424-page `index.md` breaks the "bounded token cost" promise once an agent must scan it. Fix (Phase 4): TIER it — per-area `<area>/_INDEX.md` sub-catalogs + a thin root `index.md` (areas + pointers); `_ingest_index.py` emits per-area files; keep `hot.md` ≤500 words. Use the existing `_HUB`/`INDEX` as the 2nd tier.
- [ ] **E-2 code simplicity** — mostly covered by D (dead IPC D-M8, env flags scattered D-L3, two ready-owners D-M1). Plus: centralize `process.env.*` config; remove the `Bash(*)` dead allow entry; the bubble timing constants → one config object.

---
## SYNTHESIS — fix-first themes (multi-auditor confirmed, highest confidence)
1. **shell:true injection** (A-L4 + D-H1) — HIGH, breaks on punctuation now. Spawn w/o shell.
2. **Store: serialize writes + atomic temp-rename + migration runner + corrupt-recovery** (C-M2/M3/H4 + D-M3/M4) — HIGH, one crash = total loss today.
3. **Persist ThinkingSession** (C-H1/H2 + D-L8) — HIGH, needed for Task 4 transcript + completion log + cost.
4. **Dual-source: unify cat-box channel + clamp inputs** (D-H3/M9 + A-H2) — HIGH, the exact desync class the refactor targeted.
5. **Teardown: one will-quit, clear intervals/socket/handlers; delete dead IPC** (D-H2/M7/M8 + A-H1).
6. **Bubble session keying** (A-H4 + C-L6 + D-L5) — key by sessionId+idx; cancel deferred removal on clear.
7. **resizing stuck flag watchdog** (A-H3) — window stops eating desktop clicks.
8. **think mutex** (A-H5) — no double-spend / interleave.
9. **timeout msg + budget + placeholder bubble + fresh-uuid retry** (A-M8 + D-M2).
10. **MIMIR_KNOWLEDGE_VAULT config not author-path** (D-M6).
11. **Persist settings edge/hidden** (C-H3) + collapse dual sync (C-M5).
12. **UIUX batch**: hit-targets ≥24, delete-button stable+confirm, drag grip, bubble tag colors (token+distinct), focus-ring textarea, ≤3 visible bubbles, instant-swap animations, ARIA (B-*).
13. **multi-monitor display from cat content rect** (A-M3 + D-M9).
14. **docs/01 stale** (D-L7) — reconcile to fixed-window or point at TEST_DESIGN §6.

---
## Cross-dimension dupes already noted
- bubble idx/sessionId keying: A-H4 = C-L6 (UIUX bubble cap B-HIGH related).
- timeout 90s/120s: A-M8 = C-L5.
- multi-monitor display pick: A-M3 (arch D may add).
- settings persistence: C-H3 + C-M5 (+ B "Mimir title" unrelated).
