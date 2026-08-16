// Programmatic pixel-art atlas. Every sprite is a small char-map rendered
// once into an offscreen canvas at boot. Placeholder art — real pixel art
// (GPT-generated from trip photos) can replace any entry later by dropping
// a styled sheet in game/data/sprites/ — see tools/SPRITESHEET.md.
"use strict";

const PAL = {
  ".": null,               // transparent
  k: "#1a1208",            // near-black outline
  s: "#e8b88a",            // skin
  S: "#c98d5e",            // skin shade
  r: "#c0392b",            // red (shirt, cap)
  R: "#8e2418",            // red shade
  b: "#2e5d8c",            // blue (shorts)
  B: "#1d3d5e",            // blue shade
  g: "#4a7c3a",            // green (pack)
  G: "#2f5226",            // green shade
  y: "#e9c46a",            // yellow / straps
  w: "#f4f1ea",            // white (quartzite, eyes)
  W: "#cfc9bd",            // white shade
  o: "#b5651d",            // brown (chipmunk, branches)
  O: "#7d4512",            // brown shade
  t: "#d9a066",            // tan (chipmunk belly)
  n: "#5d7a45",            // snake green
  N: "#3c5230",            // snake shade
  f: "#6ab04c",            // frog green
  F: "#447930",            // frog shade
  d: "#4b4e57",            // dark grey (bird)
  D: "#2b2d33",            // darker grey
  p: "#f2a65a",            // orange (beak, flame)
  e: "#e74c3c",            // berry red
  c: "#f7e8c3",            // cream (snack bag)
  m: "#9b59b6",            // purple (star/secret)
  q: "#101418",            // night navy
};

function makeSprite(rows, scale = 1) {
  const h = rows.length, w = rows[0].length;
  const c = document.createElement("canvas");
  c.width = w * scale; c.height = h * scale;
  const g = c.getContext("2d");
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const col = PAL[rows[y][x]];
    if (col) { g.fillStyle = col; g.fillRect(x * scale, y * scale, scale, scale); }
  }
  return c;
}

function flip(cv) {
  const c = document.createElement("canvas");
  c.width = cv.width; c.height = cv.height;
  const g = c.getContext("2d");
  g.translate(cv.width, 0); g.scale(-1, 1); g.drawImage(cv, 0, 0);
  return c;
}

// --- hiker (12x18), cap + backpack, two walk frames + jump + trudge -------
const HIKER_A = [
  "....rrrr....",
  "...rrrrrr...",
  "...sssssS...",
  "...sksskS...",
  "...sssssS...",
  "..gggggggy..",
  ".gGgggggGys.",
  ".gGgggggGys.",
  ".gGgggggGy..",
  "..ggggggg...",
  "...bbbbB....",
  "...bbbbB....",
  "...ss.sS....",
  "...ss.sS....",
  "..kk...kk...",
  "..kk...kk...",
  ".kk.....kk..",
  "............",
];
const HIKER_B = [
  "....rrrr....",
  "...rrrrrr...",
  "...sssssS...",
  "...sksskS...",
  "...sssssS...",
  "..gggggggy..",
  ".gGgggggGys.",
  ".gGgggggGys.",
  ".gGgggggGy..",
  "..ggggggg...",
  "...bbbbB....",
  "...bbbbB....",
  "...ss.sS....",
  "....sssS....",
  "....kkk.....",
  "....kk......",
  "...kkkk.....",
  "............",
];
const HIKER_JUMP = [
  "....rrrr....",
  "...rrrrrr...",
  "...sssssS...",
  "...sksskS...",
  "...sssssS...",
  "..gggggggys.",
  ".gGgggggGys.",
  ".gGgggggGy..",
  ".gGgggggGy..",
  "..ggggggg...",
  "...bbbbB....",
  "..sbbbbBs...",
  "..ss...ss...",
  ".kk.....kk..",
  ".k.......k..",
  "............",
  "............",
  "............",
];
const HIKER_TRUDGE = [
  "............",
  "....rrrr....",
  "...rrrrrr...",
  "...sssssS...",
  "...sksskS...",
  "..gsssssS...",
  ".gGggggggy..",
  ".gGgggggGys.",
  ".gGgggggGys.",
  "..gggggggy..",
  "...bbbbB....",
  "...bbbbB....",
  "...ss.sS....",
  "...ss.sS....",
  "..kk..kk....",
  "..kk..kk....",
  ".kk....kk...",
  "............",
];

