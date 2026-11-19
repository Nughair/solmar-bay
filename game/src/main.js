// main.js — Solmar Bay orchestration: boot, the game loop, third-person camera,
// day-night cycle, wanted level and police response, hitscan combat, vehicle
// entry, the mission state machine glue, saving, title/pause and shot modes.
import * as THREE from 'three';
import { CITY, SAVE_KEY, WANTED, roadCoord, blockCoord } from './config.js';
import { makeRng } from './rng.js';
import { createAudio } from './audio.js';
import { createCity } from './city.js';
import { createTraffic, createPoliceCar, updateTrafficCar, driveCar, updatePoliceCar } from './vehicles.js';
import { createBoat, updateBoat } from './boat.js';
import { createPedestrians, updatePedestrian, createOfficer, updateOfficer, knockDown } from './people.js';
import { createPlayer, updatePlayerOnFoot, createCombatFx } from './player.js';
import { createMissionSystem } from './missions.js';
import { createHud } from './hud.js';
import { poseShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 20261119;
const rng = makeRng(seed);

const canvas = document.getElementById('game3d');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87c5e8);
scene.fog = new THREE.Fog(0x87c5e8, 160, 900);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);

const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x8a7a5a, 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe3b3, 1.6);
scene.add(sun);
scene.add(sun.target);

const audio = createAudio();
const city = createCity(scene, rng);
const traffic = createTraffic(scene, rng, 14);
const peds = createPedestrians(scene, rng, 38);
const boat = createBoat(scene);
const player = createPlayer(scene);
const fx = createCombatFx(scene);
const missions = createMissionSystem(scene);
const hud = createHud(document.getElementById('ui'));
hud.bindButtons();

const policeCars = [];
const officers = [];
let rivalBoat = null;
let buoy = null;

const state = {
  screen: shotName ? 'shot' : 'title',
  cash: 250, wanted: 0, unseenTime: 0, lastCrimeTime: -99,
  timeOfDay: 0.38, elapsed: 0, camYaw: Math.PI / 2, camPitch: 0.32,
  missionCar: null, saveTimer: 0,
};
const hudState = { objective: '', clockText: '' };

function setTimeOfDay(t) {
  state.timeOfDay = ((t % 1) + 1) % 1;
  const ang = state.timeOfDay * Math.PI * 2 - Math.PI / 2;
  const sunH = Math.sin(ang);
  sun.position.set(Math.cos(ang) * 300, Math.max(8, sunH * 260), 120);
  const day = Math.max(0, Math.min(1, sunH * 1.6 + 0.35));
  sun.intensity = 0.25 + day * 1.5;
  hemi.intensity = 0.3 + day * 0.65;
  const sky = new THREE.Color().setHSL(0.58, 0.55, 0.12 + day * 0.5);
  scene.background.copy(sky);
  scene.fog.color.copy(sky);
  const night = 1 - day;
  for (const m of city.windowMats) m.emissive.setHSL(0.11, 0.85, night * 0.38);
  const hh = Math.floor(state.timeOfDay * 24), mm = Math.floor((state.timeOfDay * 24 - hh) * 60);
  hudState.clockText = `Day 1 · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}${state.wanted ? ' · wanted' : ''}`;
}
setTimeOfDay(state.timeOfDay);

// ---------- save / load ----------
function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: state.cash, completed: missions.completed, index: missions.index,
      pos: { x: player.pos.x, z: player.pos.z },
    }));
  } catch { /* storage unavailable */ }
}
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function applySave(s) {
  if (!s) return;
  state.cash = s.cash || 0;
  missions.completed = s.completed || [];
  missions.index = Math.min(s.index || 0, 8);
  if (s.pos) player.pos.set(s.pos.x, 0.3, s.pos.z);
}

