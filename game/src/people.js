// people.js — pedestrians strolling the sidewalks with a leg-swing walk cycle,
// fleeing gunfire, plus police officers who chase on foot. Simple articulated
// figures: torso, head and swinging limbs.
import * as THREE from 'three';
import { blockCoord } from './config.js';
import { pick, randRange } from './rng.js';

const mat = (color) => new THREE.MeshLambertMaterial({ color });
const SHIRTS = [0xff6b6b, 0x4dc3ff, 0xffd93c, 0x6bcb77, 0xf2f2f2, 0xff9f45, 0xb983ff, 0x2ec4b6];

export function buildPersonMesh(shirt, isOfficer) {
  const g = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.78, 0.34), mat(isOfficer ? 0x1d2f57 : shirt));
  torso.position.y = 1.12; g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 8, 7), mat(0xe8b98a));
  head.position.y = 1.72; g.add(head);
  if (isOfficer) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.25, 0.12, 8), mat(0x14264a));
    cap.position.y = 1.9; g.add(cap);
  }
  const legGeo = new THREE.BoxGeometry(0.2, 0.72, 0.22);
  const legMat = mat(isOfficer ? 0x14264a : 0x3a3f4a);
  const legL = new THREE.Mesh(legGeo, legMat); legL.position.set(-0.16, 0.72, 0);
  const legR = new THREE.Mesh(legGeo, legMat); legR.position.set(0.16, 0.72, 0);
  // Pivot legs at the hip by offsetting geometry.
  legL.geometry = legGeo.clone(); legL.geometry.translate(0, -0.36, 0); legL.position.y = 0.74;
  legR.geometry = legGeo.clone(); legR.geometry.translate(0, -0.36, 0); legR.position.y = 0.74;
  g.add(legL); g.add(legR);
  const armGeo = new THREE.BoxGeometry(0.15, 0.62, 0.17);
  armGeo.translate(0, -0.28, 0);
  const armMat = mat(isOfficer ? 0x1d2f57 : shirt);
  const armL = new THREE.Mesh(armGeo, armMat); armL.position.set(-0.4, 1.44, 0); g.add(armL);
  const armR = new THREE.Mesh(armGeo.clone(), armMat); armR.position.set(0.4, 1.44, 0); g.add(armR);
  g.userData.parts = { legL, legR, armL, armR, torso };
  return g;
}

function animateWalk(person, dt, speed) {
  person.walkPhase += dt * (4 + speed * 1.1);
  const s = Math.sin(person.walkPhase) * Math.min(0.6, 0.2 + speed * 0.05);
  const p = person.mesh.userData.parts;
  p.legL.rotation.x = s; p.legR.rotation.x = -s;
  p.armL.rotation.x = -s * 0.8; p.armR.rotation.x = s * 0.8;
  person.mesh.position.copy(person.pos);
  person.mesh.rotation.y = person.heading;
}

export function createPedestrians(scene, rng, count) {
  const peds = [];
  for (let i = 0; i < count; i++) {
    const bx = blockCoord(Math.floor(rng() * 9));
    const bz = blockCoord(Math.floor(rng() * 9));
    const side = Math.floor(rng() * 4);
    const ped = {
      mesh: buildPersonMesh(pick(rng, SHIRTS), false),
      pos: new THREE.Vector3(bx, 0.3, bz),
      heading: rng() * Math.PI * 2,
      speed: randRange(rng, 1.4, 2.4),
      walkPhase: rng() * 6,
      // sidewalk loop: walk the perimeter of one block
      cx: bx, cz: bz, corner: side, t: rng(),
      flee: 0, dead: false, health: 30, isOfficer: false,
    };
    scene.add(ped.mesh);
    peds.push(ped);
  }
  return peds;
}

const HALF_WALK = 23; // sidewalk loop half-extent around a block centre
export function updatePedestrian(ped, dt, danger) {
  if (ped.dead) return;
  if (danger && danger.pos) {
    const d = ped.pos.distanceTo(danger.pos);
    if (d < 26) ped.flee = 2.5;
  }
  if (ped.flee > 0) {
    ped.flee -= dt;
    const away = Math.atan2(ped.pos.x - danger.pos.x, ped.pos.z - danger.pos.z);
    ped.heading = away;
    ped.pos.x += Math.sin(away) * 6.4 * dt;
    ped.pos.z += Math.cos(away) * 6.4 * dt;
    ped.pos.x = Math.max(-258, Math.min(262, ped.pos.x));
    ped.pos.z = Math.max(-258, Math.min(258, ped.pos.z));
    animateWalk(ped, dt, 6.4);
    return;
  }
  // Walk the block perimeter: four straight sides.
  const speed = ped.speed;
  ped.t += (speed * dt) / (HALF_WALK * 2);
  if (ped.t >= 1) { ped.t = 0; ped.corner = (ped.corner + 1) % 4; }
  const u = -HALF_WALK + ped.t * HALF_WALK * 2;
  let x, z, heading;
  if (ped.corner === 0) { x = ped.cx + u; z = ped.cz - HALF_WALK; heading = Math.PI / 2; }
  else if (ped.corner === 1) { x = ped.cx + HALF_WALK; z = ped.cz + u; heading = 0; }
  else if (ped.corner === 2) { x = ped.cx - u; z = ped.cz + HALF_WALK; heading = -Math.PI / 2; }
  else { x = ped.cx - HALF_WALK; z = ped.cz - u; heading = Math.PI; }
  ped.pos.set(x, 0.3, z);
  ped.heading = heading;
  animateWalk(ped, dt, speed);
}

export function createOfficer(scene, pos) {
  const officer = {
    mesh: buildPersonMesh(0x1d2f57, true),
    pos: pos.clone(), heading: 0, speed: 5.6, walkPhase: 0,
    flee: 0, dead: false, health: 60, isOfficer: true, shootCd: 0,
  };
  officer.pos.y = 0.3;
  scene.add(officer.mesh);
  return officer;
}

export function updateOfficer(officer, dt, targetPos) {
  if (officer.dead) return;
  const dx = targetPos.x - officer.pos.x, dz = targetPos.z - officer.pos.z;
  const dist = Math.hypot(dx, dz);
  officer.heading = Math.atan2(dx, dz);
  if (dist > 7) {
    officer.pos.x += Math.sin(officer.heading) * officer.speed * dt;
    officer.pos.z += Math.cos(officer.heading) * officer.speed * dt;
    animateWalk(officer, dt, officer.speed);
  } else {
    officer.mesh.position.copy(officer.pos);
    officer.mesh.rotation.y = officer.heading;
  }
  return dist;
}

export function knockDown(person) {
  person.dead = true;
  person.mesh.rotation.x = -Math.PI / 2;
  person.mesh.position.y = 0.25;
}
