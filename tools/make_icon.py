#!/usr/bin/env python3
"""Generate icon.png (512x512) for the Tizen package — same palette as the app."""
from PIL import Image, ImageDraw
import os

S = 512
SS = 4  # supersample for smooth edges
W = S * SS

img = Image.new("RGB", (W, W), "#17457f")
d = ImageDraw.Draw(img)

# diagonal gradient #17457f -> #3d87c7
c1, c2 = (0x17, 0x45, 0x7f), (0x3d, 0x87, 0xc7)
for i in range(2 * W):
    t = i / (2 * W - 1)
    col = tuple(int(a + (b - a) * t) for a, b in zip(c1, c2))
    d.line([(i, 0), (0, i)], fill=col, width=2)

# sun, upper right
sun = (0xff, 0xd2, 0x57)
cx, cy, r = int(W * 0.66), int(W * 0.33), int(W * 0.135)
d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=sun)

# cloud, lower left
white = (0xff, 0xff, 0xff)
def circ(x, y, rr):
    d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=white)

circ(int(W * 0.40), int(W * 0.55), int(W * 0.155))
circ(int(W * 0.60), int(W * 0.60), int(W * 0.115))
d.rounded_rectangle(
    [int(W * 0.22), int(W * 0.60), int(W * 0.72), int(W * 0.775)],
    radius=int(W * 0.0875), fill=white,
)

# three rain streaks
for fx in (0.34, 0.47, 0.60):
    x = int(W * fx)
    d.line([(x, int(W * 0.80)), (x - int(W * 0.03), int(W * 0.90))],
           fill=(0x9d, 0xdc, 0xff), width=int(W * 0.022))

img = img.resize((S, S), Image.LANCZOS)
out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "icon.png")
img.save(out, "PNG", optimize=True)
print("wrote", out, img.size)
