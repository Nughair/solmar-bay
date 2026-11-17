// people.js — the pedestrians of Solmar Bay. They stroll the sidewalks
// around a city block, chat in pairs, and — importantly for a crime game —
// they notice trouble: a gunshot, a speeding car or a wanted face makes them
// run, and running witnesses are how the police hear about a crime.

import * as THREE from '../vendor/three.module.min.js';
import { BLOCK, GRID, makeRng } from './city.js';

const rng = makeRng(5150);
const SKIN = [0xf1c27d, 0xe0ac69, 0x8d5524, 0xffdbac, 0xc68642];
const SHIRTS = [0xef476f, 0xffd166, 0x06d6a0, 0x118ab2, 0x9b5de5, 0xf4f1e8, 0xfd9644, 0x20bf6b];
const PANTS = [0x2f3542, 0x57606f, 0x3b3b98, 0x82589f, 0x22262b];

function makePersonMesh() {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: SKIN[Math.floor(rng() * SKIN.length)] });
  const shirt = new THREE.MeshLambertMaterial({ color: SHIRTS[Math.floor(rng() * SHIRTS.length)] });
  const pants = new THREE.MeshLambertMaterial({ color: PANTS[Math.floor(rng() * PANTS.length)] });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.78, 0.26), pants);
  legs.position.y = 0.39;
  g.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.66, 0.3), shirt);
  torso.position.y = 1.1;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), skin);
  head.position.y = 1.66;
  head.castShadow = true;
  g.add(head);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.6, 0.13), shirt);
  armL.position.set(-0.34, 1.08, 0);
  g.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.34;
  g.add(armR);
  g.userData.armL = armL;
  g.userData.armR = armR;
  g.userData.legs = legs;
  return g;
}

export class Pedestrian {
  constructor(scene) {
    this.mesh = makePersonMesh();
    scene.add(this.mesh);
    this.health = 100;
    this.state = 'walk';       // walk | flee | down | gunman
    this.fleeTimer = 0;
    this.downTimer = 0;
    this.speed = 1.1 + rng() * 0.7;
    this.phase = rng() * Math.PI * 2;
    this.placeOnSidewalk();
  }

  // A sidewalk loop: the pavement ring around one city block.
  placeOnSidewalk() {
    const bx = Math.floor(rng() * (GRID * 2)) - GRID;
    const bz = Math.floor(rng() * (GRID * 2)) - GRID;
    this.cx = bx * BLOCK + BLOCK / 2;
    this.cz = bz * BLOCK + BLOCK / 2;
    this.half = 17.2;   // the sidewalk frame: clear of the road and the buildings
    this.angle = rng() * Math.PI * 2;
    this.dirSign = rng() > 0.5 ? 1 : -1;
    this.syncToRing();
  }

  ringPoint(angle) {
    // Walk a rounded square: parametrise the block perimeter by angle.
    const c = Math.cos(angle), s = Math.sin(angle);
    const m = Math.max(Math.abs(c), Math.abs(s));
    return { x: this.cx + (c / m) * this.half, z: this.cz + (s / m) * this.half };
  }

  syncToRing() {
    const p = this.ringPoint(this.angle);
    this.x = p.x;
    this.z = p.z;
    this.mesh.position.set(this.x, 0.24, this.z);
  }

  scare(fromX, fromZ, seconds = 3.5) {
    if (this.state === 'down' || this.state === 'gunman') return;
    this.state = 'flee';
    this.fleeTimer = seconds;
    const dx = this.x - fromX, dz = this.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    this.fleeX = dx / d;
    this.fleeZ = dz / d;
  }

  knockDown() {
    if (this.state === 'down') return;
    this.state = 'down';
    this.downTimer = 9;
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = 0.3;
  }

  update(dt, danger) {
    if (this.state === 'down') {
      this.downTimer -= dt;
      if (this.downTimer <= 0) {
        this.mesh.rotation.x = 0;
        this.state = 'walk';
        this.placeOnSidewalk();
      }
      return;
    }
    if (this.state === 'gunman') return; // missions.js animates gunmen itself
    if (danger && danger.active) {
      const d = Math.hypot(this.x - danger.x, this.z - danger.z);
      if (d < danger.radius) this.scare(danger.x, danger.z, 2.5);
    }
    if (this.state === 'flee') {
      this.fleeTimer -= dt;
      this.x += this.fleeX * 3.4 * dt;
      this.z += this.fleeZ * 3.4 * dt;
      this.mesh.position.set(this.x, 0.24, this.z);
      this.mesh.rotation.y = Math.atan2(this.fleeX, this.fleeZ);
      if (this.fleeTimer <= 0) { this.state = 'walk'; this.placeOnSidewalk(); }
    } else {
      this.angle += this.dirSign * (this.speed / (this.half * 2.6)) * dt;
      const p = this.ringPoint(this.angle);
      const dx = p.x - this.x, dz = p.z - this.z;
      this.x = p.x;
      this.z = p.z;
      this.mesh.position.set(this.x, 0.24, this.z);
      if (Math.abs(dx) + Math.abs(dz) > 0.001) this.mesh.rotation.y = Math.atan2(dx, dz);
    }
    // A little walk cycle: arms swing, body bobs.
    this.phase += dt * (this.state === 'flee' ? 11 : 6.5);
    const swing = Math.sin(this.phase) * 0.5;
    this.mesh.userData.armL.rotation.x = swing;
    this.mesh.userData.armR.rotation.x = -swing;
    this.mesh.position.y = 0.24 + Math.abs(Math.sin(this.phase)) * 0.045;
  }
}

export class Crowd {
  constructor(scene, count = 22) {
    this.peds = [];
    for (let i = 0; i < count; i++) this.peds.push(new Pedestrian(scene));
  }

  update(dt, danger) {
    for (const p of this.peds) p.update(dt, danger);
  }

  // Everyone within radius of (x,z) panics — used for gunshots and crashes.
  scareAll(x, z, radius) {
    for (const p of this.peds) {
      if (Math.hypot(p.x - x, p.z - z) < radius) p.scare(x, z);
    }
  }

  // Was anyone close enough to witness an event at (x,z)?
  anyWitness(x, z, radius) {
    return this.peds.some(p => p.state !== 'down' && Math.hypot(p.x - x, p.z - z) < radius);
  }
}
