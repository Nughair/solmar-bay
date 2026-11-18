// Cars: low-poly builds with turning front wheels and light bars, one arcade physics
// step shared by the player and every AI driver, and a traffic system that drives
// the street-node grid — cruising, turning at junctions, braking for the car ahead.

import * as THREE from 'three';
import { STREET_LINES, collideCircle } from './world.js';
import { makeRng, range, pick, chance } from './rng.js';

const CAR_COLORS = [0xe8452c, 0x2c7de8, 0xf2b134, 0x37b268, 0xe8e4da, 0x8a5fc0, 0xef7fb0, 0x3fb6c9, 0xd96c2c];

/** A car body from boxes: hull, cabin, wheels, lights; police get a light bar. */
export function createCarMesh(kind, colorHex) {
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: colorHex });
  const glass = new THREE.MeshLambertMaterial({ color: 0x18242e });
  const sport = kind === 'sport';
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, sport ? 0.5 : 0.62, sport ? 4.4 : 4.1), paint);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.5, sport ? 1.9 : 2.1), glass);
  cabin.position.set(0, 1.05, sport ? -0.2 : 0.1);
  group.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14181c });
  const wheels = [];
  const wheelPos = [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]];
  for (const [wx, wz] of wheelPos) {
    const pivot = new THREE.Group();
    pivot.position.set(wx, 0.36, wz);
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    pivot.add(wheel);
    group.add(pivot);
    wheels.push(pivot);
  }
  const headMat = new THREE.MeshLambertMaterial({ color: 0xfff6c8, emissive: 0xffedb5, emissiveIntensity: 0.4 });
  for (const hx of [-0.62, 0.62]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.06), headMat);
    head.position.set(hx, 0.62, 2.06);
    group.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.06), new THREE.MeshLambertMaterial({ color: 0xb02020, emissive: 0x901010, emissiveIntensity: 0.5 }));
    tail.position.set(hx, 0.64, -2.06);
    group.add(tail);
  }
  if (kind === 'police') {
    const bar = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.12, 0.5), new THREE.MeshLambertMaterial({ color: 0x222222 }));
    bar.add(base);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.16, 0.44), new THREE.MeshLambertMaterial({ color: 0xff2a2a, emissive: 0xff2a2a, emissiveIntensity: 1.4 }));
    red.position.x = -0.33;
    bar.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.16, 0.44), new THREE.MeshLambertMaterial({ color: 0x2a5aff, emissive: 0x2a5aff, emissiveIntensity: 1.4 }));
    blue.position.x = 0.33;
    bar.add(blue);
    bar.position.set(0, 1.42, 0.1);
    group.add(bar);
    group.userData.lightbar = bar;
  }
  if (kind === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.22, 0.4), new THREE.MeshLambertMaterial({ color: 0xffd75e, emissive: 0xaa7d10, emissiveIntensity: 0.4 }));
    sign.position.set(0, 1.42, 0.1);
    group.add(sign);
  }
  group.userData.wheels = wheels;
  return group;
}

/** One vehicle in the world, whoever is driving it. */
export class Car {
  constructor(kind, colorHex, x, z, heading) {
    this.kind = kind;
    this.mesh = createCarMesh(kind, colorHex);
    this.mesh.position.set(x, 0, z);
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.health = 100;
    this.radius = 2.15;
    this.dead = false;
    this.wheelSpin = 0;
    // Traffic state.
    this.nodeIx = 0;
    this.nodeIz = 0;
    this.fromIx = 0;
    this.fromIz = 0;
    this.cruise = 12;
    this.parked = false;
  }

  get pos() {
    return this.mesh.position;
  }

  forward() {
    return { x: Math.sin(this.heading), z: Math.cos(this.heading) };
  }
}

/**
 * One physics step for any driven car. controls: {throttle -1..1, steer -1..1, brake}.
 * Returns the impact strength of any building hit this step (0 = none).
 */
