// The screenshot scenes behind ?shot=aerial|chase|boat|mission. Each one stages the
// real game — real traffic, real patrol AI, real HUD — at a photogenic moment, so a
// frame is the game itself, never a mock-up. In a shot scene the player's vehicle
// drives itself gently and the camera is placed for the view named.

import { MISSIONS } from './missions.js';

function placePlayer(game, x, z, heading) {
  game.player.pos.set(x, 0, z);
  game.player.heading = heading;
  game.player.mesh.position.copy(game.player.pos);
  game.player.mesh.rotation.y = heading;
}

/** Aerial cover: golden hour over the whole bay, city, beach and sea in one frame. */
function stageAerial(game) {
  game.dayNight.setHour(16.9);
  placePlayer(game, -52, 282, 2.6);
  game.fixedCamera = { pos: [168, 128, 356], look: [-30, 0, 30] };
  game.save.cash = 2450;
}

/** Street action: a four-star chase down a downtown avenue, mission timer running. */
function stageChase(game) {
  game.dayNight.setHour(13.2);
  const car = game.traffic.cars.find((c) => c.kind === 'sport' && !c.parked) || game.traffic.cars[0];
  car.pos.set(30, 0, 96);
  car.heading = Math.PI;
  car.speed = 17;
  game.enterCar(car);
  game.wanted.heat = 210;
  game.police.spawnAt(24, 128, Math.PI);
  game.police.spawnAt(38, 136, Math.PI);
  game.police.spawnAt(30, 150, Math.PI);
  game.story.active = { mission: MISSIONS[4], stepIndex: 0, timer: 97, pickups: 2, rivalPos: null };
  game.shotDrive = { throttle: 0.92, steerWave: 0.05 };
  game.save.cash = 3150;
}

/** On the water: the runabout planing across the bay with the skyline behind. */
function stageBoat(game) {
  game.dayNight.setHour(10.8);
  const boat = game.boats[0];
  boat.pos.set(-40, 0, 470);
  boat.heading = Math.PI * 0.92;
  boat.speed = 13;
  game.enterBoat(boat);
  game.shotDrive = { throttle: 0.85, steerWave: 0.03 };
  game.save.cash = 4600;
}

/** A mission moment: dusk at the beach crate, objective up, beacon glowing. */
function stageMission(game) {
  game.dayNight.setHour(19.3);
  placePlayer(game, 172, 300, 0.8);
  game.story.active = { mission: MISSIONS[2], stepIndex: 0, timer: null, pickups: 0, rivalPos: null };
  game.save.cash = 1850;
}

/** Stage the named scene on a fresh game; unknown names fall back to the cover. */
export function stageShot(game, name) {
  game.beginPlay(false);
  if (name === 'chase') stageChase(game);
  else if (name === 'boat') stageBoat(game);
  else if (name === 'mission') stageMission(game);
  else stageAerial(game);
}
