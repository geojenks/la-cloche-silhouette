// Main loop and orchestration: states (title → play → night), the
// beat-driven enemy spawner, collisions, camera, painterly-pixel rendering
// of the day, HUD, and touch/keyboard input.
"use strict";

const VIEW_W = 480, VIEW_H = 270;

const canvas = document.getElementById("game");
const ctx2d = canvas.getContext("2d");
canvas.width = VIEW_W; canvas.height = VIEW_H;
ctx2d.imageSmoothingEnabled = false;

const music = new MusicManager();
let level = null, player = null, enemies = [], state = "boot";
let camX = 0, camY = 0, bgPulse = 0, elapsed = 0, fade = 0;
let checkpoint = null, spawnAlt = 0, toastT = 0, toastText = "";
let dayCfg = null, nightAnim = 0;
// sprite mood follows the music: section.mood if the song JSON names one,
// else mapped from section intensity
const MOOD_BY_INTENSITY = ["calm", "hike", "dance", "rave"];
let mood = "hike";

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
  dayCfg = await (await fetch("data/levels/day1.json")).json();
  await music.load(dayCfg.playlist);
  const first = music.songs[dayCfg.playlist[0]];
  level = new Level(dayCfg, first.duration);
  state = "title";
}

function startRun() {
  player = new Player(40, level.groundTop(40) - 20);
  enemies = [];
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
  player.stamina = 100; player.trudge = false; player.invuln = 1;
  enemies = [];
  fade = 0.6;
  toast(`Back to: ${checkpoint.label}`);
}

