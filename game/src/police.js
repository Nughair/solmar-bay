// police.js — the Solmar Police Department: a wanted system that turns
// witnessed crimes into stars, and the interceptors that hunt you while the
// stars last. Lose their sight long enough and the heat cools off.

import { ROADS, clamp, angleDiff, dist2D, pick } from './util.js';
import { Vehicle, headingFor, laneOffset } from './vehicles.js';

const STAR_THRESHOLDS = [0, 1, 3, 6, 10, 15];

export class WantedSystem {
  constructor(onStarUp) {
    this.points = 0;
    this.stars = 0;
    this.timeSinceSeen = 99;
    this.onStarUp = onStarUp || null;
  }

  get wanted() {
    return this.stars > 0;
  }

  // A crime counts in full when somebody saw it — a pedestrian nearby or an
  // officer — and only leaves a rumour when nobody did.
  addCrime(points, witnessed) {
    this.points += witnessed ? points : points * 0.4;
    this.refresh();
  }

  setWantedAtLeast(stars) {
    const need = STAR_THRESHOLDS[stars] || 0;
    if (this.points < need) this.points = need;
    this.refresh();
  }

  markSeen() {
    this.timeSinceSeen = 0;
  }

  refresh() {
    let s = 0;
    for (let i = 1; i <= 5; i++) if (this.points >= STAR_THRESHOLDS[i]) s = i;
    if (s > this.stars && this.onStarUp) this.onStarUp(s);
    this.stars = s;
  }

  clear() {
    this.points = 0;
    this.stars = 0;
    this.timeSinceSeen = 99;
  }

  update(dt) {
    this.timeSinceSeen += dt;
    if (this.points > 0 && this.timeSinceSeen > 7) {
      // hidden long enough: witnesses drift away and reports go stale
      this.points = Math.max(0, this.points - dt * 0.30);
      this.refresh();
    }
  }
}

export class PoliceForce {
  constructor(scene, wanted) {
    this.scene = scene;
    this.wanted = wanted;
    this.units = [];
    this.spawnTimer = 0;
  }

  desiredUnits() {
    const s = this.wanted.stars;
    if (s === 0) return 0;
    return Math.min(1 + s, 6);
  }

  spawnNear(player) {
    // Officers arrive along an avenue, far enough to approach, near enough
    // to matter, and never on top of the player.
    for (let tries = 0; tries < 8; tries++) {
      const axis = Math.random() > 0.5 ? 'x' : 'z';
      const road = pick(ROADS);
      const along = clamp(player.x + (Math.random() - 0.5) * 200, -155, 155);
      const alongZ = clamp(player.z + (Math.random() - 0.5) * 200, -155, 155);
      const dir = Math.random() > 0.5 ? 1 : -1;
      const x = axis === 'x' ? along : road + laneOffset('z', dir);
      const z = axis === 'x' ? road + laneOffset('x', dir) : alongZ;
      if (dist2D(x, z, player.x, player.z) < 55) continue;
      const car = new Vehicle(this.scene, 'police', 0xf2f4f6, x, z, headingFor(axis, dir));
      car.isPolice = true;
      car.stuckTimer = 0;
      car.reverseTimer = 0;
      this.units.push(car);
      return car;
    }
    return null;
  }

  update(dt, player, colliders, onRam) {
    this.spawnTimer -= dt;
    const want = this.desiredUnits();
    if (this.units.length < want && this.spawnTimer <= 0) {
      if (this.spawnNear(player)) this.spawnTimer = 2.5;
    }
    const targetX = player.inCar ? player.inCar.x : player.x;
    const targetZ = player.inCar ? player.inCar.z : player.z;

    for (let i = this.units.length - 1; i >= 0; i--) {
      const unit = this.units[i];
      unit.updateLightbar(dt);
      const d = dist2D(unit.x, unit.z, targetX, targetZ);
      if (this.wanted.stars === 0 && d > 190) {
        unit.removeFrom(this.scene);
        this.units.splice(i, 1);
        continue;
      }
      if (d < 42) this.wanted.markSeen();

      let throttle = 0;
      let steer = 0;
      let brake = false;
      if (this.wanted.stars > 0) {
        // Pursuit: aim a touch ahead of the target so the interceptor cuts
        // corners instead of trailing forever.
        const lead = clamp(d * 0.04, 0, 2.5);
        const pvx = player.inCar ? player.inCar.forwardX() * player.inCar.speed : player.vx || 0;
        const pvz = player.inCar ? player.inCar.forwardZ() * player.inCar.speed : player.vz || 0;
        const aimX = targetX + pvx * lead * 0.3;
        const aimZ = targetZ + pvz * lead * 0.3;
        const desired = Math.atan2(aimX - unit.x, aimZ - unit.z);
        steer = clamp(angleDiff(unit.angle, desired) * 1.9, -1, 1);
        throttle = d > 9 ? 1 : 0.45;
        if (d < 5 && Math.abs(unit.speed) > 12) brake = true;
        // stuck recovery: if full throttle barely moves the car, back out
        if (Math.abs(unit.speed) < 1.2 && throttle > 0) {
          unit.stuckTimer += dt;
          if (unit.stuckTimer > 1.1) {
            unit.reverseTimer = 0.8;
            unit.stuckTimer = 0;
          }
        } else unit.stuckTimer = 0;
        if (unit.reverseTimer > 0) {
          unit.reverseTimer -= dt;
          throttle = -1;
          steer = -steer;
        }
      } else {
        // No longer wanted: the patrol just cruises its avenue and leaves.
        throttle = 0.5;
        steer = clamp(angleDiff(unit.angle, unit.angle) * 0, -1, 1);
      }
      const speedBefore = Math.abs(unit.speed);
      unit.drive(dt, throttle, steer, brake, colliders, (intensity, car) => {
        if (onRam && car === unit) onRam(intensity, unit);
      });
      void speedBefore;
    }
  }

  nearestDistance(player) {
    const tx = player.inCar ? player.inCar.x : player.x;
    const tz = player.inCar ? player.inCar.z : player.z;
    let best = Infinity;
    for (const u of this.units) best = Math.min(best, dist2D(u.x, u.z, tx, tz));
    return best;
  }

  clearAll() {
    for (const u of this.units) u.removeFrom(this.scene);
    this.units = [];
  }
}
