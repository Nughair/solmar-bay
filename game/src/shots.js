// shots.js — deterministic screenshot scenes for ?shot=aerial|chase|boat|mission
// &seed=N. Each poses the real game world (same city, cars, people and HUD),
// freezes a composed frame and flags window.__shotReady when painted.
import { CITY, roadCoord } from './config.js';

// ctx: { player, boat, traffic, missions, spawnPolice, setWanted, setTimeOfDay,
//        camera, scene objects... } — everything main.js owns.
export function poseShot(name, ctx) {
  const { player, boat } = ctx;
  ctx.setTimeOfDay(0.42); // late-morning light for every shot
  if (name === 'aerial') {
    player.pos.set(-60, 0.3, 60);
    ctx.camera.position.set(-150, 190, 260);
    ctx.camera.lookAt(30, 0, -20);
    ctx.hudState.objective = '';
    return 'aerial';
  }
  if (name === 'chase') {
    // Player car on a main road, two police cars behind, wanted 3 stars.
    const car = ctx.traffic[0];
    car.pos.set(roadCoord(5), 0, -16);
    car.heading = 0; car.speed = 16;
    ctx.enterCar(car, true);
    ctx.setWanted(3);
    ctx.spawnPolice(2);
    const cops = ctx.policeCars;
    if (cops[0]) { cops[0].pos.set(roadCoord(5) + 3, 0, -31); cops[0].heading = 0; cops[0].speed = 15; }
    if (cops[1]) { cops[1].pos.set(roadCoord(5) - 3, 0, -43); cops[1].heading = 0; cops[1].speed = 14; }
    // Camera centred over the road ahead of the player car, looking straight
    // back down the corridor: player car foreground, police cars behind it.
    ctx.camera.position.set(car.pos.x + 1, 7.5, car.pos.z + 21);
    ctx.camera.lookAt(car.pos.x, 1, car.pos.z - 24);
    ctx.hudState.objective = 'Lose the police!';
    return 'chase';
  }
  if (name === 'boat') {
    boat.pos.set(CITY.dockX + 42, 0, CITY.dockZ + 26);
    boat.heading = 0.7; boat.speed = 8;
    ctx.enterBoat(true);
    // Camera seaward of the boat, looking back west: boat in the foreground,
    // the dock, beach and city skyline behind it.
    ctx.camera.position.set(boat.pos.x + 14, 6.5, boat.pos.z + 11);
    ctx.camera.lookAt(boat.pos.x - 16, 1.5, boat.pos.z - 6);
    ctx.hudState.objective = 'Boat hire: the bay is yours';
    return 'boat';
  }
  // mission: first mission offered, player at the marker, HUD objective visible.
  const offer = ctx.missions.currentOffer();
  if (offer) {
    player.pos.set(offer.start.x + 2.5, 0.3, offer.start.z + 4);
    player.heading = Math.PI;
    // Show the gold marker (updateMarkers is not called again in shot mode).
    ctx.missions.updateMarkers(1.2);
    ctx.missions.tryStart(player.pos);
    ctx.missions.marker.visible = true;
    ctx.missions.marker.position.set(offer.start.x, 7, offer.start.z);
    ctx.hudState.objective = offer.objective;
    // Street-level view along the road: player, gold marker and city in frame.
    ctx.camera.position.set(offer.start.x + 9, 6, offer.start.z + 15);
    ctx.camera.lookAt(offer.start.x - 2, 2.5, offer.start.z - 4);
  }
  return 'mission';
}
