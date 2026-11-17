// player.js — Marina "Mars" Solano, the driver you play: on-foot movement
// with building collision, sprinting, health and slow recovery, and the
// little low-poly figure the camera follows around Solmar Bay.

import * as THREE from 'three';
import { clamp, collideCircle, keepInCity } from './util.js';

export class Player {
  constructor(scene, x, z) {
    this.group = new THREE.Group();
    const shirt = new THREE.MeshLambertMaterial({ color: 0x12b5a5 });
    const skin = new THREE.MeshLambertMaterial({ color: 0xc68642 });
    const denim = new THREE.MeshLambertMaterial({ color: 0x2c4a73 });

    this.legL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.78, 0.21), denim);
    this.legL.position.set(-0.13, 0.39, 0);
    this.legR = this.legL.clone();
    this.legR.position.x = 0.13;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.74, 0.3), shirt);
    torso.position.y = 1.14;
    torso.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), skin);
    head.position.y = 1.72;
    head.castShadow = true;
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.23, 0.26, 0.12, 10),
      new THREE.MeshLambertMaterial({ color: 0xd43a2f }),
    );
    cap.position.y = 1.88;
    this.armL = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.64, 0.16), shirt);
    this.armL.position.set(-0.35, 1.16, 0);
    this.armR = this.armL.clone();
    this.armR.position.x = 0.35;
    // the pistol she carries from the first mission on
    this.gunMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.14, 0.44),
      new THREE.MeshLambertMaterial({ color: 0x14181c }),
    );
    this.gunMesh.position.set(0.35, 1.0, 0.28);
    this.gunMesh.visible = false;
    this.group.add(this.legL, this.legR, torso, head, cap, this.armL, this.armR, this.gunMesh);
    this.group.position.set(x, 0, z);
    scene.add(this.group);

    this.angle = Math.PI;
    this.vx = 0;
    this.vz = 0;
    this.speed = 0;
    this.health = 100;
    this.maxHealth = 100;
    this.hurtTimer = 0;
    this.walkPhase = 0;
    this.inCar = null;
    this.dead = false;
  }

  get x() {
    return this.group.position.x;
  }

  get z() {
    return this.group.position.z;
  }

  teleport(x, z, angle) {
    this.group.position.set(x, 0, z);
    if (angle !== undefined) this.angle = angle;
    this.vx = 0;
    this.vz = 0;
  }

  damage(amount) {
    if (this.dead) return false;
    this.health -= amount;
    this.hurtTimer = 0;
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      return true;
    }
    return false;
  }

  heal(amount) {
    this.health = clamp(this.health + amount, 0, this.maxHealth);
    if (this.health > 0) this.dead = false;
  }

  // input is a direction in camera space: ix (strafe) and iz (forward), each
  // -1..1, plus sprint. faceAngle, when given, is where she should look
  // (aiming); otherwise she turns the way she runs.
  update(dt, input, camYaw, colliders, faceAngle) {
    this.hurtTimer += dt;
    if (this.hurtTimer > 9 && this.health > 0 && this.health < this.maxHealth) {
      this.health = Math.min(this.maxHealth, this.health + dt * 3.2);
    }
    const sin = Math.sin(camYaw);
    const cos = Math.cos(camYaw);
    // forward is (sin, cos) in world space; right is that turned a quarter
    // turn clockwise seen from above: (-cos, sin)... checked against the
    // compass: facing north (yaw = PI), D must walk east, and it does.
    let mx = sin * input.iz - cos * input.ix;
    let mz = cos * input.iz + sin * input.ix;
    const len = Math.hypot(mx, mz);
    if (len > 1) {
      mx /= len;
      mz /= len;
    }
    const topSpeed = input.sprint ? 8.6 : 5.2;
    const accel = 26;
    this.vx += mx * accel * dt;
    this.vz += mz * accel * dt;
    // friction: bleed velocity toward the wanted direction's speed
    const drag = Math.pow(0.0001, dt);
    if (len < 0.05) {
      this.vx *= drag;
      this.vz *= drag;
    }
    const sp = Math.hypot(this.vx, this.vz);
    if (sp > topSpeed) {
      this.vx = (this.vx / sp) * topSpeed;
      this.vz = (this.vz / sp) * topSpeed;
    }
    let nx = this.x + this.vx * dt;
    let nz = this.z + this.vz * dt;
    [nx, nz] = collideCircle(nx, nz, 0.55, colliders);
    [nx, nz] = keepInCity(nx, nz, 2);
    this.group.position.x = nx;
    this.group.position.z = nz;
    this.speed = Math.hypot(this.vx, this.vz);

    if (faceAngle !== undefined && faceAngle !== null) {
      this.turnToward(faceAngle, dt, 14);
    } else if (this.speed > 0.6) {
      this.turnToward(Math.atan2(this.vx, this.vz), dt, 10);
    }
    this.group.rotation.y = this.angle;

    this.walkPhase += dt * (this.speed > 6 ? 11 : 8) * (this.speed > 0.3 ? 1 : 0);
    const swing = this.speed > 0.3 ? Math.sin(this.walkPhase) * 0.55 : 0;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.7;
    this.armR.rotation.x = this.gunMesh.visible ? -1.2 : swing * 0.7;
  }

  turnToward(target, dt, rate) {
    let diff = target - this.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.angle += diff * Math.min(1, dt * rate);
  }

  setVisible(v) {
    this.group.visible = v;
  }
}
