// The Baywatch patrol: a heat-based wanted level (one to five stars) and the units
// that answer it. Patrol cars hunt the player's street position and ram; officers
// fire from their cars at close range; at four stars a harbour patrol boat joins
// the chase on the water. Heat cools when the player stays out of trouble and out
// of sight.

import * as THREE from 'three';
import { Car, stepVehicle } from './vehicles.js';
import { Boat, stepBoat } from './boat.js';
import { STREET_LINES } from './world.js';

export const CRIMES = {
  shotFired: 9,
  carStolen: 16,
  pedHit: 26,
  pedKilled: 42,
  policeHit: 30,
  policeKilled: 60,
  carRam: 10,
  missionHeat: 55,
};

const STAR_THRESHOLDS = [1, 45, 105, 185, 285];

export class Wanted {
  constructor() {
    this.heat = 0;
    this.sinceCrime = 99;
  }

  get stars() {
    let stars = 0;
    for (const threshold of STAR_THRESHOLDS) if (this.heat >= threshold) stars += 1;
    return stars;
  }

  addCrime(points) {
    this.heat = Math.min(420, this.heat + points);
    this.sinceCrime = 0;
  }

  /** seen: a police unit currently has the player in comfortable sight. */
  update(dt, seen) {
    this.sinceCrime += dt;
    if (this.sinceCrime < 2.5) return;
    const rate = seen ? 0.55 : 2.6;
    this.heat = Math.max(0, this.heat - rate * dt);
    if (this.heat < 1) this.heat = 0;
  }

  clear() {
    this.heat = 0;
    this.sinceCrime = 99;
  }
}

/** One patrol unit — a car, or the harbour boat at high heat. */
class PoliceUnit {
  constructor(scene, kind, x, z, heading) {
    this.kind = kind;
    if (kind === 'boat') {
      this.boat = new Boat(0xf2f2f2, x, z, heading);
      this.boat.mesh.children[0].material = new THREE.MeshLambertMaterial({ color: 0x24425e });
      scene.add(this.boat.mesh);
      this.vehicle = this.boat;
    } else {
      this.car = new Car('police', 0xf4f4f4, x, z, heading);
      scene.add(this.car.mesh);
      this.vehicle = this.car;
    }
    this.fireTimer = 1 + Math.random() * 1.5;
    this.stuckTimer = 0;
    this.reversing = 0;
  }

  get pos() {
    return this.vehicle.pos;
  }

  get speed() {
    return this.vehicle.speed;
  }
}

