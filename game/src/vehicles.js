// vehicles.js — every car in Solmar Bay: the mesh factory (sedans, hatchbacks,
// taxis, vans, police interceptors and one armoured van), the arcade driving
// physics the player feels, and the traffic drivers who follow the avenues,
// keep their lane and brake for whatever is in front of them.

import * as THREE from 'three';
import { ROADS, clamp, angleLerp, angleDiff, collideCircle, rand, randRange, pick } from './util.js';

export const CAR_COLORS = [0xd64541, 0x3f7fbf, 0xf2f2f2, 0x2b2f36, 0xf5a623, 0x50b86b, 0x9b59b6, 0xe8e3d5, 0x16a3a3, 0xc0c6cc];

const KINDS = {
  sedan: { w: 1.9, l: 4.4, bodyH: 0.62, cabinL: 2.2, cabinH: 0.55, topSpeed: 36, accel: 21 },
  hatch: { w: 1.8, l: 3.8, bodyH: 0.6, cabinL: 2.3, cabinH: 0.6, topSpeed: 33, accel: 20 },
  taxi: { w: 1.9, l: 4.4, bodyH: 0.62, cabinL: 2.2, cabinH: 0.55, topSpeed: 35, accel: 21 },
  van: { w: 2.1, l: 5.2, bodyH: 1.15, cabinL: 1.4, cabinH: 0.75, topSpeed: 29, accel: 16 },
  armored: { w: 2.2, l: 5.6, bodyH: 1.3, cabinL: 1.5, cabinH: 0.8, topSpeed: 27, accel: 15 },
  police: { w: 1.95, l: 4.6, bodyH: 0.62, cabinL: 2.2, cabinH: 0.55, topSpeed: 39, accel: 24 },
};

export function createCarMesh(kind, color) {
  const spec = KINDS[kind] || KINDS.sedan;
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const glass = new THREE.MeshLambertMaterial({ color: 0x11161d });
  const trim = new THREE.MeshLambertMaterial({ color: 0x22262b });

  const body = new THREE.Mesh(new THREE.BoxGeometry(spec.w, spec.bodyH, spec.l), paint);
  body.position.y = 0.55 + spec.bodyH / 2 - 0.3;
  body.castShadow = true;
  group.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(spec.w * 0.86, spec.cabinH, spec.cabinL), glass);
  cabin.position.set(0, body.position.y + spec.bodyH / 2 + spec.cabinH / 2 - 0.05, kind === 'van' || kind === 'armored' ? -spec.l * 0.22 : -0.15);
  cabin.castShadow = true;
  group.add(cabin);

  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 10);
  const wheels = [];
  const wx = spec.w / 2 - 0.05;
  const wz = spec.l / 2 - 0.85;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const wheel = new THREE.Mesh(wheelGeo, trim);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(sx * wx, 0.36, sz * wz);
    group.add(wheel);
    wheels.push(wheel);
  }
  group.userData.wheels = wheels;
  group.userData.frontWheels = [wheels[2], wheels[3]];

  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6c9 });
  for (const sx of [-1, 1]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.06), lightMat);
    head.position.set(sx * spec.w * 0.32, 0.72, spec.l / 2 + 0.02);
    group.add(head);
    const tail = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.12, 0.06),
      new THREE.MeshBasicMaterial({ color: 0xff3b30 }),
    );
    tail.position.set(sx * spec.w * 0.32, 0.74, -spec.l / 2 - 0.02);
    group.add(tail);
  }

  if (kind === 'taxi') {
    const signMat = new THREE.MeshBasicMaterial({ color: 0xffd21f });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.3), signMat);
    sign.position.set(0, cabin.position.y + spec.cabinH / 2 + 0.13, cabin.position.z);
    group.add(sign);
  }
  if (kind === 'police') {
    const bar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.4), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    red.position.x = -0.3;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.4), new THREE.MeshBasicMaterial({ color: 0x2266ff }));
    blue.position.x = 0.3;
    bar.add(red);
    bar.add(blue);
    bar.position.set(0, cabin.position.y + spec.cabinH / 2 + 0.1, cabin.position.z);
    group.add(bar);
    group.userData.lightbar = bar;
  }
  group.userData.spec = spec;
  return group;
}

