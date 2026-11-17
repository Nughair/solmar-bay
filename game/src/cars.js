// cars.js — every vehicle in Solmar Bay: the mesh factory, the arcade
// driving model, the parked cars waiting to be stolen, and the traffic AI
// that keeps the streets alive. Police cars live in police.js but are built
// from the same Car class.

import * as THREE from '../vendor/three.module.min.js';
import { ROADS, ROAD_W, CITY_EDGE, collideCircle, makeRng } from './city.js';

export const CAR_COLORS = [0xd64541, 0x2e86de, 0xf7d774, 0x7be495, 0xf4f1e8,
  0x8854d0, 0xfd9644, 0x4b6584, 0xe5989b, 0x20bf6b, 0xa3cb38, 0x718093];
export const CAR_KINDS = ['sedan', 'coupe', 'hatch', 'pickup', 'taxi', 'sport'];

const rng = makeRng(99173);

export function randomCarSpec() {
  return {
    color: CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)],
    kind: CAR_KINDS[Math.floor(rng() * CAR_KINDS.length)],
  };
}

// Build a low-poly car group. Origin at ground centre, forward = -Z of the
// group (three.js convention), so heading math stays simple: the car moves
// along (sin(heading), cos(heading)) in world XZ when heading rotates Y.
export function makeCarMesh(color, kind, opts = {}) {
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const glass = new THREE.MeshLambertMaterial({ color: 0x1c2b39 });
  const trim = new THREE.MeshLambertMaterial({ color: 0x22262b });
  const specs = {
    sedan:  { len: 4.3, wid: 1.9, bodyH: 0.62, cabH: 0.55, cabLen: 2.0 },
    coupe:  { len: 4.1, wid: 1.85, bodyH: 0.55, cabH: 0.45, cabLen: 1.7 },
    hatch:  { len: 3.7, wid: 1.8, bodyH: 0.7, cabH: 0.6, cabLen: 2.2 },
    pickup: { len: 4.7, wid: 2.0, bodyH: 0.8, cabH: 0.6, cabLen: 1.5 },
    taxi:   { len: 4.3, wid: 1.9, bodyH: 0.62, cabH: 0.55, cabLen: 2.0 },
    sport:  { len: 4.4, wid: 1.95, bodyH: 0.45, cabH: 0.4, cabLen: 1.6 },
  };
  const s = specs[kind] || specs.sedan;
  const body = new THREE.Mesh(new THREE.BoxGeometry(s.wid, s.bodyH, s.len), paint);
  body.position.y = 0.35 + s.bodyH / 2;
  body.castShadow = true;
  g.add(body);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(s.wid - 0.3, s.cabH, s.cabLen), glass);
  cab.position.set(0, 0.35 + s.bodyH + s.cabH / 2 - 0.05, kind === 'pickup' ? -s.len / 4 : -0.15);
  cab.castShadow = true;
  g.add(cab);
  if (kind === 'pickup') {
    const bed = new THREE.Mesh(new THREE.BoxGeometry(s.wid - 0.15, 0.4, s.len / 2.4), trim);
    bed.position.set(0, 0.35 + s.bodyH + 0.1, s.len / 3.4);
    g.add(bed);
  }
  if (kind === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xffd94d }));
    sign.position.set(0, 0.35 + s.bodyH + s.cabH + 0.08, -0.15);
    g.add(sign);
  }
  if (kind === 'sport') {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(s.wid - 0.1, 0.09, 0.5), trim);
    wing.position.set(0, 0.95, s.len / 2 - 0.25);
    g.add(wing);
  }
  if (opts.police) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.18, 0.5), trim);
    bar.position.set(0, 0.35 + s.bodyH + s.cabH + 0.1, -0.15);
    g.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.44),
      new THREE.MeshBasicMaterial({ color: 0xff2d2d }));
    red.position.set(-0.3, 0.35 + s.bodyH + s.cabH + 0.11, -0.15);
    g.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.44),
      new THREE.MeshBasicMaterial({ color: 0x2d6bff }));
    blue.position.set(0.3, 0.35 + s.bodyH + s.cabH + 0.11, -0.15);
    g.add(blue);
    g.userData.lightbar = [red, blue];
  }
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
  const wheels = [];
  for (const [wx, wz] of [[-s.wid / 2, -s.len / 2 + 0.8], [s.wid / 2, -s.len / 2 + 0.8],
                           [-s.wid / 2, s.len / 2 - 0.8], [s.wid / 2, s.len / 2 - 0.8]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.36, wz);
    g.add(w);
    wheels.push(w);
  }
  g.userData.wheels = wheels;
  g.userData.len = s.len;
  // Headlights: two small bright boxes at the front (-Z end).
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6c9 });
  for (const lx of [-s.wid / 3, s.wid / 3]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.06), lightMat);
    hl.position.set(lx, 0.62, -s.len / 2 - 0.02);
    g.add(hl);
  }
  return g;
}

