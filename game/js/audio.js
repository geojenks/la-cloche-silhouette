// Music manager: playlist per level (default first song, shuffle after),
// beat clock derived from each song's JSON grid (bpm/offset/beatsPerBar),
// underwater EQ, and a bare oscillator fallback when an mp3 is missing.
//
// The beat clock is the game's metronome: update() returns every beat
// crossed since the last frame as {type: 'downbeat'|'midbeat'|'upbeat',
// bar, beat}. Beat 0 of the bar is the downbeat, the backbeat (bar
// midpoint) is the midbeat, everything else is an upbeat.
"use strict";

// Tiny synthesized SFX — sparse by design: a global 120ms throttle per
// sound, volume falls off with distance, and everything routes through the
// music's filter chain so effects muffle underwater too.
const Sfx = {
  ctx: null, dest: null, last: {},
  init(ctx, dest) { this.ctx = ctx; this.dest = dest; },
  vol(dist) { return Math.max(0, 1 - Math.abs(dist) / 380); },
  play(name, vol = 1) {
    if (!this.ctx || vol <= 0.03) return;
    const now = performance.now();
    if (now - (this.last[name] || 0) < 120) return;
    this.last[name] = now;
    const t = this.ctx.currentTime;
    const g = this.ctx.createGain();
    g.connect(this.dest);
    const env = (v, dur) => {
      g.gain.setValueAtTime(v * vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    };
    const osc = (type, f0, f1, dur) => {
      const o = this.ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      o.start(t); o.stop(t + dur + 0.05);
      return o;
    };
    if (name === "hiss") {          // snake ambush triggered
      const n = this.ctx.createBufferSource();
      const b = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.3, this.ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      n.buffer = b;
      const f = this.ctx.createBiquadFilter();
      f.type = "highpass"; f.frequency.value = 3200;
      n.connect(f).connect(g); env(0.22, 0.3); n.start(t);
    } else if (name === "boing") {  // frog hop nearby
      osc("sine", 340, 120, 0.16).connect(g); env(0.2, 0.18);
    } else if (name === "screech") { // bird committing to a dive
      const f = this.ctx.createBiquadFilter();
      f.type = "bandpass"; f.frequency.value = 1800;
      osc("sawtooth", 1500, 700, 0.25).connect(f).connect(g); env(0.12, 0.28);
    } else if (name === "pop") {    // enemy defeated
      osc("square", 220, 60, 0.08).connect(g); env(0.18, 0.09);
    } else if (name === "thud") {   // player hurt
      osc("sine", 100, 45, 0.12).connect(g); env(0.4, 0.13);
    }
  },
};

class MusicManager {
  constructor() {
    this.ctx = null;
    this.songs = {};        // id -> song JSON
    this.buffers = {};      // id -> Float32Array for generated tracks
    this.playlist = [];     // ids, [0] is the level default
    this.queue = [];        // play order actually used
    this.qi = 0;
    this.el = null;         // HTMLAudioElement
    this.srcNode = null;
    this.fallback = null;   // oscillator scheduler when mp3 absent
    this.startCtxTime = 0;  // ctx.currentTime when current song hit t=0
    this.lastBeat = -1;
    this.playing = false;
    this.underwaterOn = false;
    this.onSongChange = null;
  }

  async load(ids) {
    for (const id of ids) {
      if (!this.songs[id]) {
        const r = await fetch(`data/songs/${id}.json`);
        this.songs[id] = await r.json();
        this.songs[id].id = id;
        // synthesize generated tracks up front (a second or so of CPU)
        if (this.songs[id].generated && typeof generateTrack === "function" && !this.buffers[id])
          this.buffers[id] = generateTrack(id);
      }
    }
  }

  initGraph() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.bass = this.ctx.createBiquadFilter();
    this.bass.type = "lowshelf";
    this.bass.frequency.value = 200;
    this.bass.gain.value = 0;
    this.lp = this.ctx.createBiquadFilter();
    this.lp.type = "lowpass";
    this.lp.frequency.value = 18000;
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.bass.connect(this.lp).connect(this.master).connect(this.ctx.destination);
    Sfx.init(this.ctx, this.bass);
  }

  setPlaylist(ids) {
    this.playlist = ids.slice();
    // default song first, the rest shuffled after it, endless
    const rest = ids.slice(1);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    this.queue = [ids[0], ...rest];
    this.qi = 0;
  }

  get song() { return this.songs[this.queue[this.qi]]; }

  start() {
    this.initGraph();
    this.ctx.resume();
    this._playCurrent();
  }

  _stopCurrent() {
    if (this.el) { this.el.pause(); this.el.src = ""; this.el = null; }
    if (this.srcNode) { try { this.srcNode.disconnect(); } catch (e) {} this.srcNode = null; }
    if (this.bufSrc) { this.bufSrc.onended = null; try { this.bufSrc.stop(); } catch (e) {} this.bufSrc = null; }
    if (this.fallback) { this.fallback.stop(); this.fallback = null; }
  }

  _playBuffer(song, samples) {
    const buf = this.ctx.createBuffer(1, samples.length, 44100);
    buf.getChannelData(0).set(samples);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.bass);
    src.onended = () => { if (this.bufSrc === src) this.next(); };
    this.bufSrc = src;
    this.startCtxTime = this.ctx.currentTime;
    src.start();
    this.playing = true;
    if (this.onSongChange) this.onSongChange(song, true);
  }

  _playCurrent() {
    this._stopCurrent();
    const song = this.song;
    this.lastBeat = -1;
    const gen = this.buffers[song.id] ||
      (typeof generateTrack === "function" ? (this.buffers[song.id] = generateTrack(song.id)) : null);
    if (song.generated && gen) return this._playBuffer(song, gen);
    const el = new Audio("../" + song.file);
    el.crossOrigin = "anonymous";
    el.preload = "auto";
    this.el = el;
    el.addEventListener("ended", () => this.next());
    el.addEventListener("error", () => {
      // mp3 missing (e.g. purchased tracks not dropped in yet) — fall back
      // to a generated tune, or a bare synth loop, on the same beat grid
      // so gameplay is identical.
      if (this.el !== el) return;
      this.el = null;
      const genFb = this.buffers[song.id];
      if (genFb) return this._playBuffer(song, genFb);
      this.fallback = new FallbackSynth(this.ctx, this.bass, song);
      this.startCtxTime = this.ctx.currentTime;
      this.fallback.start();
      this.playing = true;
      if (this.onSongChange) this.onSongChange(song, true);
    });
    const onPlay = () => {
      this.startCtxTime = this.ctx.currentTime - el.currentTime;
      this.playing = true;
      if (this.onSongChange) this.onSongChange(song, false);
    };
    el.addEventListener("playing", onPlay);
    this.srcNode = this.ctx.createMediaElementSource(el);
    this.srcNode.connect(this.bass);
    el.play().catch(() => {});
  }

  next() { this.qi = (this.qi + 1) % this.queue.length; this._playCurrent(); }
  prev() {
    // restart current song if we're a few seconds in, else go back one
    if (this.time() > 3) this._playCurrent();
    else { this.qi = (this.qi - 1 + this.queue.length) % this.queue.length; this._playCurrent(); }
  }

  time() {
    if (!this.playing || !this.ctx) return 0;
    if (this.el) return this.el.currentTime;
    return this.ctx.currentTime - this.startCtxTime;
  }

  section() {
    const song = this.song, t = this.time();
    if (!song || !song.sections) return { name: "-", intensity: 1 };
    let cur = song.sections[0];
    for (const s of song.sections) { if (s.t <= t) cur = s; else break; }
    return cur;
  }

  // Beats crossed since last call.
  update() {
    if (!this.playing) return [];
    const song = this.song;
    const beatLen = 60 / song.bpm;
    const t = this.time();
    const idx = Math.floor((t - song.offset) / beatLen);
    const out = [];
    if (idx > this.lastBeat) {
      const bpb = song.beatsPerBar || 4;
      // a big jump means a seek or song skip, not elapsed play — resync
      // silently instead of firing hundreds of stale beats in one frame
      if (idx - this.lastBeat > 8) { this.lastBeat = idx; return out; }
      for (let i = Math.max(this.lastBeat + 1, 0); i <= idx; i++) {
        const beat = ((i % bpb) + bpb) % bpb;
        out.push({
          type: beat === 0 ? "downbeat" : beat === bpb >> 1 ? "midbeat" : "upbeat",
          bar: Math.floor(i / bpb), beat,
        });
      }
      this.lastBeat = idx;
    }
    return out;
  }

  // Fraction 0..1 through the current beat — drives on-beat animation pulses.
  beatPhase() {
    if (!this.playing) return 0;
    const song = this.song, beatLen = 60 / song.bpm;
    const t = this.time() - song.offset;
    return ((t % beatLen) + beatLen) % beatLen / beatLen;
  }

  underwater(on) {
    if (!this.ctx || on === this.underwaterOn) return;
    this.underwaterOn = on;
    const now = this.ctx.currentTime;
    // bass up, tone down, treble down
    this.lp.frequency.cancelScheduledValues(now);
    this.lp.frequency.setTargetAtTime(on ? 420 : 18000, now, 0.15);
    this.bass.gain.cancelScheduledValues(now);
    this.bass.gain.setTargetAtTime(on ? 9 : 0, now, 0.15);
  }

  pause() { if (this.el) this.el.pause(); if (this.ctx) this.ctx.suspend(); }
  resume() { if (this.ctx) this.ctx.resume(); if (this.el) this.el.play().catch(() => {}); }
}

