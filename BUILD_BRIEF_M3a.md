# BUILD BRIEF — Slice M3a (todo core: store + panel + controls + completion jsonl)

Build the heart of the app: a real todo list managed from the hover-expanding panel beside the cat.
**Read `docs/02_data_schema.md`, `docs/04_wireframes.md`, `docs/03_design_tokens.md` first** — authoritative.
DO NOT build attachments/paste or the item-detail view yet (that's M3b). DO NOT build thinking/notebooks.

## Don't break what works
The avatar + drag + four-side snap + click-through + tray are working and were hard-won. Specifically:
- Window size is **pinned** via `setBounds({width,height})` to stop a Win11 DPI inflation bug — keep that pattern.
- Snap aligns the cat's **visible pixels** (`cat:content`) to the screen edge. Keep it.
- Click-through: transparent areas pass clicks through; only the cat (and now the panel) is interactive.
Re-run and confirm these STILL work after your changes.

## 1. Store (main) — lowdb
- `electron/main/store.ts`: lowdb JSON at `app.getPath('userData')/mimir-sprite/db.json`. Shape per docs/02 (`DB` with `schemaVersion:1`, `todos[]`, `appState`, `settings`, and empty `thinkingSessions:[]`, `notebooks:[]`). Create with defaults if missing.
- Typed (`src/shared/types.ts` shared by main+renderer, or a types file imported by both). Implement Todo/AppState/Settings per docs/02. `order` controls sort; status `pending|active|paused|done`; track `totalActiveMs` + `lastStartedAt`.
- Persist on every mutation (debounced ok).

## 2. IPC + renderer store mirror
- Channels: `todo:list|add|update|reorder|remove|start|pause|complete`, `app:setMode`, and a `store:changed` event broadcasting the full snapshot (or todos+appState) to the renderer.
- `src/store/useAppStore.ts` (extend existing): hold todos + appState mirrored from main via `store:changed`; actions call IPC. Keep the existing anchorEdge/avatarId.
- Add the IPC wiring in `electron/main/ipc.ts` and preload `api`.

## 3. Panel UI (renderer) — hover to expand
Per docs/04 wireframe B. Dark, minimal, token-driven, Lucide icons, shadcn where it helps.
- **Hover-expand**: hovering the cat opens the `TodoPanel` beside it; leaving (cat AND panel) collapses back to avatar-only. Debounce the collapse (~250ms) so moving cursor from cat to panel doesn't flicker shut.
- **Window resize for the panel**: introduce `collapsedSize` (current ~190 avatar) and `expandedSize` (e.g. ~340 wide × ~360 tall — tune). When expanding/collapsing, `setBounds` to the new size but KEEP THE CAT anchored at its screen edge: the panel grows toward screen center (per `anchorEdge`: right-edge → panel extends left, etc.; mirror for left/top/bottom). The cat must not jump.
  - Update the size constants used by drag/snap so they use the CURRENT mode's size. While expanded, dragging can either be disabled or collapse-then-drag — pick the simplest that doesn't reintroduce the inflation bug (always `setBounds` with explicit width/height).
- **Click-through while expanded**: the whole panel must be interactive. Simplest robust approach: when expanded, `setIgnoreMouseEvents(false)` for the whole window; when collapsed, restore the cat-only click-through (existing logic). Make sure leaving the panel collapses and restores click-through.
- **Panel contents** (docs/04-B):
  - Top bar: app name/handle, a Rest toggle (Lucide `Coffee`) that flips `appState.mode` resting⇄idle, a Hide button (Lucide `EyeOff` → `window.hide()`).
  - List of todos where `status!=='done'`, sorted by `order` asc. Each row: drag handle (`GripVertical`), title, and controls:
    - `pending|paused` → show Play (start). `active` → show Pause. `active|paused` → show Check (complete).
    - A `Brain` icon (thinking) — **stub** for now (no-op or a TODO comment; thinking is a later slice).
    - Delete (`Trash2`) shown on row hover.
  - Bottom: add-todo input (`Plus`/Enter to add a `pending` todo with next `order`).
- **Drag-reorder**: reorder the list by dragging the handle; on drop, recompute `order` and call `todo:reorder`. Use `@dnd-kit/core`+`@dnd-kit/sortable` (clean) or a minimal pointer-based sort — your call, but it must feel smooth and persist.

## 4. Controls behavior (state machine per docs/02)
- start: status→active, `appState.mode='working'`, `activeTodoId=id`, set `lastStartedAt=now`.
- pause: status→paused, add `now-lastStartedAt` to `totalActiveMs`, `mode='idle'`, clear activeTodoId.
- complete: if was active add the elapsed to `totalActiveMs`; status→done, `completedAt=now`, `mode='idle'`; write completion log (below); remove from visible list.
- rest toggle: `mode` resting⇄idle (clears activeTodoId when entering rest? leave active todo paused — keep it simple: entering rest pauses any active todo).
- Only one active todo at a time.

## 5. Completion log (fact layer only — docs/09)
- On complete, append ONE line to `app.getPath('userData')/mimir-sprite/state/completion_log.jsonl` (create dirs) with the jsonl fact shape from docs/09 (todoId, title, createdAt, completedAt, totalActiveMs, thinkingSessionIds:[], notebookIds:[], result:"" for now). NO LLM. Set `todo.completionLogPath` to the jsonl path.

## Done when
- `npm run dev`: hover the cat → panel opens beside it (cat stays put at its edge); add/edit/delete todos; drag to reorder (persists across restart); start/pause/complete/rest work and reflect in the cat? (optional: cat state can stay idle for now). Completing writes a jsonl line. Leaving collapses back to just the cat, click-through restored, drag/snap still work.
- `npm run typecheck` clean. Update RUN_NOTES.md. `git commit` with a clear message.
- If you touch debug-sensitive areas, keep/extend `dlog` probes (e.g. log expand/collapse bounds) — instrument-first.

## Constraints
- Dark minimal, semantic tokens only (no hardcoded colors), icon-only controls with `aria-label`+tooltip.
- Keep main/renderer boundary clean (contextBridge). No nodeIntegration.
- Stay scoped: no attachments/paste, no item-detail modal, no thinking, no notebooks.
