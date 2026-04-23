#!/usr/bin/env python3
"""Génère les icônes PNG (apple-touch-icon + favicon) à partir de la composition standard."""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent

BG = (17, 17, 19)          # #111113
YELLOW = (255, 221, 11)    # #FFDD0B
PURPLE = (89, 20, 208)     # #5914D0
GRAY = (138, 138, 138)     # #8A8A8A


def make(size, filename, radius_ratio=0.21, text=True):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = int(size * radius_ratio)
    # background rounded square
    d.rounded_rectangle((0, 0, size, size), radius=r, fill=BG)
    # 3 bars (matin / aprem / soir)
    bar_h = int(size * 0.145)
    bar_radius = int(size * 0.022)
    left = int(size * 0.156)
    top1 = int(size * 0.188)
    gap = int(size * 0.189)
    d.rounded_rectangle((left, top1, left + int(size * 0.322), top1 + bar_h), radius=bar_radius, fill=YELLOW)
    d.rounded_rectangle((left, top1 + gap, left + int(size * 0.689), top1 + gap + bar_h), radius=bar_radius, fill=PURPLE)
    d.rounded_rectangle((left, top1 + 2 * gap, left + int(size * 0.478), top1 + 2 * gap + bar_h), radius=bar_radius, fill=GRAY)
    # petit point indicateur sur le bloc courant (violet)
    dot_r = max(2, int(size * 0.025))
    cx, cy = int(size * 0.811), int(size * 0.45)
    d.ellipse((cx - dot_r, cy - dot_r, cx + dot_r, cy + dot_r), fill=YELLOW)
    # texte WUBO en bas si size assez grand
    if text and size >= 96:
        try:
            fs = int(size * 0.12)
            font = ImageFont.truetype("arialbd.ttf", fs)
        except Exception:
            try:
                font = ImageFont.truetype("DejaVuSans-Bold.ttf", int(size * 0.12))
            except Exception:
                font = ImageFont.load_default()
        txt = "WUBO"
        bbox = d.textbbox((0, 0), txt, font=font)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        d.text(((size - tw) // 2, int(size * 0.825) - th // 2), txt, fill=YELLOW, font=font)
    path = OUT / filename
    img.save(path, "PNG", optimize=True)
    print(f"wrote {path} ({size}x{size})")


for s, fname in [
    (180, "apple-touch-icon.png"),
    (192, "icon-192.png"),
    (512, "icon-512.png"),
    (32, "favicon-32.png"),
    (16, "favicon-16.png"),
]:
    make(s, fname)

# favicon.ico (multi-size)
ico_sizes = [16, 32, 48]
ico_imgs = []
for s in ico_sizes:
    i = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    dr = ImageDraw.Draw(i)
    r = int(s * 0.21)
    dr.rounded_rectangle((0, 0, s, s), radius=r, fill=BG)
    # simple 3 bars
    bh = max(2, int(s * 0.15))
    l = int(s * 0.16)
    t0 = int(s * 0.2)
    g = int(s * 0.2)
    dr.rounded_rectangle((l, t0, l + int(s * 0.3), t0 + bh), radius=1, fill=YELLOW)
    dr.rounded_rectangle((l, t0 + g, l + int(s * 0.65), t0 + g + bh), radius=1, fill=PURPLE)
    dr.rounded_rectangle((l, t0 + 2 * g, l + int(s * 0.45), t0 + 2 * g + bh), radius=1, fill=GRAY)
    ico_imgs.append(i)
ico_path = OUT / "favicon.ico"
ico_imgs[0].save(ico_path, format="ICO", sizes=[(s, s) for s in ico_sizes])
print(f"wrote {ico_path}")

print("\nDONE")