// Minimal chip-loop stand-in: kick on downbeats, hat on upbeats, bass drone
// following section intensity. Enough to test gameplay without any mp3.
class FallbackSynth {
  constructor(ctx, dest, song) {
    this.ctx = ctx; this.dest = dest; this.song = song;
    this.t0 = ctx.currentTime; this.nextBeat = 0; this.timer = null;
  }
  start() { this.timer = setInterval(() => this._schedule(), 80); }
  stop() { clearInterval(this.timer); }
  _schedule() {
    const beatLen = 60 / this.song.bpm;
    const horizon = this.ctx.currentTime - this.t0 + 0.2;
    while (this.nextBeat * beatLen < horizon) {
      const when = this.t0 + this.nextBeat * beatLen + this.song.offset;
      const beat = this.nextBeat % (this.song.beatsPerBar || 4);
      this._blip(when, beat === 0 ? 70 : 0, beat === 0 ? 0.5 : 0.15);
      this.nextBeat++;
      if (this.nextBeat * beatLen > (this.song.duration || 180)) this.nextBeat = 0, this.t0 = this.ctx.currentTime;
    }
  }
  _blip(when, freq, vol) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = freq ? "triangle" : "square";
    o.frequency.value = freq || 3000;
    g.gain.setValueAtTime(vol, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + (freq ? 0.15 : 0.04));
    o.connect(g).connect(this.dest);
    o.start(when); o.stop(when + 0.2);
  }
}