// -------------------------------------------------------------- spawner ---
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
function handleCollisions(prevBottom, prevTop) {
  for (const e of enemies) {
    if (e.dead || !overlap(player, e)) continue;
    if (e instanceof Bird) {
      if (player.vy > 40 && prevBottom <= e.y + 6) {
        player.vy = -580; player.superBounceT = 0.35; e.y += 8;  // springboard!
        toast("Woah — thermal lift!");
      } else if (player.vy < -20 && prevTop >= e.y + e.h - 6) {
        e.dieBonk();
      } else if (player.hurt(e.x + e.w / 2)) bgPulse = 1;
    } else if (e.stompable && player.vy > 40 && prevBottom <= e.y + 6) {
      e.dieStomp();
      player.vy = input.jump ? -330 : -240;
    } else if (player.hurt(e.x + e.w / 2)) bgPulse = 1;
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

  const m = sec.mood || MOOD_BY_INTENSITY[Math.max(0, Math.min(3, sec.intensity))];
  if (m !== mood) { mood = m; setSpriteMood(mood); }
  // in dance/rave the hiker grooves on the spot to the beat
  player.dancing = (mood === "dance" || mood === "rave") && player.onGround &&
    Math.abs(player.vx) < 5 && !player.swimming && !player.trudge;
  if (player.dancing) player.anim = music.lastBeat;

  const prevBottom = player.y + player.h, prevTop = player.y;
  player.update(dt, input, level);
  music.underwater(player.swimming);

  // checkpoints by crossing; dipping in the lake claims the lakeside one
  for (const c of level.checkpoints) {
    if (player.x >= c.x && (!checkpoint || c.x > checkpoint.x)) { if (checkpoint !== c) { checkpoint = c; toast(`Checkpoint — ${c.label}`); } }
  }

  spawnFromBeats(beats, sec.intensity);
  for (const e of enemies) e.update(dt, level, player, beats, sec.intensity);
  enemies = enemies.filter(e => !e.remove && e.x > camX - 250 && e.x < camX + VIEW_W + 600);
  handleCollisions(prevBottom, prevTop);

  camX = Math.max(0, Math.min(level.length - VIEW_W, player.x - VIEW_W * 0.38 + player.vx * 0.25));

  if (player.x > level.tentX + 20) { state = "night"; nightAnim = 0; music.underwater(false); }
}

// --------------------------------------------------------------- render ---
function lerp(a, b, t) { return a + (b - a) * t; }
function lerpColor(c1, c2, t) {
  return `rgb(${Math.round(lerp(c1[0], c2[0], t))},${Math.round(lerp(c1[1], c2[1], t))},${Math.round(lerp(c1[2], c2[2], t))})`;
}

const SKY = [[135, 206, 235], [150, 210, 235], [244, 172, 96]]; // morning, midday, dusk
function skyColors(p) {
  const a = p < 0.5 ? lerpColor(SKY[0], SKY[1], p * 2) : lerpColor(SKY[1], SKY[2], (p - 0.5) * 2);
  return a;
}

function render(dt) {
  const g = ctx2d;
  g.clearRect(0, 0, VIEW_W, VIEW_H);
  if (state === "boot") { g.fillStyle = "#111"; g.fillRect(0, 0, VIEW_W, VIEW_H); return; }
  if (state === "title") return renderTitle(g);
  if (state === "night") return renderNight(g);

  const p = camX / (level.length - VIEW_W);
  // sky with a beat pulse
  const grd = g.createLinearGradient(0, 0, 0, VIEW_H);
  grd.addColorStop(0, skyColors(p));
  grd.addColorStop(1, "#e8ecda");
  g.fillStyle = grd;
  g.fillRect(0, 0, VIEW_W, VIEW_H);
  if (bgPulse > 0) {
    // rave sections pulse in colour, alternating per bar
    const raveCol = music.playing && Math.floor(music.lastBeat / 4) % 2 ? "0,255,255" : "255,0,255";
    g.fillStyle = mood === "rave" ? `rgba(${raveCol},${bgPulse * 0.1})` : `rgba(255,255,255,${bgPulse * 0.07})`;
    g.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  // sun sliding across the day
  const sunX = 60 + p * 340, sunY = 50 + Math.sin(p * Math.PI) * -15;
  if (Sprites.sun) g.drawImage(Sprites.sun, sunX - 12, sunY - 12);
  else { g.fillStyle = "#fff7d6"; g.beginPath(); g.arc(sunX, sunY, 12, 0, 7); g.fill(); }
  if (Sprites.cloud) {
    for (let i = 0; i < 3; i++) {
      const cx = ((i * 210 + 40 - camX * 0.08) % (VIEW_W + 60) + VIEW_W + 60) % (VIEW_W + 60) - 30;
      g.drawImage(Sprites.cloud, cx, 28 + i * 26);
    }
  }

  // white quartzite ridge (parallax far)
  g.fillStyle = "#e9e7df";
  g.beginPath(); g.moveTo(0, VIEW_H);
  for (let i = 0; i <= VIEW_W; i += 8) {
    const idx = Math.floor((i + camX * 0.15) / 32) % level.ridge.length;
    g.lineTo(i, level.ridge[idx]);
  }
  g.lineTo(VIEW_W, VIEW_H); g.fill();

  // hazy distant treeline (parallax mid) — muted so it can't be mistaken
  // for walkable ground
  g.fillStyle = "#7c9480";
  g.beginPath(); g.moveTo(0, VIEW_H);
  for (let i = 0; i <= VIEW_W; i += 4) {
    const s = Math.sin((i + camX * 0.4) * 0.05) * 6 + Math.sin((i + camX * 0.4) * 0.13) * 4;
    g.lineTo(i, 158 + s);
  }
  g.lineTo(VIEW_W, VIEW_H); g.fill();

  g.save();
  g.translate(-Math.round(camX), -Math.round(camY));

  // terrain columns (sheet tiles when styled art is loaded)
  const c0 = Math.floor(camX / TILE), c1 = Math.min(level.cols - 1, c0 + VIEW_W / TILE + 1);
  for (let c = c0; c <= c1; c++) {
    const x = c * TILE, top = level.top[c], biome = level.biomeOf(c);
    const inLakebed = level.waterSurfaceAt(x + 8) !== null;
    const tile = inLakebed ? Sprites.tileSand
      : biome === "quartzite" ? Sprites.tileQuartzite : Sprites.tileForest;
    if (tile) {
      g.drawImage(tile, x, top);
      const below = (biome === "quartzite" || inLakebed) ? tile : (Sprites.tileDirt || tile);
      for (let y = top + TILE; y < VIEW_H; y += TILE) g.drawImage(below, x, y);
    } else if (biome === "quartzite") {
      g.fillStyle = "#f4f1ea"; g.fillRect(x, top, TILE, VIEW_H - top);
      g.fillStyle = "#d8d3c6"; g.fillRect(x, top + 6, TILE, 2);
    } else if (inLakebed) {
      g.fillStyle = "#cbb27f"; g.fillRect(x, top, TILE, VIEW_H - top); // lakebed sand
    } else {
      g.fillStyle = "#5d8a44"; g.fillRect(x, top, TILE, 5);
      g.fillStyle = "#6d4c33"; g.fillRect(x, top + 5, TILE, VIEW_H - top - 5);
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
  g.drawImage(Sprites.tent, level.tentX, level.groundTop(level.tentX) - Sprites.tent.height);

  // pickups (bob on the beat)
  const bob = Math.sin(music.beatPhase() * Math.PI * 2) * 1.5;
  for (const pk of level.pickups) {
    if (pk.taken || pk.x < camX - 20 || pk.x > camX + VIEW_W + 20) continue;
    const spr = pk.type === "star" ? Sprites.star : Sprites.snack;
    g.drawImage(spr, Math.round(pk.x - spr.width / 2), Math.round(pk.y - spr.height / 2 + bob));
  }

  // enemies
  for (const e of enemies) {
    const spr = e.sprite();
    g.drawImage(spr, Math.round(e.x + e.w / 2 - spr.width / 2), Math.round(e.y + e.h - spr.height));
  }

  // player (flash while invulnerable)
  if (!(player.invuln > 0 && Math.floor(player.invuln * 12) % 2)) {
    const spr = player.sprite();
    g.drawImage(spr, Math.round(player.x + player.w / 2 - spr.width / 2), Math.round(player.y + player.h - spr.height + 1));
  }

  // water on top (translucent)
  for (const w of level.water) {
    g.fillStyle = "rgba(52,120,180,0.55)";
    g.fillRect(w.x, w.y, w.w, w.h);
    g.fillStyle = "rgba(220,240,255,0.7)";
    const ph = music.beatPhase();
    for (let i = 0; i < w.w; i += 24) g.fillRect(w.x + i + ph * 12, w.y, 10, 2);
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
  if (player.trudge) { g.fillStyle = "#e74c3c"; g.font = "8px monospace"; g.fillText("EXHAUSTED — rest, snack or swim!", 8, 30); }

  // km + snacks
  g.font = "9px monospace"; g.fillStyle = "#fff";
  g.textAlign = "right";
  g.fillText(`${level.kmAt(player.x).toFixed(1)} / ${level.km} km`, VIEW_W - 8, 16);
  g.fillText(`🥜 ${player.snacks}  ★ ${player.stars}`, VIEW_W - 8, 28);
  g.textAlign = "left";

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
  g.fillText(`${level.km} km hiked · ${player.snacks} snacks · ${player.stars} vista${player.stars === 1 ? "" : "s"}`, VIEW_W / 2, 100);
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
  get mood() { return mood; },
  music, resetToCheckpoint,
};
