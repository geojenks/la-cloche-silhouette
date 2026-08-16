// Main loop and orchestration: states (title → play → night), the
// beat-driven enemy spawner, collisions, camera, painterly-pixel rendering
// of the day, HUD, and touch/keyboard input.
"use strict";

const VIEW_W = 480, VIEW_H = 270;

const canvas = document.getElementById("game");
const ctx2d = canvas.getContext("2d");
canvas.width = VIEW_W; canvas.height = VIEW_H;
ctx2d.imageSmoothingEnabled = false;

// The backing store tracks the element's real device-pixel size and the
// whole scene is drawn under one scale transform. Text rasterizes at native
// resolution (crisp on laptops) instead of being a stretched 480px bitmap.
function fitCanvas() {
  const r = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(VIEW_W, Math.round(r.width * dpr));
  const h = Math.max(VIEW_H, Math.round(r.height * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
}

const music = new MusicManager();
let level = null, player = null, enemies = [], drops = [], state = "boot";
let camX = 0, camY = 0, bgPulse = 0, elapsed = 0, fade = 0, bgLift = 0;
let groundedY = 0, bearsSpawned = 0, photoShow = null;
let checkpoint = null, spawnAlt = 0, toastT = 0, toastText = "";
let dayCfg = null, nightAnim = 0;
// sprite set follows the music's hype = section intensity (0 calm,
// 1 default hike, 2 dance, 3 rave)
let hype = 1;

// ---------------------------------------------------------------- input ---
const input = { left: false, right: false, jump: false, jumpPressed: false };
const keys = {};
addEventListener("keydown", (e) => {
  if (keys[e.code]) return; keys[e.code] = true;
  if (["ArrowLeft", "KeyA"].includes(e.code)) input.left = true;
  if (["ArrowRight", "KeyD"].includes(e.code)) input.right = true;
  if (["Space", "ArrowUp", "KeyW", "KeyZ"].includes(e.code)) { input.jump = true; input.jumpPressed = true; e.preventDefault(); }
  if (e.code === "KeyR") resetToCheckpoint();
  if (e.code === "KeyN") skipSong(1);
  if (e.code === "KeyP") skipSong(-1);
  if (state === "title" || state === "night") advanceState();
});
addEventListener("keyup", (e) => {
  keys[e.code] = false;
  if (["ArrowLeft", "KeyA"].includes(e.code)) input.left = false;
  if (["ArrowRight", "KeyD"].includes(e.code)) input.right = false;
  if (["Space", "ArrowUp", "KeyW", "KeyZ"].includes(e.code)) input.jump = false;
});

function bindTouch(id, prop) {
  const el = document.getElementById(id);
  const on = (e) => { e.preventDefault(); input[prop] = true; if (prop === "jump") input.jumpPressed = true; };
  const off = (e) => { e.preventDefault(); input[prop] = false; };
  el.addEventListener("pointerdown", on);
  el.addEventListener("pointerup", off);
  el.addEventListener("pointercancel", off);
  el.addEventListener("pointerleave", off);
}
bindTouch("btnL", "left"); bindTouch("btnR", "right"); bindTouch("btnJ", "jump");
document.getElementById("btnReset").addEventListener("click", () => resetToCheckpoint());
document.getElementById("btnPrev").addEventListener("click", () => skipSong(-1));
document.getElementById("btnNext").addEventListener("click", () => skipSong(1));
canvas.addEventListener("pointerdown", () => { if (state === "title" || state === "night") advanceState(); });

document.addEventListener("visibilitychange", () => {
  if (document.hidden) music.pause(); else if (state === "play") music.resume();
});

function skipSong(dir) {
  if (state !== "play") return;
  dir > 0 ? music.next() : music.prev();
}

function toast(msg) { toastText = msg; toastT = 2.5; }

// ---------------------------------------------------------------- state ---
async function boot() {
  buildAtlas();
  await loadSpriteSheets(); // styled art (+mood variants) overrides placeholders
  await Backdrops.init();
  dayCfg = await (await fetch("data/levels/day1.json")).json();
  await music.load(dayCfg.playlist);
  const first = music.songs[dayCfg.playlist[0]];

  // the terrain follows the real elevation profile of this day's walk, and
  // the actual trail photos appear at their real distances
  let profile = null, photoSpots = [];
  try {
    const site = await (await fetch("../data/site_data.json")).json();
    const day = site.days.find((d) => d.n === dayCfg.day);
    profile = site.points
      .filter((p) => p[2] >= day.start && p[2] <= day.end)
      .map((p) => [p[2], p[3]]);
    const seen = [];
    for (const m of site.media
      .filter((m) => m.type === "photo" && !m.dropped && m.dist >= day.start && m.dist <= day.end)
      .sort((a, b) => a.dist - b.dist)) {
      if (seen.length && m.dist - seen[seen.length - 1].dist < 600) continue; // no bunching
      seen.push(m);
    }
    photoSpots = seen.map((m) => ({
      file: m.file,
      frac: (m.dist - day.start) / (day.end - day.start),
      km: (m.dist - day.start) / 1000,
      taken: false, img: null,
    }));
  } catch (e) { /* profile missing → Level falls back to a flat base */ }

  level = new Level(dayCfg, first.duration, profile);
  level.photoSpots = photoSpots.map((s) => ({
    ...s, x: Math.max(120, Math.min(level.tentX - 60, s.frac * level.length)),
  }));
  state = "title";
}

function startRun() {
  player = new Player(40, level.groundTop(40) - 20);
  enemies = []; drops = [];
  bearsSpawned = 0; photoShow = null;
  for (const s of level.spawns) s.done = false;
  for (const ph of level.photoSpots) ph.taken = false;
  camY = Math.max(0, Math.min(level.worldH - VIEW_H, player.y - VIEW_H * 0.6));
  groundedY = player.y;
  checkpoint = level.checkpoints[0];
  elapsed = 0; camX = 0;
  music.initGraph();
  music.setPlaylist(dayCfg.playlist);
  music.onSongChange = (s, isFallback) =>
    toast(`♪ ${s.title}${s.artist ? " — " + s.artist : ""}${isFallback ? " (chip loop)" : ""}`);
  music.start();
  state = "play";
}

function advanceState() {
  if (state === "title") startRun();
  else if (state === "night") { music.pause(); state = "title"; }
}

function resetToCheckpoint() {
  if (state !== "play" || !checkpoint) return;
  player.x = checkpoint.x;
  player.y = level.groundTop(checkpoint.x) - 24;
  player.vx = player.vy = 0;
  camY = Math.max(0, Math.min(level.worldH - VIEW_H, player.y - VIEW_H * 0.6));
  player.stamina = 100; player.trudge = false; player.invuln = 1;
  enemies = [];
  fade = 0.6;
  toast(`Back to: ${checkpoint.label}`);
}

// -------------------------------------------------------------- spawner ---
// Level-placed patrol enemies activate as their spot scrolls into view.
function spawnPlaced() {
  for (const s of level.spawns) {
    if (s.done || s.x > camX + VIEW_W + 60 || s.x < camX - 60) continue;
    s.done = true;
    if (s.type === "chipmunk") enemies.push(new Chipmunk(s.x, level.groundTop(s.x) - 8, s.dir));
    else if (s.type === "frog") enemies.push(new Frog(s.x, level.groundTop(s.x) - 8, s.dir));
    else if (s.type === "snake") enemies.push(new Snake(s.x, level.groundTop(s.x) - 8, s.dir));
    else if (s.type === "bird") enemies.push(new Bird(s.x, s.alt, s.dir));
  }
}

function spawnFromBeats(beats, intensity) {
  const maxEnemies = 1 + intensity * 2;
  let alive = enemies.filter(e => !e.dead).length;
  for (const b of beats) {
    if (intensity < 1 || alive >= maxEnemies) return;
    alive++;
    const sx = camX + VIEW_W + 40;
    if (sx > level.tentX - 250 || sx > level.length - 100) return;
    const biome = level.biomeOf(Math.floor(sx / TILE));
    const inLake = level.waterSurfaceAt(sx) !== null;
    if (b.type === "downbeat") {
      if (spawnAlt++ % 2 === 0 || inLake) {
        const alt = Math.max(60, player.y - 55 - Math.random() * 30);
        enemies.push(new Bird(sx, alt));
      } else {
        enemies.push(new Snake(sx, level.groundTop(sx) - 8));
      }
    } else if (b.type === "midbeat" && !inLake) {
      enemies.push(new Chipmunk(sx, level.groundTop(sx) - 8));
    } else if (b.type === "upbeat" && (biome === "forest" || biome === "lake") && !inLake && Math.random() < 0.35) {
      enemies.push(new Frog(sx, level.groundTop(sx) - 8));
    }
  }
}

// ------------------------------------------------------------ collisions --
function spawnDrop(x, y) { drops.push({ x, y, vy: -120 }); }

function handleCollisions(prevBottom, prevTop) {
  const truce = hype >= 3; // rave sections: everyone's dancing, nobody bites
  for (const e of enemies) {
    if (e.dead || !overlap(player, e)) continue;
    if (e instanceof Bear) {
      if (player.vy > 40 && prevBottom <= e.y + 6) {
        player.vy = -480; player.superBounceT = 0.3; // bounces off — and startles it
        e.startle(player);
      } else if (!truce && player.hurt(e.x + e.w / 2, e.damage)) {
        bgPulse = 1; Sfx.play("thud", 1);
        e.startle(player);
      }
    } else if (e instanceof Bird) {
      if (player.vy > 40 && prevBottom <= e.y + 6) {
        player.vy = -580; player.superBounceT = 0.35; e.y += 8;  // springboard!
        toast("Woah — thermal lift!");
      } else if (player.vy < -20 && prevTop >= e.y + e.h - 6) {
        e.dieBonk();
        Sfx.play("pop", 0.8);
        if (Math.random() < 0.35) spawnDrop(e.x + e.w / 2, e.y);
      } else if (!truce && player.hurt(e.x + e.w / 2)) { bgPulse = 1; Sfx.play("thud", 0.9); }
    } else if (e.stompable && player.vy > 40 && prevBottom <= e.y + 6) {
      e.dieStomp();
      Sfx.play("pop", 0.8);
      // chipmunks are springy — stomp one to reach high bonus spots
      if (e.bouncy) { player.vy = input.jump ? -500 : -420; player.superBounceT = 0.3; }
      else player.vy = input.jump ? -330 : -240;
      if (Math.random() < 0.35) spawnDrop(e.x + e.w / 2, e.y);
    } else if (!truce && player.hurt(e.x + e.w / 2)) { bgPulse = 1; Sfx.play("thud", 0.9); }
  }
  // fruit trees: bonk from below to knock a snack loose
  for (const f of level.fruits) {
    if (f.taken || player.vy >= -20) continue;
    const box = { x: f.x - 5, y: f.y - 4, w: 10, h: 9 };
    if (overlap(player, box) && prevTop >= f.y + 2) {
      f.taken = true;
      spawnDrop(f.x, f.y);
    }
  }
  for (const p of level.pickups) {
    if (p.taken) continue;
    const box = { x: p.x - 6, y: p.y - 6, w: 12, h: 14 };
    if (overlap(player, box)) {
      p.taken = true;
      if (p.type === "snack") { player.snacks++; player.stamina = Math.min(100, player.stamina + 25); toast("Trail mix +25"); }
      if (p.type === "star") { player.stars++; toast("★ Silver vista found!"); }
    }
  }
}

// --------------------------------------------------------------- update ---
let lastT = 0;
function frame(t) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.033, (t - lastT) / 1000 || 0.016);
  lastT = t;
  if (state === "play") updatePlay(dt);
  if (state === "night") nightAnim += dt;
  render(dt);
  input.jumpPressed = false;
}

