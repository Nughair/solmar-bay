// police.js — the law in Solmar Bay: the wanted level and the patrol cars
// that answer it. Crimes raise "heat"; heat becomes stars; stars decide how
// many patrol cars hunt Rico and how hard they push. Stay out of sight and
// the heat bleeds away, one star at a time.

import * as THREE from '../vendor/three.module.min.js';
import { Car, roadSpawnPoint, wrapAngle, clamp } from './cars.js';
import { collideCircle, CITY_EDGE, ROADS } from './city.js';

export class Wanted {
  constructor() {
    this.heat = 0;          // 0..5 in star units, fractional
    this.sinceSeen = 0;     // seconds since a cop last had eyes on Rico
    this.decayDelay = 9;    // unseen seconds before heat starts to fall
  }

  get stars() { return Math.floor(this.heat + 0.0001); }

  // Report a crime. severity is in stars (theft 1, assault 1, gunfire 0.6…).
  // witnessed=false crimes (nobody around) count for half.
  commit(severity, witnessed) {
    const add = witnessed ? severity : severity * 0.45;
    this.heat = clamp(this.heat + add, 0, 5);
  }

  setAtLeast(stars) {
    if (this.heat < stars) this.heat = stars;
  }

  clear() { this.heat = 0; this.sinceSeen = 0; }

  update(dt, seenByPolice) {
    if (seenByPolice) this.sinceSeen = 0;
    else this.sinceSeen += dt;
    if (this.heat > 0 && this.sinceSeen > this.decayDelay) {
      // Heat falls faster when the player is far from any patrol.
      this.heat = Math.max(0, this.heat - dt * 0.055);
    }
  }
}

// One patrol car: a Car with pursuit steering. It drives at the player's
// position, tries to ram at speed and to box Rico in when he is on foot.
class PatrolCar extends Car {
  constructor(scene, x, z) {
    super(scene, { color: 0xf4f6f8, kind: 'sedan' }, x, z, 0, { police: true });
    this.stuckTimer = 0;
    this.lastX = x;
    this.lastZ = z;
  }

  pursue(dt, target, city) {
    const dx = target.x - this.x;
    const dz = target.z - this.z;
    const dist = Math.hypot(dx, dz);
    const desired = Math.atan2(dx, dz);
    const dh = wrapAngle(desired - this.heading);
    // Car.drive turns the heading down for a positive steer, hence the sign.
    const steer = clamp(-dh * 1.9, -1, 1);
    // Full throttle while far; ease off when alongside so it sits on Rico.
    let throttle = 1;
    if (dist < 6) throttle = 0.35;
    if (Math.abs(dh) > 2.4) throttle = -0.7;  // badly turned around: reverse out
    const top = dist > 40 ? 34 : 26;
    const res = this.drive(dt, { throttle, steer, brake: false }, city, top);
    // Stuck detection: barely moved while trying — back up and swing round.
    this.stuckTimer += dt;
    if (this.stuckTimer > 1.4) {
      const moved = Math.hypot(this.x - this.lastX, this.z - this.lastZ);
      if (moved < 1.2 && Math.abs(this.speed) < 3) {
        this.speed = -7;
        this.heading += 0.7;
      }
      this.lastX = this.x;
      this.lastZ = this.z;
      this.stuckTimer = 0;
    }
    return res;
  }
}

export class PoliceForce {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.cars = [];
    this.spawnCooldown = 0;
    this.seen = false;      // did any patrol see Rico this frame?
  }

  desiredCount(stars) {
    return stars <= 0 ? 0 : Math.min(2 + stars, 6);
  }

  // A spawn point on the same road the target is using, 44–58 units ahead
  // of or behind them: patrols join the hunt on the street where it is
  // happening instead of wandering in from across the map.
  spawnNear(target) {
    const snap = (v) => ROADS.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a), ROADS[0]);
    const alongZ = Math.abs(snap(target.x) - target.x) <= Math.abs(snap(target.z) - target.z);
    const dist = 44 + Math.random() * 14;
    const lane = (Math.random() > 0.5 ? 1 : -1) * 3.2;
    let sign = Math.random() > 0.5 ? 1 : -1;
    const lim = CITY_EDGE + 8;
    if (alongZ) {
      let z = target.z + sign * dist;
      if (z > lim || z < -lim) { sign = -sign; z = target.z + sign * dist; }
      return { x: snap(target.x) + lane, z };
    }
    let x = target.x + sign * dist;
    if (x > lim || x < -lim) { sign = -sign; x = target.x + sign * dist; }
    return { x, z: snap(target.z) + lane };
  }

  update(dt, wanted, target) {
    this.seen = false;
    this.spawnCooldown -= dt;
    const want = this.desiredCount(wanted.stars);
    // Spawn reinforcements on roads a fair distance away, out of sight.
    if (this.cars.length < want && this.spawnCooldown <= 0) {
      const p = this.spawnNear(target);
      const car = new PatrolCar(this.scene, p.x, p.z);
      car.heading = Math.atan2(target.x - p.x, target.z - p.z);
      car.bestDist = Infinity;
      car.progressTimer = 0;
      this.cars.push(car);
      this.spawnCooldown = 1.6;
    }
    // Despawn: surplus cars, and any car hopelessly far away once calm.
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const car = this.cars[i];
      const d = Math.hypot(car.x - target.x, car.z - target.z);
      if (i >= want || (wanted.stars === 0 && d > 55) || d > 220) {
        this.scene.remove(car.mesh);
        this.cars.splice(i, 1);
      }
    }
    // Drive the hunt.
    for (const car of this.cars) {
      const d = Math.hypot(car.x - target.x, car.z - target.z);
      if (d < 46) this.seen = true;
      if (wanted.stars > 0) {
        // A patrol that cannot close the gap (wedged on a building corner,
        // say) is quietly re-deployed on a road nearer the hunt, the way a
        // real cordon re-forms — the chase never dies in a side street.
        if (car.bestDist === undefined) { car.bestDist = d; car.progressTimer = 0; }
        if (d < car.bestDist - 2) { car.bestDist = d; car.progressTimer = 0; }
        else car.progressTimer += dt;
        if (car.progressTimer > 4.5 && d > 35) {
          const p = this.spawnNear(target);
          car.x = p.x;
          car.z = p.z;
          car.speed = 6;
          car.heading = Math.atan2(target.x - p.x, target.z - p.z);
          car.bestDist = Math.hypot(car.x - target.x, car.z - target.z);
          car.progressTimer = 0;
          car.syncMesh(0);
        }
        car.pursue(dt, target, this.city);
      } else {
        // No heat: patrols just cruise off — despawn check handles removal.
        car.drive(dt, { throttle: 0.4, steer: 0, brake: false }, this.city, 12);
      }
    }
    return this.seen;
  }

  // The closest patrol distance to a point — drives the bust meter.
  nearestDist(x, z) {
    let best = Infinity;
    for (const car of this.cars) best = Math.min(best, Math.hypot(car.x - x, car.z - z));
    return best;
  }

  allCars() { return this.cars; }
}