// ---------- wanted & police ----------
function addWanted(n) {
  state.wanted = Math.max(0, Math.min(5, state.wanted + n));
  state.lastCrimeTime = state.elapsed;
  state.unseenTime = 0;
}
function spawnPolice(nCars) {
  for (let i = 0; i < (nCars || 1); i++) {
    if (policeCars.length >= 6) break;
    const car = createPoliceCar(scene);
    const a = rng() * Math.PI * 2;
    car.pos.set(
      Math.max(-256, Math.min(256, player.pos.x + Math.sin(a) * 70)),
      0,
      Math.max(-256, Math.min(256, player.pos.z + Math.cos(a) * 70)),
    );
    car.heading = a + Math.PI;
    policeCars.push(car);
  }
  while (officers.length < Math.min(6, state.wanted * WANTED_OFFICERS())) {
    const a = rng() * Math.PI * 2;
    officers.push(createOfficer(scene, new THREE.Vector3(
      player.pos.x + Math.sin(a) * 34, 0, player.pos.z + Math.cos(a) * 34)));
  }
}
function WANTED_OFFICERS() { return 1.4; }
function clearPolice() {
  for (const c of policeCars) scene.remove(c.mesh);
  for (const o of officers) scene.remove(o.mesh);
  policeCars.length = 0; officers.length = 0;
}
function updateWanted(dt) {
  if (state.wanted <= 0) return;
  // Seen if any police unit is close.
  let seen = false;
  for (const c of policeCars) if (c.pos.distanceTo(player.pos) < 55) seen = true;
  for (const o of officers) if (!o.dead && o.pos.distanceTo(player.pos) < 30) seen = true;
  if (seen) state.unseenTime = 0; else state.unseenTime += dt;
  if (state.unseenTime > WANTED.decayDelay + WANTED.decayStep) {
    state.unseenTime = WANTED.decayDelay;
    addWanted(-1);
    if (state.wanted === 0) { clearPolice(); hud.toast('You lost the police.'); }
    else hud.toast(`Wanted level down: ${state.wanted} star${state.wanted > 1 ? 's' : ''}`);
  }
  // Top up police presence.
  const wantCars = Math.min(5, state.wanted);
  if (policeCars.length < wantCars && Math.random() < dt * 0.7) spawnPolice(1);
}