// --- chipmunk (12x8), two scurry frames -----------------------------------
const CHIP_A = [
  "........kk..",
  "..oooo.koko.",
  ".otttoooooo.",
  "ottttooootk.",
  "otttttoooo..",
  ".oottooo....",
  "..o..o......",
  "..k..k......",
];
const CHIP_B = [
  "........kk..",
  "..oooo.koko.",
  ".otttoooooo.",
  "ottttooootk.",
  "otttttoooo..",
  ".oottooo....",
  ".o....o.....",
  ".k....k.....",
];
const CHIP_SQUASH = [
  "............",
  "............",
  "............",
  "............",
  "............",
  "..oooooooo..",
  ".otttttttok.",
  "oooooooooooo",
];

// --- frog (10x8), sit + leap ----------------------------------------------
const FROG_SIT = [
  ".ff....ff.",
  "fkf....fkf",
  "ffffffffff",
  "fFffffffFf",
  "fFFFFFFFFf",
  ".ffffffff.",
  ".fF....Ff.",
  "ff......ff",
];
const FROG_LEAP = [
  ".ff....ff.",
  "fkf....fkf",
  "ffffffffff",
  "fFffffffFf",
  ".fFFFFFFf.",
  ".f......f.",
  "f........f",
  "..........",
];

// --- snake (22x8), two slither frames -------------------------------------
const SNAKE_A = [
  "..................kk..",
  ".....nn......nn..nknk.",
  "...nnNNnn..nnNNnnnnnn.",
  "..nnn..nnnnnn..nnnnn..",
  ".nnn....nnnn....nnn...",
  "nnn......nn......n....",
  "......................",
  "......................",
];
const SNAKE_B = [
  "..................kk..",
  "..nn......nn.....nknk.",
  ".nnNNnn..nnNNnn..nnnn.",
  "nnn..nnnnnn..nnnnnnn..",
  "nn....nnnn....nnnn....",
  "n......nn......nn.....",
  "......................",
  "......................",
];

// --- bird of prey (16x10), two flap frames --------------------------------
const BIRD_A = [
  "dd..............",
  "ddd.............",
  ".ddd......ddd...",
  "..dddddddddddd..",
  "...ddDDDDDDdddd.",
  "....DDDDDDDDkp..",
  ".....DDDDDDD.p..",
  "......ddddd.....",
  "........dd......",
  "................",
];
const BIRD_B = [
  "................",
  "................",
  "..........ddd...",
  "..dddddddddddd..",
  ".ddddDDDDDDdddd.",
  "dd..DDDDDDDDkp..",
  "d....DDDDDDD.p..",
  "......ddddd.....",
  ".......d..d.....",
  "................",
];

// --- pickups & props -------------------------------------------------------
const SNACK = [
  "..yyyy..",
  ".yccccy.",
  ".yceecy.",
  ".ycecey.",
  ".yceecy.",
  ".yccccy.",
  ".yyyyyy.",
  "........",
];
const STAR = [
  "....y....",
  "...yyy...",
  ".yyyyyyy.",
  "..yyyyy..",
  "...yyy...",
  "..yy.yy..",
  ".y.....y.",
  ".........",
];
const TENT = [
  "............yy..............",
  "...........yy...............",
  "..........rr................",
  ".........rrrr...............",
  "........rrrrrr..............",
  ".......rrrrrrrr.............",
  "......rrrRRrrrrr............",
  ".....rrrrRRrrrrrr...........",
  "....rrrrrRRrrrrrrr..........",
  "...rrrrrrRRrrrrrrrr.........",
  "..rrrrrrrkkrrrrrrrrr........",
  ".rrrrrrrrkkrrrrrrrrrr.......",
  "rrrrrrrrrkkrrrrrrrrrrr......",
  "OOOOOOOOOOOOOOOOOOOOOOO.....",
];
const SIGN = [
  ".oooooooo.",
  ".okkokkko.",
  ".oooooooo.",
  "....oo....",
  "....oo....",
  "....oo....",
  "....OO....",
];
const CAIRN = [
  "....ww....",
  "...wwWw...",
  "..wwwwWw..",
  "..wWwwww..",
  ".wwwwwWww.",
  ".wWwwwwww.",
  "wwwwwWwwww",
];
const MATCHBOX = [
  ".yyyyyy.",
  "ycrrrrcy",
  "ycrrrrcy",
  ".yyyyyy.",
];
const FRUIT = [
  "...gk...",
  "..ee.k..",
  ".eeeeee.",
  ".eeReee.",
  ".eeeeee.",
  "..eeee..",
  "........",
  "........",
];

