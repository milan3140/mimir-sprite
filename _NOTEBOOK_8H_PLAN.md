# Notebook + Claude-Chat — 8h autonomous build plan

**Vision (user, before sleep):** merge M4 (notebooks) + M5 (thinking) into one model. A **Notebook = a persisted Claude chat session shown in a floating window**. Each todo has notebooks:
- After 🧠 thinking finishes, its full stage-1 plan becomes the content of the **first/default notebook**. Clicking a bubble opens **that** notebook.
- A **Notebook icon** sits next to the Brain icon on the row. **Click** → open the default notebook window. **Hover** → a list of this todo's notebooks to pick which floating window to open + "＋ new notebook".
- The **Brain icon**: **hover** → a chat-input box (type to talk to Claude / "open this session's chat room"). **First** message that's about understanding the task/prep AND no prior 前置查詢 yet → run the existing pre-thinking flow. Otherwise → normal chat. Claude uses **one** notebook by default unless the user opens more.

**Goal:** fully build + verify + commit this, autonomously, overnight. User reviews in the morning.

---

## Design decisions (made now so I can proceed; flagged forks at the bottom)
- **D1 Notebook = Claude session.** Each `Notebook` owns a `sessionId` (uuid). Chat turns spawn `claude -p --session-id <id> --resume` for continuity (same hardened spawn as thinking: strip CLAUDECODE, `--disallowedTools Bash,Edit,Write,NotebookEdit`, comma allowedTools `Read,Grep,Glob,WebSearch,WebFetch`).
- **D2 Thinking → first notebook message.** When 🧠 runs for a todo, ensure a default notebook exists; append the stage-1 `rawAnswer` as its first message `{role:'assistant', kind:'thinking'}`. Bubbles still stream as the teaser. `ThinkingSession` is kept (bubbles/cost/transcript record) and linked to the notebook.
- **D3 Row Notebook icon** (lucide `Notebook`): click → open default notebook window; hover → popover list of notebooks + "＋ 新筆記本".
- **D4 Row Brain icon:** click → trigger thinking (populates default notebook + bubbles, as today); hover → chat-input popover (send → notebook chat turn; "打開聊天室" → open notebook window).
- **D5 First-message routing** (in the chat backend): if the target notebook has no messages AND the todo has no prior thinking session → run the **thinking flow** as the response (stage-1/stage-2). Else → a **normal chat turn**. (Simple, robust heuristic; no fragile NLP intent classifier.)
- **D6 Chat-turn tools:** read-only + web (same allow/deny as thinking) — safety + cost.
- **D7 Notebook window:** frameless dark, draggable, **non**-click-through, multi-open, route `?notebook=<id>`, persisted `windowState`, resume on reopen. `notebookManager` = `Map<id, BrowserWindow>`; closed on `will-quit` (extends Fix 6).
- **D8 Chat response:** append-on-complete with a "思考中…" pending bubble in the window (streaming is a later polish). 

---

## Slices (each: typecheck-gated; verify with the matched modality; commit on branch `feat/notebook`)

### S0 — Design + data model + docs  (~0.5h)
- `src/shared/types.ts`: extend `Notebook { id, todoId, title, sessionId, createdAt, updatedAt, messages: NoteMessage[], windowState?, archived, isDefault }`; `NoteMessage { id, role:'user'|'assistant', kind?:'thinking'|'chat', text, createdAt, costUsd?, attachments? }`. Keep `ThinkingSession` (+ optional `notebookId` link).
- Update `docs/10_notebook.md` + `docs/05_thinking_framework.md` to the merged model; note in `docs/01_architecture.md` module list (`notebookManager`, `notebookChat`).
- **Criteria:** types compile; docs match the design. **Verify:** `npm run typecheck`.

