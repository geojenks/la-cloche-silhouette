#!/usr/bin/env python3
"""Beat-grid annotator: mp3 in, song JSON out.

For each track the game needs only three numbers (bpm, offset of the first
downbeat, beats per bar) plus a hand-editable section list — beats are
computed at runtime from those, so nothing per-beat is stored. This script
drafts all of it; you then nudge `offset` by ear and rename/merge sections.

Usage:
    python3 tools/beatgrid.py media/audio_game/song.mp3 [more.mp3 ...]
    # writes game/data/songs/<stem>.json next to any existing ones

Section drafting is deliberately dumb: it splits wherever the smoothed
RMS loudness makes a sustained jump/drop, and labels each region with an
intensity 0-3 (quartile of its loudness). Rename "sec1/sec2/…" to
verse/chorus/etc. by hand if you care; the game only reads `intensity`.

Deps: pip install librosa soundfile numpy
"""

import json
import sys
from pathlib import Path

import librosa
import numpy as np

OUT_DIR = Path(__file__).resolve().parent.parent / "game" / "data" / "songs"
MIN_SECTION_S = 12.0


def comb_score(onset, times, bpm, duration):
    """Best phase + score for a fixed-BPM grid laid over the onset envelope."""
    beat_len = 60.0 / bpm
    best = (0.0, 0.0)
    for phase in np.arange(0, beat_len, 0.01):
        ts = np.arange(phase, duration, beat_len)
        idx = np.searchsorted(times, ts)
        idx = idx[idx < len(onset)]
        s = float(onset[idx].mean()) if len(idx) else 0.0
        if s > best[1]:
            best = (float(phase), s)
    return best


def analyse(path: Path) -> dict:
    y, sr = librosa.load(path, sr=22050, mono=True)
    duration = float(len(y) / sr)

    tempo, _ = librosa.beat.beat_track(y=y, sr=sr, units="time")
    tempo = float(np.atleast_1d(tempo)[0])

    onset = librosa.onset.onset_strength(y=y, sr=sr)
    times = librosa.times_like(onset, sr=sr)

    # librosa's tempo is a good seed but drifts over minutes-long tracks;
    # refine with a comb-filter scan (integer BPMs included — most produced
    # music is an exact integer).
    cands = set(np.round(np.arange(tempo - 2, tempo + 2, 0.1), 1))
    cands |= {float(i) for i in range(int(tempo) - 2, int(tempo) + 3)}
    scored = [(c, *comb_score(onset, times, c, duration)) for c in sorted(cands)]
    bpm, offset, _ = max(scored, key=lambda s: s[2])
    beat_len = 60.0 / bpm

    # Downbeat guess: try each of the 4 possible bar phases, pick the one
    # whose beats carry the most onset energy (downbeats usually hit hardest).
    onset = librosa.onset.onset_strength(y=y, sr=sr)
    times = librosa.times_like(onset, sr=sr)
    bar_scores = []
    for k in range(4):
        ts = np.arange(offset + k * beat_len, duration, 4 * beat_len)
        idx = np.searchsorted(times, ts)
        idx = idx[idx < len(onset)]
        bar_scores.append(onset[idx].mean() if len(idx) else 0.0)
    offset = offset + int(np.argmax(bar_scores)) * beat_len

    # Loudness → section boundaries + intensity.
    hop = 2048
    rms = librosa.feature.rms(y=y, hop_length=hop)[0]
    rt = librosa.times_like(rms, sr=sr, hop_length=hop)
    win = max(1, int(6.0 / (hop / sr)))  # ~6 s smoothing
    smooth = np.convolve(rms, np.ones(win) / win, mode="same")
    levels = np.digitize(smooth, np.quantile(smooth[smooth > 0], [.35, .65, .88]))

    sections = []
    start_i = 0
    for i in range(1, len(levels)):
        if levels[i] != levels[start_i] and rt[i] - rt[start_i] >= MIN_SECTION_S:
            # require the new level to hold for a few seconds
            hold = int(4.0 / (hop / sr))
            if i + hold < len(levels) and np.median(levels[i:i + hold]) == levels[i]:
                sections.append({"t": round(float(rt[start_i]), 2),
                                 "name": f"sec{len(sections) + 1}",
                                 "intensity": int(levels[start_i])})
                start_i = i
    sections.append({"t": round(float(rt[start_i]), 2),
                     "name": f"sec{len(sections) + 1}",
                     "intensity": int(levels[start_i])})
    if sections and sections[0]["t"] > 0:
        sections[0]["t"] = 0.0

    return {
        "title": path.stem.replace("-", " ").replace("_", " ").title(),
        "artist": "",
        "file": f"media/audio_game/{path.name}",
        "bpm": bpm,
        "offset": round(offset, 3),
        "beatsPerBar": 4,
        "duration": round(duration, 2),
        "sections": sections,
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for arg in sys.argv[1:]:
        p = Path(arg)
        meta = analyse(p)
        out = OUT_DIR / f"{p.stem}.json"
        out.write_text(json.dumps(meta, indent=2) + "\n")
        print(f"{p.name}: {meta['bpm']} BPM, offset {meta['offset']}s, "
              f"{len(meta['sections'])} sections -> {out.relative_to(Path.cwd()) if out.is_relative_to(Path.cwd()) else out}")
