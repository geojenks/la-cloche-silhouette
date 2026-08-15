#!/usr/bin/env python3
"""Normalize a GPT-styled sprite sheet back to native game pixels.

Image models output big, slightly fuzzy sheets. This slices each cell by the
grid manifest, downscales the art to its true pixel size (nearest), keys out
the background (sampled from the sheet corners, so it survives GPT shifting
the magenta), and writes the clean transparent atlas the game loads.

Usage:
    python3 tools/normalize_spritesheet.py styled-sheet.png
    # → game/img/spritesheet.png  (+ preview at 4x for eyeballing)

Options:
    --manifest game/data/spritesheet.json   grid layout (default)
    --out game/img/spritesheet.png          output path (default)
    --key-threshold 90                      bg color distance for transparency

Deps: pip install pillow
"""

import argparse
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("--manifest", default=str(ROOT / "game/data/spritesheet.json"))
    ap.add_argument("--out", default=str(ROOT / "game/img/spritesheet.png"))
    ap.add_argument("--key-threshold", type=int, default=90)
    args = ap.parse_args()

    mf = json.loads(Path(args.manifest).read_text())
    src = Image.open(args.input).convert("RGB")
    cell_w, cell_h, label = mf["cell"]["w"], mf["cell"]["h"], mf["cell"]["label"]
    native_w = mf["cols"] * cell_w
    rows = max(s["cell"][1] for s in mf["sprites"]) + 1
    native_h = mf["header"] + rows * cell_h
    sx = src.width / native_w
    sy = src.height / native_h
    art_h = cell_h - label

    # background color: median of the four corners
    corners = [src.getpixel(p) for p in
               [(2, 2), (src.width - 3, 2), (2, src.height - 3), (src.width - 3, src.height - 3)]]
    bg = tuple(sorted(ch[i] for ch in corners)[len(corners) // 2] for i in range(3))
    print(f"scale {sx:.2f}x{sy:.2f}, background {bg}")

    out = Image.new("RGBA", (native_w, native_h), (0, 0, 0, 0))
    for s in mf["sprites"]:
        cx = s["cell"][0] * cell_w
        cy = mf["header"] + s["cell"][1] * cell_h
        px = cx + (cell_w - s["w"]) // 2
        py = cy + (art_h - s["h"]) // 2
        box = (round(px * sx), round(py * sy),
               round((px + s["w"]) * sx), round((py + s["h"]) * sy))
        sprite = src.crop(box).resize((s["w"], s["h"]), Image.NEAREST).convert("RGBA")
        pix = sprite.load()
        for y in range(s["h"]):
            for x in range(s["w"]):
                r, g, b, _ = pix[x, y]
                near_bg = abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2]) < args.key_threshold
                # anti-aliased edges blend toward magenta without getting
                # near it — key anything magenta-hued too
                magenta_ish = r > 120 and b > 120 and g < min(r, b) * 0.6 and abs(r - b) < 80
                if near_bg or magenta_ish:
                    pix[x, y] = (0, 0, 0, 0)
        out.paste(sprite, (px, py))

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out.save(out_path)
    prev = out.resize((native_w * 4, native_h * 4), Image.NEAREST)
    prev_path = out_path.with_suffix(".preview.png")
    prev.save(prev_path)
    print(f"wrote {out_path} ({native_w}x{native_h}) + {prev_path.name}")


if __name__ == "__main__":
    main()