// --- death poses ----------------------------------------------------------
const FROG_DEAD = [
  "..........",
  "..........",
  "..........",
  "..........",
  "f.k....k.f",
  "ffffffffff",
  "fFFFFFFFFf",
  "ff.ffff.ff",
];
const SNAKE_DEAD = [
  "......................",
  "........nnnnnn........",
  ".......nn....nn..kk...",
  ".......n..nn..n.k..k..",
  ".......nn.nn.nn..kk...",
  "........n....nn.......",
  ".........nnnnn........",
  "......................",
];
const BIRD_DEAD = [
  "................",
  "....d......d....",
  ".....d....d.....",
  "..dddDDDDDDddd..",
  ".ddddDDDDDDdddd.",
  "....DDDDDDDDkp..",
  ".....DDDDDD..p..",
  "......ddddd.....",
  "................",
  "................",
];

// --- bear (26x15), two lumber frames — night visitor ----------------------
const BEAR_A = [
  "..........................",
  "....ooo...................",
  "...ooooo..................",
  "..ooooooooooooooooooo.....",
  ".oOooooooooooooooooooo....",
  ".ookoooooooooooooooooo....",
  ".oooooooooooooooooooooo...",
  ".OoooooooooooooooooooOo...",
  ".OooooooooooooooooooooO...",
  "..oooooooooooooooooooo....",
  "..OOo..oOO....OOo..oOO....",
  "..OO....OO....OO....OO....",
  "..........................",
  "..........................",
  "..........................",
];
const BEAR_B = [
  "..........................",
  "....ooo...................",
  "...ooooo..................",
  "..ooooooooooooooooooo.....",
  ".oOooooooooooooooooooo....",
  ".ookoooooooooooooooooo....",
  ".oooooooooooooooooooooo...",
  ".OoooooooooooooooooooOo...",
  ".OooooooooooooooooooooO...",
  "..oooooooooooooooooooo....",
  "...oOO..OOo....oOO..OOo...",
  "...OO....OO....OO....OO...",
  "..........................",
  "..........................",
  "..........................",
];

const Sprites = {};

// Sheet-based art, with music-hype variants (hype = the song section's
// intensity, 0-3). game/data/sprites/base.png (hype 1, the default) restyles
// everything; hype0/hype2/hype3.png (same grid) are PARTIAL — only the
// cells they redraw override the base, everything else falls through.
// setSpriteMood() swaps the live set when the music's hype changes. All
// produced by tools/normalize_spritesheet.py; raw GPT sheets live in
// game/data/sprites/src/.
const SpriteSets = { base: null, variants: {} };

function sliceSheet(mf, img, partial) {
  const artH = mf.cell.h - mf.cell.label;
  const by = {};
  for (const s of mf.sprites) {
    const cx = s.cell[0] * mf.cell.w + Math.floor((mf.cell.w - s.w) / 2);
    const cy = mf.header + s.cell[1] * mf.cell.h + Math.floor((artH - s.h) / 2);
    const c = document.createElement("canvas");
    c.width = s.w; c.height = s.h;
    const g = c.getContext("2d");
    g.imageSmoothingEnabled = false;
    g.drawImage(img, cx, cy, s.w, s.h, 0, 0, s.w, s.h);
    if (partial || s.optional) { // skip cells this sheet left empty
      const d = g.getImageData(0, 0, s.w, s.h).data;
      let solid = false;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 10) { solid = true; break; }
      if (!solid) continue;
    }
    by[s.name] = c;
  }
  // assemble only the atlas entries whose source cells are present
  const S = {};
  const put = (k, v) => {
    if (Array.isArray(v) ? v.every(Boolean) : v) S[k] = v;
  };
  // animation arrays grow to 4 frames when the optional _c/_d cells exist
  const frames = (a, b, c, d) => {
    const arr = [a, b];
    if (c && d) arr.push(c, d);
    return arr;
  };
  put("hiker", frames(by.hiker_walk_a, by.hiker_walk_b, by.hiker_walk_c, by.hiker_walk_d));
  if (S.hiker) S.hikerL = S.hiker.map(flip);
  put("hikerJump", by.hiker_jump); if (S.hikerJump) S.hikerJumpL = flip(S.hikerJump);
  put("hikerTrudge", by.hiker_trudge); if (S.hikerTrudge) S.hikerTrudgeL = flip(S.hikerTrudge);
  put("chip", frames(by.chipmunk_a, by.chipmunk_b, by.chipmunk_c, by.chipmunk_d));
  if (S.chip) S.chipL = S.chip.map(flip);
  put("chipSquash", by.chipmunk_squash);
  put("frog", frames(by.frog_sit, by.frog_leap, by.frog_c, by.frog_d));
  put("snake", frames(by.snake_a, by.snake_b, by.snake_c, by.snake_d));
  if (S.snake) S.snakeL = S.snake.map(flip);
  put("bird", frames(by.bird_a, by.bird_b, by.bird_c, by.bird_d));
  if (S.bird) S.birdL = S.bird.map(flip);
  put("snack", by.snack); put("star", by.star); put("matchbox", by.matchbox);
  put("fruit", by.fruit);
  put("frogDead", by.frog_dead); put("snakeDead", by.snake_dead); put("birdDead", by.bird_dead);
  put("bear", frames(by.bear_a, by.bear_b, by.bear_c, by.bear_d));
  if (S.bear) S.bearL = S.bear.map(flip);
  put("sign", by.sign); put("cairn", by.cairn); put("tent", by.tent);
  put("treeSmall", by.tree_small); put("treeLarge", by.tree_large);
  put("boulder", by.boulder); put("reed", by.reed); put("flower", by.flower);
  put("sun", by.sun); put("cloud", by.cloud); put("stone", by.stone);
  put("platformWood", by.platform_wood);
  put("tileForest", by.tile_forest); put("tileDirt", by.tile_dirt);
  put("tileQuartzite", by.tile_quartzite); put("tileSand", by.tile_sand);
  return S;
}

