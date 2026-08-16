// Player + enemies. All movement is on the level heightfield: small steps
// (<= STEP_UP) are climbed automatically, taller ones act as walls.
// Enemies are beat-aware — they receive the beat events each frame and use
// them for locomotion (frog hops on downbeats, chipmunks skitter, birds
// flap and dive), which is what keeps the world feeling glued to the music.
"use strict";

const GRAV = 1500, MAX_FALL = 430, STEP_UP = 6;
const SWIM_GRAV = 250, SWIM_FALL = 80;

function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// Horizontal move against the heightfield: climb small steps, stop at walls.
function moveX(e, dx, level) {
  if (!dx) return;
  const nx = e.x + dx;
  const lead = dx > 0 ? nx + e.w : nx;
  const top = level.groundTop(lead);
  const feet = e.y + e.h;
  if (feet > top + STEP_UP) {           // wall
    const c = Math.floor(lead / TILE);
    e.x = dx > 0 ? c * TILE - e.w - 0.01 : (c + 1) * TILE + 0.01;
    e.vx = 0;
  } else {
    e.x = nx;
    if (feet > top) e.y = top - e.h;    // auto-step
  }
}

function moveY(e, dt, level, opts = {}) {
  const grav = opts.swim ? SWIM_GRAV : GRAV;
  const maxFall = opts.swim ? SWIM_FALL : MAX_FALL;
  e.vy = Math.min(e.vy + grav * dt, maxFall);
  const prevBottom = e.y + e.h;
  e.y += e.vy * dt;
  e.onGround = false;
  const top = Math.min(level.groundTop(e.x + 1), level.groundTop(e.x + e.w - 1));
  if (e.y + e.h >= top && prevBottom <= top + 12 && e.vy >= 0) {
    e.y = top - e.h; e.vy = 0; e.onGround = true;
  } else if (e.y + e.h > top) {
    e.y = top - e.h; e.vy = Math.min(e.vy, 0); e.onGround = true; // inside a step
  }
  if (!opts.noPlatforms && e.vy >= 0) {  // one-way platforms
    for (const p of level.platforms) {
      if (e.x + e.w > p.x && e.x < p.x + p.w &&
          prevBottom <= p.y + 1 && e.y + e.h >= p.y) {
        e.y = p.y - e.h; e.vy = 0; e.onGround = true;
      }
    }
  }
}

class Player {
  constructor(x, y) {
    this.x = x; this.y = y; this.w = 10; this.h = 17;
    this.vx = 0; this.vy = 0;
    this.onGround = false; this.facing = 1;
    this.coyote = 0; this.jumpBuf = 0; this.jumpHeld = false;
    this.stamina = 100; this.trudge = false;
    this.invuln = 0; this.swimming = false;
    this.anim = 0; this.snacks = 0; this.stars = 0;
    this.superBounceT = 0; this.dancing = false;
  }

  get maxRun() { return this.swimming ? 90 : this.trudge ? 55 : MAX_RUN; }

