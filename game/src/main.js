// main.js — Solmar Bay: an original open-world crime game.
// Rico Vale, a wheelman new in town, works five jobs for fixer Marina Sol:
// steal cars, run checkpoints, shake the police, win a dockside shootout and
// pull one big score. This file wires the modules together: the renderer and
// light, input, combat, the wanted/police loop, saving, the HUD and the
// game states (title, playing, paused, busted, wasted, story complete).

import * as THREE from '../vendor/three.module.min.js';
import { City, districtName } from './city.js';
import { Car, Traffic, randomCarSpec, roadSpawnPoint } from './cars.js';
import { Crowd } from './people.js';
import { Player, FollowCamera } from './player.js';
import { Wanted, PoliceForce } from './police.js';
import { Missions, CLINIC } from './missions.js';
import { Hud } from './hud.js';
import { SoundBank } from './audio.js';

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87c5e8);
scene.fog = new THREE.Fog(0xa8d4ee, 150, 420);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
camera.position.set(3, 4, 105);

const sun = new THREE.DirectionalLight(0xfff2d8, 2.6);
sun.position.set(90, 130, 60);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -190;
sun.shadow.camera.right = 190;
sun.shadow.camera.top = 190;
sun.shadow.camera.bottom = -190;
sun.shadow.camera.far = 420;
scene.add(sun);
scene.add(sun.target);
scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x8a7a5a, 0.95));

// ------------------------------------------------------------------- world
const city = new City(scene);
const hud = new Hud();
const sound = new SoundBank();
const player = new Player(scene);
const crowd = new Crowd(scene, 22);
const traffic = new Traffic(scene, city, 13);
const wanted = new Wanted();
const police = new PoliceForce(scene, city);
const followCam = new FollowCamera(camera);

// Parked cars dotted around the city, waiting to be borrowed.
const parkedCars = [];
for (let i = 0; i < 11; i++) {
  const p = roadSpawnPoint(25, player.x, player.z);
  const spec = randomCarSpec();
  const car = new Car(scene, spec, p.x, p.z, p.vertical ? 0 : Math.PI / 2, { parked: true });
  parkedCars.push(car);
}

// All cars that exist, for collisions, the minimap and mission spawns.
function allCars() {
  const list = [...traffic.cars, ...parkedCars, ...police.allCars()];
  if (missionCar && !list.includes(missionCar)) list.push(missionCar);
  return list;
}
let missionCar = null;

// ------------------------------------------------------------------- state
const S = {
  mode: 'title',           // title | playing | paused | ended
  cash: 0,
  playerCar: null,
  bustMeter: 0,
  shootCooldown: 0,
  saveTimer: 0,
  started: false,
  hideoutActive: false,
};
window.__solmar = S; // handy for the scripted smoke test

const keys = {};
let pointerLocked = false;

const game = {
  scene,
  sound,
  wanted,
  player,
  get playerCar() { return S.playerCar; },
  get hideoutActive() { return S.hideoutActive; },
  set hideoutActive(v) { S.hideoutActive = v; },
  playerPos() {
    if (S.playerCar) return { x: S.playerCar.x, z: S.playerCar.z };
    return { x: player.x, z: player.z };
  },
  addCash(n) { S.cash += n; hud.setCash(S.cash); },
  objective(title, text, marker) {
    hud.setObjective(title, text, '');
    missions.marker = marker || null;
  },
  objectiveDist(text) { hud.el.objectivedist.textContent = text; },
  toast(text) { hud.toast(text); },
  banner(title, sub) { hud.banner(title, sub); },
  spawnMissionCar(spec, x, z, heading) {
    missionCar = new Car(scene, spec, x, z, heading, { parked: true });
    missionCar.missionTarget = true;
    return missionCar;
  },
  exitCar(silent) { exitCar(silent); },
  enemyShot(shooter, hit) { enemyShot(shooter, hit); },
  onStoryComplete() {
    hud.el.completescreen.classList.remove('hidden');
    S.mode = 'ended';
  },
  saveGame() { saveGame(); },
};
const missions = new Missions(game);

