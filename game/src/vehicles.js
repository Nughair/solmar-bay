// vehicles.js — car factory, traffic AI driving the road grid, player driving
// and police pursuit cars. Cars follow road centre lines, turn at intersections
// and brake for the car ahead.
import * as THREE from 'three';
import { CITY, CAR_COLORS, roadCoord } from './config.js';
import { pick, randRange } from './rng.js';

const mat = (color, opts) => new THREE.MeshLambertMaterial(Object.assign({ color }, opts || {}));

export function buildCarMesh(color, isPolice) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.65, 4.4), mat(color));
  body.position.y = 0.62; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.2), mat(isPolice ? 0xf2f2f2 : 0x22303c));
  cabin.position.set(0, 1.2, -0.2); g.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  const wheelMat = mat(0x14161a);
  const wheels = [];
  [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]].forEach(([x, z]) => {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2; w.position.set(x, 0.38, z); g.add(w); wheels.push(w);
  });
  const lightGeo = new THREE.BoxGeometry(0.4, 0.18, 0.1);
  const hl = new THREE.Mesh(lightGeo, mat(0xfff6c9, { emissive: 0x444422 }));
  hl.position.set(-0.6, 0.7, 2.22); g.add(hl);
  const hr = hl.clone(); hr.position.x = 0.6; g.add(hr);
  if (isPolice) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.22, 0.5), mat(0x2244cc, { emissive: 0x112266 }));
    bar.position.set(0, 1.58, -0.2); g.add(bar);
    g.userData.lightBar = bar;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.2, 4.42), mat(0x2244cc));
    stripe.position.y = 0.62; g.add(stripe);
  }
  g.userData.wheels = wheels;
  return g;
}

function makeCar(rng, isPolice) {
  return {
    mesh: null, isPolice: !!isPolice,
    pos: new THREE.Vector3(), heading: 0, speed: 0,
    // traffic route state
    axis: 'x', dir: 1, lane: 0, targetSpeed: randRange(rng, 11, 17),
    occupied: false, dead: false, health: 100,
    flash: 0,
  };
}

// Lane target for travelling in direction (dx,dz) through intersection (ix,iz):
// right-hand traffic means the lane is offset to the right of the direction.
function lanePoint(ix, iz, dx, dz) {
  return { x: ix + dz * 3.6, z: iz - dx * 3.6 };
}

function pickNextLeg(car, rng) {
  // Choose a neighbouring intersection and drive the leg toward it.
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let options = dirs.filter(([dx, dz]) => {
    const nx = car.gridI + dx, nz = car.gridJ + dz;
    return nx >= 0 && nx <= CITY.blocks && nz >= 0 && nz <= CITY.blocks &&
      !(dx === -car.legDx && dz === -car.legDz);
  });
  if (!options.length) options = dirs.filter(([dx, dz]) => {
    const nx = car.gridI + dx, nz = car.gridJ + dz;
    return nx >= 0 && nx <= CITY.blocks && nz >= 0 && nz <= CITY.blocks;
  });
  const [dx, dz] = options[Math.floor(rng() * options.length)];
  car.legDx = dx; car.legDz = dz;
  car.gridI += dx; car.gridJ += dz;
  const p = lanePoint(roadCoord(car.gridI), roadCoord(car.gridJ), dx, dz);
  car.tx = p.x; car.tz = p.z;
}

function placeOnRoad(car, rng) {
  car.gridI = Math.floor(rng() * 10);
  car.gridJ = Math.floor(rng() * 10);
  car.legDx = 0; car.legDz = 0;
  car.pos.set(roadCoord(car.gridI), 0, roadCoord(car.gridJ));
  pickNextLeg(car, rng);
  car.heading = Math.atan2(car.legDx, car.legDz);
  // Start part-way along the leg so traffic is spread out.
  car.pos.x += car.legDx * randRange(rng, 0, 30);
  car.pos.z += car.legDz * randRange(rng, 0, 30);
}

export function createTraffic(scene, rng, count) {
  const cars = [];
  for (let i = 0; i < count; i++) {
    const car = makeCar(rng, false);
    car.mesh = buildCarMesh(pick(rng, CAR_COLORS), false);
    placeOnRoad(car, rng);
    scene.add(car.mesh);
    cars.push(car);
  }
  return cars;
}

export function createPoliceCar(scene) {
  const car = makeCar(Math.random, true);
  car.mesh = buildCarMesh(0xf4f4f6, true);
  car.targetSpeed = 24;
  scene.add(car.mesh);
  return car;
}