// ---------- vehicles entry ----------
function nearestCar(maxD) {
  let best = null, bd = maxD;
  for (const c of traffic.concat(policeCars)) {
    if (c.dead) continue;
    const d = c.pos.distanceTo(player.pos);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
function enterCar(car, silent) {
  car.occupied = true;
  player.mode = 'car'; player.vehicle = car;
  player.mesh.visible = false;
  if (!silent) { audio.door(); }
}
function exitVehicle() {
  if (player.vehicle && player.mode === 'car') {
    const car = player.vehicle;
    car.occupied = false;
    player.pos.set(car.pos.x + 2.4, 0.3, car.pos.z);
  }
  if (player.mode === 'boat') {
    player.pos.set(CITY.dockX - 2, 0.3, CITY.dockZ);
    boat.occupied = false;
    audio.splash();
  }
  player.mode = 'foot'; player.vehicle = null;
  player.mesh.visible = true;
}
function enterBoat(silent) {
  boat.occupied = true;
  player.mode = 'boat'; player.vehicle = boat;
  player.mesh.visible = false;
  if (!silent) audio.splash();
}

// ---------- input ----------
const keys = {};
let mouseDown = false;
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (state.screen === 'play') {
    if (e.code === 'KeyE') {
      if (player.mode !== 'foot') exitVehicle();
      else {
        const car = nearestCar(4.5);
        if (car) {
          const wasMoving = Math.abs(car.speed) > 1;
          enterCar(car);
          if (car.isPolice || wasMoving) { addWanted(1); hud.toast(car.isPolice ? 'You stole a police car!' : 'Carjacked! +1 star'); }
          onEnteredVehicle(car);
        } else if (player.pos.distanceTo(boat.pos) < 6 || (Math.abs(player.pos.x - CITY.dockX) < 8 && Math.abs(player.pos.z - CITY.dockZ) < 10)) {
          enterBoat();
          onEnteredBoat();
        }
      }
    }
    if (e.code === 'KeyF') {
      const car = nearestCar(6);
      if (car && player.mode === 'foot') { enterCar(car); addWanted(1); hud.toast('Carjacked! +1 star'); onEnteredVehicle(car); }
    }
    if (e.code === 'KeyP' || e.code === 'Escape') setPaused(true);
    if (e.code === 'KeyH') setPaused(true);
  } else if (state.screen === 'pause' && (e.code === 'KeyP' || e.code === 'Escape' || e.code === 'KeyH')) setPaused(false);
  if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
canvas.addEventListener('mousedown', () => {
  mouseDown = true;
  if (state.screen === 'play') { audio.unlock(); shoot(); }
});
window.addEventListener('mouseup', () => { mouseDown = false; });
window.addEventListener('mousemove', (e) => {
  if (state.screen !== 'play') return;
  state.camYaw -= (e.movementX || 0) * 0.0026;
  state.camPitch = Math.max(0.05, Math.min(1.1, state.camPitch + (e.movementY || 0) * 0.002));
});
function setPaused(p) {
  if (state.screen === 'shot' || state.screen === 'title') return;
  state.screen = p ? 'pause' : 'play';
  hud.setPaused(p);
}
function driveInput() {
  return {
    forward: keys.KeyW || keys.ArrowUp, back: keys.KeyS || keys.ArrowDown,
    left: keys.KeyA || keys.ArrowLeft, right: keys.KeyD || keys.ArrowRight,
    brake: !!keys.Space,
  };
}
function footInput() {
  const d = driveInput();
  return { ...d, run: !!(keys.ShiftLeft || keys.ShiftRight), camYaw: state.camYaw, aiming: mouseDown };
}

// ---------- combat ----------
const lastShot = { pos: new THREE.Vector3(), time: -99 };
const raycaster = new THREE.Raycaster();
function shoot() {
  if (player.mode !== 'foot' || player.shootCd > 0 || player.dead) return;
  player.shootCd = 0.28;
  audio.shoot();
  lastShot.pos.copy(player.pos); lastShot.time = state.elapsed;
  addWanted(1);
  // Aim from the camera centre.
  raycaster.setFromCamera({ x: 0, y: 0 }, camera);
  raycaster.far = 70;
  const origin = player.pos.clone(); origin.y = 1.5;
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const from = origin.clone().addScaledVector(dir, 1.2); from.y = 1.45;
  let bestT = 70, bestTarget = null, bestKind = null;
  const test = (pos, radius, target, kind) => {
    const to = pos.clone(); to.y = 1.1;
    const rel = to.clone().sub(origin);
    const t = rel.dot(dir);
    if (t < 1 || t > bestT) return;
    const perp = rel.addScaledVector(dir, -t).length();
    if (perp < radius) { bestT = t; bestTarget = target; bestKind = kind; }
  };
  for (const p of peds) if (!p.dead) test(p.pos, 0.85, p, 'ped');
  for (const o of officers) if (!o.dead) test(o.pos, 0.85, o, 'officer');
  for (const c of traffic.concat(policeCars)) if (!c.dead) test(c.pos, 2.2, c, 'car');
  const hitPoint = origin.clone().addScaledVector(dir, bestTarget ? bestT : 40); hitPoint.y = 1.2;
  fx.fire(from, hitPoint);
  if (!bestTarget) return;
  audio.hit();
  if (bestKind === 'car') {
    bestTarget.health -= 34;
    if (bestTarget.health <= 0 && !bestTarget.dead) {
      bestTarget.dead = true;
      bestTarget.mesh.rotation.z = 0.35;
      hud.toast('Vehicle wrecked!');
    }
  } else {
    bestTarget.health -= 30;
    if (bestTarget.health <= 0) {
      knockDown(bestTarget);
      if (bestKind === 'officer') { addWanted(1); hud.toast('Officer down! The heat is rising.'); }
      else hud.toast('Pedestrian down!');
      onPersonDown(bestTarget);
    } else {
      bestTarget.flee = 3;
    }
  }
}

// ---------- missions glue ----------
let lookoutPoints = [];
function onEnteredVehicle(car) {
  const m = missions.active;
  if (!m) return;
  if ((m.type === 'deliver-car' || m.type === 'escape' || m.type === 'finale') && missions.stage === 0 && car === state.missionCar) {
    missions.stage = 1;
    if (m.type === 'escape' || m.type === 'finale') { addWanted(3); hud.toast('The police are on you!'); }
    hud.toast('Now drive to the blue marker.');
  }
}
function onEnteredBoat() {
  const m = missions.active;
  if (m && m.type === 'boat-fetch' && missions.stage === 0) {
    missions.stage = 1;
    hud.toast('Head out to the buoy.');
  }
  if (m && m.type === 'boat-chase' && missions.stage === 0) missions.stage = 1;
}
function onPersonDown(person) {
  const m = missions.active;
  if (m && m.type === 'clear' && person.isLookout) {
    missions.hits++;
    hud.toast(`Lookout down (${missions.hits}/3)`);
    if (missions.hits >= 3) missions.complete();
  }
}
missions.onEvent = (kind, m, reason) => {
  if (kind === 'start') {
    hud.banner(m.name, m.intro);
    audio.sting(true);
    state.missionCar = null; lookoutPoints = [];
    if (m.type === 'deliver-car' || m.type === 'escape' || m.type === 'finale') {
      const car = traffic[2];
      car.pos.set(m.target.x, 0, m.target.z); car.speed = 0; car.heading = 0.6;
      car.health = 100; car.dead = false; car.mesh.rotation.z = 0;
      state.missionCar = car;
    }
    if (m.type === 'boat-fetch') {
      if (!buoy) {
        buoy = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 2.2, 10),
          new THREE.MeshLambertMaterial({ color: 0xff5a3c, emissive: 0x661a08 }));
        scene.add(buoy);
      }
      buoy.position.set(m.target.x, 0.6, m.target.z); buoy.visible = true;
    }
    if (m.type === 'boat-chase') {
      if (!rivalBoat) rivalBoat = createBoat(scene);
      rivalBoat.pos.set(m.target.x, 0, m.target.z);
      rivalBoat.heading = 2.4; rivalBoat.speed = 9; rivalBoat.occupied = false;
      rivalBoat.mesh.visible = true; rivalBoat.wake.visible = true;
    }
    if (m.type === 'clear') {
      for (let i = 0; i < 3; i++) {
        const o = createOfficer(scene, new THREE.Vector3(m.target.x + i * 16 - 16, 0, m.target.z + (i % 2) * 14));
        o.isLookout = true; o.health = 30;
        officers.push(o); lookoutPoints.push(o);
      }
    }
  }
  if (kind === 'complete') {
    state.cash += m.pay;
    hud.banner('MISSION COMPLETE', `${m.name} · +$${m.pay.toLocaleString('en-US')}`);
    audio.cash(); audio.sting(true);
    if (buoy) buoy.visible = false;
    if (rivalBoat) { rivalBoat.mesh.visible = false; rivalBoat.wake.visible = false; }
    saveGame();
  }
  if (kind === 'fail') {
    hud.banner('MISSION FAILED', reason || 'Try again at the gold marker.');
    audio.sting(false);
    if (buoy) buoy.visible = false;
  }
};
function updateMissions(dt) {
  missions.updateMarkers(state.elapsed);
  if (!missions.active) {
    if (player.mode === 'foot') missions.tryStart(player.pos);
    hudState.objective = missions.currentOffer()
      ? `Go to the gold marker: ${missions.currentOffer().name}` : 'All jobs done — King of the Bay!';
    return;
  }
  const m = missions.active;
  const inCar = player.mode === 'car', inBoat = player.mode === 'boat';
  const at = (p, d) => Math.hypot(player.pos.x - p.x, player.pos.z - p.z) < d ||
    (player.vehicle && Math.hypot(player.vehicle.pos.x - p.x, player.vehicle.pos.z - p.z) < d);
  hudState.objective = m.objective + (m.type === 'timed' ? ` · ${Math.ceil(missions.timer)}s` : '');
  if (m.type === 'deliver-car' || m.type === 'finale') {
    if (missions.stage === 0) hudState.objective = 'Get into the marked car';
    else if (at(m.dest, 9)) missions.complete();
  } else if (m.type === 'boat-fetch') {
    if (missions.stage === 1 && inBoat && Math.hypot(boat.pos.x - m.target.x, boat.pos.z - m.target.z) < 12) {
      missions.stage = 2; hud.toast('Package secured! Back to the dock.');
      if (buoy) buoy.visible = false;
    } else if (missions.stage === 2 && inBoat && Math.hypot(boat.pos.x - m.dest.x, boat.pos.z - m.dest.z) < 14) missions.complete();
  } else if (m.type === 'escape') {
    if (missions.stage === 1 && state.wanted === 0) missions.complete();
  } else if (m.type === 'boat-chase') {
    if (rivalBoat && rivalBoat.mesh.visible) {
      updateBoat(rivalBoat, dt, { forward: true, back: false, left: false, right: false });
      rivalBoat.speed = 10;
      if (inBoat && boat.pos.distanceTo(rivalBoat.pos) < 6.5) {
        missions.hits++; rivalBoat.speed = 2;
        boat.speed *= 0.4;
        hud.toast(`Ram! (${missions.hits}/3)`);
        audio.hit();
        if (missions.hits >= 3) { missions.complete(); }
        else { rivalBoat.pos.x += 14; }
      }
    }
  } else if (m.type === 'timed') {
    missions.timer -= dt;
    if (at(m.target, 10)) missions.complete();
    else if (missions.timer <= 0) missions.fail('Out of time.');
  } else if (m.type === 'tour') {
    const wp = m.waypoints[missions.stage];
    if (wp && at(wp, 13)) {
      missions.stage++;
      if (missions.stage >= m.waypoints.length) missions.complete();
      else hud.toast(`Stop ${missions.stage + 1} of ${m.waypoints.length}`);
    }
  }
  // Any mission: wandering too far on foot from a required vehicle is fine;
  // death fails the mission (handled in damage code).
}

