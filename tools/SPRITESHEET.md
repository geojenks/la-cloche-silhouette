# Sprite-sheet workflow (GPT-styled art)

One image holds every sprite the game needs, on a strict labeled grid.
Iterate the *style* with GPT; the grid layout is the contract that lets the
game slice it back apart.

## The loop

1. **Template** — `sprite-template.png` (rendered from the game's current
   placeholder art by `tools/sprite-template.html`; regenerate with
   `node tools/render_sprite_template.js` after adding sprites to
   `game/data/spritesheet.json`).
2. **Style it** — give the template to GPT with a prompt like the one below.
   Iterate until the style/palette feels right. Judge silhouettes, not
   pixel-perfection — step 3 re-pixelates everything anyway.
3. **Normalize** — `python3 tools/normalize_spritesheet.py styled.png`
   slices by the grid, downscales each sprite to true pixel size, keys the
   background to transparency, and writes `game/img/spritesheet.png`
   (plus a `.preview.png` at 4x to eyeball).
4. **Play** — the game auto-loads `game/img/spritesheet.png` at boot and
   uses it for everything: characters, enemies, props, decor, terrain
   tiles, sun/clouds. Delete the file to get the code-drawn placeholders
   back. Commit it from George's machine (cloud sessions can't push
   binaries).

## Suggested GPT prompt

> Here is a pixel-art sprite sheet template for a cosy side-scrolling
> platformer set on the La Cloche Silhouette Trail (white quartzite ridges,
> pine forest, lakes — Killarney, Ontario). Redraw every sprite in a
> consistent retro 16-bit style with palette X. Rules: keep the exact grid,
> keep each sprite centered in its cell at the same size and position, keep
> the magenta background pure magenta, keep the black label text under each
> cell unchanged, crisp pixel art with hard edges (no anti-aliasing, no
> gradients, no drop shadows). The hiker wears a red cap and a green
> backpack. `_a`/`_b` cells are two frames of the same walk/flap/slither
> animation — same pose family, small differences. `tile_*` cells are
> seamless 16x16 terrain tiles.

Notes from testing: models drift on tiny sprites — ask for "bold readable
silhouettes"; if a sprite comes back mispositioned, crop/repair that cell in
any editor rather than re-rolling the whole sheet; the normalizer samples
the sheet's corners for the background color, so a slightly-off magenta
still keys out.

## Adding a sprite later

Add its entry to `game/data/spritesheet.json` (name, cell, native w/h),
re-render the template, restyle just that cell with GPT, re-normalize.
Wire it up in `loadSpriteSheet()` (game/js/sprites.js) and draw it wherever
it's needed.
