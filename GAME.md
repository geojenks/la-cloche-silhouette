# Side-scroller — design brief & handoff

Handoff doc for building the La Cloche Silhouette mini-game. Written so a fresh
Claude session (e.g. Claude Code on the web, working from this repo) has full
context without the original machine.

## What this repo is

The live trip site (https://geojenks.github.io/la-cloche-silhouette/) for
George's six-day clockwise solo loop of the La Cloche Silhouette Trail,
Killarney PP, Ontario (2026-08-08 → 08-13, 77.5 km incl. the Silver Peak side
trip). Nights at H20, H22 (Moose Pass), Boundary Lake portage tip, H47 (Heaven
Lake), H52. `data/site_data.json` has the route, per-day distances
(camps at 26.7 / 32.4 / 44.5 / 60.8 / 74.2 km), elevations, and all placed
media; photos live in `media/web/` (full) and `media/thumb/`.

## The game

A silly, phone-first, Mario-like side-scroller. **Fun over challenge** — for
family and friends, loosely following the real itinerary. Deploy as part of
this site (e.g. `game/index.html`, linked from the map page).

- **6 levels, one per day**, habitat switching between stone (white quartzite),
  forest, lake, and swamp to match each day's terrain.
- **Enemies:** birds of prey, snakes, chipmunks, frogs.
- **Stamina element** (walking/jumping drains it; resting/snacks restore).
- **Day 2:** collect matches from a friendly group of three hikers (this really
  happened — George had no lighter; see the d2-matches voice note).
- **End of each day: food-hanging mini-game** — tie the rope to a rock, throw
  it over a suitably high branch, hoist, repeat on the other side, hang the
  bag. (See `media/video/hang_compiled.mp4` for the real technique.)
- **Level-complete "resting" screen:** a pixel-art NIGHT version of one of the
  photos from that day, as a **few-frame looping GIF** — retro and cosy, like
  old Square Enix games — with soothing music.
- Touch controls first (big on-screen buttons); keyboard as a bonus.
  Vanilla JS + canvas preferred; no build step; must work offline-ish as static
  files on GitHub Pages.

## Soundtrack

George can name the song stuck in his head each day (Day 1: FISHER x AATIG —
"Take It Off", https://www.youtube.com/watch?v=0CKkRtkzw4g) and can supply
mp3s. **Copyrighted tracks must NOT be embedded in this public repo/site** —
show a "song of the day" link out instead, and use original chiptune-style
loops for actual in-game audio.

## Status (2026-08-15)

Bare-bones Day 1 is playable at `game/index.html` (linked from the map
topbar). Decisions locked in with George:

- **Beat-clocked spawner**, free movement (not an auto-runner). Enemy spawns
  fire on the beat grid — downbeats spawn birds/snakes, midbeats chipmunks,
  upbeats frogs (which hop on downbeats); song sections' `intensity` (0-3)
  sets spawn density. Intensity-0 sections (intros/bridges) are enemy-free
  breathing room.
- **Level length = default song length**: acing a level (holding max run
  speed) takes exactly the duration of the level's default first song.
  Playlists shuffle after the default song; ⏮⏭ skip anytime.
- **Songs**: George is buying the mp3s (non-profit use). Drop them in
  `media/audio_game/`, run `python3 tools/beatgrid.py media/audio_game/*.mp3`
  to draft each song's JSON (BPM/offset detection is solid; hand-tune
  `sections` + `offset` by ear), then list song ids in the level's
  `playlist` and remove the JSON's `"generated"` flag if present. The
  placeholder track (`trailhead-test`) is an original chiptune synthesized
  in the browser at load (`game/js/gen-track.js`, mirrored by
  `tools/make_test_track.py` for offline mp3 rendering); a listed mp3 that
  fails to load falls back to the same generated audio. NOTE: cloud Claude
  sessions can only push text through the GitHub API, so mp3s must be
  committed/pushed from George's machine (individually — see push note
  below).
- **Stamina is the only resource** — no deaths. Zero stamina = slow trudge.
  Snacks +25, swimming refills fast, standing still trickles. The 🔄 button
  (or R) resets to the last checkpoint with full stamina.
- **Enemy verbs**: stomp (chipmunks, frogs), bonk-from-below (birds),
  avoid (snakes — never safe to touch). Landing *on top* of a bird is a
  deliberately-hard springboard (vy -580 vs normal jump -420) to reach
  secret vista platforms.
- **Lake dips are optional** (stepping stones cross above) and set a
  checkpoint; underwater audio = lowpass + bass-shelf boost via Web Audio.
- **Nights**: `game/data/levels/dayN.json` has a `night` block — `gif` slot
  for the pixel-art photo loops (George will make these, e.g. with GPT),
  `bear: true` on night 4 for the bear-poo cameo.

Still to build: days 2-6 (incl. day-2 matches pickup → better night
recovery, day-4 Silver Peak hiker crowds), food-hang mini-game, night
GIFs, per-day biome tuning.

**Sprite art**: full GPT-iteration pipeline in place — see
`tools/SPRITESHEET.md`. One labeled template sheet (all sprites, props,
decor, terrain tiles) goes to GPT for restyling;
`tools/normalize_spritesheet.py` turns the result into
`game/data/sprites/base.png` (+ optional partial `hype0/2/3.png` variants
that switch with the music), which the game auto-loads over the code-drawn
placeholders. Raw GPT sheets live in `game/data/sprites/src/`.

## Constraints carried over from the site

- Base map is © Maps by Jeff — don't reuse map artwork in the game.
- `.gitignore` here is generated (see the trip-site pipeline); don't hand-edit,
  and never commit anything into `media/audio_full/` beyond what's tracked.
- George's network resets pushes over ~15 MB: keep commits small and push them
  individually (`git push origin <sha>:refs/heads/main`) if pushing from his
  machine; cloud sessions won't have this problem.