// ---------- damage / death ----------
function damagePlayer(amount) {
  if (player.dead || state.screen !== 'play') return;
  player.health -= amount;
  audio.hurt();
  if (player.health <= 0) {
    player.dead = true;
    if (missions.active) missions.fail('You were wasted.');
    setTimeout(() => {
      exitVehicle();
      player.pos.set(blockCoord(4), 0.3, blockCoord(4));
      player.health = 100; player.dead = false;
      state.cash = Math.max(0, state.cash - 200);
      state.wanted = 0; clearPolice();
      hud.toast('Solmar General patched you up. -$200');
      saveGame();
    }, 600);
  }
}

// ---------- camera ----------
function updateCamera(dt) {
  if (state.screen === 'shot') return;
  let target, look;
  if (player.mode === 'car' && player.vehicle) {
    const v = player.vehicle;
    const back = 10.5, up = 4.6;
    target = new THREE.Vector3(
      v.pos.x - Math.sin(v.heading) * back, up, v.pos.z - Math.cos(v.heading) * back);
    look = new THREE.Vector3(v.pos.x + Math.sin(v.heading) * 8, 1.4, v.pos.z + Math.cos(v.heading) * 8);
    state.camYaw = v.heading + Math.PI;
  } else if (player.mode === 'boat') {
    const back = 11, up = 5;
    target = new THREE.Vector3(
      boat.pos.x - Math.sin(boat.heading) * back, up, boat.pos.z - Math.cos(boat.heading) * back);
    look = new THREE.Vector3(boat.pos.x + Math.sin(boat.heading) * 8, 1.2, boat.pos.z + Math.cos(boat.heading) * 8);
    state.camYaw = boat.heading + Math.PI;
  } else {
    const dist = 8.5;
    const cx = player.pos.x - Math.sin(state.camYaw) * Math.cos(state.camPitch) * dist;
    const cz = player.pos.z - Math.cos(state.camYaw) * Math.cos(state.camPitch) * dist;
    const cy = 1.6 + Math.sin(state.camPitch) * dist;
    target = new THREE.Vector3(cx, cy, cz);
    look = player.pos.clone(); look.y = 1.5;
  }
  const k = state.screen === 'title' ? 1 : 1 - Math.pow(0.0001, dt);
  camera.position.lerp(target, Math.min(1, k));
  camera.lookAt(look);
}