function updatePlay(dt) {
  elapsed += dt;
  fade = Math.max(0, fade - dt);
  toastT = Math.max(0, toastT - dt);
  const beats = music.update();
  const sec = music.section();
  if (beats.some(b => b.type === "downbeat")) bgPulse = 1;
  bgPulse = Math.max(0, bgPulse - dt * 2.5);

  const h = Math.max(0, Math.min(3, sec.intensity));
  if (h !== hype) { hype = h; setSpriteMood(hype); }
  // at hype 2+ the hiker grooves on the spot to the beat
  player.dancing = hype >= 2 && player.onGround &&
    Math.abs(player.vx) < 5 && !player.swimming && !player.trudge;
  if (player.dancing) player.anim = music.lastBeat;

  const prevBottom = player.y + player.h, prevTop = player.y;
  player.update(dt, input, level);
  music.underwater(player.swimming);

  // checkpoints by crossing; dipping in the lake claims the lakeside one
  for (const c of level.checkpoints) {
    if (player.x >= c.x && (!checkpoint || c.x > checkpoint.x)) { if (checkpoint !== c) { checkpoint = c; toast(`Checkpoint — ${c.label}`); } }
  }

  // vista tip + background reveal: climbing pans the forest away from the
  // far mountains. The reveal keys off GROUNDED altitude so jumps don't
  // bob the background.
  const vista = level.inVista(player.x + player.w / 2);
  if (vista && !vista.tipped) { vista.tipped = true; toast("Quite the view — resting here restores stamina"); }
  if (player.onGround) groundedY = player.y;
  const alt = level.lowTop - groundedY;
  const targetLift = Math.max(0, Math.min(60, (alt - 130) * 0.3));
  bgLift += (targetLift - bgLift) * Math.min(1, dt * 2);

  // vertical camera: deadzone in the middle of the screen, smooth outside it
  let ty = camY;
  if (player.y < camY + 70) ty = player.y - 70;
  else if (player.y + player.h > camY + VIEW_H - 96) ty = player.y + player.h - (VIEW_H - 96);
  ty = Math.max(0, Math.min(level.worldH - VIEW_H, ty));
  camY += (ty - camY) * Math.min(1, dt * 5);

  // the bear: dark hours only, rare, one at a time
  const prog = camX / (level.length - VIEW_W);
  if ((prog < 0.07 || prog > 0.88) && bearsSpawned < 2 &&
      !enemies.some((e) => e instanceof Bear) && Math.random() < dt * 0.06) {
    const bx = camX + VIEW_W + 30;
    enemies.push(new Bear(bx, level.groundTop(bx) - 14));
    bearsSpawned++;
    toast("…something big moves in the dark…");
  }

  // trail photos: preload nearby, collect on touch
  for (const ph of level.photoSpots) {
    if (ph.taken) continue;
    if (!ph.img && ph.x - player.x < 700 && ph.x - player.x > -300) {
      ph.img = new Image();
      ph.img.src = "../media/thumb/" + ph.file;
    }
    const my = level.groundTop(ph.x) - 24;
    if (overlap(player, { x: ph.x - 7, y: my - 8, w: 14, h: 18 })) {
      ph.taken = true;
      player.photosSeen = (player.photosSeen || 0) + 1;
      photoShow = { spot: ph, t: 4 };
    }
  }
  if (photoShow) { photoShow.t -= dt; if (photoShow.t <= 0) photoShow = null; }

  spawnPlaced();
  spawnFromBeats(beats, sec.intensity);
  for (const e of enemies) e.update(dt, level, player, beats, sec.intensity);
  enemies = enemies.filter(e => !e.remove && e.x > camX - 250 && e.x < camX + VIEW_W + 600 &&
    e.y > -250 && e.y < level.worldH + 250);
  handleCollisions(prevBottom, prevTop);

  // knocked-loose snacks fall until they land, then become pickups
  for (const d of drops) {
    d.vy += 900 * dt; d.y += d.vy * dt;
    const top = level.groundTop(d.x);
    if (d.y >= top - 7) { d.landed = true; level.pickups.push({ type: "snack", x: d.x, y: top - 14, taken: false }); }
  }
  drops = drops.filter(d => !d.landed);

  // player fixed at screen centre — no lookahead drag
  camX = Math.max(0, Math.min(level.length - VIEW_W, player.x + player.w / 2 - VIEW_W / 2));

  if (player.x > level.tentX + 20) { state = "night"; nightAnim = 0; music.underwater(false); }
}

