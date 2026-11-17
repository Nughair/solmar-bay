# Solmar Bay

![gta6-01 competition](https://make.fun/badge/gta6-01.svg)
![rank](https://make.fun/badge/gta6-01/Nughair/solmar-bay/rank.svg)
![reward](https://make.fun/badge/gta6-01/Nughair/solmar-bay/reward.svg)

**Solmar Bay** is an original open-world crime game that runs in a desktop
browser from static files — no build step, no network. Explore a sun-soaked
coastal city of sixteen blocks on foot and by car: steal rides, dodge or
outrun the Solmar PD, and work five story jobs for fixer Tomas Rey, from a
first stolen coupe to an armoured van delivered under a three-star sky.

Built with three.js (vendored under `game/vendor/`) and plain ES modules.
Every sound is synthesised live with WebAudio; the city, traffic and crowd
are procedural from a fixed seed.

## Play

Serve the `game/` folder with any static file server (or run `node serve.ts`
from this repository) and open `game/index.html` in desktop Chrome.

| Input | Action |
| --- | --- |
| WASD / arrows | Move / drive |
| Mouse | Look (click the game to capture it) |
| Left click | Shoot |
| E | Enter / exit a car |
| Shift | Sprint |
| Space | Handbrake |
| P | Pause |

Progress — cash, story position, health — saves to localStorage
automatically.

## The game

- Procedural city: street grid, varied towers and walk-ups, palms, lamps,
  billboards, a beach and the bay, plus landmarks (Rey's Customs, Solmar
  Police, Bay General hospital, Pier 9 Storage).
- Traffic that drives the grid and brakes for trouble; pedestrians who
  stroll, panic and flee.
- A five-star wanted system: witnessed crimes raise heat, police
  interceptors pursue, and hiding until the stars fade cools it down.
  Get caught slow and close and you are busted; get shot down and you wake
  up at Bay General.
- Five story missions with cash rewards, a HUD with a live minimap, and a
  completion state that opens free roam.

## Competition

This repository is an entry to make.fun's **gta6-01 — "Make GTA 6"**:
https://make.fun/c/gta6-01

The entry program is `main.ts` (Node 22, standard library only): it copies
`game/` and `screenshots/` to the output directory and writes the
`dossier.json` summary with the vendored library in `vendor/makefun-game.ts`.

Source layout, one job per file under `game/src/`:

- `main.js` — boot, the loop, camera, crimes, busts, saves, staged scenes
- `city.js` — the procedural city and its landmarks
- `vehicles.js` — car meshes, arcade driving physics, traffic drivers
- `player.js` — on-foot movement, health, the player figure
- `police.js` — the wanted system and the pursuit drivers
- `combat.js` — the pistol, tracers, muzzle flash, particles
- `missions.js` — Tomas Rey's five jobs and their objectives
- `pedestrians.js` — the crowd and the Pier 9 crew
- `hud.js` — HUD readouts and the minimap
- `audio.js` — WebAudio-synthesised engine, siren and effects
- `save.js` — localStorage progress
- `util.js` — seeded randomness, math, the street plan

Licensed under the MIT License (see `LICENSE`).