// Objective marker beacon: a column of gold light at the target.
const beacon = new THREE.Mesh(
  new THREE.CylinderGeometry(2.6, 2.6, 30, 18, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xffd94d, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false })
);
beacon.visible = false;
scene.add(beacon);

// ------------------------------------------------------------------- input
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  sound.unlock();
  if (e.code === 'KeyE' && S.mode === 'playing') toggleCar();
  if ((e.code === 'KeyP' || e.code === 'Escape') && (S.mode === 'playing' || S.mode === 'paused')) togglePause();
  if (e.code === 'KeyF' && S.mode === 'playing' && !S.playerCar) tryShoot();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
canvas.addEventListener('click', () => {
  sound.unlock();
  if (S.mode === 'playing' && !S.playerCar) {
    if (!pointerLocked) canvas.requestPointerLock();
    else tryShoot();
  } else if (S.mode === 'playing' && S.playerCar && !pointerLocked) {
    canvas.requestPointerLock();
  }
});
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === canvas;
});
window.addEventListener('mousemove', (e) => {
  if (pointerLocked && S.mode === 'playing') followCam.addLook(e.movementX, e.movementY);
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ------------------------------------------------------------- car in / out
function nearestCar(maxDist) {
  let best = null, bestD = maxDist;
  for (const car of allCars()) {
    if (car.isPolice || car.wrecked) continue;
    const d = Math.hypot(car.x - player.x, car.z - player.z);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

function toggleCar() {
  if (S.playerCar) exitCar(false);
  else {
    const car = nearestCar(3.6);
    if (car) enterCar(car);
  }
}

function enterCar(car) {
  S.playerCar = car;
  car.isParked = false;
  car.occupied = true;
  player.setVisible(false);
  sound.door();
  // Stealing is a crime when someone sees it.
  const idx = parkedCars.indexOf(car);
  const wasParked = idx >= 0 || car.missionTarget;
  if (wasParked) {
    const witnessed = crowd.anyWitness(car.x, car.z, 26) || police.nearestDist(car.x, car.z) < 40;
    if (witnessed) {
      wanted.commit(1, true);
      hud.toast('Witnessed! The theft was seen — the law is coming.');
    } else {
      wanted.commit(1, false);
    }
  }
  missions.onEnterCar(car);
}

function exitCar(silent) {
  const car = S.playerCar;
  if (!car) return;
  S.playerCar = null;
  car.occupied = false;
  car.speed = 0;
  // Step out beside the car.
  const side = { x: Math.cos(car.heading), z: -Math.sin(car.heading) };
  player.place(car.x + side.x * 2.4, car.z + side.z * 2.4, car.heading);
  player.setVisible(true);
  if (!silent) sound.door();
  sound.engine(false, 0);
  missions.onExitCar();
}

// ------------------------------------------------------------------ combat
const tracers = [];
const muzzle = new THREE.PointLight(0xffc266, 0, 18);
scene.add(muzzle);

function spawnTracer(from, to, color) {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
  scene.add(line);
  tracers.push({ line, ttl: 0.07 });
}

function updateTracers(dt) {
  for (let i = tracers.length - 1; i >= 0; i--) {
    tracers[i].ttl -= dt;
    if (tracers[i].ttl <= 0) {
      scene.remove(tracers[i].line);
      tracers[i].line.geometry.dispose();
      tracers.splice(i, 1);
    }
  }
  if (muzzle.intensity > 0) muzzle.intensity = Math.max(0, muzzle.intensity - dt * 260);
}

function tryShoot() {
  if (S.shootCooldown > 0) { sound.dryFire(); return; }
  S.shootCooldown = 0.24;
  sound.shot();
  player.mesh.userData.aiming = true;
  setTimeout(() => { player.mesh.userData.aiming = false; }, 160);
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const origin = new THREE.Vector3(player.x, 1.5, player.z);
  muzzle.position.copy(origin).addScaledVector(dir, 1.2);
  muzzle.intensity = 60;
  S.dangerT = 1.2;
  crowd.scareAll(player.x, player.z, 17);

  // Find the closest hittable thing along the aim ray.
  let bestT = 65, bestHit = null;
  const consider = (obj, x, y, z, radius, kind) => {
    const to = new THREE.Vector3(x - origin.x, y - origin.y, z - origin.z);
    const t = to.dot(dir);
    if (t < 0.5 || t > 65) return;
    const perp = to.clone().addScaledVector(dir, -t).length();
    if (perp < radius && t < bestT) { bestT = t; bestHit = { obj, kind, point: origin.clone().addScaledVector(dir, t) }; }
  };
  for (const ped of crowd.peds) if (ped.state !== 'down') consider(ped, ped.x, 1.1, ped.z, 1.0, 'ped');
  for (const ped of missions.gunmen) if (ped.state !== 'down') consider(ped, ped.x, 1.1, ped.z, 1.0, 'gunman');
  for (const car of allCars()) consider(car, car.x, 0.8, car.z, 2.3, 'car');

  const end = bestHit ? bestHit.point : origin.clone().addScaledVector(dir, 55);
  spawnTracer(origin.clone().addScaledVector(dir, 0.8), end, 0xffe9a8);

  if (bestHit) {
    hud.hitmark();
    if (bestHit.kind === 'ped') {
      bestHit.obj.health -= 60;
      if (bestHit.obj.health <= 0) bestHit.obj.knockDown();
      else bestHit.obj.scare(player.x, player.z, 4);
      wanted.commit(1, crowd.anyWitness(player.x, player.z, 30) || police.nearestDist(player.x, player.z) < 45);
    } else if (bestHit.kind === 'gunman') {
      bestHit.obj.health -= 60;
      if (bestHit.obj.health <= 0) { bestHit.obj.knockDown(); bestHit.obj.downTimer = 99999; }
    } else if (bestHit.kind === 'car') {
      bestHit.obj.health -= 22;
      if (bestHit.obj.health <= 0) bestHit.obj.wrecked = true;
      wanted.commit(0.6, crowd.anyWitness(player.x, player.z, 30) || police.nearestDist(player.x, player.z) < 45);
    }
  } else {
    wanted.commit(0.5, crowd.anyWitness(player.x, player.z, 26) || police.nearestDist(player.x, player.z) < 45);
  }
}

function enemyShot(shooter, hit) {
  const from = new THREE.Vector3(shooter.x, 1.5, shooter.z);
  const targetPos = S.playerCar
    ? new THREE.Vector3(S.playerCar.x, 1, S.playerCar.z)
    : new THREE.Vector3(player.x, 1.3, player.z);
  spawnTracer(from, targetPos, 0xff7a5c);
  sound.shot();
  if (hit) damagePlayer(4 + Math.random() * 4);
}

// ------------------------------------------------------------------ damage
function damagePlayer(n) {
  if (S.mode !== 'playing') return;
  player.health -= n;
  hud.setHealth(player.health);
  hud.flashDamage(Math.min(1, n / 16));
  sound.hurt();
  if (player.health <= 0) endRun('wasted');
}

function endRun(kind) {
  S.mode = 'ended';
  sound.engine(false, 0);
  sound.siren(false);
  sound.missionFailed();
  const t = hud.el.endtitle;
  if (kind === 'wasted') {
    t.textContent = 'WASTED';
    t.className = 'wasted';
    hud.el.endsub.textContent = 'The clinic on the hill patches Rico up — for a price. The bay keeps what it catches.';
  } else {
    t.textContent = 'BUSTED';
    t.className = 'busted';
    hud.el.endsub.textContent = 'A night in the marina lockup and a fine. Marina will hear about this.';
  }
  hud.el.endscreen.classList.remove('hidden');
  document.exitPointerLock && document.exitPointerLock();
}

function respawn() {
  const fine = S.cash > 0 ? Math.min(S.cash, 150) : 0;
  S.cash -= fine;
  hud.setCash(S.cash);
  wanted.clear();
  S.bustMeter = 0;
  player.health = 100;
  hud.setHealth(100);
  if (S.playerCar) { S.playerCar.occupied = false; S.playerCar = null; }
  player.setVisible(true);
  player.place(CLINIC.x, CLINIC.z, Math.PI * 0.75);
  followCam.yaw = Math.PI * 0.75;
  hud.el.endscreen.classList.add('hidden');
  S.mode = 'playing';
  if (missions.active) missions.begin(missions.current);
  saveGame();
}

// -------------------------------------------------------------------- save
const SAVE_KEY = 'solmarBaySaveV3';
function saveGame() {
  if (!S.started) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: S.cash,
      mission: missions.done ? 99 : Math.max(0, missions.current),
      x: player.x, z: player.z,
    }));
  } catch (e) { /* private mode etc. — saving is best-effort */ }
}
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

