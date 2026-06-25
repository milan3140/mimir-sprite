# BUILD BRIEF — Slice 1 (M0 + M1 + placeholder avatar)

You are building the foundation of **Mimir-Sprite**, a Windows 11 desktop-pet todo assistant. This brief is the spec for the FIRST runnable vertical slice. **Read `docs/01_architecture.md` and `docs/03_design_tokens.md` first** — they are authoritative; this brief only scopes what to build now.

## Goal of this slice
A **runnable** Electron app (`npm run dev` launches it) that puts a small, frameless, transparent, always-on-top window on the desktop showing a **placeholder Siamese-cat furball** (pure CSS, no sprite asset yet), which the user can **drag anywhere and which snaps to the nearest screen edge (top/bottom/left/right)**, is **click-through** except over the cat, and can be **hidden/shown from a tray icon + global shortcut**. This deliberately de-risks the hardest Windows behaviors first.

## Stack (use exactly this)
- **electron-vite** (Vite + HMR) + **React 18** + **TypeScript**
- **Tailwind CSS** + **shadcn/ui** + **lucide-react** (set up now even if few components used yet)
- State: **zustand** (renderer)
- `electron` 30+, `uuid`. (Do NOT add get-windows/lowdb yet — later slices.)
- Node is v24, npm 11. `claude` CLI present. Windows 11.

## Project layout (create)
```
electron/main/index.ts        electron/main/windowManager.ts
electron/main/clickThrough.ts  electron/main/tray.ts  electron/main/ipc.ts
electron/preload/index.ts
src/main.tsx  src/App.tsx  src/index.css
src/components/Avatar.tsx
src/store/useAppStore.ts
index.html  package.json  electron.vite.config.ts  tsconfig*.json
tailwind.config.js  postcss.config.js  components.json (shadcn)
```

## Requirements

### 1. Window (see docs/01 §視窗策略)
BrowserWindow: `frame:false, transparent:true, hasShadow:false, resizable:false, skipTaskbar:true, alwaysOnTop:true, thickFrame:false, roundedCorners:false, maximizable:false, minimizable:false, backgroundColor:'#00000000'`, webPreferences `{ contextIsolation:true, nodeIntegration:false, backgroundThrottling:false, preload }`. Then `win.setAlwaysOnTop(true,'screen-saver')`. Size ~240×280. Load renderer.
- **If transparency renders black on this machine**, try `app.commandLine.appendSwitch('disable-gpu-compositing')` BEFORE app ready; document what you did in a `RUN_NOTES.md`.

### 2. Drag + four-side snap (docs/01 §四側吸附)
- Avatar element is the drag handle (`-webkit-app-region: drag`; buttons `no-drag`). OR implement manual drag via mouse events + IPC `win.setPosition`. Pick one that works frameless on Windows.
- On drag end (mouseup), compute nearest edge from the cat's center vs the `screen.getDisplayNearestPoint(cursor).workArea`, then animate the window to snap flush to that edge (keep the other axis, clamp into workArea), with a short tween (~320ms). Persist nothing yet (in-memory ok), but expose current `anchorEdge` to renderer so the placeholder can flip/orient.

### 3. Click-through (docs/01 §Click-through)
- Default whole window `setIgnoreMouseEvents(true,{forward:true})` so transparent areas pass clicks to the desktop.
- On `mouseenter` the cat element → IPC → `setIgnoreMouseEvents(false)` (interactive). On `mouseleave` → back to ignore+forward.
- **Add the cursor-polling fallback** (poll cursor vs cat rect every ~120ms) because Electron's `mouseleave` is unreliable after forward on Windows. This fallback is REQUIRED, not optional.

### 4. Tray + global shortcut (docs/01 §隱藏/召回)
- Tray icon (use any small placeholder png you generate, or a 1-color icon) with menu: Show/Hide, Quit. Tray click toggles.
- `globalShortcut` `Ctrl+Alt+Space` toggles show/hide. `unregisterAll()` on `will-quit`.

### 5. Placeholder Siamese furball (docs/03 §Avatar)
- Pure CSS/SVG, NO external asset. A cute cream/khaki rounded blob (`--cat-cream` body) with two small brown ears (`--cat-point`), a brown face patch, two soft blue eyes (`--cat-eye`), dusty-pink nose. Add a gentle idle "breathing" scale animation (CSS, infinite). It should read as a curled cat furball. Put the cat palette CSS vars from docs/03 into `index.css`.
- Add the dark-mode design tokens from docs/03 into `index.css` too (we'll use them next slice).

### 6. Design tokens
- Wire Tailwind to the CSS vars (hsl(var(--…))) per docs/03 so later UI uses semantic tokens. No hardcoded colors.

## Definition of done
- `npm install` succeeds; `npm run dev` opens the transparent always-on-top window with the CSS furball, no black box (or documented workaround).
- I can drag the cat around; on release it snaps flush to the nearest of the 4 screen edges.
- Clicking empty/transparent area clicks through to the desktop; hovering the cat makes it interactive.
- Tray Show/Hide and Ctrl+Alt+Space both work.
- `npm run build` (or `electron-vite build`) type-checks clean (tsc no errors).
- Write a short `RUN_NOTES.md`: how to run, what worked, any Windows quirks (esp. transparency/GPU and click-through), and a TODO list of anything you stubbed.

## Constraints
- Match the codebase conventions in docs/. Dark, minimal, token-driven (except the cat).
- Keep main/renderer boundary clean (contextBridge; no nodeIntegration).
- Do NOT build the todo panel, store persistence, thinking, or notebooks yet — those are later slices. Stay scoped.
- Commit your work with git when done (the repo is already initialized at the monorepo root; just `git add` this project's files and commit with a clear message).
