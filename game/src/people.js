// People: jointed low-poly figures built from boxes — the player, Vera, and the
// crowds of Solmar Bay. Pedestrians stroll the sidewalk grid and the promenade,
// chat in pairs, flee from gunfire and crashes, and fall when hit.

import * as THREE from 'three';
import { STREET_LINES, collideCircle, isWater } from './world.js';
import { makeRng, range, pick } from './rng.js';

const SHIRTS = [0xe85d75, 0x3fb6c9, 0xf2b134, 0x37b268, 0xf7ead7, 0x8a5fc0, 0xef7fb0, 0x2c7de8, 0xff8a3c];
const PANTS = [0x2c3e50, 0x6e5636, 0xe8e4da, 0x40536b, 0x7a4a56, 0x2e4a3a];
const SKIN = [0xf2c49b, 0xc68863, 0x8a5a3b, 0x6e4530, 0xffdbac];

/** A jointed figure; limbs are pivots so the walk cycle can swing them. */
export function createPersonMesh(shirt, pants, skin) {
  const group = new THREE.Group();
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirtMat);
  torso.position.y = 1.12;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.38, 0.34), skinMat);
  head.position.y = 1.68;
  group.add(head);
  function limb(mat, w, len, x, y, z) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, len, w), mat);
    mesh.position.y = -len / 2;
    pivot.add(mesh);
    group.add(pivot);
    return pivot;
  }
  const armL = limb(skinMat, 0.16, 0.66, -0.4, 1.44, 0);
  const armR = limb(skinMat, 0.16, 0.66, 0.4, 1.44, 0);
  const legL = limb(pantsMat, 0.2, 0.78, -0.16, 0.78, 0);
  const legR = limb(pantsMat, 0.2, 0.78, 0.16, 0.78, 0);
  group.userData.limbs = { armL, armR, legL, legR };
  return group;
}

/** Swing a figure's limbs for a walk cycle; phase advances with distance walked. */
export function animatePerson(mesh, phase, down = false) {
  const { armL, armR, legL, legR } = mesh.userData.limbs;
  if (down) {
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.25;
    return;
  }
  mesh.rotation.x = 0;
  const swing = Math.sin(phase) * 0.55;
  legL.rotation.x = swing;
  legR.rotation.x = -swing;
  armL.rotation.x = -swing * 0.8;
  armR.rotation.x = swing * 0.8;
}

/** A point on the sidewalk grid: along a street, one kerb out from its centre. */
function sidewalkPoint(rng) {
  const line = pick(rng, STREET_LINES);
  const along = range(rng, -282, 282);
  const side = rng() < 0.5 ? -7.6 : 7.6;
  return rng() < 0.5 ? { x: line + side, z: along } : { x: along, z: line + side };
}

export class Pedestrian {
  constructor(rng, x, z) {
    this.mesh = createPersonMesh(pick(rng, SHIRTS), pick(rng, PANTS), pick(rng, SKIN));
    this.mesh.position.set(x, 0, z);
    this.heading = range(rng, 0, Math.PI * 2);
    this.speed = 0;
    this.state = 'walk'; // walk | flee | down
    this.target = sidewalkPoint(rng);
    this.phase = range(rng, 0, 6);
    this.downTimer = 0;
    this.fleeFrom = null;
    this.radius = 0.55;
    this.dead = false;
  }

  get pos() {
    return this.mesh.position;
  }

  /** Knock the pedestrian down (shot, run over); they stay down, then the crowd thins. */
  knockDown() {
    if (this.state === 'down') return;
    this.state = 'down';
    this.downTimer = 9;
    this.dead = true;
  }

  scare(fromPos) {
    if (this.state === 'down') return;
    this.state = 'flee';
    this.fleeFrom = { x: fromPos.x, z: fromPos.z };
    this.downTimer = 3.2;
  }

  update(dt, rng, world) {
    if (this.state === 'down') {
      this.downTimer -= dt;
      animatePerson(this.mesh, 0, true);
      return this.downTimer > 0; // false once the body can be recycled
    }
    let want = 1.35;
    if (this.state === 'flee') {
      this.downTimer -= dt;
      if (this.downTimer <= 0) {
        this.state = 'walk';
        this.target = sidewalkPoint(rng);
      }
      const away = Math.atan2(this.pos.x - this.fleeFrom.x, this.pos.z - this.fleeFrom.z);
      this.target = { x: this.pos.x + Math.sin(away) * 26, z: this.pos.z + Math.cos(away) * 26 };
      want = 4.4;
    } else if (Math.hypot(this.target.x - this.pos.x, this.target.z - this.pos.z) < 2.2) {
      this.target = sidewalkPoint(rng);
    }
    const desired = Math.atan2(this.target.x - this.pos.x, this.target.z - this.pos.z);
    let diff = desired - this.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.heading += Math.max(-2.6 * dt, Math.min(2.6 * dt, diff));
    this.speed += (want - this.speed) * Math.min(1, dt * 3);
    this.pos.x += Math.sin(this.heading) * this.speed * dt;
    this.pos.z += Math.cos(this.heading) * this.speed * dt;
    if (isWater(this.pos.x, this.pos.z)) {
      this.pos.z = 330;
      this.target = sidewalkPoint(rng);
    }
    collideCircle(world.colliders, this.pos, this.radius);
    this.pos.x = Math.max(-298, Math.min(298, this.pos.x));
    this.pos.z = Math.max(-298, Math.min(298, this.pos.z));
    this.mesh.position.y = 0;
    this.mesh.rotation.y = this.heading;
    this.phase += dt * this.speed * 3.4;
    animatePerson(this.mesh, this.phase);
    return true;
  }
}

/** The crowd: a fixed pool of pedestrians who respawn at the edges when recycled. */
export class Crowd {
  constructor(scene, world, seed = 99, count = 38) {
    this.world = world;
    this.rng = makeRng(seed);
    this.peds = [];
    for (let i = 0; i < count; i += 1) {
      const spot = sidewalkPoint(this.rng);
      const ped = new Pedestrian(this.rng, spot.x, spot.z);
      scene.add(ped.mesh);
      this.peds.push(ped);
    }
  }

  update(dt) {
    for (const ped of this.peds) {
      const alive = ped.update(dt, this.rng, this.world);
      if (!alive) {
        // Recycle far from the action: a fresh stroller at a random kerb.
        const spot = sidewalkPoint(this.rng);
        ped.pos.set(spot.x, 0, spot.z);
        ped.state = 'walk';
        ped.dead = false;
        ped.target = sidewalkPoint(this.rng);
      }
    }
  }

  /** Everyone within radius of a point runs from it. */
  scareAll(fromPos, radius) {
    for (const ped of this.peds) {
      if (Math.hypot(ped.pos.x - fromPos.x, ped.pos.z - fromPos.z) < radius) ped.scare(fromPos);
    }
  }
}