// ---------------------------------------------------------------------- UI
function startGame(kind, saved) {
  hud.el.titlescreen.classList.add('hidden');
  hud.show();
  S.mode = 'playing';
  S.started = true;
  player.health = 100;
  hud.setHealth(100);
  if (kind === 'story') {
    S.cash = 0;
    player.place(3, 95, Math.PI);
    missions.startStory(0);
  } else if (kind === 'continue' && saved) {
    S.cash = saved.cash || 0;
    if (typeof saved.x === 'number') player.place(saved.x, saved.z, Math.PI);
    if (saved.mission === 99) {
      missions.done = true;
      hud.setObjective('Solmar Bay', 'Free roam — the city is yours', '');
    } else {
      missions.startStory(Math.min(saved.mission || 0, 5));
    }
  } else {
    hud.setObjective('Solmar Bay', 'Free roam — steal a car, make some noise', '');
    missions.current = -1;
  }
  hud.setCash(S.cash);
  saveGame();
}

function togglePause() {
  if (S.mode === 'playing') {
    S.mode = 'paused';
    hud.el.pausestats.textContent = 'Cash $' + S.cash.toLocaleString('en-US') +
      ' — progress saves automatically.';
    hud.el.pausescreen.classList.remove('hidden');
    document.exitPointerLock && document.exitPointerLock();
  } else if (S.mode === 'paused') {
    S.mode = 'playing';
    hud.el.pausescreen.classList.add('hidden');
  }
}