export class Vehicle {
  constructor(scene, kind, color, x, z, angle) {
    this.kind = kind;
    this.spec = KINDS[kind] || KINDS.sedan;
    this.group = createCarMesh(kind, color);
    this.group.position.set(x, 0, z);
    this.group.rotation.y = angle;
    scene.add(this.group);
    this.angle = angle;
    this.speed = 0;
    this.steer = 0;
    this.health = 100;
    this.disabled = false;
    this.parked = false;
    this.wheelSpin = 0;
    // traffic state
    this.axis = null;
    this.dir = 1;
    this.roadCoord = 0;
    this.cruise = randRange(10, 15);
    this.turnCooldown = 0;
    this.flashTimer = rand() * 0.5;
  }

  get x() {
    return this.group.position.x;
  }

  get z() {
    return this.group.position.z;
  }

  get pos() {
    return this.group.position;
  }

  forwardX() {
    return Math.sin(this.angle);
  }

  forwardZ() {
    return Math.cos(this.angle);
  }

  // Arcade step shared by the player and the AI drivers: throttle, steering
  // that bites harder at speed, drag, and a simple building collision that
  // costs speed (and health) when you hit something solid.
  drive(dt, throttle, steer, brake, colliders, onCrash) {
    const spec = this.spec;
    if (this.disabled) throttle = 0;
    if (throttle > 0) this.speed += spec.accel * throttle * dt * (1 - Math.max(0, this.speed) / (spec.topSpeed * 1.25));
    else if (throttle < 0) this.speed += spec.accel * 0.6 * throttle * dt * (1 - Math.min(0, this.speed) / 14);
    if (brake) this.speed -= Math.sign(this.speed) * 30 * dt;
    // Rolling drag is tuned so a sedan settles near 27 m/s (about 96 km/h):
    // at 0.55 the fleet cruised at barely 20 and the bay felt slow.
    this.speed -= this.speed * 0.32 * dt;
    if (Math.abs(this.speed) < 0.12 && throttle === 0) this.speed = 0;
    this.speed = clamp(this.speed, -13, spec.topSpeed);

    const steerTarget = clamp(steer, -1, 1) * 0.55 * (1 - Math.min(0.55, Math.abs(this.speed) / 90));
    this.steer += (steerTarget - this.steer) * Math.min(1, dt * 7);
    if (this.speed !== 0) {
      this.angle += this.steer * (this.speed / 2.6) * dt * (this.speed < 0 ? -1 : 1) * 0.62;
    }

    let nx = this.x + this.forwardX() * this.speed * dt;
    let nz = this.z + this.forwardZ() * this.speed * dt;
    const before = Math.abs(this.speed);
    [nx, nz] = collideCircle(nx, nz, 1.7, colliders);
    const moved = Math.hypot(nx - this.x, nz - this.z);
    if (moved < Math.abs(this.speed) * dt * 0.35 && before > 6) {
      const impact = before;
      this.health -= impact * 0.55;
      this.speed *= -0.18;
      if (onCrash) onCrash(Math.min(1, impact / 30), this);
    }
    this.group.position.x = nx;
    this.group.position.z = nz;
    this.group.rotation.y = this.angle;

    this.wheelSpin += (this.speed * dt) / 0.36;
    const wheels = this.group.userData.wheels;
    if (wheels) {
      for (const w of wheels) w.rotation.x = this.wheelSpin;
      for (const w of this.group.userData.frontWheels) w.rotation.y = this.steer * 0.9;
    }
    if (this.health <= 0 && !this.disabled) {
      this.disabled = true;
      this.health = 0;
    }
    return this.speed;
  }

