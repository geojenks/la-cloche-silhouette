#!/usr/bin/env python3
"""Assemble canonical sprite-sheet sources from generated mood sheets.

The image model is used for drawing, but not trusted with the sheet contract.
This script rebuilds the exact 4x template, copies all established sprites from
the previous native atlas, isolates only the explicitly allowed generated
cells, and leaves every other variant art area at exact #FF00FF.
"""

import argparse
import json
from pathlib import Path

from PIL import Image


BASE_GENERATED = {
    "fruit",
    "bear_a",
    "bear_b",
    "frog_dead",
    "snake_dead",
    "bird_dead",
}

VARIANT_GENERATED = {
    "calm": {
        "hiker_walk_a", "hiker_walk_b", "hiker_jump", "hiker_trudge",
        "bird_a", "bird_b", "frog_sit", "frog_leap",
    },
    "dance": {
        "hiker_walk_a", "hiker_walk_b", "chipmunk_a", "chipmunk_b",
        "frog_sit", "frog_leap",
    },
    "rave": {
        "hiker_walk_a", "hiker_walk_b", "hiker_jump", "hiker_trudge",
        "chipmunk_a", "chipmunk_b", "frog_sit", "frog_leap",
        "bird_a", "bird_b", "bear_a", "bear_b", "sun", "star",
    },
}

_GRID_CACHE = {}


def is_magenta(pixel):
    """Reject model-shifted magenta while retaining bright pink accents."""
    r, g, b = pixel[:3]
    return (
        r > 135
        and b > 135
        and g < min(r, b) * 0.45
        and abs(r - b) < 75
    )


def _band_centres(values):
    groups = []
    for value in values:
        if not groups or value > groups[-1][-1] + 6:
            groups.append([value])
        else:
            groups[-1].append(value)
    return [round(sum(group) / len(group)) for group in groups]


