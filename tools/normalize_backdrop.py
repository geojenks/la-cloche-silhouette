#!/usr/bin/env python3
"""Normalize a GPT-styled backdrop template back to game-ready strips.

Slices each strip by game/data/backdrops.json, resizes to native size,
keys the magenta sky to transparency, and writes
game/data/sprites/backdrops/{far,mid}.png (auto-loaded by the game;
delete them to get the procedural placeholders back).

Usage:
    python3 tools/normalize_backdrop.py styled-backdrops.png
Options:
    --smooth          use Lanczos resampling instead of nearest (for a
                      painterly rather than pixel-art style)
    --key-threshold 90

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
    ap.add_argument("--smooth", action="store_true")
    ap.add_argument("--key-threshold", type=int, default=90)
    args = ap.parse_args()

    mf = json.loads((ROOT / "game/data/backdrops.json").read_text())
    src = Image.open(args.input).convert("RGB")
    native_w = max(s["w"] for s in mf["strips"]) + mf["margin"] * 2
    native_h = mf["header"] + sum(s["h"] + mf["gap"] for s in mf["strips"]) + mf["margin"]
    sx, sy = src.width / native_w, src.height / native_h
    bg = src.getpixel((2, 2))
    out_dir = ROOT / "game/data/sprites/backdrops"
    out_dir.mkdir(parents=True, exist_ok=True)
    resample = Image.LANCZOS if args.smooth else Image.NEAREST

    y = mf["header"]
    for s in mf["strips"]:
        box = (round(mf["margin"] * sx), round(y * sy),
               round((mf["margin"] + s["w"]) * sx), round((y + s["h"]) * sy))
        strip = src.crop(box).resize((s["w"], s["h"]), resample).convert("RGBA")
        pix = strip.load()
        for yy in range(s["h"]):
            for xx in range(s["w"]):
                r, g, b, _ = pix[xx, yy]
                near_bg = abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2]) < args.key_threshold
                magenta_ish = r > 120 and b > 120 and g < min(r, b) * 0.6 and abs(r - b) < 80
                if near_bg or magenta_ish:
                    pix[xx, yy] = (0, 0, 0, 0)
        strip.save(out_dir / f"{s['name']}.png")
        print(f"wrote {out_dir / (s['name'] + '.png')} ({s['w']}x{s['h']})")
        y += s["h"] + mf["gap"]


if __name__ == "__main__":
    main()
