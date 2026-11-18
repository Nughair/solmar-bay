# Solmar Bay

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Nughair/solmar-bay/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Nughair/solmar-bay/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Solmar Bay** is an original open-world crime game that runs entirely in the browser — no build step, no network, just static files. You are Nilo Ferreira, newly arrived in a sun-soaked harbour city with forty dollars to his name. Fixer Vera Castellan has work: eight story errands that take you from stealing your first coupe to a last, desperate run across the bay.

## What's in the game

- **A living city** — a 9×9 street grid of roughly 240 pastel towers, plazas and billboards, a promenade, a sandy beach, a marina pier and open water, all lit by a full day–night cycle with glowing windows and street lamps after dark.
- **Traffic and crowds** — fifteen cruising cars and taxis drive the street grid, braking and turning at junctions; fourteen more cars sit parked and stealable; thirty-eight pedestrians stroll the kerbs, chat, and flee from trouble.
- **Drive anything** — steal any car (even a patrol car), board the moored runabouts at the pier, and chase or be chased across the water.
- **Wanted system** — crimes raise your heat through five stars; patrol cars hunt, ram and shoot, and at four stars a harbour patrol boat joins in. Heat cools when you lie low.
- **Combat** — hitscan pistol with muzzle flash, impact sparks, damaged cars that smoke and die, and a health system with busted / taken-down outcomes.
- **Eight story missions** — timed deliveries, a beach pickup and escape, a harbour chase against a rival smuggler, a steal-and-deliver with a condition limit, a night run under a locked wanted level, and a final run to the yacht. Payouts run $800–$5,000.
- **Full HUD** — cash, wanted stars, health, speedometer, mission panel with timers, dialogue, and a live minimap with traffic, patrol and objective blips.
- **Sound, synthesised live** — engines, sirens, gunshots, crashes, splashes and sea air, all from WebAudio; nothing is a file.
- **Saving** — cash and story progress persist in `localStorage`.

## Play it

Serve the `game/` folder with any static file server and open `index.html` in a desktop browser:

```sh
node serve.ts   # then open http://localhost:8080
```

**Controls** — WASD move/drive · mouse look (click to lock) · Shift sprint · E enter/exit car or boat · click or F shoot · Space handbrake · P pause · M mute.

## Layout

- `main.ts` — the entry program: copies `game/` and `screenshots/` to the output and writes the dossier.
- `game/index.html` — the page and HUD.
- `game/src/` — the game itself, one job per file: `world.js` (the city), `vehicles.js` (cars and traffic), `boat.js`, `people.js` (player and crowds), `police.js` (wanted and patrols), `missions.js` (Vera's eight errands), `hud.js`, `fx.js` (day–night and particles), `audio.js` (synth sound), `input.js`, `save.js`, `rng.js`, `shots.js` (the screenshot scenes).
- `game/vendor/three.module.min.js` — three.js, vendored.

Built by an AI agent for make.fun's “Make GTA 6” bounty, $1,666 in USDC.
