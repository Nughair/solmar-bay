// combat.js — Mars's pistol: hitscan shots with a tracer and a muzzle flash,
// plus the little particle system that sells every impact, crash and smoking
// engine in the game.

import * as THREE from 'three';

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    this.maxBursts = 40;
  }

  burst(x, y, z, color, count = 10, speed = 5, life = 0.5, size = 0.16, gravity = -4) {
    if (this.pool.length > this.maxBursts) {
      const old = this.pool.shift();
      this.scene.remove(old.points);
    }
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const vel = [];
    for (let i = 0; i < count; i++) {
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
      const a = Math.random() * Math.PI * 2;
      const up = Math.random() * 0.9 + 0.2;
      const s = speed * (0.4 + Math.random() * 0.8);
      vel.push([Math.cos(a) * s * 0.7, up * s * 0.6, Math.sin(a) * s * 0.7]);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color, size, transparent: true, opacity: 0.95, depthWrite: false });
    const points = new THREE.Points(geo, mat);
    this.scene.add(points);
    this.pool.push({ points, vel, life, age: 0, gravity });
  }

  smoke(x, y, z) {
    this.burst(x, y, z, 0x555b61, 3, 1.1, 1.3, 0.5, 2.5);
  }

  update(dt) {
    for (let i = this.pool.length - 1; i >= 0; i--) {
      const b = this.pool[i];
      b.age += dt;
      if (b.age >= b.life) {
        this.scene.remove(b.points);
        b.points.geometry.dispose();
        b.points.material.dispose();
        this.pool.splice(i, 1);
        continue;
      }
      const attr = b.points.geometry.getAttribute('position');
      for (let j = 0; j < b.vel.length; j++) {
        b.vel[j][1] += b.gravity * dt;
        attr.array[j * 3] += b.vel[j][0] * dt;
        attr.array[j * 3 + 1] += b.vel[j][1] * dt;
        attr.array[j * 3 + 2] += b.vel[j][2] * dt;
      }
      attr.needsUpdate = true;
      b.points.material.opacity = 0.95 * (1 - b.age / b.life);
    }
  }
}

export class Weapon {
  constructor(scene, effects, sound) {
    this.scene = scene;
    this.effects = effects;
    this.sound = sound;
    this.cooldown = 0;
    this.fireInterval = 0.16;
    this.damage = 34;
    this.range = 95;
    this.tracerMat = new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.9 });
    this.tracer = null;
    this.tracerAge = 0;
    this.flash = new THREE.PointLight(0xffc266, 0, 12);
    scene.add(this.flash);
    this.raycaster = new THREE.Raycaster();
  }

  get ready() {
    return this.cooldown <= 0;
  }

  update(dt) {
    this.cooldown -= dt;
    if (this.tracer) {
      this.tracerAge += dt;
      this.tracerMat.opacity = Math.max(0, 0.9 - this.tracerAge * 11);
      if (this.tracerAge > 0.09) {
        this.scene.remove(this.tracer);
        this.tracer.geometry.dispose();
        this.tracer = null;
      }
    }
    if (this.flash.intensity > 0) this.flash.intensity = Math.max(0, this.flash.intensity - dt * 260);
  }

  // targets: { peds: [...], cars: [...] } — returns what was hit, if anything.
  fire(camera, shooterPos, targets, onEvent) {
    if (!this.ready) return null;
    this.cooldown = this.fireInterval;
    this.sound.gunshot();
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const origin = camera.position.clone();

    // muzzle flash at the shooter's gun hand
    this.flash.position.set(shooterPos.x, 1.25, shooterPos.z).addScaledVector(dir, 0.7);
    this.flash.intensity = 26;

    let bestT = this.range;
    let hit = null;
    // pedestrians: a standing figure is a capsule; test a sphere at chest height
    for (const ped of targets.peds) {
      if (!ped.alive) continue;
      const c = new THREE.Vector3(ped.x, 1.1, ped.z);
      const t = raySphere(origin, dir, c, 0.85);
      if (t !== null && t < bestT) {
        bestT = t;
        hit = { type: 'ped', ped, point: origin.clone().addScaledVector(dir, t) };
      }
    }
    // cars: a sphere around the centre is close enough at street ranges
    for (const car of targets.cars) {
      const c = new THREE.Vector3(car.x, 0.9, car.z);
      const t = raySphere(origin, dir, c, 2.3);
      if (t !== null && t < bestT) {
        bestT = t;
        hit = { type: 'car', car, point: origin.clone().addScaledVector(dir, t) };
      }
    }

    const end = hit ? hit.point : origin.clone().addScaledVector(dir, this.range);
    // ground strike if the shot dives into the street before its range ends
    if (!hit && dir.y < -0.02) {
      const tGround = -origin.y / dir.y;
      if (tGround > 0 && tGround < bestT) {
        end.copy(origin).addScaledVector(dir, tGround);
        hit = { type: 'ground', point: end.clone() };
      }
    }

    const muzzle = new THREE.Vector3(shooterPos.x, 1.22, shooterPos.z).addScaledVector(dir, 0.55);
    const geo = new THREE.BufferGeometry().setFromPoints([muzzle, end]);
    if (this.tracer) {
      this.scene.remove(this.tracer);
      this.tracer.geometry.dispose();
    }
    this.tracer = new THREE.Line(geo, this.tracerMat);
    this.tracerMat.opacity = 0.9;
    this.tracerAge = 0;
    this.scene.add(this.tracer);

    if (hit && hit.type === 'ped') {
      const died = hit.ped.hurt(this.damage);
      this.effects.burst(hit.point.x, hit.point.y, hit.point.z, 0xd43a2f, 8, 3.4, 0.4, 0.13);
      if (onEvent) onEvent({ type: 'pedShot', ped: hit.ped, died });
    } else if (hit && hit.type === 'car') {
      hit.car.health -= 13;
      if (hit.car.health <= 0 && !hit.car.disabled) hit.car.disabled = true;
      this.effects.burst(hit.point.x, hit.point.y, hit.point.z, 0xffc266, 7, 4, 0.3, 0.12);
      this.sound.hitThud();
      if (onEvent) onEvent({ type: 'carShot', car: hit.car });
    } else if (hit && hit.type === 'ground') {
      this.effects.burst(end.x, 0.15, end.z, 0xcfc8b8, 5, 2.2, 0.35, 0.11);
    }
    if (onEvent) onEvent({ type: 'fired', hit: hit ? hit.type : 'air' });
    return hit;
  }
}

function raySphere(origin, dir, centre, radius) {
  const ox = centre.x - origin.x;
  const oy = centre.y - origin.y;
  const oz = centre.z - origin.z;
  const tca = ox * dir.x + oy * dir.y + oz * dir.z;
  if (tca < 0) return null;
  const d2 = ox * ox + oy * oy + oz * oz - tca * tca;
  const r2 = radius * radius;
  if (d2 > r2) return null;
  return tca - Math.sqrt(r2 - d2);
}