const FWD = new THREE.Vector3();
export function carForward(car) {
  FWD.set(Math.sin(car.heading), 0, Math.cos(car.heading));
  return FWD;
}

function syncMesh(car, dt) {
  car.mesh.position.copy(car.pos);
  car.mesh.rotation.y = car.heading;
  const spin = car.speed * dt * 2.4;
  for (const w of car.mesh.userData.wheels) w.rotation.x += spin;
  if (car.mesh.userData.lightBar) {
    car.flash += dt * 9;
    car.mesh.userData.lightBar.material.emissive.setHex(Math.sin(car.flash) > 0 ? 0xcc2222 : 0x2244cc);
  }
}

// Traffic update: waypoint driving. Steer toward the current lane target at
// the next intersection; on arrival pick the next leg (never a U-turn unless
// boxed in). Brake when another car is close ahead.
export function updateTrafficCar(car, dt, allCars, rng) {
  if (car.dead || car.occupied) { syncMesh(car, dt); return; }
  if (car.tx === undefined) placeOnRoad(car, rng);
  const dx = car.tx - car.pos.x, dz = car.tz - car.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 4) pickNextLeg(car, rng);
  const wantHeading = Math.atan2(dx, dz);
  let diff = wantHeading - car.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  car.heading += Math.max(-2.6 * dt, Math.min(2.6 * dt, diff * 3 * dt));
  let want = car.targetSpeed * (1 - Math.min(0.55, Math.abs(diff) * 0.5));
  const fwd = carForward(car);
  for (const other of allCars) {
    if (other === car || other.dead) continue;
    const ox = other.pos.x - car.pos.x, oz = other.pos.z - car.pos.z;
    const ahead = ox * fwd.x + oz * fwd.z;
    const side = Math.abs(ox * fwd.z - oz * fwd.x);
    if (ahead > 0 && ahead < 11 && side < 2.4) want = Math.min(want, Math.max(0, (ahead - 6) * 1.6));
  }
  car.speed += Math.sign(want - car.speed) * Math.min(Math.abs(want - car.speed), 13 * dt);
  car.pos.addScaledVector(fwd, car.speed * dt);
  car.pos.x = Math.max(-262, Math.min(262, car.pos.x));
  car.pos.z = Math.max(-262, Math.min(262, car.pos.z));
  syncMesh(car, dt);
}

// Player / police driving model: throttle, steering, simple grip.
export function driveCar(car, dt, input, collide) {
  const accel = car.isPolice ? 20 : 17;
  if (input.forward) car.speed += accel * dt;
  else if (input.back) car.speed -= (car.speed > 0.5 ? 22 : 9) * dt;
  else car.speed -= car.speed * 0.7 * dt;
  const maxF = car.isPolice ? 34 : 30, maxR = -11;
  car.speed = Math.max(maxR, Math.min(maxF, car.speed));
  if (input.brake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 30 * dt);
  const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  if (Math.abs(car.speed) > 0.4) {
    car.heading += steer * dt * 1.65 * Math.sign(car.speed) * Math.min(1, Math.abs(car.speed) / 9);
  }
  const fwd = carForward(car);
  car.pos.addScaledVector(fwd, car.speed * dt);
  car.pos.x = Math.max(-262, Math.min(CITY.beachX + 2, car.pos.x));
  car.pos.z = Math.max(-262, Math.min(262, car.pos.z));
  if (collide) {
    const before = car.pos.clone();
    if (collide(car.pos, 2.1)) { car.pos.copy(before); car.speed *= -0.25; }
  }
  syncMesh(car, dt);
  return Math.abs(car.speed);
}

// Police pursuit: steer toward the target, ram gently, stop at a distance.
export function updatePoliceCar(car, dt, targetPos, collide) {
  const dx = targetPos.x - car.pos.x, dz = targetPos.z - car.pos.z;
  const dist = Math.hypot(dx, dz);
  const wantHeading = Math.atan2(dx, dz);
  let diff = wantHeading - car.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  car.heading += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff * 2.2 * dt * 3));
  const want = dist > 9 ? 26 : dist > 4 ? 10 : 0;
  car.speed += Math.sign(want - car.speed) * Math.min(Math.abs(want - car.speed), 16 * dt);
  const fwd = carForward(car);
  car.pos.addScaledVector(fwd, car.speed * dt);
  if (collide) {
    const before = car.pos.clone();
    if (collide(car.pos, 2.1)) { car.pos.copy(before); car.speed *= -0.3; }
  }
  syncMesh(car, dt);
}
