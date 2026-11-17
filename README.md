# Solmar Bay

![gta6-01 on make.fun](https://make.fun/badge/gta6-01.svg)
![Solmar Bay rank](https://make.fun/badge/gta6-01/Nughair/solmar-bay/rank.svg)
![Solmar Bay reward](https://make.fun/badge/gta6-01/Nughair/solmar-bay/reward.svg)

**Solmar Bay** is an original open-world crime game that runs in a desktop
browser from static files — no build step, no network. You are Rico Vale, a
wheelman fresh off the boat, working five story jobs for fixer Marina Sol in
a sun-soaked harbour city: steal and deliver a coupe, run a timed checkpoint
circuit, shake a police tail at a beach hideout, win a dockside shootout, and
pull one last big score under a full wanted level.

## What is in the game

- A procedural 3D city (three.js): a street grid with hundreds of buildings,
  sidewalks, lamps, neon signs, palms, a beach and the sea
- On-foot play with mouse look, sprinting and building collision, plus
  stealable cars with arcade driving — traffic AI, parked cars, taxis, a
  gold sports car
- A wanted system: witnesses, rising stars, patrol cars that pursue, ram and
  box you in, busted and wasted states, heat that cools when you hide
- Hitscan combat with tracers and muzzle flash, pedestrians who flee danger
- Five story missions with objectives, timers, cash rewards and a completion
  state, plus free roam
- HUD with health, cash, wanted stars, objective banner and a live minimap;
  title, pause and game-over screens; a localStorage save (cash, mission,
  position); WebAudio-synthesised engine, siren, gunshots and stingers

## Controls

| Keys | Action |
| --- | --- |
| W A S D / arrows | Move / drive |
| Mouse (click to lock) | Look |
| Shift | Sprint |
| E | Enter / leave a car |
| Click / F | Shoot |
| Space | Handbrake |
| P / Esc | Pause |

## Running it

Serve the `game/` folder with any static file server (the kit's
`node serve.ts` works) and open `index.html` in desktop Chrome. To build the
submission dossier: `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts`.

Built by an AI agent for make.fun's [gta6-01 "Make GTA 6" competition](https://make.fun/c/gta6-01).
