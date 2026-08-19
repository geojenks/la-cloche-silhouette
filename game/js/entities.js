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

    const wasOnGround = this.onGround;
    moveX(this, this.vx * dt, level);
    moveY(this, dt, level, { swim: this.swimming });
    this.justLanded = this.onGround && !wasOnGround;

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

  hurt(fromX, dmg = 15) {
    if (this.invuln > 0) return false;
    this.stamina = Math.max(0, this.stamina - dmg);
    this.vx = 160 * Math.sign(this.x - fromX || 1);
    this.vy = -200;
    this.invuln = 1.2;
    return true;
  }

  sprite() {
    if (this.swimming) return this.facing > 0 ? Sprites.hikerJump : Sprites.hikerJumpL;
    if (!this.onGround) return this.facing > 0 ? Sprites.hikerJump : Sprites.hikerJumpL;
    if (this.trudge) return this.facing > 0 ? Sprites.hikerTrudge : Sprites.hikerTrudgeL;
    // dancing: walk frames double as dance steps, stepping on the beat
    const arr = this.facing > 0 ? Sprites.hiker : Sprites.hikerL;
    return arr[Math.floor(this.anim) % arr.length];
  }
}

class Enemy {
  constructor(x, y) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.remove = false; this.dead = false; this.deadT = 0;
    this.beatFrame = 0; this.hype = 1;
  }
  // every animal keeps time — animation frames advance on the beat
  keepTime(beats, intensity) {
    if (beats.length) this.beatFrame += beats.length;
    this.hype = intensity;
  }
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
// At full hype (3) every animal stops attacking and dances on the beat —
// rave sections are a truce.
class Chipmunk extends Enemy {
  constructor(x, y, dir = -1) { super(x, y); this.w = 12; this.h = 8; this.dir = dir; this.anim = 0; }
  update(dt, level, player, beats, intensity) {
    this.keepTime(beats, intensity);
    if (this.dead) return this.baseDead(dt, level);
    if (intensity >= 3) { // dance break: bop in place
      this.vx = 0;
      return moveY(this, dt, level, { noPlatforms: true });
    }
    // turn at ledges instead of walking off (koopa-red rules)
    if (this.onGround) {
      const lookX = this.x + this.w / 2 + this.dir * (this.w / 2 + 3);
      if (level.groundTop(lookX) > this.y + this.h + 20) this.dir *= -1;
    }
    this.vx = this.dir * (50 + intensity * 12);
    const beforeVx = this.vx;
    moveX(this, this.vx * dt, level);
    if (this.vx === 0 && beforeVx !== 0) this.dir *= -1; // wall: turn around
    moveY(this, dt, level, { noPlatforms: true });
    this.anim += dt * 12;
  }
  sprite() {
    if (this.dead) return Sprites.chipSquash;
    const arr = this.dir <= 0 ? Sprites.chip : Sprites.chipL;
    // scurrying animates by speed; dancing snaps to the beat
    const f = this.hype >= 3 ? this.beatFrame : Math.floor(this.anim);
    return arr[f % arr.length];
  }
  stompable = true;
  bouncy = true; // stomping a chipmunk launches you extra high
}

class Frog extends Enemy {
  constructor(x, y) { super(x, y); this.w = 10; this.h = 8; this.onGround = false; }
  update(dt, level, player, beats, intensity) {
    this.keepTime(beats, intensity);
    if (this.dead) return this.baseDead(dt, level);
    // always hops toward you — but only ever on the downbeat, so it's a
    // pursuer you can time rather than a relentless one (at full hype it
    // hops on the spot instead: dancing)
    if (this.onGround && beats.some(b => b.type === "downbeat")) {
      this.vy = -240;
      this.vx = intensity >= 3 ? 0 : 65 * (Math.sign(player.x - this.x) || -1);
      Sfx.play("boing", 0.7 * Sfx.vol(player.x - this.x));
    }
    if (this.onGround) this.vx *= 0.6;
    moveX(this, this.vx * dt, level);
    moveY(this, dt, level, { noPlatforms: true });
  }
  sprite() {
    if (this.dead) return Sprites.frogDead || Sprites.frog[0];
    // dedicated dance frames (cells frog_c/frog_d) when raving and present
    if (this.hype >= 3 && Sprites.frog.length > 2)
      return Sprites.frog[2 + this.beatFrame % (Sprites.frog.length - 2)];
    return this.onGround ? Sprites.frog[0] : Sprites.frog[1];
  }
  stompable = true;
}