  update(dt, input, level) {
    const accel = this.onGround ? 900 : 600;
    if (input.left) { this.vx = Math.max(this.vx - accel * dt, -this.maxRun); this.facing = -1; }
    else if (input.right) { this.vx = Math.min(this.vx + accel * dt, this.maxRun); this.facing = 1; }
    else {
      const f = (this.onGround ? 1100 : 300) * dt;
      this.vx = Math.abs(this.vx) < f ? 0 : this.vx - Math.sign(this.vx) * f;
    }

    // jump: buffered + coyote on land, strokes in water
    this.coyote = this.onGround ? 0.09 : Math.max(0, this.coyote - dt);
    this.jumpBuf = Math.max(0, this.jumpBuf - dt);
    if (input.jumpPressed) this.jumpBuf = 0.12;
    const surface = level.waterSurfaceAt(this.x + this.w / 2);
    this.swimming = !!level.inWater(this.x + this.w / 2, this.y + this.h / 2);
    if (this.swimming) {
      if (input.jumpPressed) {
        // near the surface a stroke launches you out of the water
        this.vy = (surface !== null && this.y + this.h / 2 < surface + 20) ? -300 : -170;
        this.jumpBuf = 0;
      }
    } else if (this.jumpBuf > 0 && this.coyote > 0) {
      this.vy = this.trudge ? -290 : -420;
      this.jumpBuf = 0; this.coyote = 0;
      this.stamina = Math.max(0, this.stamina - 1.5);
    }
    if (!input.jump && this.vy < -150 && !this.swimming && this.superBounceT <= 0) this.vy = -150;

    moveX(this, this.vx * dt, level);
    moveY(this, dt, level, { swim: this.swimming });

    // stamina economy — resting only works at vista spots (high ground
    // with the big view) and tops out at 75; full recovery needs snacks
    // or a swim
    this.resting = false;
    if (this.swimming) this.stamina = Math.min(100, this.stamina + 18 * dt);
    else if (this.onGround && !input.left && !input.right &&
             level.inVista(this.x + this.w / 2) && this.stamina < 75) {
      this.stamina = Math.min(75, this.stamina + 6 * dt);
      this.resting = true;
    }
    else if (Math.abs(this.vx) > 20) this.stamina = Math.max(0, this.stamina - 1.1 * dt);
    if (this.stamina <= 0) this.trudge = true;
    if (this.trudge && this.stamina > 25) this.trudge = false;

    this.invuln = Math.max(0, this.invuln - dt);
    this.superBounceT = Math.max(0, this.superBounceT - dt);
    if (Math.abs(this.vx) > 10 && this.onGround) this.anim += dt * (this.trudge ? 5 : 10);
  }

  hurt(fromX) {
    if (this.invuln > 0) return false;
    this.stamina = Math.max(0, this.stamina - 15);
    this.vx = 160 * Math.sign(this.x - fromX || 1);
    this.vy = -200;
    this.invuln = 1.2;
    return true;
  }

  sprite() {
    if (this.swimming) return this.facing > 0 ? Sprites.hikerJump : Sprites.hikerJumpL;
    if (!this.onGround) return this.facing > 0 ? Sprites.hikerJump : Sprites.hikerJumpL;
    if (this.trudge) return this.facing > 0 ? Sprites.hikerTrudge : Sprites.hikerTrudgeL;
    // dancing: walk frames double as dance steps, flipping on the beat
    const f = Math.floor(this.anim) % 2;
    return (this.facing > 0 ? Sprites.hiker : Sprites.hikerL)[f];
  }
}

class Enemy {
  constructor(x, y) { this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.remove = false; this.dead = false; this.deadT = 0; }
  dieStomp() { this.dead = true; this.deadT = 0.45; this.vx = 0; }
  dieBonk() { this.dead = true; this.deadT = 0.8; this.vy = -220; this.spin = true; }
  baseDead(dt, level) {
    this.deadT -= dt;
    if (this.spin) { this.y += this.vy * dt; this.vy += GRAV * dt; this.x += 40 * dt; }
    if (this.deadT <= 0) this.remove = true;
  }
}

// Enemies run predictable movement loops, not player-tracking — loops make
// their timing readable, so jumps can be planned (and level-placed groups
// become timing puzzles). The music still touches them: speeds scale with
// section intensity and frogs hop exactly on downbeats.
class Chipmunk extends Enemy {
  constructor(x, y, dir = -1) { super(x, y); this.w = 12; this.h = 8; this.dir = dir; this.anim = 0; }
  update(dt, level, player, beats, intensity) {
    if (this.dead) return this.baseDead(dt, level);
    this.vx = this.dir * (50 + intensity * 12);
    const beforeVx = this.vx;
    moveX(this, this.vx * dt, level);
    if (this.vx === 0 && beforeVx !== 0) this.dir *= -1; // wall: turn around
    moveY(this, dt, level, { noPlatforms: true });
    this.anim += dt * 12;
  }
  sprite() {
    if (this.dead) return Sprites.chipSquash;
    const f = Math.floor(this.anim) % 2;
    return (this.vx <= 0 ? Sprites.chip : Sprites.chipL)[f];
  }
  stompable = true;
}

