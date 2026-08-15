// Programmatic pixel-art atlas. Every sprite is a small char-map rendered
// once into an offscreen canvas at boot. Placeholder art — real pixel art
// (GPT-generated from trip photos) can replace any entry later by dropping
// a PNG in game/img/ and swapping the lookup, without touching game code.
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

const Sprites = {};

// Boot-time override: if game/img/spritesheet.png exists (produced by
// tools/normalize_spritesheet.py from a GPT-styled sheet), slice it by the
// grid manifest and replace the code-drawn placeholders. Returns true when
// a sheet was loaded; on any failure the placeholders stay.
async function loadSpriteSheet() {
  let mf, img;
  try {
    mf = await (await fetch("data/spritesheet.json")).json();
    img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i); i.onerror = rej;
      i.src = "img/spritesheet.png";
    });
  } catch (e) { return false; }
  const artH = mf.cell.h - mf.cell.label;
  const cut = (s) => {
    const cx = s.cell[0] * mf.cell.w + Math.floor((mf.cell.w - s.w) / 2);
    const cy = mf.header + s.cell[1] * mf.cell.h + Math.floor((artH - s.h) / 2);
    const c = document.createElement("canvas");
    c.width = s.w; c.height = s.h;
    const g = c.getContext("2d");
    g.imageSmoothingEnabled = false;
    g.drawImage(img, cx, cy, s.w, s.h, 0, 0, s.w, s.h);
    return c;
  };
  const by = {};
  for (const s of mf.sprites) by[s.name] = cut(s);
  // frames back into the atlas the game reads
  Sprites.hiker = [by.hiker_walk_a, by.hiker_walk_b];
  Sprites.hikerJump = by.hiker_jump;
  Sprites.hikerTrudge = by.hiker_trudge;
  Sprites.hikerL = Sprites.hiker.map(flip);
  Sprites.hikerJumpL = flip(by.hiker_jump);
  Sprites.hikerTrudgeL = flip(by.hiker_trudge);
  Sprites.chip = [by.chipmunk_a, by.chipmunk_b];
  Sprites.chipL = Sprites.chip.map(flip);
  Sprites.chipSquash = by.chipmunk_squash;
  Sprites.frog = [by.frog_sit, by.frog_leap];
  Sprites.snake = [by.snake_a, by.snake_b];
  Sprites.snakeL = Sprites.snake.map(flip);
  Sprites.bird = [by.bird_a, by.bird_b];
  Sprites.birdL = Sprites.bird.map(flip);
  Sprites.snack = by.snack;
  Sprites.star = by.star;
  Sprites.matchbox = by.matchbox;
  Sprites.sign = by.sign;
  Sprites.cairn = by.cairn;
  Sprites.tent = by.tent;
  // decor + tiles only exist once a sheet provides them; the renderer
  // checks for these and falls back to procedural drawing otherwise
  Sprites.treeSmall = by.tree_small;
  Sprites.treeLarge = by.tree_large;
  Sprites.boulder = by.boulder;
  Sprites.reed = by.reed;
  Sprites.flower = by.flower;
  Sprites.sun = by.sun;
  Sprites.cloud = by.cloud;
  Sprites.stone = by.stone;
  Sprites.platformWood = by.platform_wood;
  Sprites.tileForest = by.tile_forest;
  Sprites.tileDirt = by.tile_dirt;
  Sprites.tileQuartzite = by.tile_quartzite;
  Sprites.tileSand = by.tile_sand;
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
}
