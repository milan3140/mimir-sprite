# BUILD BRIEF — Slice 1b (fix snap crash + DPI + shrink + real sprite pipeline)

Continuation of Slice 1. Three jobs. Stay scoped — no todo panel / persistence / notebooks yet.

## 1. FIX the snap/drag crash (main process)
Symptom on real Win11: dragging the cat then releasing throws
`TypeError: Error processing argument at index 0, conversion failure ... at Timeout._onTimeout`
and the window snaps to a wrong position, not the true screen edge.

Root causes to fix in `electron/main/windowManager.ts`:
- **Non-integer args to `win.setPosition`.** `drag:move` does `win.setPosition(mouseX - dragOffset.x, ...)` with values that can be **floats** (renderer screenX/Y, DPI scaling). Electron requires integers. **`Math.round()` every x/y passed to `setPosition`/`setBounds`, in BOTH `drag:move` AND the snap animation.** Also guard against `NaN` (if NaN, skip the call).
- **Destroyed/hidden window during the snap interval.** In the `setInterval` snap loop, bail if `win.isDestroyed()` (clearInterval + return) before calling `setPosition`.
- **Wrong snap position — investigate Windows display scaling (DPI).** Likely the renderer sends `e.screenX/e.screenY` that don't match Electron's DIP screen coords under 125%/150% scaling, so drag tracking and the snap target drift. Make dragging robust to DPI: prefer driving drag from `screen.getCursorScreenPoint()` in the main process (poll on an interval while dragging) instead of trusting renderer mouse coords, OR convert properly. The cat MUST end flush against the real visible screen edge (use the correct display's `workArea`). Test mentally for a 150%-scaled primary monitor.
- Keep the ~320ms ease-out snap animation, but make it integer-stable and abortable.

Verify `npm run typecheck` stays clean. Add a short note to `RUN_NOTES.md` on what the crash was and the DPI handling.

## 2. SHRINK everything ~half
The window + cat are too big. Halve them:
- Window default `240×280` → about `120×150` (tune so the cat fits snugly with a little breathing room).
- Scale the avatar rendering to match. Keep it crisp (`image-rendering: pixelated` for sprites).
- Make the base size a single constant (e.g. `AVATAR_PX` / window size const) so it's easy to tune later.

## 3. Real sprite pipeline (replace the ugly CSS blob)
Build a **reusable, swappable sprite-sheet animator** so the hero art can be changed later by editing config + dropping a PNG — no code changes.
- New component `src/components/SpriteAvatar.tsx`: renders one state of a sprite sheet via CSS `steps()` + `background-position` (per `docs/03`), `image-rendering: pixelated`. Props/config: sheet image, frame size, and per-state `{ row/col offset, frameCount, fps }`.
- New config `src/avatar/spriteConfig.ts`: declares states `idle | walk | sleep | alert(talking)` mapped to sheet coordinates. Centralize so swapping sheets = edit this file.
- **Default asset = oneko (MIT code / public-domain sprite)** to prove the pipeline with a real cat now. Download it yourself into `assets/sprites/`:
  `curl -L https://raw.githubusercontent.com/adryd325/oneko.js/main/oneko.gif -o assets/sprites/oneko.gif`
  oneko.gif is a **32×32 tile, 8 columns × 4 rows** sprite sheet. Its tile map is documented in oneko.js (`spriteSets`): e.g. idle/still = (-3,-3); alert = (-7,-3); sleeping = (-2,0)&(-2,-1); scratch; and running tiles for the 8 directions (2 frames each). Map our states: `idle`→still/idle tiles, `walk`→a run direction's 2 frames, `sleep`→the 2 sleeping tiles, `alert`→alert tile. If the curl fails (no network), keep a minimal CSS fallback but log it in RUN_NOTES.
  - Record source + license in `assets/sprites/CREDITS.md` (oneko: MIT code, original Neko sprite public domain).
- Keep the cat oriented toward screen center using `anchorEdge` (horizontal flip), as before.
- NOTE for later (do not implement now): we will likely swap the hero sprite to a cuter Siamese pack (LuizMelo "Pet Cats Pack", CC0) — that's why the animator + config must be swap-friendly.

## Done when
- Drag + release no longer crashes; cat snaps flush to the real nearest screen edge on a scaled (150%) and 100% display.
- Window + cat are ~half the previous size.
- A real oneko cat sprite animates (idle + at least one moving + sleep state) via the new SpriteAvatar/spriteConfig, replacing the CSS blob.
- `npm run typecheck` clean. Commit with a clear message. Update RUN_NOTES.md.
