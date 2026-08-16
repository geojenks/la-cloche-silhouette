#!/usr/bin/env python3
"""Beat-grid annotator: mp3 in, song JSON out.

For each track the game needs only three numbers (bpm, offset of the first
downbeat, beats per bar) plus a hand-editable section list — beats are
computed at runtime from those, so nothing per-beat is stored. This script
drafts all of it; you then nudge `offset` by ear and rename/merge sections.

Usage:
    python3 tools/beatgrid.py media/audio_game/song.mp3 [more.mp3 ...]
    # writes game/data/songs/<stem>.json next to any existing ones

Section drafting splits wherever the smoothed energy makes a sustained
jump/drop. Intensity (0-3 — the game's "hype") is calibrated ACROSS the
whole batch, not per song: energy = loudness (dB) + onset density (how
busy the music is), both z-scored over the POOLED batch, and the 0/1/2/3
cut points come from the pool too. A mellow track therefore sits low on
the shared scale and simply never reaches hype 3; a relentless banger may
never drop to 0 — run all the mp3s in ONE batch for this to work. The
batch writes _calibration.json so later single-file runs (a song added to
the playlist afterwards) score on the same scale.
Rename "sec1/sec2/…" to verse/chorus/etc. by hand if you care; the game
only reads `intensity`.

Deps: pip install librosa soundfile numpy
"""

import json
import sys
from pathlib import Path

import librosa
import numpy as np

OUT_DIR = Path(__file__).resolve().parent.parent / "game" / "data" / "songs"
CAL_FILE = OUT_DIR / "_calibration.json"
MIN_SECTION_S = 12.0
ENERGY_QUANTILES = [0.35, 0.65, 0.88]


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

    # Energy features, absolute (no per-song normalization — the batch
    # z-scores them across the pool): smoothed loudness in dB + smoothed
    # onset density aligned to the same frames.
    hop = 2048
    rms = librosa.feature.rms(y=y, hop_length=hop)[0]
    rt = librosa.times_like(rms, sr=sr, hop_length=hop)
    win = max(1, int(6.0 / (hop / sr)))  # ~6 s smoothing
    smooth = np.convolve(rms, np.ones(win) / win, mode="same")
    db = 20 * np.log10(np.maximum(smooth, 1e-6))
    on_frames = np.interp(rt, times, onset)
    on_smooth = np.convolve(on_frames, np.ones(win) / win, mode="same")

    return {
        "title": path.stem.replace("-", " ").replace("_", " ").title(),
        "artist": "",
        "file": f"media/audio_game/{path.name}",
        "bpm": bpm,
        "offset": round(offset, 3),
        "beatsPerBar": 4,
        "duration": round(duration, 2),
    }, db, on_smooth, rt, hop / sr


def sections_from_energy(energy, rt, frame_s, cuts):
    levels = np.digitize(energy, cuts)
    sections = []
    start_i = 0
    for i in range(1, len(levels)):
        if levels[i] != levels[start_i] and rt[i] - rt[start_i] >= MIN_SECTION_S:
            hold = int(4.0 / frame_s)  # new level must hold a few seconds
            if i + hold < len(levels) and np.median(levels[i:i + hold]) == levels[i]:
                sections.append({"t": round(float(rt[start_i]), 2),
                                 "name": f"sec{len(sections) + 1}",
                                 "intensity": int(levels[start_i])})
                start_i = i
    sections.append({"t": round(float(rt[start_i]), 2),
                     "name": f"sec{len(sections) + 1}",
                     "intensity": int(levels[start_i])})
    if sections:
        sections[0]["t"] = 0.0
    return sections


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    paths = [Path(a) for a in sys.argv[1:]]
    analysed = [(p, *analyse(p)) for p in paths]

    cal = None
    if len(paths) > 1:
        db_pool = np.concatenate([a[2] for a in analysed])
        on_pool = np.concatenate([a[3] for a in analysed])
        cal = {"db_mean": float(db_pool.mean()), "db_std": float(db_pool.std() or 1),
               "on_mean": float(on_pool.mean()), "on_std": float(on_pool.std() or 1)}
        e_pool = ((db_pool - cal["db_mean"]) / cal["db_std"] +
                  (on_pool - cal["on_mean"]) / cal["on_std"]) / 2
        cal["cuts"] = [float(q) for q in np.quantile(e_pool, ENERGY_QUANTILES)]
        cal["built_from"] = len(paths)
        CAL_FILE.write_text(json.dumps(cal, indent=2) + "\n")
        print(f"calibrated hype scale across {len(paths)} songs -> {CAL_FILE.name}")
    elif CAL_FILE.exists():
        cal = json.loads(CAL_FILE.read_text())
        print(f"scoring on existing calibration ({CAL_FILE.name}, "
              f"built from {cal.get('built_from', '?')} songs)")
    else:
        print("WARNING: single file and no _calibration.json — intensity "
              "will use this song's own range. Batch all mp3s together for "
              "playlist-wide hype levels.")

    for (p, meta, db, on, rt, frame_s) in analysed:
        if cal:
            energy = ((db - cal["db_mean"]) / cal["db_std"] +
                      (on - cal["on_mean"]) / cal["on_std"]) / 2
            c = cal["cuts"]
        else:
            energy = (db - db.mean()) / (db.std() or 1)
            c = [float(q) for q in np.quantile(energy, ENERGY_QUANTILES)]
        meta["sections"] = sections_from_energy(energy, rt, frame_s, c)
        out = OUT_DIR / f"{p.stem}.json"
        out.write_text(json.dumps(meta, indent=2) + "\n")
        ints = sorted({s["intensity"] for s in meta["sections"]})
        print(f"{p.name}: {meta['bpm']} BPM, offset {meta['offset']}s, "
              f"{len(meta['sections'])} sections, hype levels used {ints} -> {out.name}")