// --------------------------------------------------------------- render ---
function lerp(a, b, t) { return a + (b - a) * t; }
function lerpColor(c1, c2, t) {
  return `rgb(${Math.round(lerp(c1[0], c2[0], t))},${Math.round(lerp(c1[1], c2[1], t))},${Math.round(lerp(c1[2], c2[2], t))})`;
}

// day cycle keyed to level progress: start the hike pre-dawn, arrive at
// camp as the sun sets
const SKY_STOPS = [
  [0.00, [14, 20, 42]],    // pre-dawn, stars out
  [0.05, [70, 48, 74]],    // first light
  [0.09, [214, 122, 62]],  // sunrise burnt orange
  [0.20, [135, 206, 235]], // morning blue
  [0.72, [152, 211, 235]], // afternoon
  [0.88, [235, 142, 72]],  // sunset
  [1.00, [112, 56, 76]],   // dusk at camp
];
function skyRGB(p) {
  for (let i = 1; i < SKY_STOPS.length; i++) {
    if (p <= SKY_STOPS[i][0]) {
      const [p0, c0] = SKY_STOPS[i - 1], [p1, c1] = SKY_STOPS[i];
      const t = (p - p0) / (p1 - p0);
      return c0.map((v, k) => lerp(v, c1[k], t));
    }
  }
  return SKY_STOPS[SKY_STOPS.length - 1][1];
}
function rgb(c) { return `rgb(${c.map(Math.round).join(",")})`; }

