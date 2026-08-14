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

## Constraints carried over from the site

- Base map is © Maps by Jeff — don't reuse map artwork in the game.
- `.gitignore` here is generated (see the trip-site pipeline); don't hand-edit,
  and never commit anything into `media/audio_full/` beyond what's tracked.
- George's network resets pushes over ~15 MB: keep commits small and push them
  individually (`git push origin <sha>:refs/heads/main`) if pushing from his
  machine; cloud sessions won't have this problem.
