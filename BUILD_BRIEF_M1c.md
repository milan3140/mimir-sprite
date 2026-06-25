# BUILD BRIEF — Slice 1c (add LuizMelo cat as a 2nd swappable sprite set + live switch)

Goal: let the user visually compare **oneko** vs **LuizMelo Pet Cats (Cat-1, CC0)** by switching the avatar at runtime. Stay scoped — no todo panel / persistence / notebooks.

## Assets (already downloaded — do not re-download)
`assets/sprites/luizmelo/` contains LuizMelo Cat-1 sprites (CC0). **One PNG per animation, horizontal strip of 50×50 cells:**
| File | Dimensions | Frames (50px each) | Use for state |
|---|---|---|---|
| Cat-1-Idle.png | 500×50 | 10 | `idle` |
| Cat-1-Walk.png | 400×50 | 8 | `walk` |
| Cat-1-Run.png | 400×50 | 8 | (optional run) |
| Cat-1-Meow.png | 200×50 | 4 | `alert` / talking |
| Cat-1-Sleeping.png | 100×50 | 2 | `sleep` |
| Cat-1-SleepingLeft.png | 100×50 | 2 | sleep when facing left |
| Cat-1-Laying.png | (strip) | — | optional rest |
The actual cat is small (~20×14) centered in each 50×50 cell.

## Jobs
1. **Generalize the sprite system to support two sheet shapes** in `spriteConfig.ts` / `SpriteAvatar.tsx`:
   - **oneko shape**: ONE combined sheet (`oneko.gif`), states = (row/col offset, frameCount) within the 32×32 / 8×4 grid. (already done)
   - **per-state-image shape (LuizMelo)**: a DIFFERENT PNG per state, each a horizontal strip of NxN cells. Add this mode.
   Model it cleanly, e.g. an `AvatarSet` type:
   ```ts
   type AvatarSet = {
     id: 'oneko' | 'luizmelo'
     label: string
     frame: { w: number; h: number }
     scale: number                 // render scale to fit the shrunk window
     states: Record<AvatarState, { image: string; frames: number; fps: number; offset?: {x:number;y:number} }>
   }
   ```
   `AvatarState = 'idle' | 'walk' | 'sleep' | 'alert'`.
2. **Define the LuizMelo set**: frame 50×50, map states to the PNGs above (idle=Idle/10, walk=Walk/8, sleep=Sleeping/2, alert=Meow/4). Pick a `scale` so the cat reads clearly in the ~120×150 window (the small cat in a 50px cell will need scaling up; keep `image-rendering: pixelated`). Center it.
3. **Live switch** so the user can compare: add a **tray menu item "Avatar: oneko ⇄ LuizMelo"** (and/or cycle on tray double-click) that toggles the active `AvatarSet` and tells the renderer to re-render with it. In-memory is fine (no need to persist yet). Default can stay oneko.
4. **CREDITS**: append a LuizMelo entry to `assets/sprites/CREDITS.md` — "LuizMelo Pet Cats Pack, CC0; PNGs mirrored from github.com/Smaragdinex/cat-game; original https://luizmelo.itch.io/pet-cat-pack".

## Done when
- `npm run dev` shows the cat; switching avatar from the tray flips between oneko and the LuizMelo cat live, both animating their idle (and ideally walk/sleep) correctly, both correctly sized in the small window.
- `npm run typecheck` clean. Commit with a clear message. Note the switch mechanism in RUN_NOTES.md.

## Note (do NOT do now)
Recoloring LuizMelo to Siamese (cream + seal-brown points + blue eyes) comes later, once the user picks the hero. Keep the system swap-friendly.