export class Car {
  constructor(scene, spec, x, z, heading, opts = {}) {
    this.kind = spec.kind;
    this.color = spec.color;
    this.mesh = makeCarMesh(spec.color, spec.kind, opts);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    scene.add(this.mesh);
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.health = 100;
    this.isPolice = !!opts.police;
    this.isParked = !!opts.parked;
    this.missionTarget = false;   // the gold coupe etc. get a marker
    this.wrecked = false;
    this.honkCooldown = 0;
  }

  get pos() { return this.mesh.position; }

  forward() { return { x: Math.sin(this.heading), z: Math.cos(this.heading) }; }

  // Arcade step. input = {throttle -1..1, steer -1..1, brake bool}
  drive(dt, input, city, topSpeed = 27) {
    if (this.wrecked) { this.speed = 0; this.syncMesh(dt); return { hit: false, impact: 0 }; }
    const accel = input.throttle > 0 ? 13 : 9;
    this.speed += input.throttle * accel * dt;
    if (input.brake) this.speed -= Math.sign(this.speed) * 26 * dt;
    // Rolling drag and a soft top speed.
    this.speed -= this.speed * 0.55 * dt;
    if (this.speed > topSpeed) this.speed = topSpeed;
    if (this.speed < -9) this.speed = -9;
    if (Math.abs(this.speed) < 0.04 && input.throttle === 0) this.speed = 0;
    const steerTarget = input.steer * 0.62;
    this.steer += (steerTarget - this.steer) * Math.min(1, dt * 7);
    if (this.speed !== 0) {
      const grip = Math.min(1, Math.abs(this.speed) / 9);
      this.heading -= this.steer * grip * dt * 1.55 * Math.sign(this.speed);
    }
    const f = this.forward();
    let nx = this.x + f.x * this.speed * dt;
    let nz = this.z + f.z * this.speed * dt;
    const before = Math.abs(this.speed);
    const [cx, cz, hit] = collideCircle(city, nx, nz, 1.7);
    let impact = 0;
    if (hit && before > 3) {
      impact = before;
      this.speed = -this.speed * 0.25;
      this.health -= before * 1.1;
      if (this.health <= 0) this.wrecked = true;
    }
    this.x = cx;
    this.z = cz;
    this.syncMesh(dt);
    return { hit, impact };
  }

  syncMesh(dt) {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    // A touch of body roll in corners and pitch under power sells the speed.
    this.mesh.rotation.z = -this.steer * Math.min(0.09, Math.abs(this.speed) * 0.004);
    this.mesh.rotation.x = Math.max(-0.03, Math.min(0.03, -this.speed * 0.0009));
    const spin = this.speed * dt * 2.6;
    for (const w of this.mesh.userData.wheels) w.rotation.x += spin;
    if (this.mesh.userData.lightbar) {
      const t = performance.now() / 160;
      this.mesh.userData.lightbar[0].visible = Math.floor(t) % 2 === 0;
      this.mesh.userData.lightbar[1].visible = Math.floor(t) % 2 !== 0;
    }
  }
}

