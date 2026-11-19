# Solmar Bay

![gta6-01](https://make.fun/badge/gta6-01.svg)
![rank](https://make.fun/badge/gta6-01/Nughair/solmar-bay/rank.svg)
![reward](https://make.fun/badge/gta6-01/Nughair/solmar-bay/reward.svg)

**Solmar Bay** is an original open-world crime game set in a sun-soaked bay city: nine by nine blocks of streets, towers and palms, a beach and a working harbour on its east shore. You arrive with $250 and a cousin named Mara who always needs "one small favour". Steal cars, outrun a five-star police response, hire the boat at the pier, chase rivals across the water, and work through her eight jobs — from a first stolen coupe to the downtown cash-van finale — to become King of the Bay.

Competition: [make.fun/c/gta6-01](https://make.fun/c/gta6-01)

## Features

- 9×9 city grid with ~240 varied buildings, emissive windows, roads with markings, sidewalks, street lamps, palms and props
- Beach and sea along the east edge, with a boat-hire dock and a driveable boat (enter/exit, throttle, steering, wake)
- Traffic AI: a fleet of cars driving the road grid with lane following, intersection turns and car-ahead braking
- 38+ pedestrians strolling the sidewalks with a leg-swing walk cycle; they flee when shots are fired nearby
- Third-person on-foot play: enter/exit cars, carjack traffic, hitscan pistol combat with muzzle flash, tracers and hit reactions
- Wanted system, 0–5 stars: shooting, carjacking and hit-and-runs raise it; police cars pursue and officers chase on foot and shoot back; it decays while you stay out of sight
- 8 story missions with markers, intros, objectives and payouts from $800 to $5,000 — including a boat chase and a 90-second timed delivery — with fail/retry
- Full HUD: health, cash, wanted stars, weapon/vehicle readout, canvas minimap (roads, player, cars, peds, police, mission marker), mission banner, objective line and toasts
- Day–night cycle: the sun moves, sky/fog/light lerp, building windows and street lamps glow at night
- localStorage save (cash, missions completed, position) with CONTINUE on the title screen
- Synthesized WebAudio sound — engine hum, gunshot, hits, cash, mission stings and an ambient pad; no audio files
- Title screen with NEW GAME / CONTINUE and a pause/help overlay listing every control
- Deterministic screenshot scenes: `?shot=aerial|chase|boat|mission&seed=N`

## Controls

- **WASD / arrows** — move, drive, steer
- **Shift** — run
- **Mouse** — look and aim · **Left click** — shoot
- **E** — enter / exit a car or the boat
- **F** — carjack the nearest car
- **Space** — handbrake
- **P / Esc / H** — pause and help

## How to run

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome. The game is fully static and offline: everything it loads lives under `game/`, with three.js vendored at `game/vendor/three.module.min.js`.