document.getElementById('startbtn').addEventListener('click', () => { sound.unlock(); startGame('story'); });
document.getElementById('freeroambtn').addEventListener('click', () => { sound.unlock(); startGame('roam'); });
document.getElementById('continuebtn').addEventListener('click', () => { sound.unlock(); startGame('continue', loadSave()); });
document.getElementById('resumebtn').addEventListener('click', togglePause);
document.getElementById('respawnbtn').addEventListener('click', respawn);
document.getElementById('keepgoingbtn').addEventListener('click', () => {
  hud.el.completescreen.classList.add('hidden');
  S.mode = 'playing';
});
document.getElementById('restartbtn').addEventListener('click', () => {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  hud.el.pausescreen.classList.add('hidden');
  wanted.clear();
  startGame('story');
});
if (loadSave()) document.getElementById('continuebtn').classList.remove('hidden');

// ------------------------------------------------------- screenshot states
const shotParam = new URLSearchParams(window.location.search).get('shot');
function applyShotMode() {
  if (!shotParam) return;
  if (shotParam === 'drive' || shotParam === 'chase') {
    startGame('roam');
    const car = parkedCars[0];
    car.x = 3; car.z = 100; car.heading = Math.PI; car.speed = 13;
    car.syncMesh(0);
    enterCar(car);
    followCam.yaw = Math.PI;
    if (shotParam === 'chase') {
      wanted.setAtLeast(4);
      hud.toast('The whole bay is after you — run!');
    }
  } else if (shotParam === 'mission') {
    startGame('story');
    player.place(96, 96, Math.PI * 0.8);
    followCam.yaw = Math.PI * 0.8;
  }
  // 'start' keeps the title screen over a live city.
}
if (shotParam) setTimeout(applyShotMode, 60);

