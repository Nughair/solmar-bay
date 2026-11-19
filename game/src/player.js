// player.js — the on-foot player: third-person figure, movement with building
// collision, and hitscan combat (muzzle flash, tracer, hit reactions).
import * as THREE from 'three';
import { PLAYER } from './config.js';
import { buildPersonMesh } from './people.js';

export function createPlayer(scene) {
  const mesh = buildPersonMesh(0xffc93c, false);
  scene.add(mesh);
  const player = {
    mesh,
    pos: new THREE.Vector3(-224, 0.3, -196),
    heading: Math.PI / 2,
    health: PLAYER.maxHealth,
    walkPhase: 0,
    mode: 'foot',           // foot | car | boat
    vehicle: null,
    shootCd: 0,
    ammo: Infinity,
    dead: false,
  };
  mesh.position.copy(player.pos);
  return player;
}

export function updatePlayerOnFoot(player, dt, input, collide) {
  const speed = input.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
  let mx = 0, mz = 0;
  // Movement is camera-relative: input gives camera yaw.
  const yaw = input.camYaw;
  const f = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
  const s = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  mx = Math.sin(yaw) * f + Math.cos(yaw) * s;
  mz = Math.cos(yaw) * f - Math.sin(yaw) * s;
  const len = Math.hypot(mx, mz);
  if (len > 0.01) {
    mx /= len; mz /= len;
    player.pos.x += mx * speed * dt;
    player.pos.z += mz * speed * dt;
    player.heading = Math.atan2(mx, mz);
    player.walkPhase += dt * (f !== 0 || s !== 0 ? (input.run ? 13 : 9) : 9);
    const p = player.mesh.userData.parts;
    const sw = Math.sin(player.walkPhase) * 0.55;
    p.legL.rotation.x = sw; p.legR.rotation.x = -sw;
    p.armL.rotation.x = -sw * 0.7; p.armR.rotation.x = sw * 0.7;
  }
  player.pos.x = Math.max(-262, Math.min(272, player.pos.x));
  player.pos.z = Math.max(-262, Math.min(262, player.pos.z));
  if (collide) collide(player.pos, PLAYER.radius);
  player.mesh.position.copy(player.pos);
  player.mesh.rotation.y = input.aiming ? input.camYaw : player.heading;
  if (player.shootCd > 0) player.shootCd -= dt;
}

// Hitscan helpers live in main (they need the whole world); this module owns
// the visual kit: a shared muzzle flash sprite and tracer line pool.
export function createCombatFx(scene) {
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0 });
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5), flashMat);
  flash.visible = false;
  scene.add(flash);
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0 });
  const tracerGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const tracer = new THREE.Line(tracerGeo, tracerMat);
  tracer.visible = false;
  scene.add(tracer);
  let timer = 0;
  return {
    fire(from, to) {
      flash.position.copy(from); flash.visible = true; flashMat.opacity = 0.95;
      const pts = [from.clone(), to.clone()];
      tracer.geometry.setFromPoints(pts);
      tracer.visible = true; tracerMat.opacity = 0.85;
      timer = 0.07;
    },
    update(dt) {
      if (timer > 0) {
        timer -= dt;
        if (timer <= 0) { flash.visible = false; tracer.visible = false; }
      }
    },
  };
}
