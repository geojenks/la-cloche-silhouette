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
  // profile: [[dist_m, elev_m], ...] for this day's slice of the real trail
  constructor(cfg, songDuration, profile) {
    this.cfg = cfg;
    this.km = cfg.km;
    this.length = Math.floor(MAX_RUN * songDuration * ACE_PACE);
    this.cols = Math.ceil(this.length / TILE);
    const rnd = mulberry32(cfg.seed || 1);

    // --- base curve: the actual topography of the day's walk -------------
    // (falls back to a flat line if no profile is supplied)
    this.profileAmp = 380;         // px spanning the day's min..max elevation
    const TOP_BAND = 130;          // world y of the highest ground
    this.base = new Float64Array(this.cols);
    if (profile && profile.length > 2) {
      const d0 = profile[0][0], d1 = profile[profile.length - 1][0];
      const elevs = profile.map((p) => p[1]);
      const eMin = Math.min(...elevs), eMax = Math.max(...elevs) || eMin + 1;
      let pi = 0;
      for (let c = 0; c < this.cols; c++) {
        const dist = d0 + (c / (this.cols - 1)) * (d1 - d0);
        while (pi < profile.length - 2 && profile[pi + 1][0] < dist) pi++;
        const [da, ea] = profile[pi], [db, eb] = profile[pi + 1];
        const t = (dist - da) / ((db - da) || 1);
        const e = ea + (eb - ea) * Math.max(0, Math.min(1, t));
        this.base[c] = TOP_BAND + (1 - (e - eMin) / (eMax - eMin)) * this.profileAmp;
      }
      // light smoothing so column steps come from the detail pass, not noise
      const sm = new Float64Array(this.cols);
      for (let c = 0; c < this.cols; c++) {
        let s = 0, n = 0;
        for (let k = -4; k <= 4; k++) {
          const i = c + k;
          if (i >= 0 && i < this.cols) { s += this.base[i]; n++; }
        }
        sm[c] = s / n;
      }
      this.base = sm;
    } else {
      this.base.fill(TOP_BAND + this.profileAmp * 0.7);
    }

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

    // --- heightfield: base curve + stepped local detail for platforming --
    // ("large local variation around the true profile" — LOCAL_AMP sets it)
    const LOCAL_AMP = 48;
    this.top = new Float64Array(this.cols);
    let dh = 0;
    for (let c = 0; c < this.cols; c++) {
      const biome = this.biomeOf(c);
      if (c > 4 && c < this.cols - 40 && biome !== "lake" && rnd() < 0.18) {
        const amp = biome === "quartzite" ? 32 : 16;
        let step = (rnd() < 0.5 ? -1 : 1) * (rnd() < 0.3 ? amp : 16);
        if (dh + step > LOCAL_AMP || dh + step < -LOCAL_AMP) step = -step;
        dh += step;
      }
      this.top[c] = Math.round(this.base[c] + dh);
    }
    // flatten start & camp
    for (let c = 0; c < 8; c++) this.top[c] = this.top[8];
    for (let c = this.cols - 30; c < this.cols; c++) this.top[c] = this.top[this.cols - 31];

    // --- lake basin --------------------------------------------------------
    const shoreY = Math.round(this.top[this.lakeCol - 9] || this.base[this.lakeCol]);
    for (let c = this.lakeCol - 8; c < this.lakeCol + lakeW + 8 && c < this.cols; c++) this.top[c] = shoreY;
    const surface = shoreY + 14, floor = surface + 74;
    for (let c = this.lakeCol; c < this.lakeCol + lakeW; c++) {
      const edge = Math.min(c - this.lakeCol, this.lakeCol + lakeW - 1 - c);
      this.top[c] = edge < 3 ? surface + 16 + edge * 20 : floor; // stepped walls
    }
    this.water = [{ x: this.lakeCol * TILE, y: surface, w: lakeW * TILE, h: floor - surface + 8 }];

    // deep-dive bonus: a narrow crevice in the lake floor (Mario-pipe
    // energy) — darker water, treasure at the bottom
    const crevCol = this.lakeCol + Math.floor(lakeW * 0.62);
    const crevDepth = 46;
    const crevBottom = floor + crevDepth;
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

    // --- lookout plateaus at the REAL local maxima of the day's profile —
    // the actual high points of the hike are where you can rest
    this.lookouts = [];
    const WIN = 80;
    const peaks = [];
    for (let c = Math.floor(this.cols * 0.08); c < this.cols - 60; c++) {
      if (c > this.lakeCol - 28 && c < this.lakeCol + lakeW + 28) continue;
      let isPeak = true;
      for (let k = -WIN; k <= WIN && isPeak; k += 4) {
        const i = Math.max(0, Math.min(this.cols - 1, c + k));
        if (this.base[i] < this.base[c] - 0.01) isPeak = false;
      }
      if (isPeak) peaks.push(c);
    }
    peaks.sort((a, b) => this.base[a] - this.base[b]); // highest (smallest y) first
    const minGap = Math.floor(this.cols * 0.12);
    for (const pc of peaks) {
      if (this.lookouts.length >= 4) break;
      if (this.lookouts.some((l) => Math.abs(l.col - pc) < minGap)) continue;
      const w = 6, steps = 3, c0 = pc - Math.floor(w / 2);
      const baseL = this.top[c0 - steps - 1], baseR = this.top[c0 + w + steps];
      const topY = Math.round(Math.min(this.base[pc] - 10, baseL - 16, baseR - 16));
      for (let i = 1; i <= steps; i++) {
        this.top[c0 - steps + i - 1] = Math.round(baseL + (topY - baseL) * i / steps);
        this.top[c0 + w + steps - i] = Math.round(baseR + (topY - baseR) * i / steps);
      }
      for (let c = c0; c < c0 + w; c++) this.top[c] = topY;
      this.lookouts.push({ x: (c0 + w / 2) * TILE, y: topY, col: pc });
    }

    // --- vista spots = the lookouts + the bird-bounce secret --------------
    this.vistas = this.lookouts.map((l) => ({
      x0: l.x - (3 + 4) * TILE, x1: l.x + (3 + 4) * TILE, tipped: false,
    }));
    this.vistas.push({ x0: this.secret.x - 8, x1: this.secret.x + this.secret.w + 8, tipped: false });

    // world extends below the deepest feature; camY is clamped to this
    this.worldH = Math.ceil(Math.max(...this.top, crevBottom) + 80);
    this.lowTop = Math.max(...this.top);

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