// Exposed for the scripted smoke test only.
window.__solmarGame = {
  state: () => ({ mode: S.mode, cash: S.cash, mission: missions.current, inCar: !!S.playerCar, health: player.health, x: player.x, z: player.z, car: S.playerCar ? { x: S.playerCar.x, z: S.playerCar.z, speed: S.playerCar.speed } : null, stars: wanted.stars }),
  startStory: () => startGame('story'),
  toggleCar: () => toggleCar(),
  setKey: (code, down) => { keys[code] = down; },
  teleport: (x, z) => player.place(x, z),
  setCamYaw: (y) => { followCam.yaw = y; },
};

// -------------------------------------------------------------------- loop
const clock = new THREE.Clock();
let policeShootTimer = 0;
S.dangerT = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());
  const target = S.playerCar || player;
  const tPos = { x: target.x !== undefined ? target.x : player.x, z: target.z !== undefined ? target.z : player.z };

  if (S.mode === 'title') {
    // A slow orbit over the bay behind the title card.
    const t = performance.now() / 1000;
    camera.position.set(Math.sin(t * 0.05) * 130, 42, Math.cos(t * 0.05) * 130);
    camera.lookAt(0, 0, 20);
    traffic.update(dt, { playerCar: null, list: allCars() });
    crowd.update(dt, null);
  } else if (S.mode === 'playing') {
    S.shootCooldown = Math.max(0, S.shootCooldown - dt);
    S.dangerT = Math.max(0, S.dangerT - dt);

    // --- the player, on foot or driving
    if (S.playerCar) {
      const car = S.playerCar;
      const input = {
        throttle: (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0),
        steer: (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0),
        brake: !!keys.Space,
      };
      const res = car.drive(dt, input, city, 27);
      if (res.hit && res.impact > 11) {
        sound.crash((res.impact - 8) / 16);
        damagePlayer((res.impact - 10) * 0.55);
        crowd.scareAll(car.x, car.z, 13);
      }
      sound.engine(true, Math.abs(car.speed) / 27);
      hud.setSpeed(car.speed * 3.6, true);
      // Running someone down is the bay's loudest crime.
      for (const ped of crowd.peds) {
        if (ped.state !== 'down' && Math.abs(car.speed) > 5 &&
            Math.hypot(ped.x - car.x, ped.z - car.z) < 1.8) {
          ped.knockDown();
          wanted.commit(1, crowd.anyWitness(car.x, car.z, 30) || police.nearestDist(car.x, car.z) < 45);
          sound.crash(0.4);
          hud.toast('You hit a pedestrian!');
        }
      }
    } else {
      player.update(dt, {
        forward: !!keys.KeyW || !!keys.ArrowUp, back: !!keys.KeyS || !!keys.ArrowDown,
        left: !!keys.KeyA || !!keys.ArrowLeft, right: !!keys.KeyD || !!keys.ArrowRight,
        sprint: !!keys.ShiftLeft || !!keys.ShiftRight,
      }, followCam.yaw, city);
      sound.engine(false, 0);
      hud.setSpeed(0, false);
      // Cars can hurt Rico too.
      for (const car of allCars()) {
        if (Math.abs(car.speed) > 6 && Math.hypot(car.x - player.x, car.z - player.z) < 1.9) {
          damagePlayer(15);
          player.place(player.x + (player.x - car.x) * 0.4 + 1.5, player.z + (player.z - car.z) * 0.4);
          break;
        }
      }
    }

    // --- the living city
    const obstacleList = allCars().slice();
    if (!S.playerCar) obstacleList.push({ x: player.x, z: player.z });
    traffic.update(dt, { playerCar: S.playerCar, list: obstacleList });
    const danger = S.dangerT > 0
      ? { active: true, x: tPos.x, z: tPos.z, radius: 13 }
      : (S.playerCar && Math.abs(S.playerCar.speed) > 11 ? { active: true, x: tPos.x, z: tPos.z, radius: 9 } : null);
    crowd.update(dt, danger);

    // --- the law
    const seen = police.update(dt, wanted, { x: tPos.x, z: tPos.z });
    wanted.update(dt, seen);
    if (S.hideoutActive && Math.hypot(tPos.x + 92, tPos.z - 128) < 12) {
      wanted.heat = Math.max(0, wanted.heat - dt * 0.085);
    }
    const copDist = police.nearestDist(tPos.x, tPos.z);
    sound.siren(wanted.stars > 0 && copDist < 65);

    // Police open fire at three stars and up.
    policeShootTimer -= dt;
    if (wanted.stars >= 3 && policeShootTimer <= 0 && copDist < 27) {
      policeShootTimer = 1.5;
      const shooter = police.allCars()[0];
      if (shooter) enemyShot({ x: shooter.x, z: shooter.z }, Math.random() < 0.4);
    }

    // --- the bust meter: cornered + slow + watched = caught
    const cornered = copDist < 4.6 && wanted.stars > 0;
    const slow = S.playerCar ? Math.abs(S.playerCar.speed) < 2.5 : player.speedNow < 5.5;
    if (cornered && slow) S.bustMeter += dt * 0.45;
    else S.bustMeter = Math.max(0, S.bustMeter - dt * 0.7);
    if (S.bustMeter >= 1) { S.bustMeter = 0; endRun('busted'); }

    // --- missions, marker, HUD
    if (missions.marker) {
      hud.el.objectivedist.textContent = Math.round(Math.hypot(missions.marker.x - tPos.x, missions.marker.z - tPos.z)) + ' m';
      beacon.visible = true;
      beacon.position.set(missions.marker.x, 15, missions.marker.z);
      beacon.material.opacity = 0.22 + Math.sin(performance.now() / 300) * 0.1;
    } else {
      beacon.visible = false;
    }
    missions.update(dt);
    hud.setStars(wanted.stars);
    hud.setDistrict(districtName(tPos.x, tPos.z));
    hud.showPrompt(!S.playerCar && nearestCar(3.6) ? '<b>E</b> — Enter car' : (S.playerCar ? '<b>E</b> — Leave car' : ''));
    hud.setControls(S.playerCar
      ? '<b>W/S</b> drive &nbsp;<b>A/D</b> steer<br><b>Space</b> handbrake &nbsp;<b>E</b> leave car<br><b>P</b> pause'
      : '<b>WASD</b> move &nbsp;<b>Shift</b> sprint<br><b>Click/F</b> shoot &nbsp;<b>E</b> enter car<br><b>P</b> pause');
    hud.drawMinimap({
      playerX: tPos.x, playerZ: tPos.z,
      playerHeading: S.playerCar ? S.playerCar.heading : player.heading,
      buildings: city.buildings,
      objective: missions.marker,
      cars: allCars().map(c => ({ x: c.x, z: c.z, police: c.isPolice, mission: c.missionTarget })),
    });
    followCam.update(dt, { x: tPos.x, z: tPos.z, heading: S.playerCar ? S.playerCar.heading : player.heading }, S.playerCar ? 'car' : 'foot');

    // Keep the shadow camera centred on the action.
    sun.position.set(tPos.x + 90, 130, tPos.z + 60);
    sun.target.position.set(tPos.x, 0, tPos.z);

    S.saveTimer += dt;
    if (S.saveTimer > 6) { S.saveTimer = 0; saveGame(); }
  }
  hud.update(dt);
  updateTracers(dt);
  renderer.render(scene, camera);
}
animate();