// ---------- title flow ----------
hud.onNew = () => {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  missions.completed = []; missions.index = 0; state.cash = 250;
  player.pos.set(-224, 0.3, -196);
  startPlay();
};
hud.onContinue = () => { applySave(loadSave()); startPlay(); };
function startPlay() {
  state.screen = 'play';
  hud.showGame();
  audio.unlock();
  hud.banner('SOLMAR BAY', 'Find Mara\'s gold markers to take jobs.');
}
if (!shotName) hud.showTitle(!!loadSave());

// ---------- shot mode ----------
const shotCtx = {
  player, boat, traffic, missions, camera,
  hudState,
  enterCar: (car, silent) => enterCar(car, silent),
  enterBoat: (silent) => enterBoat(silent),
  setWanted: (n) => { state.wanted = n; },
  spawnPolice: (n) => spawnPolice(n),
  policeCars,
  setTimeOfDay,
};
if (shotName) {
  hud.showGame();
  poseShot(shotName, shotCtx);
  // Pose the world once so every mesh is in place, then render a few frames.
  for (const c of traffic) { c.mesh.position.copy(c.pos); c.mesh.rotation.y = c.heading; }
  for (const c of policeCars) { c.mesh.position.copy(c.pos); c.mesh.rotation.y = c.heading; }
  boat.mesh.position.copy(boat.pos); boat.mesh.rotation.y = boat.heading;
}

