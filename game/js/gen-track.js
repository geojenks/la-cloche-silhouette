// Runtime chiptune synthesis — JS port of tools/make_test_track.py.
// Songs whose JSON has "generated": true are synthesized into an
// AudioBuffer in the browser instead of loading an mp3. This keeps
// copyrighted/purchased audio out of the public repo entirely: real mp3s
// dropped into media/audio_game/ take over just by removing that flag.
// It is also the rich fallback when a listed mp3 is missing.
"use strict";

const GEN_SR = 44100;

// Same plan as the Python generator: (name, bars, intensity 0-3).
const GENERATED_TRACKS = {
  "trailhead-test": {
    bpm: 112,
    sections: [
      ["intro", 8, 0], ["verse", 16, 1], ["chorus", 16, 2], ["verse", 16, 1],
      ["chorus", 16, 3], ["bridge", 8, 0], ["chorus", 16, 3], ["outro", 8, 1],
    ],
  },
};

function genRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GEN_SCALE = [57, 60, 62, 64, 67, 69, 72, 74, 76, 79];
const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

const LEAD_A = [[0, 4, .5], [.5, 5, .5], [1, 7, 1], [2, 5, .5], [2.5, 4, .5], [3, 2, 1]];
const LEAD_B = [[0, 7, .5], [.5, 8, .5], [1, 9, .5], [1.5, 8, .5], [2, 7, 1], [3, 5, 1]];
const LEAD_CALM = [[0, 2, 2], [2, 4, 2]];
const BASS_ROOTS = [0, 0, 3, 5];

function generateTrack(id) {
  const spec = GENERATED_TRACKS[id];
  if (!spec) return null;
  const BEAT = 60 / spec.bpm, BAR = 4 * BEAT;
  const totalBars = spec.sections.reduce((a, s) => a + s[1], 0);
  const buf = new Float32Array(Math.floor(totalBars * BAR * GEN_SR) + GEN_SR);

  const env = (i, n, a, d, s, r) => {
    const t = i / GEN_SR, dur = n / GEN_SR;
    let e = s;
    if (t < a) e = t / a;
    else if (t < a + d) e = 1 + (s - 1) * (t - a) / d;
    if (t > dur - r) e *= (dur - t) / r;
    return Math.max(0, e);
  };
  const place = (t0, n, fn) => {
    const i0 = Math.floor(t0 * GEN_SR);
    for (let i = 0; i < n && i0 + i < buf.length; i++) buf[i0 + i] += fn(i);
  };
  const square = (t0, freq, dur, duty, vol) => {
    const n = Math.floor(dur * GEN_SR);
    place(t0, n, (i) => ((i * freq / GEN_SR) % 1 < duty ? 1 : -1) * env(i, n, .005, .08, .5, .03) * vol);
  };
  const tri = (t0, freq, dur, vol) => {
    const n = Math.floor(dur * GEN_SR);
    place(t0, n, (i) => (4 * Math.abs(((i * freq / GEN_SR) % 1) - .5) - 1) * env(i, n, .005, .02, .8, .03) * vol);
  };
  const noise = (t0, dur, vol, seed) => {
    const n = Math.floor(dur * GEN_SR), rng = genRng(seed);
    place(t0, n, (i) => (rng() * 2 - 1) * Math.exp(-i / (GEN_SR * dur * .3)) * vol);
  };
  const kick = (t0, vol = .9) => {
    const n = Math.floor(.12 * GEN_SR);
    let ph = 0;
    place(t0, n, (i) => {
      const t = i / GEN_SR;
      ph += (120 * Math.exp(-t * 30) + 40) / GEN_SR;
      return Math.sin(2 * Math.PI * ph) * Math.exp(-t * 25) * vol;
    });
  };

  let t0 = 0, barIdx = 0;
  for (const [, bars, intensity] of spec.sections) {
    for (let b = 0; b < bars; b++) {
      const bt = t0 + b * BAR;
      const root = GEN_SCALE[BASS_ROOTS[barIdx % 4]] - 24;
      if (intensity >= 1) {
        kick(bt); kick(bt + 2 * BEAT);
        noise(bt + BEAT, .09, .35, 2); noise(bt + 3 * BEAT, .09, .35, 2);
      }
      if (intensity >= 2)
        for (let e = 0; e < 8; e++) noise(bt + e * BEAT / 2, .03, .12, 3);
      if (intensity >= 3 && b % 4 === 3)
        for (let e = 0; e < 4; e++) noise(bt + 3 * BEAT + e * BEAT / 4, .05, .3, 4 + e);
      if (intensity >= 1)
        for (let e = 0; e < 8; e++) tri(bt + e * BEAT / 2, midiHz(root), BEAT / 2 * .9, .3);
      else tri(bt, midiHz(root), BAR * .95, .22);
      const pat = intensity === 0 ? LEAD_CALM : (Math.floor(barIdx / 4) % 2 === 0 ? LEAD_A : LEAD_B);
      const duty = intensity < 2 ? .25 : .5;
      for (const [off, deg, ln] of pat)
        square(bt + off * BEAT, midiHz(GEN_SCALE[deg % GEN_SCALE.length]), ln * BEAT * .9, duty, intensity ? .16 : .10);
      if (intensity >= 3)
        for (const [off, deg, ln] of pat)
          square(bt + off * BEAT, midiHz(GEN_SCALE[deg % GEN_SCALE.length] + 12), ln * BEAT * .9, .125, .06);
      barIdx++;
    }
    t0 += bars * BAR;
  }
  for (let i = 0; i < buf.length; i++) buf[i] = Math.tanh(buf[i] * 1.2) * .85;
  const fadeN = 2 * GEN_SR;
  for (let i = 0; i < fadeN; i++) buf[buf.length - fadeN + i] *= 1 - i / fadeN;
  return buf;
}
