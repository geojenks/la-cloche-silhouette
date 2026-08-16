// Seeded level generation. A level's pixel length is derived from its
// default song's duration: holding max run speed for the whole song ==
// reaching the tent as the song ends ("acing it").
//
// Terrain is a 16px-column heightfield (simple + robust for a heightfield
// world: small steps auto-climb, tall steps act as walls), plus one-way
// platforms, water rects, decor and pre-placed pickups.
"use strict";

const TILE = 16;
const WORLD_H = 270;
const MAX_RUN = 140;      // px/s — also used by player physics
const ACE_PACE = 0.97;    // fraction of a perfect run spent moving forward

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Level {
  constructor(cfg, songDuration) {
    this.cfg = cfg;
    this.km = cfg.km;
    this.length = Math.floor(MAX_RUN * songDuration * ACE_PACE);
    this.cols = Math.ceil(this.length / TILE);
    const rnd = mulberry32(cfg.seed || 1);

    // --- biome bands: forest → quartzite → lake shore → quartzite → forest
    const lakeFrac = (cfg.lakes && cfg.lakes[0] && cfg.lakes[0].at) || 0.45;
    this.lakeCol = Math.floor(this.cols * lakeFrac);
    const lakeW = 50;
    this.biomeOf = (col) => {
      if (col >= this.lakeCol - 8 && col < this.lakeCol + lakeW + 8) return "lake";
      const f = col / this.cols;
      if (f < 0.22 || f > 0.86) return "forest";
      if (f > 0.55 && f < 0.75) return "quartzite";
      return f < 0.4 ? "forest" : "quartzite";
    };

    // --- heightfield random walk ------------------------------------------
    this.top = new Float64Array(this.cols);
    let h = 200;
    for (let c = 0; c < this.cols; c++) {
      const biome = this.biomeOf(c);
      // quartzite ridges sit higher than forest floor; reflect steps that
      // would leave each biome's band so the walk keeps wandering instead
      // of pinning at a clamp
      const lo = biome === "quartzite" ? 140 : 168;
      const hi = biome === "quartzite" ? 200 : 216;
      if (c > 4 && c < this.cols - 40 && biome !== "lake" && rnd() < 0.18) {
        const amp = biome === "quartzite" ? 32 : 16;
        let step = (rnd() < 0.5 ? -1 : 1) * (rnd() < 0.3 ? amp : 16);
        if (h + step > hi || h + step < lo) step = -step;
        h += step;
      }
      h = Math.max(140, Math.min(216, h));
      this.top[c] = h;
    }
    // flatten start & camp
    for (let c = 0; c < 8; c++) this.top[c] = 200;
    for (let c = this.cols - 30; c < this.cols; c++) this.top[c] = this.top[this.cols - 31];

    // --- lake basin --------------------------------------------------------
    const shoreY = Math.min(184, this.top[this.lakeCol - 9] || 184);
    for (let c = this.lakeCol - 8; c < this.lakeCol + lakeW + 8 && c < this.cols; c++) this.top[c] = shoreY;
    const surface = shoreY + 14, floor = Math.min(WORLD_H - 8, surface + 74);
    for (let c = this.lakeCol; c < this.lakeCol + lakeW; c++) {
      const edge = Math.min(c - this.lakeCol, this.lakeCol + lakeW - 1 - c);
      this.top[c] = edge < 3 ? surface + 16 + edge * 20 : floor; // stepped walls
    }
    this.water = [{ x: this.lakeCol * TILE, y: surface, w: lakeW * TILE, h: floor - surface + 8 }];

    // deep-dive bonus: a narrow crevice in the lake floor (Mario-pipe
    // energy) — darker water, treasure at the bottom
    const crevCol = this.lakeCol + Math.floor(lakeW * 0.62);
    const crevDepth = 46;
    const crevBottom = Math.min(WORLD_H - 6, floor + crevDepth);
    for (let c = crevCol; c < crevCol + 2; c++) this.top[c] = crevBottom;
    this.crevice = { x: crevCol * TILE, y: floor - 4, w: 2 * TILE, h: crevBottom - floor + 12 };
    this.water.push(this.crevice);

    // --- platforms ---------------------------------------------------------
    this.platforms = [];
    // stepping stones across the lake
    const stones = 4;
    for (let i = 1; i <= stones; i++) {
      this.platforms.push({ x: this.lakeCol * TILE + (i * lakeW * TILE) / (stones + 1) - 16, y: surface - 6, w: 32, stone: true });
    }
    // bird-bounce secret vista above the lake (too high for a normal jump)
    this.secret = { x: this.lakeCol * TILE + (lakeW * TILE) / 2 - 40, y: shoreY - 128, w: 96 };
    this.platforms.push({ ...this.secret });
    // scattered hop-up platforms elsewhere
    for (let c = 20; c < this.cols - 40; c += 30 + Math.floor(rnd() * 40)) {
      if (this.biomeOf(c) === "lake") continue;
      this.platforms.push({ x: c * TILE, y: this.top[c] - 52 - Math.floor(rnd() * 3) * 16, w: TILE * (3 + Math.floor(rnd() * 3)) });
    }

    // --- guaranteed lookout plateaus: stepped climb, flat top, stepped
    // descent — the designated rest spots (plus wherever the walk happens
    // to run high)
    this.lookouts = [];
    for (const f of (cfg.vistaAt || [0.3, 0.65, 0.85])) {
      let c0 = Math.floor(this.cols * f);
      if (c0 > this.lakeCol - 24 && c0 < this.lakeCol + lakeW + 24) c0 = this.lakeCol + lakeW + 28;
      const w = 6, steps = 3;
      const base = this.top[c0 - steps - 1];
      const topY = Math.max(132, base - 48);
      for (let i = 1; i <= steps; i++) {
        const h = Math.round(base + (topY - base) * i / steps);
        this.top[c0 - steps + i - 1] = h;                       // ascent
        this.top[c0 + w + steps - i] = h;                       // descent
      }
      for (let c = c0; c < c0 + w; c++) this.top[c] = topY;
      this.lookouts.push({ x: (c0 + w / 2) * TILE, y: topY });
    }

    // --- vista spots: sustained high ground where resting works ----------
    this.vistas = [];
    let v0 = -1;
    for (let c = 0; c <= this.cols; c++) {
      const high = c < this.cols && this.top[c] <= 150;
      if (high && v0 < 0) v0 = c;
      if (!high && v0 >= 0) {
        if (c - v0 >= 4) this.vistas.push({ x0: v0 * TILE - 8, x1: c * TILE + 8, tipped: false });
        v0 = -1;
      }
    }
    // the bird-bounce secret is always a vista
    this.vistas.push({ x0: this.secret.x - 8, x1: this.secret.x + this.secret.w + 8, tipped: false });

    // --- checkpoints (trailhead sign, lakeshore, cairn, tent) -------------
    this.checkpoints = [
      { x: 40, label: "Trailhead" },
      { x: (this.lakeCol - 5) * TILE, label: "Lakeside break" },
      { x: Math.floor(this.cols * 0.75) * TILE, label: "Ridge cairn" },
    ];
    this.tentX = (this.cols - 16) * TILE;

    // --- pickups -----------------------------------------------------------
    // a snack waits at every lookout
    // (placed before the sparse ground scatter)
    this.pickups = [];
    for (const lk of this.lookouts)
      this.pickups.push({ type: "snack", x: lk.x, y: lk.y - 14, taken: false });
    // sparse on the ground — most snacks come from fruit trees and drops
    for (let c = 24; c < this.cols - 40; c += 80 + Math.floor(rnd() * 60)) {
      if (this.biomeOf(c) === "lake") continue;
      this.pickups.push({ type: "snack", x: c * TILE, y: this.top[c] - 14, taken: false });
    }
    // platform snacks
    for (const p of this.platforms) {
      if (!p.stone && p !== this.secret && rnd() < 0.5)
        this.pickups.push({ type: "snack", x: p.x + p.w / 2, y: p.y - 14, taken: false });
    }
    // underwater snack + crevice treasure + the secret star
    this.pickups.push({ type: "snack", x: this.water[0].x + this.water[0].w * 0.45, y: floor - 20, taken: false });
    this.pickups.push({ type: "star", x: this.crevice.x + this.crevice.w / 2, y: crevBottom - 10, taken: false });
    this.pickups.push({ type: "snack", x: this.crevice.x + 8, y: crevBottom - 24, taken: false });
    this.pickups.push({ type: "snack", x: this.crevice.x + this.crevice.w - 8, y: crevBottom - 24, taken: false });
    this.pickups.push({ type: "star", x: this.secret.x + this.secret.w / 2, y: this.secret.y - 16, taken: false });
    this.pickups.push({ type: "snack", x: this.secret.x + 16, y: this.secret.y - 14, taken: false });
    this.pickups.push({ type: "snack", x: this.secret.x + this.secret.w - 16, y: this.secret.y - 14, taken: false });

    // --- fixed patrol enemies (timing puzzles) ----------------------------
    // Seeded, geography-based hazards on predictable loops, independent of
    // the beat-driven spawner. None in the opening stretch.
    this.spawns = [];
    for (let c = Math.floor(this.cols * 0.12); c < this.cols - 45; c += 120 + Math.floor(rnd() * 130)) {
      const b = this.biomeOf(c);
      if (b === "lake") {
        this.spawns.push({ type: "frog", x: c * TILE, dir: rnd() < 0.5 ? -1 : 1 });
      } else if (b === "quartzite") {
        this.spawns.push(rnd() < 0.5
          ? { type: "snake", x: c * TILE, dir: rnd() < 0.5 ? -1 : 1 }
          : { type: "bird", x: c * TILE, alt: Math.max(60, this.top[c] - 70), dir: rnd() < 0.5 ? -1 : 1 });
      } else {
        this.spawns.push(rnd() < 0.6
          ? { type: "chipmunk", x: c * TILE, dir: rnd() < 0.5 ? -1 : 1 }
          : { type: "frog", x: c * TILE, dir: rnd() < 0.5 ? -1 : 1 });
      }
    }

    // --- decor + fruit hanging in some trees (bonk from below to knock
    // a snack down, like a ? block) --------------------------------------
    this.decor = [];
    this.fruits = [];
    for (let c = 2; c < this.cols - 2; c++) {
      const b = this.biomeOf(c), x = c * TILE + rnd() * TILE;
      if (b === "forest" && rnd() < 0.14) {
        const s = 0.7 + rnd() * 0.9;
        this.decor.push({ type: "tree", x, y: this.top[c], s });
        if (s > 0.9 && rnd() < 0.4)
          this.fruits.push({ x, y: this.top[c] - 40 * s + 4, taken: false });
      }
      else if (b === "quartzite" && rnd() < 0.1)
        this.decor.push({ type: "boulder", x, y: this.top[c], s: 0.5 + rnd() * 0.8 });
      else if (b === "lake" && rnd() < 0.2 && Math.abs(c - this.lakeCol) < 12)
        this.decor.push({ type: "reed", x, y: this.top[c], s: 0.8 + rnd() * 0.5 });
      if (rnd() < 0.02) this.decor.push({ type: "flower", x, y: this.top[c], s: 1 });
    }

    // --- parallax ridge line (the white La Cloche hills) ------------------
    this.ridge = [];
    let rh = 100;
    for (let i = 0; i <= 200; i++) {
      rh += (rnd() - 0.5) * 22;
      rh = Math.max(50, Math.min(150, rh));
      this.ridge.push(rh);
    }
  }

  groundTop(x) {
    const c = Math.max(0, Math.min(this.cols - 1, Math.floor(x / TILE)));
    return this.top[c];
  }

  inWater(x, y) {
    for (const w of this.water)
      if (x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h) return w;
    return null;
  }

  waterSurfaceAt(x) {
    for (const w of this.water) if (x >= w.x && x <= w.x + w.w) return w.y;
    return null;
  }

  inVista(x) {
    for (const v of this.vistas) if (x >= v.x0 && x <= v.x1) return v;
    return null;
  }

  kmAt(x) { return (Math.max(0, Math.min(1, x / this.length)) * this.km); }
}