### S1 — Store: notebook CRUD + IPC  (~1h)
- `store.ts`: `createNotebook(todoId, {title?, isDefault?})` (crypto.randomUUID for id+sessionId), `getNotebooks(todoId)`, `getNotebook(id)`, `getOrCreateDefaultNotebook(todoId)`, `addNotebookMessage(id, msg)`, `setNotebookWindowState(id, ws)`, `archiveNotebook(id)`. Mirror in `Todo.notebookIds`. removeTodo cascade already covers notebooks — verify it also deletes their windows (S3).
- `ipc.ts` + `preload`: `notebook:list(todoId)`, `notebook:get(id)`, `notebook:new(todoId)`, `notebook:open(id)`, `notebook:send(id, text)`, event `notebook:updated(id, notebook)`.
- **Criteria:** atomic/serialized writes (existing save()); cascade deletes notebooks+messages; default is idempotent (one per todo). **Verify:** typecheck + a node unit test for getOrCreateDefaultNotebook idempotency + cascade.

### S2 — `notebookChat.ts` backend: chat turn + routing + thinking link  (~1.5h)
- `runChatTurn(notebookId, userText)`: append user msg → spawn claude (`--session-id notebook.sessionId --resume`) with a chat system framing (concise assistant for this todo; can use vault + web like thinking) → append assistant msg (+ cost) → emit `notebook:updated`.
- **First-message routing (D5):** if no messages & no prior ThinkingSession → call the thinking flow (`runThinking`) → store rawAnswer as the first `{kind:'thinking'}` message + persist the ThinkingSession + stream bubbles (reuse `streamRealThinking`). Else `runChatTurn`.
- **Thinking→notebook (D2):** in `streamRealThinking`, after `runThinking`, `getOrCreateDefaultNotebook(todoId)` + append the rawAnswer message if not already present.
- **Criteria:** chat persists both turns; first-message routes correctly; FAKE mode (`MIMIR_FAKE_CLAUDE=1`) returns canned text (no spend) for probes. **Verify:** typecheck + a FAKE chat round-trip probe.

### S3 — `notebookManager.ts` + window + `NotebookView` renderer  (~1.5h)
- `notebookManager.ts`: `openNotebook(id)` → focus existing or create frameless dark `BrowserWindow` (`?notebook=id`), restore `windowState`, persist on move/resize/close; `closeNotebook(id)`; `closeAllNotebooks()` (wire into `will-quit`).
- Renderer: detect `?notebook=id` in `main.tsx`/`App` → render `NotebookView`: header (todo title + ✕), scrollable message list (role-styled bubbles, `kind:'thinking'` rendered as the full plan), input box (Enter=send, Shift+Enter=newline), pending "思考中…". Subscribe to `notebook:updated`.
- **Criteria (incl. dynamic):** window opens/focuses without stealing the cat's topmost; draggable; survives close→reopen (resume); multi-open distinct windows; no click-through (it's a real window). **Verify:** typecheck + a probe that opens a notebook window via IPC and asserts it exists + reopen resumes; screenshot the window.

### S4 — Row UI: Notebook icon + hover list + Brain hover chat  (~1.5h)
- `TodoPanel.tsx`: add **Notebook icon** next to Brain. Click → `notebook:open(defaultId)`. Hover (intent delay ~150ms, no flicker) → popover list (notebooks + "＋ 新筆記本") → click opens that window. Brain hover → chat-input popover (textarea + send → `notebook:send(default, text)`; "打開聊天室" → open window). Shared lightweight popover (one open at a time, dismiss on mouseleave/esc).
- **Criteria:** popovers don't fight the click-through poll (report their rect via `bubbles:rect`-style so the window stays interactive over them); hover has a designed transition (no instant pop); icons ≥24px hit boxes; keyboard reachable. **Verify:** typecheck + visual (screenshot hover states) + the click-through still collapses correctly.

### S5 — Integrate end-to-end + bubble→notebook  (~1h)
- Clicking a bubble → `notebook:open(defaultId)` (replaces/augments the inline TranscriptOverlay). Thinking auto-creates+fills the default notebook. Wire all IPC; ensure `notebook:updated` refreshes open windows + the row list.
- **Criteria:** 🧠 → bubbles + default notebook gets the plan; click bubble → that notebook window opens with the plan; follow-up chat in the window works (FAKE). **Verify:** scripted FAKE end-to-end probe + visual.

