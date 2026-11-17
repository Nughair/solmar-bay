// pedestrians.js — the people of Solmar Bay. They stroll the sidewalks,
// hurry away from gunfire and reckless driving, and go down when a car or a
// bullet finds them. A few of them are armed: those belong to the story.

import * as THREE from 'three';
import { ROADS, ROAD_HALF, CITY_HALF, clamp, collideCircle, rand, randRange, pick } from './util.js';

const SHIRTS = [0xef5350, 0x42a5f5, 0xffee58, 0xab47bc, 0x26a69a, 0xffa726, 0xec407a, 0x9ccc65, 0xf5f5f5, 0x5c6bc0];
const SKINS = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];

export class Ped {
  constructor(scene, x, z, opts = {}) {
    this.group = new THREE.Group();
    const shirt = opts.shirt ?? pick(SHIRTS);
    const bodyMat = new THREE.MeshLambertMaterial({ color: shirt });
    const skinMat = new THREE.MeshLambertMaterial({ color: pick(SKINS) });
    const legMat = new THREE.MeshLambertMaterial({ color: pick([0x37474f, 0x5d4037, 0x263238, 0x6d4c41]) });

    this.legL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.75, 0.2), legMat);
    this.legL.position.set(-0.13, 0.375, 0);
    this.legR = this.legL.clone();
    this.legR.position.x = 0.13;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.72, 0.3), bodyMat);
    torso.position.y = 1.1;
    torso.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), skinMat);
    head.position.y = 1.68;
    head.castShadow = true;
    this.armL = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.62, 0.16), bodyMat);
    this.armL.position.set(-0.34, 1.12, 0);
    this.armR = this.armL.clone();
    this.armR.position.x = 0.34;
    this.group.add(this.legL, this.legR, torso, head, this.armL, this.armR);
    if (opts.armed) {
      const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.42), new THREE.MeshLambertMaterial({ color: 0x14181c }));
      gun.position.set(0.34, 0.95, 0.25);
      this.group.add(gun);
    }
    this.group.position.set(x, 0, z);
    scene.add(this.group);

    this.angle = rand() * Math.PI * 2;
    this.speed = 0;
    this.walkSpeed = randRange(1.1, 1.9);
    this.hp = opts.hp ?? 30;
    this.armed = !!opts.armed;
    this.state = 'walk'; // walk | flee | down | dead
    this.targetX = x;
    this.targetZ = z;
    this.thinkTimer = rand() * 2;
    this.fleeTimer = 0;
    this.fleeX = 0;
    this.fleeZ = 0;
    this.downTimer = 0;
    this.walkPhase = rand() * 6;
    this.shootCooldown = randRange(0.5, 1.5);
    this.pickSidewalkTarget();
  }

  get x() {
    return this.group.position.x;
  }

  get z() {
    return this.group.position.z;
  }

  get alive() {
    return this.state !== 'dead';
  }

  // Sidewalk targets: a random point along the pavement beside some avenue,
  // so the crowd flows along the streets instead of through the buildings.
  pickSidewalkTarget() {
    const road = pick(ROADS);
    const along = randRange(-CITY_HALF + 14, CITY_HALF - 14);
    const side = rand() > 0.5 ? 1 : -1;
    const off = ROAD_HALF + 2.4;
    if (rand() > 0.5) {
      this.targetX = road + side * off;
      this.targetZ = along;
    } else {
      this.targetX = along;
      this.targetZ = road + side * off;
    }
  }

  panic(fromX, fromZ, seconds = 3.5) {
    if (!this.alive || this.state === 'down') return;
    this.state = 'flee';
    this.fleeTimer = seconds;
    this.fleeX = fromX;
    this.fleeZ = fromZ;
  }

  knockDown(byPlayer) {
    if (!this.alive) return false;
    this.hp = 0;
    this.state = 'dead';
    this.group.rotation.x = -Math.PI / 2;
    this.group.position.y = 0.25;
    return true;
  }

  hurt(amount) {
    if (!this.alive) return false;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.state = 'dead';
      this.group.rotation.x = -Math.PI / 2;
      this.group.position.y = 0.25;
      return true;
    }
    this.panic(this.x, this.z, 2.5);
    return false;
  }

  update(dt, world) {
    if (this.state === 'dead') return;
    if (this.state === 'down') {
      this.downTimer -= dt;
      if (this.downTimer <= 0) {
        this.state = 'walk';
        this.group.rotation.x = 0;
        this.group.position.y = 0;
      }
      return;
    }

    let moveX = 0;
    let moveZ = 0;
    let speed = this.walkSpeed;

    if (this.state === 'flee') {
      this.fleeTimer -= dt;
      const dx = this.x - this.fleeX;
      const dz = this.z - this.fleeZ;
      const d = Math.hypot(dx, dz) || 1;
      moveX = dx / d;
      moveZ = dz / d;
      speed = 4.4;
      if (this.fleeTimer <= 0) this.state = 'walk';
    } else {
      const dx = this.targetX - this.x;
      const dz = this.targetZ - this.z;
      const d = Math.hypot(dx, dz);
      this.thinkTimer -= dt;
      if (d < 1.6 || this.thinkTimer < -14) {
        this.pickSidewalkTarget();
        this.thinkTimer = 2;
      } else {
        moveX = dx / d;
        moveZ = dz / d;
      }
    }

    // Step aside from cars bearing down on them; get knocked down if the car
    // actually arrives. A car at walking pace just earns a shove and a scare.
    for (const car of world.vehicles) {
      const dx = this.x - car.x;
      const dz = this.z - car.z;
      const d2 = dx * dx + dz * dz;
      const carSpeed = Math.abs(car.speed);
      if (d2 < 30 && carSpeed > 7) {
        this.panic(car.x, car.z, 1.6);
        moveX = dx / (Math.sqrt(d2) || 1);
        moveZ = dz / (Math.sqrt(d2) || 1);
        speed = 4.6;
      }
      if (d2 < 2.9) {
        if (carSpeed > 5) {
          const byPlayer = car === world.playerCar;
          if (this.knockDown(byPlayer)) {
            if (world.onPedHit) world.onPedHit(this, car);
          }
        } else if (this.state !== 'flee') {
          this.panic(car.x, car.z, 1.2);
        }
      }
    }

    if (moveX !== 0 || moveZ !== 0) {
      const targetAngle = Math.atan2(moveX, moveZ);
      let diff = targetAngle - this.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.angle += diff * Math.min(1, dt * 8);
      let nx = this.x + Math.sin(this.angle) * speed * dt;
      let nz = this.z + Math.cos(this.angle) * speed * dt;
      [nx, nz] = collideCircle(nx, nz, 0.45, world.colliders);
      nx = clamp(nx, -CITY_HALF + 2, CITY_HALF - 2);
      nz = clamp(nz, -CITY_HALF + 2, CITY_HALF - 2);
      this.group.position.x = nx;
      this.group.position.z = nz;
      this.speed = speed;
    } else {
      this.speed = 0;
    }
    this.group.rotation.y = this.angle;

    // A simple two-beat stride: legs and arms swing against each other.
    this.walkPhase += dt * (this.speed > 3 ? 11 : 7) * (this.speed > 0.1 ? 1 : 0);
    const swing = this.speed > 0.1 ? Math.sin(this.walkPhase) * 0.5 : 0;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.8;
    this.armR.rotation.x = this.armed ? -1.15 : swing * 0.8;
  }
}

export function spawnCrowd(scene, count) {
  const peds = [];
  for (let i = 0; i < count; i++) {
    const road = pick(ROADS);
    const along = randRange(-CITY_HALF + 16, CITY_HALF - 16);
    const side = rand() > 0.5 ? 1 : -1;
    const off = ROAD_HALF + 2.4;
    let x;
    let z;
    if (rand() > 0.5) {
      x = road + side * off;
      z = along;
    } else {
      x = along;
      z = road + side * off;
    }
    peds.push(new Ped(scene, x, z));
  }
  return peds;
}
