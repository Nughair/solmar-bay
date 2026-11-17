// player.js — Rico Vale on foot: the character mesh, WASD movement relative
// to the camera, sprinting, building collision, and the third-person camera
// rig that both the on-foot and driving views share.

import * as THREE from '../vendor/three.module.min.js';
import { collideCircle } from './city.js';

export function makeRicoMesh() {
  const g = new THREE.Group();
  const jeans = new THREE.MeshLambertMaterial({ color: 0x27324a });
  const jacket = new THREE.MeshLambertMaterial({ color: 0xff7b54 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc68642 });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.8, 0.27), jeans);
  legs.position.y = 0.4;
  g.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.68, 0.32), jacket);
  torso.position.y = 1.13;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.215, 10, 8), skin);
  head.position.y = 1.7;
  head.castShadow = true;
  g.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.26, 0.12, 10),
    new THREE.MeshLambertMaterial({ color: 0x14213d }));
  cap.position.y = 1.86;
  g.add(cap);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.62, 0.14), jacket);
  armL.position.set(-0.36, 1.1, 0);
  g.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.36;
  g.add(armR);
  // The pistol Rico carries: a small dark box in the right hand, raised
  // when he aims (main.js toggles userData.aiming).
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.42),
    new THREE.MeshLambertMaterial({ color: 0x191c20 }));
  gun.position.set(0.36, 0.95, -0.25);
  g.add(gun);
  g.userData.armL = armL;
  g.userData.armR = armR;
  g.userData.gun = gun;
  return g;
}

export class Player {
  constructor(scene) {
    this.mesh = makeRicoMesh();
    scene.add(this.mesh);
    this.x = 3;
    this.z = 95;
    this.heading = Math.PI;      // facing the city (north, -Z is into town)
    this.health = 100;
    this.walkPhase = 0;
    this.speedNow = 0;
    this.visible = true;
  }

  setVisible(v) {
    this.visible = v;
    this.mesh.visible = v;
  }

  place(x, z, heading) {
    this.x = x;
    this.z = z;
    if (heading !== undefined) this.heading = heading;
    this.syncMesh(0);
  }

  // input: {forward, back, left, right, sprint} booleans; camYaw is where
  // the camera looks, movement is relative to it.
  update(dt, input, camYaw, city) {
    let mx = 0, mz = 0;
    if (input.forward) mz += 1;
    if (input.back) mz -= 1;
    if (input.left) mx -= 1;
    if (input.right) mx += 1;
    const moving = (mx !== 0 || mz !== 0);
    const speed = input.sprint ? 8.6 : 5.2;
    if (moving) {
      const len = Math.hypot(mx, mz);
      mx /= len; mz /= len;
      const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
      // World move direction: forward on screen is (sin,cos) of the camera
      // yaw, screen-right is (-cos,sin) of it; combine the two input axes.
      const wx = mz * sin - mx * cos;
      const wz = mz * cos + mx * sin;
      // Face the way we run.
      const target = Math.atan2(wx, wz);
      let dh = target - this.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      this.heading += dh * Math.min(1, dt * 12);
      const [nx, nz] = collideCircle(city, this.x + wx * speed * dt, this.z + wz * speed * dt, 0.55);
      this.x = nx;
      this.z = nz;
      this.speedNow = speed;
      this.walkPhase += dt * (input.sprint ? 11 : 8);
    } else {
      this.speedNow = 0;
    }
    this.syncMesh(dt);
    return moving;
  }

  syncMesh(dt) {
    this.mesh.position.set(this.x, 0.24 + Math.abs(Math.sin(this.walkPhase)) * 0.05, this.z);
    this.mesh.rotation.y = this.heading;
    const swing = Math.sin(this.walkPhase) * (this.speedNow > 0 ? 0.55 : 0);
    this.mesh.userData.armL.rotation.x = swing;
    // Right arm holds the gun: it points forward when aiming.
    this.mesh.userData.armR.rotation.x = this.mesh.userData.aiming ? -1.35 : -swing;
  }
}

// A smooth third-person camera. On foot it orbits at mouse yaw/pitch behind
// Rico; in a car it chases the car's heading. update() lerps the position so
// corners feel soft rather than rigid.
export class FollowCamera {
  constructor(camera) {
    this.camera = camera;
    this.yaw = Math.PI;
    this.pitch = 0.32;
    this.pos = new THREE.Vector3(3, 4, 105);
    this.look = new THREE.Vector3(3, 1.5, 95);
  }

  addLook(dx, dy) {
    this.yaw -= dx * 0.0026;
    this.pitch += dy * 0.0022;
    this.pitch = Math.max(0.04, Math.min(1.15, this.pitch));
  }

  update(dt, target, mode) {
    let dist, height, desiredYaw;
    if (mode === 'car') {
      dist = 9.5;
      height = 3.6;
      desiredYaw = target.heading;
      // Blend the orbit yaw toward the car's heading while driving.
      let dh = desiredYaw - this.yaw;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      this.yaw += dh * Math.min(1, dt * 2.2);
    } else {
      dist = 6.4;
      height = 2.4;
    }
    const cx = target.x - Math.sin(this.yaw) * Math.cos(this.pitch) * dist;
    const cz = target.z - Math.cos(this.yaw) * Math.cos(this.pitch) * dist;
    const cy = height + Math.sin(this.pitch) * dist;
    const k = Math.min(1, dt * (mode === 'car' ? 5.5 : 9));
    this.pos.x += (cx - this.pos.x) * k;
    this.pos.y += (cy - this.pos.y) * k;
    this.pos.z += (cz - this.pos.z) * k;
    if (this.pos.y < 0.7) this.pos.y = 0.7;
    this.camera.position.copy(this.pos);
    const lookTarget = new THREE.Vector3(target.x, 1.6, target.z);
    this.look.lerp(lookTarget, Math.min(1, dt * 10));
    this.camera.lookAt(this.look);
  }

  // Where the camera is looking, as a flat heading — shots fire this way.
  aimHeading() { return this.yaw; }
}
