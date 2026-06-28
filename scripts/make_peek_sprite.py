"""Generate a 'cat ears peeking' pixel sprite for the hidden/recall state, in the SAME flat,
minimalist style + exact palette as the LuizMelo Siamese avatar (sampled from Cat-1-Idle.png).
Procedural + symmetric + crisp (no anti-aliasing): ellipse head + triangle ears, 1px auto-outline,
simple blue Siamese eyes. Nearest-upscaled so the stored asset stays sharp.

Run:  py scripts/make_peek_sprite.py
"""
from pathlib import Path
from PIL import Image

OUT = Path(__file__).resolve().parent.parent / "assets/sprites/luizmelo/siamese/Cat-1-Peek.png"

# palette sampled from the real Siamese sprite
T   = (0, 0, 0, 0)
OUT_= (70, 54, 38, 255)     # outline / dark
CR  = (221, 202, 166, 255)  # cream mid
LT  = (242, 233, 216, 255)  # cream light (top highlight)
SH  = (208, 189, 150, 255)  # cream shadow
PT  = (92, 72, 50, 255)     # dark brown 'point' (ear tips / mask)
EYE = (108, 162, 200, 255)  # blue eye
PUP = (40, 40, 48, 255)     # pupil
WHT = (245, 245, 245, 255)  # eye catch-light
NOSE= (176, 120, 116, 255)  # nose

W, H = 27, 21
cx = (W - 1) / 2            # 13.0 centre for symmetry
grid = [[T for _ in range(W)] for _ in range(H)]


def put(x, y, col):
    if 0 <= x < W and 0 <= y < H:
        grid[round(y)][round(x)] = col


def tri(px, py, a, bb, cc):
    # standard point-in-triangle (barycentric sign test)
    b1 = ((px - bb[0]) * (a[1] - bb[1]) - (a[0] - bb[0]) * (py - bb[1])) < 0.0
    b2 = ((px - cc[0]) * (bb[1] - cc[1]) - (bb[0] - cc[0]) * (py - cc[1])) < 0.0
    b3 = ((px - a[0]) * (cc[1] - a[1]) - (cc[0] - a[0]) * (py - a[1])) < 0.0
    return (b1 == b2) and (b2 == b3)


# --- silhouette: ellipse head + two WIDE triangular ears (Siamese dark points) ---
hcy, hrx, hry = 12.5, 11.5, 6.6
PINK = (196, 150, 150, 255)
L_outer = [(1.5, 9.0), (6.0, 0.5), (11.5, 9.0)]   # broad left ear, base 10 wide, pointed tip
R_outer = [(W - 1 - 1.5, 9.0), (W - 1 - 6.0, 0.5), (W - 1 - 11.5, 9.0)]
L_inner = [(4.0, 7.6), (6.2, 3.4), (9.0, 7.6)]    # inner ear (pink) sits inside
R_inner = [(W - 1 - 4.0, 7.6), (W - 1 - 6.2, 3.4), (W - 1 - 9.0, 7.6)]

for y in range(H):
    for x in range(W):
        in_head = ((x - cx) / hrx) ** 2 + ((y - hcy) / hry) ** 2 <= 1.0
        in_ear = tri(x, y, *L_outer) or tri(x, y, *R_outer)
        if in_ear:
            grid[y][x] = PT          # dark Siamese ear
        elif in_head:
            grid[y][x] = CR

# inner ear (pink), only where the ear is dark
for y in range(H):
    for x in range(W):
        if grid[y][x] == PT and (tri(x, y, *L_inner) or tri(x, y, *R_inner)):
            grid[y][x] = PINK

# soft top highlight + bottom shadow on the cream face for a little form
for y in range(H):
    for x in range(W):
        if grid[y][x] == CR:
            if 9 <= y <= 11:
                grid[y][x] = LT
            elif y >= 17:
                grid[y][x] = SH

# --- eyes (simple blue, symmetric: 3-wide oval, dark pupil, single catch-light) ---
def eye(ecx, ey):
    for dx in (-1, 0, 1):
        put(ecx + dx, ey, EYE)
        put(ecx + dx, ey + 1, EYE)
    put(ecx, ey, PUP); put(ecx, ey + 1, PUP)
    put(ecx - 1, ey, WHT)

eye(8, 12)
eye(W - 1 - 8, 12)

# nose (small pink triangle) + tiny muzzle shadow
put(cx, 14, NOSE); put(cx - 1, 14, NOSE); put(cx + 1, 14, NOSE); put(cx, 15, NOSE)

# --- 1px outline: any filled pixel touching transparent (4-neighbour) ---
filled = {(x, y) for y in range(H) for x in range(W) if grid[y][x] != T}
edge = []
for (x, y) in filled:
    for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
        if (nx, ny) not in filled:
            edge.append((x, y)); break
for (x, y) in edge:
    # don't overwrite eyes
    if grid[y][x] not in (EYE, PUP, WHT):
        grid[y][x] = OUT_

img = Image.new("RGBA", (W, H), T)
pix = img.load()
for y in range(H):
    for x in range(W):
        pix[x, y] = grid[y][x]

SCALE = 6
big = img.resize((W * SCALE, H * SCALE), Image.NEAREST)
OUT.parent.mkdir(parents=True, exist_ok=True)
big.save(OUT)
print("saved", OUT, big.size, "base", (W, H))