// ---------- main loop ----------
const clockT = new THREE.Clock();
let frames = 0;
function frame() {
  requestAnimationFrame(frame);
  // Shot mode: pose and paint a handful of frames, then freeze the composed
  // frame (repainting only rarely) so headless capture stays fast.
  if (state.screen === 'shot' && frames > 12) {
    if (frames % 240 === 0) renderer.render(scene, camera);
    frames++;
    return;
  }
  const dt = Math.min(0.05, clockT.getDelta());
  if (state.screen === 'pause') { renderer.render(scene, camera); return; }
  state.elapsed += dt;
  // Day-night: a full cycle every 4 minutes of play.
  if (state.screen === 'play') setTimeOfDay(state.timeOfDay + dt / 240);
  city.seaMat.color.offsetHSL(0, 0, Math.sin(state.elapsed * 0.7) * 0.0006);

  if (state.screen === 'play' || state.screen === 'shot') {
    const danger = (state.elapsed - lastShot.time < 3) ? { pos: lastShot.pos } : null;
    for (const p of peds) updatePedestrian(p, dt, danger);
    for (const c of traffic) {
      if (c === state.missionCar && missions.active && missions.stage === 0) { c.mesh.position.copy(c.pos); continue; }
      updateTrafficCar(c, dt, traffic, rng);
      // Running over a pedestrian is a crime.
      if (player.mode === 'car' && player.vehicle === c) { /* handled below */ }
    }
    if (player.mode === 'car' && player.vehicle && state.screen === 'shot') {
      // Shot mode: the posed car holds its speed and place.
      player.pos.copy(player.vehicle.pos);
    } else if (player.mode === 'car' && player.vehicle) {
      const spd = driveCar(player.vehicle, dt, driveInput(), city.collide);
      audio.setEngine(true, spd / 30);
      player.pos.copy(player.vehicle.pos);
      // Hit-and-run check.
      for (const p of peds) {
        if (!p.dead && p.pos.distanceTo(player.pos) < 2.2 && spd > 4) {
          knockDown(p); addWanted(1); hud.toast('Hit-and-run! +1 star'); audio.hit();
        }
      }
    } else if (player.mode === 'boat') {
      const spd = updateBoat(boat, dt, driveInput());
      audio.setEngine(true, spd / 19);
      player.pos.copy(boat.pos);
    } else {
      audio.setEngine(false, 0);
      updatePlayerOnFoot(player, dt, footInput(), city.collide);
      if (boat.occupied === false) updateBoat(boat, dt, null);
    }
    if (state.screen === 'play') {
      // Police.
      for (const c of policeCars) {
        if (!c.dead) updatePoliceCar(c, dt, player.pos, city.collide);
      }
      for (const o of officers) {
        if (o.isLookout) continue;
        if (!o.dead) {
          const d = updateOfficer(o, dt, player.pos);
          if (d < 8 && state.wanted > 0) {
            o.shootCd -= dt;
            if (o.shootCd <= 0) { o.shootCd = 1.1; damagePlayer(4); }
          }
        }
      }
      updateWanted(dt);
      updateMissions(dt);
      fx.update(dt);
      // Prompts.
      let prompt = '';
      if (player.mode === 'foot') {
        if (nearestCar(4.5)) prompt = 'E — enter car · F — carjack';
        else if (player.pos.distanceTo(boat.pos) < 6) prompt = 'E — board the boat';
        else if (Math.abs(player.pos.x - CITY.dockX) < 8 && Math.abs(player.pos.z - CITY.dockZ) < 10) prompt = 'E — hire the boat ($0 for Mara\'s crew)';
      } else prompt = 'E — exit';
      hud.setPrompt(prompt);
      state.saveTimer += dt;
      if (state.saveTimer > 6) { state.saveTimer = 0; saveGame(); }
    }
    updateCamera(dt);
    hud.update(dt, {
      cash: state.cash, wanted: state.wanted, health: player.health,
      mode: player.mode, speed: player.vehicle ? player.vehicle.speed : boat.speed,
      shootCd: player.shootCd, clockText: hudState.clockText,
      objective: state.screen === 'shot' ? hudState.objective : hudState.objective,
    });
    hud.drawMinimap(
      { pos: player.mode === 'foot' ? player.pos : (player.vehicle ? player.vehicle.pos : boat.pos), heading: player.mode === 'foot' ? state.camYaw + Math.PI : (player.vehicle ? player.vehicle.heading : boat.heading) },
      { peds, cars: traffic, policeCars, officers, objective: missions.objectivePos() },
    );
    if (player.shootCd > 0) player.shootCd -= dt;
  }
  if (state.screen === 'title') {
    // Slow orbital backdrop behind the title.
    const t = state.elapsed * 0.05;
    camera.position.set(Math.sin(t) * 190, 85, Math.cos(t) * 190);
    camera.lookAt(0, 10, 0);
    for (const p of peds) updatePedestrian(p, dt, null);
    for (const c of traffic) updateTrafficCar(c, dt, traffic, rng);
    updateBoat(boat, dt, null);
  }
  renderer.render(scene, camera);
  frames++;
  if (state.screen === 'shot' && frames > 12) window.__shotReady = true;
}
frame();