export function stepVehicle(car, controls, dt, world) {
  const sport = car.kind === 'sport';
  const maxSpeed = sport ? 41 : 33;
  const accel = sport ? 17 : 13.5;
  if (car.dead) controls = { throttle: 0, steer: 0, brake: true };
  if (controls.throttle > 0) car.speed += accel * controls.throttle * dt * (1 - Math.max(0, car.speed) / (maxSpeed + 12));
  else if (controls.throttle < 0) {
    if (car.speed > 0.6) car.speed -= 26 * dt;
    else car.speed = Math.max(-10, car.speed - 8 * dt);
  }
  if (controls.brake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 30 * dt);
  car.speed -= car.speed * 0.55 * dt; // rolling drag
  if (Math.abs(car.speed) < 0.04 && controls.throttle === 0) car.speed = 0;

  const steerTarget = controls.steer * 0.55;
  car.steer += (steerTarget - car.steer) * Math.min(1, dt * 7);
  const grip = Math.min(1, Math.abs(car.speed) / 6 + 0.25);
  // steer > 0 turns toward a larger heading (the driver's left); callers map keys so.
  car.heading += car.steer * grip * (car.speed / 4.4) * dt;

  const f = car.forward();
  car.pos.x += f.x * car.speed * dt;
  car.pos.z += f.z * car.speed * dt;

  // Two collision circles, nose and tail, keep long cars honest in corners.
  let impact = 0;
  for (const off of [1.35, -1.35]) {
    const probe = { x: car.pos.x + f.x * off, z: car.pos.z + f.z * off };
    const px = probe.x;
    const pz = probe.z;
    collideCircle(world.colliders, probe, 1.25);
    const moved = Math.hypot(probe.x - px, probe.z - pz);
    if (moved > 0.01) {
      car.pos.x += probe.x - px;
      car.pos.z += probe.z - pz;
      impact = Math.max(impact, Math.abs(car.speed) * moved * 3.2);
    }
  }
  if (impact > 0) {
    car.speed *= 0.42;
    car.health -= impact * 1.15;
    if (car.health <= 0) {
      car.health = 0;
      car.dead = true;
    }
  }
  // Keep cars in the world and out of the sea (the promenade is the last road).
  car.pos.x = Math.max(-305, Math.min(305, car.pos.x));
  if (car.pos.z > 292) {
    car.pos.z = 292;
    car.speed *= 0.5;
  }
  car.pos.z = Math.max(-302, car.pos.z);

  car.mesh.position.y = 0;
  car.mesh.rotation.y = car.heading;
  car.wheelSpin += (car.speed * dt) / 0.36;
  const wheels = car.mesh.userData.wheels;
  wheels.forEach((wheel, i) => {
    wheel.rotation.x = car.wheelSpin;
    if (i < 2) wheel.rotation.y = car.steer * 0.9;
  });
  return impact;
}

/** Pairwise car-to-car bumps across a set; onCrash(a, b, strength) hears the hard ones. */
export function collideCarSet(cars, onCrash) {
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      const dx = b.pos.x - a.pos.x;
      const dz = b.pos.z - a.pos.z;
      const dist = Math.hypot(dx, dz);
      const min = a.radius + b.radius;
      if (dist === 0 || dist >= min) continue;
      const nx = dx / dist;
      const nz = dz / dist;
      const push = (min - dist) / 2;
      if (!a.parked) { a.pos.x -= nx * push; a.pos.z -= nz * push; }
      if (!b.parked) { b.pos.x += nx * push; b.pos.z += nz * push; }
      const rel = Math.abs(a.speed - b.speed) + Math.abs(a.speed) * 0.3;
      if (rel > 4) {
        a.health -= rel * 0.8;
        b.health -= rel * 0.8;
        if (a.health <= 0) { a.health = 0; a.dead = true; }
        if (b.health <= 0) { b.health = 0; b.dead = true; }
        a.speed *= 0.6;
        b.speed *= 0.6;
        if (onCrash) onCrash(a, b, rel);
      }
    }
  }
}