class Frog extends Enemy {
  constructor(x, y) { super(x, y); this.w = 10; this.h = 8; this.onGround = false; }
  update(dt, level, player, beats, intensity) {
    if (this.dead) return this.baseDead(dt, level);
    // always hops toward you — but only ever on the downbeat, so it's a
    // pursuer you can time rather than a relentless one
    if (this.onGround && beats.some(b => b.type === "downbeat")) {
      this.vy = -240; this.vx = 65 * (Math.sign(player.x - this.x) || -1);
      Sfx.play("boing", 0.7 * Sfx.vol(player.x - this.x));
    }
    if (this.onGround) this.vx *= 0.6;
    moveX(this, this.vx * dt, level);
    moveY(this, dt, level, { noPlatforms: true });
  }
  sprite() { return this.dead || this.onGround ? Sprites.frog[0] : Sprites.frog[1]; }
  stompable = true;
}

class Snake extends Enemy {
  constructor(x, y) {
    super(x, y); this.w = 22; this.h = 8; this.anim = 0;
    this.state = "coiled"; this.dir = -1;
  }
  update(dt, level, player, beats, intensity) {
    if (this.dead) return this.baseDead(dt, level);
    if (this.state === "coiled") {
      this.vx = 0;
      // ambush: strikes when you get close, then commits to the direction
      if (Math.abs(player.x - this.x) < 90 && Math.abs(player.y - this.y) < 60) {
        this.state = "dash";
        this.dir = Math.sign(player.x - this.x) || -1;
        Sfx.play("hiss", Sfx.vol(player.x - this.x));
      }
      return moveY(this, dt, level, { noPlatforms: true });
    }
    // dash: fast, straight, and gone — off-screen it despawns (the enemy
    // cull handles that); a wall ends the dash into the rocks
    this.vx = this.dir * (150 + intensity * 15);
    const beforeVx = this.vx;
    moveX(this, this.vx * dt, level);
    if (this.vx === 0 && beforeVx !== 0) this.remove = true;
    moveY(this, dt, level, { noPlatforms: true });
    this.anim += dt * 14;
  }
  sprite() {
    const f = this.state === "coiled" ? 0 : Math.floor(this.anim) % 2;
    return (this.dir <= 0 ? Sprites.snake : Sprites.snakeL)[f];
  }
  stompable = false; // spiky rule: never safe to touch — jump over it
}

class Bird extends Enemy {
  constructor(x, y, dir = -1) {
    super(x, y); this.w = 16; this.h = 10;
    this.homeX = x; this.homeY = y; this.range = 120; this.dir = dir;
    this.anim = 0; this.diving = 0;
  }
  update(dt, level, player, beats, intensity) {
    if (this.dead) return this.baseDead(dt, level);
    // steady sweep of a fixed beat of sky...
    if (this.x < this.homeX - this.range) this.dir = 1;
    if (this.x > this.homeX + this.range) this.dir = -1;
    this.vx = this.dir * (60 + intensity * 15);
    // ...but every now and then, on a downbeat with prey below, it dives
    // (more often the harder the music is going)
    if (this.diving <= 0 && beats.some(b => b.type === "downbeat") &&
        Math.abs(this.x - player.x) < 100 && player.y > this.y &&
        Math.random() < 0.15 + 0.15 * intensity) {
      this.diving = 0.7;
      Sfx.play("screech", 0.8 * Sfx.vol(player.x - this.x));
    }
    if (this.diving > 0) {
      this.diving -= dt;
      this.y += (player.y - this.y) * 1.8 * dt;
    } else {
      this.y += (this.homeY - this.y) * 2 * dt + Math.sin(this.anim * 2) * 8 * dt;
    }
    this.x += this.vx * dt;
    this.anim += dt * 8;
  }
  sprite() {
    const f = Math.floor(this.anim) % 2;
    return (this.vx <= 0 ? Sprites.bird : Sprites.birdL)[f];
  }
  stompable = false; // special-cased: top = springboard, below = bonk
}
