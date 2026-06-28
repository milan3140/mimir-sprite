"""Generate the hidden/recall sprite: JUST two Siamese cat ears (no face), drawn in the avatar's
exact sampled palette. The ear BASES sit flush at the bottom row of the image (no padding below),
so when placed at a screen edge the ears hug the edge with no floating gap. Crisp pixel art
(procedural triangles, 1px auto-outline), nearest-upscaled.

Run:  py scripts/make_peek_sprite.py
"""
from pathlib import Path
from PIL import Image

OUT = Path(__file__).resolve().parent.parent / "assets/sprites/luizmelo/siamese/Cat-1-Peek.png"

# palette sampled from the real Siamese sprite
T    = (0, 0, 0, 0)
OUT_ = (70, 54, 38, 255)     # outline / dark
PT   = (92, 72, 50, 255)     # dark brown 'point' (Siamese ear)
PINK = (196, 150, 150, 255)  # inner ear
LT   = (150, 120, 92, 255)   # lighter brown highlight on the ear front

W, H = 30, 13   # short & wide so the ears look like ears, not stretched spikes
cx = (W - 1) / 2

grid = [[T for _ in range(W)] for _ in range(H)]


def tri(px, py, a, bb, cc):
    b1 = ((px - bb[0]) * (a[1] - bb[1]) - (a[0] - bb[0]) * (py - bb[1])) < 0.0
    b2 = ((px - cc[0]) * (bb[1] - cc[1]) - (bb[0] - cc[0]) * (py - cc[1])) < 0.0
    b3 = ((px - a[0]) * (cc[1] - a[1]) - (cc[0] - a[0]) * (py - a[1])) < 0.0
    return (b1 == b2) and (b2 == b3)


base_y = H - 1  # ear bases on the very bottom row = flush to the edge
# left ear (tip up, base flush at bottom); right ear mirrored. Wide base, modest height.
L_out = [(0.5, base_y), (6.0, 0.6), (12.5, base_y)]
R_out = [(W - 1 - 0.5, base_y), (W - 1 - 6.0, 0.6), (W - 1 - 12.5, base_y)]
L_in  = [(3.5, base_y - 1), (6.2, 3.6), (9.7, base_y - 1)]   # inner ear (pink)
R_in  = [(W - 1 - 3.5, base_y - 1), (W - 1 - 6.2, 3.6), (W - 1 - 9.7, base_y - 1)]

for y in range(H):
    for x in range(W):
        if tri(x, y, *L_out) or tri(x, y, *R_out):
            grid[y][x] = PT
for y in range(H):
    for x in range(W):
        if grid[y][x] == PT and (tri(x, y, *L_in) or tri(x, y, *R_in)):
            grid[y][x] = PINK

# 1px outline on the OUTER silhouette only (not along the bottom edge — keep it flush)
filled = {(x, y) for y in range(H) for x in range(W) if grid[y][x] != T}
edge = []
for (x, y) in filled:
    if y == base_y:
        continue  # don't outline the base row → ears stay flush to the screen edge
    for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
        if (nx, ny) not in filled and ny != H:  # ignore the implicit border below the base
            edge.append((x, y)); break
for (x, y) in edge:
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
