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
   background to transparency, and writes `game/data/sprites/base.png`
   (plus a `.preview.png` at 4x to eyeball).
4. **Play** — the game auto-loads `game/data/sprites/base.png` at boot and
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

## Animation frames (2 or 4)

Every animal's `_a`/`_b` cells are its two animation frames, and all of
them advance ON THE BEAT (birds flap, coiled snakes sway, the bear
lumbers in time — the world is always dancing at some energy). Each
animal also has optional `_c`/`_d` cells (hiker walk, chipmunk, frog,
snake, bird, bear): draw them and that animal gets a 4-frame cycle; leave
them magenta and it stays 2-frame. Frogs use `frog_c`/`frog_d` as
dedicated rave-dance poses. Optional cells work per-sheet — e.g. 2 frames
in the base sheet but 4 in the rave variant.

## Hype variant sheets (0 calm / 2 dance / 3 rave)

The game switches sprite sets live with the music's hype = each song
section's `intensity` (0 calm, 1 default hike, 2 dance, 3 rave). At hype
2+ the hiker grooves on the spot, stepping through the walk frames on
every beat; at hype 3 the screen pulses magenta/cyan per bar.

Variant sheets are **partial**: same grid as the base sheet, but you only
draw the cells that change for that mood — leave every other cell pure
magenta and the game falls back to the base art for those sprites
per-sprite. The walk/flap `_a`/`_b` cells are the animation frames, so the
rave sheet's `hiker_walk_a/b` are literally the dance steps.

Workflow: style the base sheet first, then give GPT *the styled base
sheet* and ask for e.g. "the rave variant: same grid, redraw only the
hiker frames (dancing, glowsticks), the chipmunk frames (bopping), and the
sun (disco ball); every other cell pure magenta." Normalize each variant
to its own file:

    python3 tools/normalize_spritesheet.py styled-rave.png --hype 3
    # → game/data/sprites/hype3.png

The base sheet is required for any of this (`game/data/sprites/base.png`);
variants are optional and can be added one hype level at a time. Keep the
raw GPT sheets in `game/data/sprites/src/` for re-rolls.

## Backdrops (parallax strips)

The background is two horizontally-tiling strips, not grid sprites: `far`
(La Cloche mountains with lakes at their feet) and `mid` (dense forest
that hides the far layer's lower half until the player climbs high — at
vista spots the layers pan apart and the lakes appear). Same GPT loop,
separate template:

1. `node tools/render_backdrops.js` → `backdrop-template.png` (renders the
   procedural placeholders + labels)
2. GPT restyles it — strips must tile horizontally (left/right edges must
   match) and the sky above each silhouette stays pure magenta
3. `python3 tools/normalize_backdrop.py styled-backdrops.png` →
   `game/data/sprites/backdrops/{far,mid}.png`, auto-loaded by the game
   (add `--smooth` for a painterly rather than pixel look)

## More sheets as the game grows

This sheet is the Day-1 set, not the whole game. Days 2-6 will add cells
(hiker trio, Silver Peak crowd, the bear, food-hang props, swamp tiles,
campfire frames...) — either as new rows in this manifest or as a second
manifest+sheet pair when this one gets crowded. To keep every sheet in one
style, always hand GPT your already-styled sheet as the style reference
when generating the next one.

## Adding a sprite later

Add its entry to `game/data/spritesheet.json` (name, cell, native w/h),
re-render the template, restyle just that cell with GPT, re-normalize.
Wire it up in `loadSpriteSheet()` (game/js/sprites.js) and draw it wherever
it's needed.