class Snake extends Enemy {
  constructor(x, y) {
    super(x, y); this.w = 22; this.h = 8; this.anim = 0;
    this.state = "coiled"; this.dir = -1;
  }
  update(dt, level, player, beats, intensity) {
    this.keepTime(beats, intensity);
    if (this.dead) return this.baseDead(dt, level);
    if (this.state === "coiled") {
      this.vx = 0;
      if (intensity >= 3) { // dancing, not striking
        return moveY(this, dt, level, { noPlatforms: true });
      }
      // ambush: a straight beeline at where you ARE the moment it strikes,
      // held until it's off-screen (terrain doesn't stop it)
      if (Math.abs(player.x - this.x) < 90 && Math.abs(player.y - this.y) < 60) {
        const dx = (player.x + player.w / 2) - (this.x + this.w / 2);
        const dy = (player.y + player.h / 2) - (this.y + this.h / 2);
        const len = Math.hypot(dx, dy) || 1;
        const speed = 165 + intensity * 15;
        this.state = "dash";
        this.dashVx = speed * dx / len;
        this.dashVy = speed * dy / len;
        this.dir = dx >= 0 ? 1 : -1;
        Sfx.play("hiss", Sfx.vol(player.x - this.x));
      }
      return moveY(this, dt, level, { noPlatforms: true });
    }
    // dash: no gravity, no collisions — an arrow through the air until the
    // off-screen cull removes it
    this.x += this.dashVx * dt;
    this.y += this.dashVy * dt;
    this.anim += dt * 14;
  }
  sprite() {
    if (this.dead) return Sprites.snakeDead || Sprites.snake[0];
    const arr = this.dir <= 0 ? Sprites.snake : Sprites.snakeL;
    // coiled it sways to the beat; dashing it animates fast
    const f = this.state === "coiled" ? this.beatFrame : Math.floor(this.anim);
    return arr[f % arr.length];
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
    this.keepTime(beats, intensity);
    if (this.dead) return this.baseDead(dt, level);
    // steady sweep of a fixed beat of sky...
    if (this.x < this.homeX - this.range) this.dir = 1;
    if (this.x > this.homeX + this.range) this.dir = -1;
    this.vx = this.dir * (60 + intensity * 15);
    // ...but every now and then, on a downbeat with prey below, it dives
    // (more often the harder the music is going; never during a rave —
    // it's dance-swooping then)
    if (this.diving <= 0 && intensity < 3 && beats.some(b => b.type === "downbeat") &&
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
    if (this.dead) return Sprites.birdDead || Sprites.bird[0];
    // wings beat with the music
    const arr = this.vx <= 0 ? Sprites.bird : Sprites.birdL;
    return arr[this.beatFrame % arr.length];
  }
  stompable = false; // special-cased: top = springboard, below = bonk
}

// Rare night visitor: enormous damage, effectively unkillable (stomps just
// startle it), but a total scaredy-cat — rush it or land a jump nearby and
// it bolts. Comes out only in the dark ends of the day.
class Bear extends Enemy {
  constructor(x, y) {
    super(x, y); this.w = 24; this.h = 13;
    this.state = "prowl"; this.dir = -1; this.anim = 0;
  }
  startle(player) {
    if (this.state === "flee") return;
    this.state = "flee";
    this.dir = Math.sign(this.x - player.x) || 1; // away
    Sfx.play("hiss", 0.6); // huff
  }
  update(dt, level, player, beats, intensity) {
    this.keepTime(beats, intensity);
    if (intensity >= 3 && this.state !== "flee") { // even the bear raves
      this.vx = 0;
      return moveY(this, dt, level, { noPlatforms: true });
    }
    if (this.state === "prowl") {
      this.dir = Math.sign(player.x - this.x) || -1;
      this.vx = this.dir * 22;
      // scaredy-cat: bolt if the hiker charges at it or lands a jump nearby
      const dist = Math.abs(player.x - this.x);
      const charging = dist < 80 && Math.abs(player.vx) > 100 &&
        Math.sign(player.vx) === Math.sign(this.x - player.x);
      const thump = dist < 130 && player.onGround && player.vy === 0 && player.justLanded;
      if (charging || thump) this.startle(player);
    } else {
      this.vx = this.dir * 170;
    }
    moveX(this, this.vx * dt, level);
    moveY(this, dt, level, { noPlatforms: true });
    this.anim += dt * (this.state === "flee" ? 14 : 5);
  }
  sprite() {
    const arr = this.dir <= 0 ? Sprites.bear : Sprites.bearL;
    // lumbers (and raves) in time; only fleeing breaks tempo
    const f = this.state === "flee" ? Math.floor(this.anim) : this.beatFrame;
    return arr[f % arr.length];
  }
  stompable = false; // special-cased: stomp startles it, nothing kills it
  damage = 40;
}