// Pick a spawn point on a road, at least minDist from (x,z).
export function roadSpawnPoint(minDist, x, z) {
  for (let tries = 0; tries < 24; tries++) {
    const vertical = rng() > 0.5;
    const line = ROADS[Math.floor(rng() * ROADS.length)];
    const along = (rng() * 2 - 1) * (CITY_EDGE - 8);
    const lane = (rng() > 0.5 ? 1 : -1) * (ROAD_W / 4);
    const px = vertical ? line + lane : along;
    const pz = vertical ? along : line + lane;
    if (Math.hypot(px - x, pz - z) >= minDist) return { x: px, z: pz, vertical, line };
  }
  return { x: ROADS[0], z: -CITY_EDGE + 10, vertical: true, line: ROADS[0] };
}

// Traffic: a pool of AI cars that follow the grid. Each car drives along one
// road; at an intersection it may turn onto the crossing road. It slows for
// the car (or the player) ahead of it.
export class Traffic {
  constructor(scene, city, count = 13) {
    this.city = city;
    this.cars = [];
    for (let i = 0; i < count; i++) {
      const spec = randomCarSpec();
      if (rng() < 0.16) spec.kind = 'taxi';
      const p = roadSpawnPoint(0, 0, 0);
      const heading = p.vertical ? (rng() > 0.5 ? 0 : Math.PI) : (rng() > 0.5 ? Math.PI / 2 : -Math.PI / 2);
      const car = new Car(scene, spec, p.x, p.z, heading);
      car.ai = { axis: p.vertical ? 'z' : 'x', dir: (heading === 0 || heading === Math.PI / 2) ? 1 : -1, cruise: 9 + rng() * 5, turnCooldown: 0 };
      this.cars.push(car);
    }
  }

  update(dt, obstacles) {
    for (const car of this.cars) {
      if (car === obstacles.playerCar || car.occupied) continue;
      const ai = car.ai;
      ai.turnCooldown -= dt;
      // Decide the desired heading from the axis we travel on.
      let targetHeading = car.heading;
      if (ai.axis === 'z') targetHeading = ai.dir > 0 ? 0 : Math.PI;
      else targetHeading = ai.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      // Near an intersection on the cross axis, maybe turn.
      const crossCoord = ai.axis === 'z' ? car.z : car.x;
      const alongCoord = ai.axis === 'z' ? car.x : car.z;
      for (const r of ROADS) {
        if (Math.abs(crossCoord - r) < 1.6 && ai.turnCooldown <= 0) {
          if (rng() < 0.38) {
            ai.axis = ai.axis === 'z' ? 'x' : 'z';
            ai.dir = rng() > 0.5 ? 1 : -1;
            ai.turnCooldown = 2.5;
          }
          break;
        }
      }
      // Lane keeping: aim at a point down the road, centred on the
      // right-hand lane of the road we travel on, and steer toward it.
      // (In Car.drive a positive steer turns the heading down, so the
      // steer command is the negated heading error.)
      const laneOffset = ROAD_W / 4;
      const laneCenter = ai.axis === 'z'
        ? snapRoad(car.x) + (ai.dir > 0 ? -laneOffset : laneOffset)
        : snapRoad(car.z) + (ai.dir > 0 ? laneOffset : -laneOffset);
      const aimX = ai.axis === 'z' ? laneCenter : car.x + ai.dir * 14;
      const aimZ = ai.axis === 'z' ? car.z + ai.dir * 14 : laneCenter;
      const desired = Math.atan2(aimX - car.x, aimZ - car.z);
      const dh = wrapAngle(desired - car.heading);
      const steer = clamp(-dh * 2.0, -1, 1);
      // Slow down if something is right ahead.
      let throttle = 0.55;
      const f = car.forward();
      for (const ob of obstacles.list) {
        if (ob === car) continue;
        const dx = ob.x - car.x, dz = ob.z - car.z;
        const ahead = dx * f.x + dz * f.z;
        const side = Math.abs(dx * f.z - dz * f.x);
        if (ahead > 0 && ahead < 9 && side < 2.2) { throttle = ahead < 4.5 ? -0.4 : 0.05; break; }
      }
      car.drive(dt, { throttle, steer, brake: throttle < 0 }, this.city, ai.cruise + 4);
      if (car.speed > ai.cruise) car.speed = ai.cruise;
    }
  }
}

function snapRoad(v) {
  let best = ROADS[0];
  for (const r of ROADS) if (Math.abs(r - v) < Math.abs(best - v)) best = r;
  return best;
}

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