/** The cruising traffic of Solmar Bay plus its parked, stealable cars. */
export class TrafficSystem {
  constructor(scene, world, seed = 4242) {
    this.world = world;
    this.rng = makeRng(seed);
    this.cars = [];
    const rng = this.rng;
    // Cruising traffic on the node grid.
    for (let i = 0; i < 15; i += 1) {
      const ix = Math.floor(range(rng, 0, 10));
      const iz = Math.floor(range(rng, 0, 10));
      const kind = chance(rng, 0.16) ? 'taxi' : chance(rng, 0.14) ? 'sport' : 'car';
      const car = new Car(kind, kind === 'taxi' ? 0xf2b134 : pick(rng, CAR_COLORS), STREET_LINES[ix], STREET_LINES[iz], 0);
      car.nodeIx = ix;
      car.nodeIz = iz;
      car.fromIx = ix;
      car.fromIz = iz;
      car.cruise = range(rng, 10, 15.5);
      this.pickNextNode(car, true);
      scene.add(car.mesh);
      this.cars.push(car);
    }
    // Parked cars on plazas, by the garage and along the promenade.
    const parkedSpots = [
      [-240, 285, 0.4], [-228, 285, -0.3], [60, 285, 0.2], [122, 285, -0.2], [-60, -285, 1.2],
      [180, -285, 2.4], [-115, 322, 1.57], [-131, 322, 1.57], [24, 24, 0], [-24, -36, 1.57],
      [84, -24, 3.14], [-84, 36, 0], [144, 84, 1.57], [-144, -84, 3.14],
    ];
    for (const [x, z, h] of parkedSpots) {
      const kind = chance(rng, 0.2) ? 'sport' : 'car';
      const car = new Car(kind, pick(rng, CAR_COLORS), x, z, h);
      car.parked = true;
      scene.add(car.mesh);
      this.cars.push(car);
    }
    this.drivenCar = null; // the car the player is driving, if any (still simulated for wheels)
  }

  /** Choose the next intersection a traffic car heads for (never straight back). */
  pickNextNode(car, first = false) {
    const options = [];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dz] of dirs) {
      const nx = car.nodeIx + dx;
      const nz = car.nodeIz + dz;
      if (nx < 0 || nx > 9 || nz < 0 || nz > 9) continue;
      if (!first && nx === car.fromIx && nz === car.fromIz) continue;
      options.push([nx, nz]);
    }
    const [nx, nz] = options[Math.floor(this.rng() * options.length)];
    car.fromIx = car.nodeIx;
    car.fromIz = car.nodeIz;
    car.nodeIx = nx;
    car.nodeIz = nz;
  }

  /** The point a traffic car steers for: its next node, offset into the right-hand lane. */
  laneTarget(car) {
    const tx = STREET_LINES[car.nodeIx];
    const tz = STREET_LINES[car.nodeIz];
    const dx = tx - car.pos.x;
    const dz = tz - car.pos.z;
    const len = Math.hypot(dx, dz) || 1;
    const fx = dx / len;
    const fz = dz / len;
    return { x: tx + -fz * 3.4, z: tz + fx * 3.4, fx, fz };
  }

  update(dt, playerPos) {
    const events = [];
    for (const car of this.cars) {
      if (car.parked || car === this.drivenCar) continue;
      const target = this.laneTarget(car);
      const dx = target.x - car.pos.x;
      const dz = target.z - car.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 5) {
        this.pickNextNode(car);
        continue;
      }
      const desired = Math.atan2(dx, dz);
      let diff = desired - car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const steer = Math.max(-1, Math.min(1, diff * 1.7));
      // Brake for a car ahead.
      let throttle = 0.85;
      const f = car.forward();
      for (const other of this.cars) {
        if (other === car) continue;
        const ox = other.pos.x - car.pos.x;
        const oz = other.pos.z - car.pos.z;
        const ahead = ox * f.x + oz * f.z;
        const side = Math.abs(ox * f.z - oz * f.x);
        if (ahead > 0 && ahead < 10 && side < 2.4) {
          throttle = ahead < 5 ? -0.4 : 0.1;
          break;
        }
      }
      if (Math.abs(diff) > 0.9) throttle = Math.min(throttle, 0.25);
      const want = car.cruise * (Math.abs(diff) > 0.5 ? 0.55 : 1);
      if (car.speed > want) throttle = Math.min(throttle, 0);
      const impact = stepVehicle(car, { throttle, steer, brake: throttle < -0.2 }, dt, this.world);
      if (impact > 3) events.push({ type: 'crash', car, strength: impact });
      // A wrecked traffic car stops being traffic.
      if (car.dead) car.parked = true;
      void playerPos;
    }
    return events;
  }
}