function setSpriteMood(hype) {
  if (!SpriteSets.base) return; // placeholders have no variants
  // re-assert base first so keys from a previous variant are cleared
  Object.assign(Sprites, SpriteSets.base, SpriteSets.variants[hype] || {});
}

async function loadSpriteSheets() {
  let mf;
  try { mf = await (await fetch("data/spritesheet.json")).json(); } catch (e) { return false; }
  const loadImg = (src) => new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i); i.onerror = rej;
    i.src = src;
  });
  let img;
  try { img = await loadImg("data/sprites/base.png"); } catch (e) { return false; }
  SpriteSets.base = sliceSheet(mf, img, false);
  Object.assign(Sprites, SpriteSets.base);
  for (const hype of mf.hypes || [0, 2, 3]) {
    try {
      SpriteSets.variants[hype] = sliceSheet(mf, await loadImg(`data/sprites/hype${hype}.png`), true);
    } catch (e) { /* variant sheet not made yet — base covers it */ }
  }
  return true;
}

function buildAtlas() {
  Sprites.hiker = [makeSprite(HIKER_A), makeSprite(HIKER_B)];
  Sprites.hikerJump = makeSprite(HIKER_JUMP);
  Sprites.hikerTrudge = makeSprite(HIKER_TRUDGE);
  Sprites.hikerL = Sprites.hiker.map(flip);
  Sprites.hikerJumpL = flip(Sprites.hikerJump);
  Sprites.hikerTrudgeL = flip(Sprites.hikerTrudge);
  Sprites.chip = [makeSprite(CHIP_A), makeSprite(CHIP_B)];
  Sprites.chipL = Sprites.chip.map(flip);
  Sprites.chipSquash = makeSprite(CHIP_SQUASH);
  Sprites.frog = [makeSprite(FROG_SIT), makeSprite(FROG_LEAP)];
  Sprites.snake = [makeSprite(SNAKE_A), makeSprite(SNAKE_B)];
  Sprites.snakeL = [flip(makeSprite(SNAKE_A)), flip(makeSprite(SNAKE_B))];
  Sprites.bird = [makeSprite(BIRD_A), makeSprite(BIRD_B)];
  Sprites.birdL = Sprites.bird.map(flip);
  Sprites.snack = makeSprite(SNACK);
  Sprites.star = makeSprite(STAR);
  Sprites.tent = makeSprite(TENT);
  Sprites.sign = makeSprite(SIGN);
  Sprites.cairn = makeSprite(CAIRN);
  Sprites.matchbox = makeSprite(MATCHBOX);
  Sprites.fruit = makeSprite(FRUIT);
  Sprites.frogDead = makeSprite(FROG_DEAD);
  Sprites.snakeDead = makeSprite(SNAKE_DEAD);
  Sprites.birdDead = makeSprite(BIRD_DEAD);
  Sprites.bear = [makeSprite(BEAR_A), makeSprite(BEAR_B)];
  Sprites.bearL = Sprites.bear.map(flip);
}