def detect_grid(src, cols, rows):
    """Find model-drifted grid lines instead of assuming perfectly even cells."""
    key = (getattr(src, "filename", None), src.size, cols, rows)
    if key in _GRID_CACHE:
        return _GRID_CACHE[key]

    rgb = src.convert("RGB")
    # Background shades drift across generated sheets; the most common pixel
    # gives a better reference than any single corner.
    sampled = rgb.resize((max(1, rgb.width // 4), max(1, rgb.height // 4)))
    counts = {}
    for p in sampled.getdata():
        counts[p] = counts.get(p, 0) + 1
    bg = max(counts, key=counts.get)

    def line_pixel(p):
        return is_magenta(p) and (p[0] + p[2]) < (bg[0] + bg[2] - 28)

    horizontal = []
    for y in range(rgb.height):
        score = sum(line_pixel(rgb.getpixel((x, y))) for x in range(rgb.width))
        if score > rgb.width * 0.58:
            horizontal.append(y)
    y_lines = _band_centres(horizontal)
    if len(y_lines) < rows:
        raise RuntimeError(f"Found only {len(y_lines)} horizontal grid lines: {y_lines}")
    # The first N horizontal lines are the starts of the N sprite rows.
    y_starts = y_lines[:rows]

    vertical = []
    grid_top = max(0, y_starts[0] - 2)
    for x in range(rgb.width):
        score = sum(line_pixel(rgb.getpixel((x, y))) for y in range(grid_top, rgb.height))
        if score > (rgb.height - grid_top) * 0.54:
            vertical.append(x)
    x_lines = _band_centres(vertical)
    if len(x_lines) < cols:
        raise RuntimeError(f"Found only {len(x_lines)} vertical grid lines: {x_lines}")
    x_starts = x_lines[:cols]
    result = (x_starts + [rgb.width], y_starts + [rgb.height])
    _GRID_CACHE[key] = result
    print(f"detected grid x={result[0]} y={result[1]}")
    return result


def extract_generated(src, sprite, manifest, rows):
    """Extract a generated cell and fit its visible art to native dimensions."""
    src = src.convert("RGB")
    cell = manifest["cell"]
    col, row = sprite["cell"]
    x_lines, y_lines = detect_grid(src, manifest["cols"], rows)
    x0, x1 = x_lines[col], x_lines[col + 1]
    y0, y1 = y_lines[row], y_lines[row + 1]
    art_y1 = round(y0 + (y1 - y0) * (cell["h"] - cell["label"]) / cell["h"])

    # Stay clear of the generated grid line, then key the varying magenta.
    inset_x = max(2, round((x1 - x0) * 0.015))
    inset_y = max(2, round((y1 - y0) * 0.010))
    crop = src.crop((x0 + inset_x, y0 + inset_y, x1 - inset_x, art_y1 - inset_y))
    rgba = Image.new("RGBA", crop.size, (0, 0, 0, 0))
    src_px = crop.load()
    dst_px = rgba.load()
    points = []
    for y in range(crop.height):
        for x in range(crop.width):
            p = src_px[x, y]
            if not is_magenta(p):
                dst_px[x, y] = (*p, 255)
                points.append((x, y))
    if not points:
        raise RuntimeError(f"No foreground found for {sprite['name']}")

    left = min(p[0] for p in points)
    top = min(p[1] for p in points)
    right = max(p[0] for p in points) + 1
    bottom = max(p[1] for p in points) + 1
    art = rgba.crop((left, top, right, bottom))

    target_w, target_h = sprite["w"], sprite["h"]
    scale = min(target_w / art.width, target_h / art.height)
    fitted_w = max(1, min(target_w, round(art.width * scale)))
    fitted_h = max(1, min(target_h, round(art.height * scale)))
    art = art.resize((fitted_w, fitted_h), Image.Resampling.NEAREST)
    fitted = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
    fitted.alpha_composite(art, ((target_w - fitted_w) // 2, (target_h - fitted_h) // 2))
    print(
        f"{sprite['name']}: generated bbox {right-left}x{bottom-top} "
        f"-> native {fitted_w}x{fitted_h} in {target_w}x{target_h}"
    )
    return fitted


def clear_art_areas(sheet, manifest, rows, scale):
    magenta = (255, 0, 255, 255)
    cell = manifest["cell"]
    art_h = cell["h"] - cell["label"]
    for row in range(rows):
        for col in range(manifest["cols"]):
            x0 = col * cell["w"] * scale + scale
            x1 = (col + 1) * cell["w"] * scale - scale
            y0 = (manifest["header"] + row * cell["h"]) * scale + scale
            y1 = (manifest["header"] + row * cell["h"] + art_h) * scale - scale
            sheet.paste(magenta, (x0, y0, x1, y1))


def paste_native_sprite(sheet, sprite_image, sprite, manifest, scale):
    cell = manifest["cell"]
    art_h = cell["h"] - cell["label"]
    col, row = sprite["cell"]
    x = col * cell["w"] + (cell["w"] - sprite["w"]) // 2
    y = manifest["header"] + row * cell["h"] + (art_h - sprite["h"]) // 2
    enlarged = sprite_image.resize(
        (sprite["w"] * scale, sprite["h"] * scale),
        Image.Resampling.NEAREST,
    )
    sheet.alpha_composite(enlarged, (x * scale, y * scale))


def old_atlas_sprite(atlas, sprite, manifest):
    cell = manifest["cell"]
    art_h = cell["h"] - cell["label"]
    col, row = sprite["cell"]
    x = col * cell["w"] + (cell["w"] - sprite["w"]) // 2
    y = manifest["header"] + row * cell["h"] + (art_h - sprite["h"]) // 2
    if x + sprite["w"] > atlas.width or y + sprite["h"] > atlas.height:
        return None
    return atlas.crop((x, y, x + sprite["w"], y + sprite["h"]))


def make_sheet(template, manifest, rows, scale):
    expected = (
        manifest["cols"] * manifest["cell"]["w"] * scale,
        (manifest["header"] + rows * manifest["cell"]["h"]) * scale,
    )
    if template.size != expected:
        raise ValueError(f"Template is {template.size}; expected {expected}")
    sheet = template.convert("RGBA").copy()
    clear_art_areas(sheet, manifest, rows, scale)
    return sheet


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--template", required=True)
    parser.add_argument("--old-atlas", required=True)
    parser.add_argument("--base-generated", required=True)
    parser.add_argument("--calm-generated", required=True)
    parser.add_argument("--dance-generated", required=True)
    parser.add_argument("--rave-generated", required=True)
    parser.add_argument("--manifest", default="game/data/spritesheet.json")
    parser.add_argument("--out-dir", default="game/data/sprites/src")
    args = parser.parse_args()

    manifest = json.loads(Path(args.manifest).read_text())
    sprites = {s["name"]: s for s in manifest["sprites"]}
    rows = max(s["cell"][1] for s in manifest["sprites"]) + 1
    template = Image.open(args.template)
    old_atlas = Image.open(args.old_atlas).convert("RGBA")
    scale = template.width // (manifest["cols"] * manifest["cell"]["w"])
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    base_generated = Image.open(args.base_generated)
    base = make_sheet(template, manifest, rows, scale)
    for sprite in manifest["sprites"]:
        if sprite["name"] in BASE_GENERATED:
            art = extract_generated(base_generated, sprite, manifest, rows)
        else:
            art = old_atlas_sprite(old_atlas, sprite, manifest)
            if art is None:
                continue
        paste_native_sprite(base, art, sprite, manifest, scale)
    base_path = out_dir / "base-v2.png"
    base.save(base_path)
    print(f"wrote {base_path}")

    generated_paths = {
        "calm": args.calm_generated,
        "dance": args.dance_generated,
        "rave": args.rave_generated,
    }
    for variant, names in VARIANT_GENERATED.items():
        generated = Image.open(generated_paths[variant])
        sheet = make_sheet(template, manifest, rows, scale)
        for name in names:
            sprite = sprites[name]
            art = extract_generated(generated, sprite, manifest, rows)
            paste_native_sprite(sheet, art, sprite, manifest, scale)
        path = out_dir / f"{variant}.png"
        sheet.save(path)
        print(f"wrote {path}")


if __name__ == "__main__":
    main()
