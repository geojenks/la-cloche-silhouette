#!/usr/bin/env python3
"""Generate the placeholder in-game track: an original chiptune with clear
intensity sections, used until George drops the real (purchased) mp3s in.

Deterministic output — same file every run. Ground truth for the beat grid:
112 BPM, 4/4, first downbeat at exactly 0.0 s. Sections are printed at the
end in the same shape `tools/beatgrid.py` emits, for eyeballing against its
detected values.

Usage:  python3 tools/make_test_track.py [out.mp3]
Deps:   pip install numpy lameenc
"""

import sys

import numpy as np

SR = 44100
BPM = 112.0
BEAT = 60.0 / BPM          # 0.5357 s
BAR = 4 * BEAT

# Section plan: (name, bars, intensity 0..3). Intensity drives both the
# arrangement here and, in-game, enemy spawn density.
SECTIONS = [
    ("intro",   8, 0),
    ("verse",  16, 1),
    ("chorus", 16, 2),
    ("verse",  16, 1),
    ("chorus", 16, 3),
    ("bridge",  8, 0),
    ("chorus", 16, 3),
    ("outro",   8, 1),
]

# A-minor-ish pentatonic pool keeps every random-free melody consonant.
SCALE = [57, 60, 62, 64, 67, 69, 72, 74, 76, 79]  # MIDI


def midi_hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def env(n, a=0.005, d=0.08, s=0.5, r=0.03):
    """Tiny ADSR over n samples."""
    t = np.arange(n) / SR
    dur = n / SR
    e = np.full(n, s)
    e[t < a] = t[t < a] / a
    dm = (t >= a) & (t < a + d)
    e[dm] = 1 + (s - 1) * (t[dm] - a) / d
    rm = t > dur - r
    e[rm] *= np.linspace(1, 0, rm.sum())
    return e


def square(freq, dur, duty=0.5, vol=0.2):
    n = int(dur * SR)
    ph = (np.arange(n) * freq / SR) % 1.0
    return np.where(ph < duty, 1.0, -1.0) * env(n) * vol


def triangle(freq, dur, vol=0.3):
    n = int(dur * SR)
    ph = (np.arange(n) * freq / SR) % 1.0
    return (4 * np.abs(ph - 0.5) - 1) * env(n, d=0.02, s=0.8) * vol


def noise_hit(dur, vol, lowpass=1.0, seed=1):
    n = int(dur * SR)
    rng = np.random.default_rng(seed)  # fixed seed: deterministic output
    x = rng.uniform(-1, 1, n)
    if lowpass < 1.0:
        k = max(1, int(1 / lowpass))
        x = np.convolve(x, np.ones(k) / k, mode="same")
    return x * np.exp(-np.arange(n) / (SR * dur * 0.3)) * vol


def kick(dur=0.12, vol=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = 120 * np.exp(-t * 30) + 40
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 25) * vol


def place(buf, t, x):
    i = int(t * SR)
    j = min(i + len(x), len(buf))
    if i < j:
        buf[i:j] += x[: j - i]


# Melody/bass patterns as (beat-offset-in-bar, scale-degree, len-in-beats).
LEAD_A = [(0, 4, .5), (.5, 5, .5), (1, 7, 1), (2, 5, .5), (2.5, 4, .5), (3, 2, 1)]
LEAD_B = [(0, 7, .5), (.5, 8, .5), (1, 9, .5), (1.5, 8, .5), (2, 7, 1), (3, 5, 1)]
LEAD_CALM = [(0, 2, 2), (2, 4, 2)]
BASS_ROOTS = [0, 0, 3, 5]  # per-bar scale degree, bass plays root eighths


def build():
    total_bars = sum(b for _, b, _ in SECTIONS)
    buf = np.zeros(int(total_bars * BAR * SR) + SR)
    t0, bar_idx = 0.0, 0
    for name, bars, intensity in SECTIONS:
        for b in range(bars):
            bt = t0 + b * BAR
            root = SCALE[BASS_ROOTS[bar_idx % 4]] - 24
            # drums
            if intensity >= 1:
                place(buf, bt, kick())
                place(buf, bt + 2 * BEAT, kick())
                place(buf, bt + BEAT, noise_hit(.09, .35, seed=2))
                place(buf, bt + 3 * BEAT, noise_hit(.09, .35, seed=2))
            if intensity >= 2:
                for e8 in range(8):
                    place(buf, bt + e8 * BEAT / 2, noise_hit(.03, .12, .3, seed=3))
            if intensity >= 3 and b % 4 == 3:  # fill into next bar
                for e16 in range(4):
                    place(buf, bt + 3 * BEAT + e16 * BEAT / 4,
                          noise_hit(.05, .3, seed=4 + e16))
            # bass
            if intensity >= 1:
                for e8 in range(8):
                    place(buf, bt + e8 * BEAT / 2,
                          triangle(midi_hz(root), BEAT / 2 * .9))
            else:
                place(buf, bt, triangle(midi_hz(root), BAR * .95, vol=.22))
            # lead
            pat = (LEAD_CALM if intensity == 0
                   else LEAD_A if (bar_idx // 4) % 2 == 0 else LEAD_B)
            duty = .25 if intensity < 2 else .5
            for off, deg, ln in pat:
                place(buf, bt + off * BEAT,
                      square(midi_hz(SCALE[deg % len(SCALE)]), ln * BEAT * .9,
                             duty=duty, vol=.16 if intensity else .10))
            # harmony an octave up doubles the lead in the loudest sections
            if intensity >= 3:
                for off, deg, ln in pat:
                    place(buf, bt + off * BEAT,
                          square(midi_hz(SCALE[deg % len(SCALE)] + 12),
                                 ln * BEAT * .9, duty=.125, vol=.06))
            bar_idx += 1
        t0 += bars * BAR
    # gentle limiter + fade-out
    buf = np.tanh(buf * 1.2) * 0.85
    buf[-2 * SR:] *= np.linspace(1, 0, 2 * SR)
    return buf


def encode_mp3(x, path):
    import lameenc
    pcm = (np.clip(x, -1, 1) * 32767).astype("<i2")
    enc = lameenc.Encoder()
    enc.set_bit_rate(128)
    enc.set_in_sample_rate(SR)
    enc.set_channels(1)
    enc.set_quality(2)
    data = enc.encode(pcm.tobytes()) + enc.flush()
    with open(path, "wb") as f:
        f.write(data)


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "media/audio_game/trailhead-test.mp3"
    x = build()
    encode_mp3(x, out)
    t, secs = 0.0, []
    for name, bars, intensity in SECTIONS:
        secs.append({"t": round(t, 3), "name": name, "intensity": intensity})
        t += bars * BAR
    print(f"wrote {out}  ({len(x)/SR:.1f}s at {BPM} BPM)")
    print("ground-truth sections:", secs)