### S6 — Verify + gate + commit + report  (~1h)
- Probes: notebook CRUD/cascade, window open/reopen, chat round-trip (FAKE), thinking→notebook linkage, click-through unaffected. Run geometry `probe_suite` (no regression). Append all to `_VERIFY_BATCH.sh`.
- Typecheck-GATE green → commit each slice on `feat/notebook`. Write `_NOTEBOOK_REPORT.md` (done / needs-real-claude-verify / decisions / forks for the user).
- One **real** chat round-trip ($-cost) only if everything FAKE-green — else leave for the user.

---

## Open forks (chose a default; user can redirect in the morning)
1. **Chat streaming vs append** → chose append-on-complete (+pending). Streaming is a later polish.
2. **Inline `ThinkingTranscript` (in the detail accordion)** → keep it as a fallback view, but the primary surface becomes the notebook window. (Don't delete working code mid-build.)
3. **Notebook icon visibility** → always show (click creates the default on demand); the brand tint appears once a session/notebook exists.

## Discipline (same as before)
- Typecheck after every slice; **matched-modality** verify (geometry→probe, visual/window→screenshot, logic→FAKE probe); re-run ALL probes on any change; if a symptom survives ≥2 fixes → question architecture. Commit per slice on `feat/notebook` (never main). Real-claude calls only after FAKE-green. Update PROGRESS below every chunk.

## PROGRESS
- [~] S0 (types ✓; docs 05/10/01 still pending) · [~] S1 (store CRUD ✓; IPC + preload + global.d.ts still pending) · [x] S2 chat backend ✓ (claudeRunner.runChat + notebookChat.ts: sendNotebookMessage with D5 routing + appendThinkingToDefaultNotebook) · [ ] S3 window+view · [ ] S4 row UI · [ ] S5 integrate · [ ] S6 verify+commit+report
- **NEXT for the loop (start here):**
  1. **Finish S1 wiring** — `ipc.ts`: `notebook:list(todoId)→getNotebooks`, `notebook:get(id)→getNotebook`, `notebook:new(todoId)→createNotebook`, `notebook:open(id)→notebookManager.openNotebook`, `notebook:send(id,text)→sendNotebookMessage(win, id, text, emit)`. The `emit` = `(nbId)=>notebookManager.broadcastNotebook(nbId)`. Add to `preload/index.ts` + `src/global.d.ts`.
  2. **S3** — `notebookManager.ts` (Map<id,BrowserWindow>; openNotebook loads the renderer with `?notebook=id` — copy the dev-URL/loadFile logic from `windowManager.createWindow`; persist windowState on move/resize/close via `setNotebookWindowState`; broadcastNotebook(id) sends `notebook:updated` to that window; closeAllNotebooks() wired into index.ts `will-quit` teardown array). Renderer: detect `?notebook=id` in `src/main.tsx`/`App.tsx` → render a new `NotebookView` (header todo title + ✕; scrollable messages role-styled, `kind:'thinking'` = the full plan in a <pre>; input Enter=send Shift+Enter=newline; pending '思考中…'; subscribe `onNotebookUpdated`). NON-click-through (real window), draggable (`-webkit-app-region:drag` header).
  3. **S4** — `TodoPanel.tsx` row: a `Notebook` (lucide) icon next to Brain. Click→`notebook:open(default)` (call `notebook:new` first if none, or add an IPC `notebook:openDefault(todoId)`). Hover→popover list (notebooks + ＋新筆記本). Brain hover→chat-input popover (send→`notebook:send`; 打開聊天室→open window). Popovers must report their rect so click-through stays interactive over them; designed transition, ≥24px hit, keyboard reachable.
  4. **S5** — `streamRealThinking` (thinking.ts) → after it persists the session, call `appendThinkingToDefaultNotebook(todoId, rawAnswer, costUsd, emit)`. Clicking a bubble → `notebook:open(default)` (App's bubble onClick + the SpeechBubble click handler). Add an IPC `notebook:openDefault(todoId)` that getOrCreateDefaultNotebook + openNotebook.
  5. **S6** — FAKE probes (notebook CRUD/cascade, window open/reopen, chat round-trip MIMIR_FAKE_CLAUDE=1, thinking→notebook), geometry probe_suite 29/29 no-regress, screenshots of the notebook window + hover popovers; append to _VERIFY_BATCH.sh; write _NOTEBOOK_REPORT.md.