function drawStrip(g, img, par, yBase, liftK) {
  const y = Math.round(yBase + bgLift * liftK);
  const w = img.width;
  let x = -((camX * par) % w) - w;
  for (; x < VIEW_W; x += w) g.drawImage(img, Math.round(x), y);
}

function render(dt) {
  const g = ctx2d;
  fitCanvas();
  const sf = Math.min(canvas.width / VIEW_W, canvas.height / VIEW_H);
  const ox = (canvas.width - VIEW_W * sf) / 2, oy = (canvas.height - VIEW_H * sf) / 2;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = "#101418";
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.setTransform(sf, 0, 0, sf, ox, oy);
  g.imageSmoothingEnabled = false;
  g.save();
  g.beginPath(); g.rect(0, 0, VIEW_W, VIEW_H); g.clip();
  renderScene(g, dt);
  g.restore();
}

function renderScene(g, dt) {
  if (state === "boot") { g.fillStyle = "#111"; g.fillRect(0, 0, VIEW_W, VIEW_H); return; }
  if (state === "title") return renderTitle(g);
  if (state === "night") return renderNight(g);

  const p = camX / (level.length - VIEW_W);
  // sky gradient for this time of day, with a beat pulse
  const sky = skyRGB(p);
  const horizon = sky.map((v) => lerp(v, 240, 0.45));
  const grd = g.createLinearGradient(0, 0, 0, VIEW_H);
  grd.addColorStop(0, rgb(sky));
  grd.addColorStop(1, rgb(horizon));
  g.fillStyle = grd;
  g.fillRect(0, 0, VIEW_W, VIEW_H);
  if (bgPulse > 0) {
    // full-hype sections pulse in colour, alternating per bar
    const raveCol = music.playing && Math.floor(music.lastBeat / 4) % 2 ? "0,255,255" : "255,0,255";
    g.fillStyle = hype === 3 ? `rgba(${raveCol},${bgPulse * 0.1})` : `rgba(255,255,255,${bgPulse * 0.07})`;
    g.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  // stars fade with the dawn (and return at dusk)
  const starA = Math.max(1 - p / 0.08, (p - 0.93) / 0.07);
  if (starA > 0) {
    for (let i = 0; i < 70; i++) {
      const sx = (i * 137.5 + 20) % VIEW_W, sy = (i * 89.3) % 150;
      g.fillStyle = `rgba(255,255,240,${starA * (0.35 + 0.4 * Math.abs(Math.sin(i * 3.7)))})`;
      g.fillRect(sx, sy, 1.5, 1.5);
    }
  }

  // the sun arcs from sunrise to sunset across the whole day
  const sunX = 40 + p * (VIEW_W - 80);
  const sunY = 158 - Math.sin(p * Math.PI) * 118;
  const warmth = 1 - Math.sin(p * Math.PI);
  if (Sprites.sun) g.drawImage(Sprites.sun, Math.round(sunX - 12), Math.round(sunY - 12));
  else {
    g.fillStyle = rgb([255, lerp(247, 150, warmth), lerp(214, 70, warmth)]);
    g.beginPath(); g.arc(sunX, sunY, 12, 0, 7); g.fill();
  }
  if (Sprites.cloud) {
    for (let i = 0; i < 3; i++) {
      const cx = ((i * 210 + 40 - camX * 0.08) % (VIEW_W + 60) + VIEW_W + 60) % (VIEW_W + 60) - 30;
      g.drawImage(Sprites.cloud, cx, 28 + i * 26);
    }
  }

  // far mountains-with-lakes, then the thick forest that hides their feet;
  // climbing high pans them apart (bgLift) and the lakes appear. Mountains
  // barely move — they're far away.
  drawStrip(g, Backdrops.far, 0.03, 92, 0.12);
  drawStrip(g, Backdrops.mid, 0.2, 136, 1.4);

  g.save();
  g.translate(-Math.round(camX), -Math.round(camY));

  // terrain columns (sheet tiles when styled art is loaded)
  const viewBot = camY + VIEW_H;
  const c0 = Math.floor(camX / TILE), c1 = Math.min(level.cols - 1, c0 + VIEW_W / TILE + 1);
  for (let c = c0; c <= c1; c++) {
    const x = c * TILE, top = level.top[c], biome = level.biomeOf(c);
    if (top > viewBot) continue;
    const inLakebed = level.waterSurfaceAt(x + 8) !== null;
    const tile = inLakebed ? Sprites.tileSand
      : biome === "quartzite" ? Sprites.tileQuartzite : Sprites.tileForest;
    if (tile) {
      g.drawImage(tile, x, top);
      const below = (biome === "quartzite" || inLakebed) ? tile : (Sprites.tileDirt || tile);
      for (let y = top + TILE; y < viewBot; y += TILE) g.drawImage(below, x, y);
    } else if (biome === "quartzite") {
      g.fillStyle = "#f4f1ea"; g.fillRect(x, top, TILE, viewBot - top);
      g.fillStyle = "#d8d3c6"; g.fillRect(x, top + 6, TILE, 2);
    } else if (inLakebed) {
      g.fillStyle = "#cbb27f"; g.fillRect(x, top, TILE, viewBot - top); // lakebed sand
    } else {
      g.fillStyle = "#5d8a44"; g.fillRect(x, top, TILE, 5);
      g.fillStyle = "#6d4c33"; g.fillRect(x, top + 5, TILE, viewBot - top - 5);
      g.fillStyle = "#573b26"; g.fillRect(x, top + 5, TILE, 2);
    }
  }

  // decor behind actors
  for (const d of level.decor) {
    if (d.x < camX - 60 || d.x > camX + VIEW_W + 60) continue;
    drawDecor(g, d);
  }

  // platforms
  for (const pf of level.platforms) {
    if (pf.x + pf.w < camX || pf.x > camX + VIEW_W) continue;
    if (pf.stone && Sprites.stone) g.drawImage(Sprites.stone, pf.x, pf.y, pf.w, 10);
    else if (!pf.stone && Sprites.platformWood) {
      for (let x = pf.x; x < pf.x + pf.w; x += TILE)
        g.drawImage(Sprites.platformWood, 0, 0, Math.min(TILE, pf.x + pf.w - x), 8, x, pf.y, Math.min(TILE, pf.x + pf.w - x), 8);
    } else {
      g.fillStyle = pf.stone ? "#cfc9bd" : "#8a6a48";
      g.fillRect(pf.x, pf.y, pf.w, pf.stone ? 8 : 5);
      if (!pf.stone) { g.fillStyle = "#6d4c33"; g.fillRect(pf.x, pf.y + 5, pf.w, 2); }
    }
  }

  // props: sign, cairns, tent
  g.drawImage(Sprites.sign, 24, level.groundTop(24) - Sprites.sign.height);
  for (const c of level.checkpoints) if (c.label === "Ridge cairn")
    g.drawImage(Sprites.cairn, c.x, level.groundTop(c.x) - Sprites.cairn.height);
  for (const lk of level.lookouts)
    g.drawImage(Sprites.cairn, Math.round(lk.x + 14), lk.y - Sprites.cairn.height);
  g.drawImage(Sprites.tent, level.tentX, level.groundTop(level.tentX) - Sprites.tent.height);

  // pickups (bob on the beat), fruit in the canopies, falling drops
  const bob = Math.sin(music.beatPhase() * Math.PI * 2) * 1.5;
  for (const pk of level.pickups) {
    if (pk.taken || pk.x < camX - 20 || pk.x > camX + VIEW_W + 20) continue;
    const spr = pk.type === "star" ? Sprites.star : Sprites.snack;
    g.drawImage(spr, Math.round(pk.x - spr.width / 2), Math.round(pk.y - spr.height / 2 + bob));
  }
  for (const f of level.fruits) {
    if (f.taken || f.x < camX - 20 || f.x > camX + VIEW_W + 20) continue;
    g.drawImage(Sprites.fruit, Math.round(f.x - 4), Math.round(f.y - 4 + bob * 0.6));
  }
  for (const d of drops) g.drawImage(Sprites.snack, Math.round(d.x - 4), Math.round(d.y - 4));

  // photo spots: little polaroids waiting on the trail
  for (const ph of level.photoSpots) {
    if (ph.taken || ph.x < camX - 30 || ph.x > camX + VIEW_W + 30) continue;
    const py = level.groundTop(ph.x) - 24 + bob;
    g.fillStyle = "#f4f1ea"; g.fillRect(ph.x - 6, py - 8, 12, 13);
    g.fillStyle = "#8a92a0"; g.fillRect(ph.x - 4, py - 6, 8, 7);
    g.fillStyle = "#2b2d33"; g.fillRect(ph.x - 1, py - 4, 3, 2);
  }

  // enemies (bonked ones spin belly-up as they fall)
  for (const e of enemies) {
    const spr = e.sprite();
    const dx = Math.round(e.x + e.w / 2 - spr.width / 2);
    const dy = Math.round(e.y + e.h - spr.height);
    if (e.dead && e.spin) {
      g.save();
      g.translate(dx + spr.width / 2, dy + spr.height / 2);
      g.scale(1, -1);
      g.drawImage(spr, -spr.width / 2, -spr.height / 2);
      g.restore();
    } else {
      g.drawImage(spr, dx, dy);
    }
  }

  // player (flash while invulnerable)
  if (!(player.invuln > 0 && Math.floor(player.invuln * 12) % 2)) {
    const spr = player.sprite();
    g.drawImage(spr, Math.round(player.x + player.w / 2 - spr.width / 2), Math.round(player.y + player.h - spr.height + 1));
  }

  // water on top (translucent); the crevice reads darker the deeper it goes
  for (const w of level.water) {
    g.fillStyle = "rgba(52,120,180,0.55)";
    g.fillRect(w.x, w.y, w.w, w.h);
    if (w === level.crevice) {
      g.fillStyle = "rgba(8,25,55,0.45)";
      g.fillRect(w.x, w.y + w.h * 0.3, w.w, w.h * 0.7);
    } else {
      g.fillStyle = "rgba(220,240,255,0.7)";
      const ph = music.beatPhase();
      for (let i = 0; i < w.w; i += 24) g.fillRect(w.x + i + ph * 12, w.y, 10, 2);
    }
  }

  g.restore();
  renderHUD(g);
  if (fade > 0) { g.fillStyle = `rgba(0,0,0,${Math.min(1, fade * 2)})`; g.fillRect(0, 0, VIEW_W, VIEW_H); }
}

function drawDecor(g, d) {
  // styled sheet art takes over when loaded; procedural shapes otherwise
  const sheetSpr = d.type === "tree" ? (d.s < 1.1 ? Sprites.treeSmall : Sprites.treeLarge)
    : d.type === "boulder" ? Sprites.boulder
    : d.type === "reed" ? Sprites.reed
    : d.type === "flower" ? Sprites.flower : null;
  if (sheetSpr) {
    const k = d.type === "tree" ? d.s * 0.8 : d.s;
    const w = sheetSpr.width * k, h = sheetSpr.height * k;
    g.drawImage(sheetSpr, d.x - w / 2, d.y - h, w, h);
    return;
  }
  if (d.type === "tree") {
    const s = d.s;
    g.fillStyle = "#6d4c33"; g.fillRect(d.x - 2 * s, d.y - 26 * s, 4 * s, 26 * s);
    g.fillStyle = "#3e6b2f";
    for (let i = 0; i < 3; i++) {
      const w = (26 - i * 6) * s, y = d.y - 22 * s - i * 10 * s;
      g.beginPath(); g.moveTo(d.x - w / 2, y); g.lineTo(d.x + w / 2, y); g.lineTo(d.x, y - 14 * s); g.fill();
    }
  } else if (d.type === "boulder") {
    g.fillStyle = "#e3e0d6";
    g.beginPath(); g.ellipse(d.x, d.y - 6 * d.s, 12 * d.s, 8 * d.s, 0, 0, 7); g.fill();
    g.fillStyle = "#c9c4b6"; g.fillRect(d.x - 6 * d.s, d.y - 6 * d.s, 10 * d.s, 2);
  } else if (d.type === "reed") {
    g.strokeStyle = "#4e7a3a"; g.lineWidth = 1.5;
    for (let i = -1; i <= 1; i++) {
      g.beginPath(); g.moveTo(d.x + i * 3, d.y);
      g.quadraticCurveTo(d.x + i * 5, d.y - 10 * d.s, d.x + i * 4, d.y - 18 * d.s); g.stroke();
    }
  } else if (d.type === "flower") {
    g.fillStyle = "#e74c3c"; g.fillRect(d.x - 1, d.y - 5, 3, 3);
    g.fillStyle = "#4e7a3a"; g.fillRect(d.x, d.y - 3, 1, 3);
  }
}

function renderHUD(g) {
  // stamina bar
  g.fillStyle = "rgba(0,0,0,0.4)"; g.fillRect(8, 8, 104, 12);
  const s = player.stamina / 100;
  g.fillStyle = s > 0.5 ? "#6ab04c" : s > 0.25 ? "#e9c46a" : "#e74c3c";
  g.fillRect(10, 10, 100 * s, 8);
  g.strokeStyle = "#fff"; g.lineWidth = 1; g.strokeRect(8.5, 8.5, 103, 11);
  if (player.trudge) { g.fillStyle = "#e74c3c"; g.font = "8px monospace"; g.fillText("EXHAUSTED — find a vista, snack or swim!", 8, 30); }
  else if (player.resting) { g.fillStyle = "#b8e6a0"; g.font = "8px monospace"; g.fillText("resting…", 8, 30); }

  // km + time of day + snacks
  const prog = Math.max(0, Math.min(1, camX / (level.length - VIEW_W)));
  const mins = Math.round(350 + prog * 880); // 05:50 sunrise → 20:30 sunset
  g.font = "9px monospace"; g.fillStyle = "#fff";
  g.textAlign = "right";
  g.fillText(`${level.kmAt(player.x).toFixed(1)} / ${level.km} km`, VIEW_W - 8, 16);
  g.fillText(`${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, "0")}`, VIEW_W - 8, 28);
  g.fillText(`🥜 ${player.snacks}  ★ ${player.stars}  📷 ${player.photosSeen || 0}`, VIEW_W - 8, 40);
  g.textAlign = "left";

  // collected trail photo pops up as a polaroid
  if (photoShow && photoShow.spot.img && photoShow.spot.img.complete && photoShow.spot.img.naturalWidth) {
    const img = photoShow.spot.img;
    const a = Math.max(0, Math.min(1, photoShow.t * 1.5, (4 - photoShow.t) * 3));
    const k = Math.min(190 / img.naturalWidth, 115 / img.naturalHeight);
    const w = img.naturalWidth * k, h = img.naturalHeight * k;
    const cx = VIEW_W / 2, cy = 64;
    g.globalAlpha = a;
    g.fillStyle = "#f4f1ea";
    g.fillRect(cx - w / 2 - 5, cy - 5, w + 10, h + 22);
    ctx2d.imageSmoothingEnabled = true;
    g.drawImage(img, cx - w / 2, cy, w, h);
    ctx2d.imageSmoothingEnabled = false;
    g.fillStyle = "#2b2d33"; g.font = "8px monospace"; g.textAlign = "center";
    g.fillText(`km ${photoShow.spot.km.toFixed(1)}`, cx, cy + h + 11);
    g.textAlign = "left";
    g.globalAlpha = 1;
  }

  // song toast
  if (toastT > 0) {
    g.globalAlpha = Math.min(1, toastT);
    g.fillStyle = "rgba(0,0,0,0.55)";
    const wTxt = toastText.length * 6 + 16;
    g.fillRect(VIEW_W / 2 - wTxt / 2, 36, wTxt, 14);
    g.fillStyle = "#fff"; g.textAlign = "center";
    g.fillText(toastText, VIEW_W / 2, 46);
    g.textAlign = "left"; g.globalAlpha = 1;
  }
}

function renderTitle(g) {
  g.fillStyle = "#101418"; g.fillRect(0, 0, VIEW_W, VIEW_H);
  g.fillStyle = "#e9e7df";
  g.beginPath(); g.moveTo(0, VIEW_H);
  for (let i = 0; i <= VIEW_W; i += 8) {
    const idx = Math.floor(i / 32) % (level ? level.ridge.length : 1);
    g.lineTo(i, (level ? level.ridge[idx] : 100) + 60);
  }
  g.lineTo(VIEW_W, VIEW_H); g.fill();
  g.drawImage(Sprites.tent, VIEW_W / 2 - 60, VIEW_H - 64);
  const spr = Sprites.hiker[0];
  g.drawImage(spr, VIEW_W / 2 + 30, VIEW_H - 50 - spr.height, spr.width * 2, spr.height * 2);
  g.textAlign = "center"; g.fillStyle = "#f4f1ea";
  g.font = "16px monospace";
  g.fillText("LA CLOCHE", VIEW_W / 2, 70);
  g.fillText("SILHOUETTE", VIEW_W / 2, 90);
  g.font = "9px monospace"; g.fillStyle = "#e9c46a";
  g.fillText("— a six-day side-scroll —", VIEW_W / 2, 108);
  g.fillStyle = "#fff";
  if (Math.floor(performance.now() / 500) % 2) g.fillText("TAP / PRESS ANY KEY TO HIKE", VIEW_W / 2, 150);
  g.font = "8px monospace"; g.fillStyle = "#8a92a0";
  g.fillText("← → move · jump: stomp chipmunks, bonk birds from below", VIEW_W / 2, 186);
  g.fillText("snakes: just don't. dip in lakes to refresh. R = reset", VIEW_W / 2, 198);
  g.textAlign = "left";
}

function renderNight(g) {
  const n = Math.min(1, nightAnim * 0.7);
  g.fillStyle = "#101418"; g.fillRect(0, 0, VIEW_W, VIEW_H);
  // stars twinkle in
  for (let i = 0; i < 60; i++) {
    const sx = (i * 137.5) % VIEW_W, sy = (i * 89.3) % 150;
    if (Math.sin(nightAnim * 2 + i) > -0.2) {
      g.fillStyle = `rgba(255,255,240,${0.4 * n + 0.3 * Math.abs(Math.sin(nightAnim + i))})`;
      g.fillRect(sx, sy, 1.5, 1.5);
    }
  }
  g.fillStyle = "#f4f1ea"; g.beginPath(); g.arc(400, 46, 14, 0, 7); g.fill();
  g.fillStyle = "#101418"; g.beginPath(); g.arc(394, 42, 12, 0, 7); g.fill();
  // ground + tent + fire
  g.fillStyle = "#0b0f0a"; g.fillRect(0, 210, VIEW_W, 60);
  g.drawImage(Sprites.tent, 180, 210 - Sprites.tent.height);
  const fx = 250, fy = 206;
  for (let i = 0; i < 6; i++) {
    const fh = 6 + Math.sin(nightAnim * 9 + i * 2.1) * 3;
    g.fillStyle = i % 2 ? "#f2a65a" : "#e74c3c";
    g.fillRect(fx + i * 2 - 6, fy - fh, 2, fh);
  }
  g.fillStyle = "#6d4c33"; g.fillRect(fx - 8, fy, 16, 3);

  g.textAlign = "center";
  g.fillStyle = "#f4f1ea"; g.font = "14px monospace";
  const nightCfg = (dayCfg && dayCfg.night) || {};
  g.fillText(nightCfg.caption || "Night falls.", VIEW_W / 2, 80);
  g.font = "9px monospace"; g.fillStyle = "#e9c46a";
  g.fillText(`${level.km} km hiked · ${player.snacks} snacks · ${player.stars} star${player.stars === 1 ? "" : "s"} · ${player.photosSeen || 0} photos`, VIEW_W / 2, 100);
  g.fillText(`day took ${Math.floor(elapsed / 60)}:${String(Math.floor(elapsed % 60)).padStart(2, "0")}`, VIEW_W / 2, 114);
  if (nightCfg.bear) { g.fillStyle = "#8a92a0"; g.fillText("...something large shuffles past the tent...", VIEW_W / 2, 136); }
  // slot for the pixel-art night GIF: nightCfg.gif → shown here when added
  g.fillStyle = "#fff"; g.font = "9px monospace";
  if (Math.floor(performance.now() / 500) % 2) g.fillText("TAP TO SLEEP", VIEW_W / 2, 170);
  g.textAlign = "left";
}

boot().then(() => requestAnimationFrame(frame));

// debug/test handle (harmless in production)
window.__game = {
  get state() { return state; }, get player() { return player; },
  get enemies() { return enemies; }, get level() { return level; },
  get camX() { return camX; }, get checkpoint() { return checkpoint; },
  get hype() { return hype; },
  music, resetToCheckpoint,
};