export class PoliceSystem {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.units = [];
    this.spawnTimer = 0;
    this.boatUnit = null;
  }

  desiredUnits(stars) {
    return [0, 1, 2, 3, 4, 6][stars] || 0;
  }

  /** Place a patrol car at an exact spot (used by the screenshot scenes). */
  spawnAt(x, z, heading) {
    const unit = new PoliceUnit(this.scene, 'car', x, z, heading);
    this.units.push(unit);
    return unit;
  }

  spawnPoint(playerPos) {
    // A street junction about 110–150 m away, so sirens approach rather than pop in.
    const angle = Math.random() * Math.PI * 2;
    const dist = 115 + Math.random() * 35;
    let x = playerPos.x + Math.sin(angle) * dist;
    let z = playerPos.z + Math.cos(angle) * dist;
    x = Math.max(-268, Math.min(268, x));
    z = Math.max(-268, Math.min(268, z));
    // Snap to the nearest street crossing so the car starts on a road.
    const snap = (v) => STREET_LINES.reduce((best, line) => (Math.abs(line - v) < Math.abs(best - v) ? line : best), STREET_LINES[0]);
    return { x: snap(x), z: snap(z) };
  }

  /**
   * ctx: { playerPos, playerSpeed, playerInBoat, stars, dt }
   * Returns events: {type:'shot', from, hit} and {type:'touch'} for arrests.
   */
  update(dt, ctx) {
    const events = [];
    const stars = ctx.stars;
    const want = this.desiredUnits(stars);
    const carUnits = this.units.filter((u) => u.kind === 'car');

    this.spawnTimer -= dt;
    if (stars > 0 && carUnits.length < want && this.spawnTimer <= 0) {
      const spot = this.spawnPoint(ctx.playerPos);
      const unit = new PoliceUnit(this.scene, 'car', spot.x, spot.z, Math.random() * Math.PI * 2);
      this.units.push(unit);
      this.spawnTimer = 2.2;
    }
    if (stars >= 4 && ctx.playerInBoat && !this.boatUnit) {
      const boat = new PoliceUnit(this.scene, 'boat', ctx.playerPos.x + 60, ctx.playerPos.z + 90, Math.PI);
      this.units.push(boat);
      this.boatUnit = boat;
    }

    // Despawn: units far away when heat is gone, or surplus when it drops.
    this.units = this.units.filter((unit) => {
      const dist = Math.hypot(unit.pos.x - ctx.playerPos.x, unit.pos.z - ctx.playerPos.z);
      const surplus = unit.kind === 'car' && this.units.filter((u) => u.kind === 'car').indexOf(unit) >= want;
      const boatDone = unit.kind === 'boat' && (stars < 3 || !ctx.playerInBoat);
      if ((stars === 0 && dist > 90) || (surplus && dist > 70) || boatDone) {
        this.scene.remove(unit.vehicle.mesh);
        if (this.boatUnit === unit) this.boatUnit = null;
        return false;
      }
      return true;
    });

    let nearest = Infinity;
    for (const unit of this.units) {
      const dist = Math.hypot(unit.pos.x - ctx.playerPos.x, unit.pos.z - ctx.playerPos.z);
      nearest = Math.min(nearest, dist);
      const flash = unit.kind === 'car' ? unit.car.mesh.userData.lightbar : null;
      if (flash) {
        const phase = Math.floor(performance.now() / 280) % 2;
        flash.children[1].material.emissiveIntensity = phase === 0 ? 2.2 : 0.15;
        flash.children[2].material.emissiveIntensity = phase === 0 ? 0.15 : 2.2;
      }

      if (unit.kind === 'boat') {
        const dx = ctx.playerPos.x - unit.pos.x;
        const dz = ctx.playerPos.z - unit.pos.z;
        const desired = Math.atan2(dx, dz);
        let diff = desired - unit.boat.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        stepBoat(unit.boat, { throttle: dist > 7 ? 1 : 0, steer: Math.max(-1, Math.min(1, diff * 1.6)) }, dt, 0);
        continue;
      }

      // Cars: hunt the player (or the shore below a boating player).
      const target = ctx.playerInBoat
        ? { x: ctx.playerPos.x, z: Math.min(ctx.playerPos.z, 282) }
        : ctx.playerPos;
      const dx = target.x - unit.pos.x;
      const dz = target.z - unit.pos.z;
      const desired = Math.atan2(dx, dz);
      let diff = desired - unit.car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      let throttle = 1;
      const cap = stars >= 5 ? 35 : 30.5;
      if (unit.car.speed > cap) throttle = 0;
      if (dist < 7 && !ctx.playerInVehicle) throttle = 0; // pull up beside a runner
      // Unstick: if the car is barely moving under power, back out and try again.
      if (Math.abs(unit.car.speed) < 0.7 && throttle > 0) unit.stuckTimer += dt;
      else unit.stuckTimer = 0;
      if (unit.stuckTimer > 1.1) {
        unit.reversing = 0.8;
        unit.stuckTimer = 0;
      }
      let steer = Math.max(-1, Math.min(1, diff * 1.9));
      if (unit.reversing > 0) {
        unit.reversing -= dt;
        stepVehicle(unit.car, { throttle: -1, steer: -steer, brake: false }, dt, this.world);
      } else {
        stepVehicle(unit.car, { throttle, steer, brake: dist < 4 && !ctx.playerInVehicle }, dt, this.world);
      }

      // Officers fire on a fleeing suspect at close range.
      unit.fireTimer -= dt;
      if (stars >= 2 && dist < 44 && unit.fireTimer <= 0 && !ctx.playerInBoat) {
        unit.fireTimer = 0.55 + Math.random() * 0.75;
        const hitChance = Math.max(0.08, 0.52 - dist * 0.008 - Math.abs(ctx.playerSpeed) * 0.006);
        events.push({ type: 'shot', from: { x: unit.pos.x, y: 1.2, z: unit.pos.z }, hit: Math.random() < hitChance });
      }
      if (dist < 5.2 && !ctx.playerInVehicle && Math.abs(ctx.playerSpeed) < 1.2) {
        events.push({ type: 'touch', dt });
      }
    }
    this.nearest = nearest;
    return events;
  }

  /** Every patrol vehicle, for shared collision with traffic and the player. */
  vehicles() {
    return this.units.filter((u) => u.kind === 'car').map((u) => u.car);
  }

  /** Give up a patrol car to the player (they stole it): the unit leaves the system. */
  releaseCar(car) {
    const before = this.units.length;
    this.units = this.units.filter((u) => u.car !== car);
    return this.units.length !== before;
  }

  anyCloseTo(pos, radius) {
    return this.units.some((u) => Math.hypot(u.pos.x - pos.x, u.pos.z - pos.z) < radius);
  }
}