  // Flash the police lightbar red/blue while the car is in service.
  updateLightbar(dt) {
    const bar = this.group.userData.lightbar;
    if (!bar) return;
    this.flashTimer += dt;
    const phase = Math.floor(this.flashTimer * 3) % 2;
    bar.children[0].material.color.setHex(phase === 0 ? 0xff2222 : 0x661111);
    bar.children[1].material.color.setHex(phase === 0 ? 0x112266 : 0x2266ff);
  }

  removeFrom(scene) {
    scene.remove(this.group);
  }
}

// --- traffic -----------------------------------------------------------------

export function spawnTrafficCar(scene, colliders) {
  const axis = rand() > 0.5 ? 'x' : 'z';
  const road = pick(ROADS);
  const dir = rand() > 0.5 ? 1 : -1;
  const along = randRange(-150, 150);
  const lane = laneOffset(axis, dir);
  const x = axis === 'x' ? along : road + lane;
  const z = axis === 'x' ? road + lane : along;
  const kind = pick(['sedan', 'sedan', 'hatch', 'taxi', 'van']);
  const color = kind === 'taxi' ? 0xffc61a : pick(CAR_COLORS);
  const car = new Vehicle(scene, kind, color, x, z, headingFor(axis, dir));
  car.axis = axis;
  car.dir = dir;
  car.roadCoord = road;
  return car;
}

export function laneOffset(axis, dir) {
  if (axis === 'x') return dir > 0 ? 4.3 : -4.3;
  return dir > 0 ? -4.3 : 4.3;
}

export function headingFor(axis, dir) {
  if (axis === 'x') return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  return dir > 0 ? 0 : Math.PI;
}

// A traffic driver: hold the lane, slow for anything ahead, and sometimes
// turn at an intersection onto the crossing avenue.
export function updateTraffic(car, dt, colliders, obstacles, onCrash) {
  car.turnCooldown -= dt;
  let throttle = 0.85;
  let brake = false;

  // obstacle ahead?
  const fx = car.forwardX();
  const fz = car.forwardZ();
  for (const o of obstacles) {
    if (o === car) continue;
    const dx = o.x - car.x;
    const dz = o.z - car.z;
    const ahead = dx * fx + dz * fz;
    const side = Math.abs(dx * fz - dz * fx);
    if (ahead > 0 && ahead < 13 && side < 2.6) {
      throttle = ahead < 7 ? 0 : 0.25;
      if (ahead < 5.5) brake = true;
      break;
    }
  }

  // intersection turn
  if (car.turnCooldown <= 0) {
    const along = car.axis === 'x' ? car.x : car.z;
    for (const cross of ROADS) {
      if (Math.abs(along - cross) < 1.6 && rand() > 0.55) {
        const oldAxis = car.axis;
        car.axis = oldAxis === 'x' ? 'z' : 'x';
        car.dir = rand() > 0.5 ? 1 : -1;
        car.roadCoord = cross;
        // snap onto the new lane so the turn starts from the junction centre
        if (car.axis === 'z') car.group.position.x = cross + laneOffset('z', car.dir);
        else car.group.position.z = cross + laneOffset('x', car.dir);
        car.turnCooldown = 4;
        break;
      }
    }
  }

  const targetHeading = headingFor(car.axis, car.dir);
  const steer = clamp(angleDiff(car.angle, targetHeading) * 1.6, -1, 1);
  // pull gently back to the exact lane line
  if (car.axis === 'x') {
    const laneZ = car.roadCoord + laneOffset('x', car.dir);
    const err = laneZ - car.z;
    car.group.position.z += clamp(err, -1, 1) * dt * 2.2;
  } else {
    const laneX = car.roadCoord + laneOffset('z', car.dir);
    const err = laneX - car.x;
    car.group.position.x += clamp(err, -1, 1) * dt * 2.2;
  }
  car.angle = angleLerp(car.angle, targetHeading, Math.min(1, dt * 2.4));
  const speedRatio = Math.abs(car.speed) / car.cruise;
  if (speedRatio > 1) throttle = 0;
  car.drive(dt, throttle, steer * 0.4, brake, colliders, onCrash);
  if (Math.abs(car.speed) > car.cruise) car.speed = Math.sign(car.speed) * car.cruise;
}
