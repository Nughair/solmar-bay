// The harbour's boats: a driveable runabout with water physics — thrust, drag, a
// turning circle that widens with speed, bob and roll — and moored sisters the
// player can take. Boats live on the water; the shoreline beaches them.

import * as THREE from 'three';
import { WATER_Z } from './world.js';

/** A small open runabout: hull, bow, windshield, bench and outboard motor. */
export function createBoatMesh(colorHex) {
  const group = new THREE.Group();
  const hullMat = new THREE.MeshLambertMaterial({ color: colorHex });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.85, 5.6), hullMat);
  hull.position.y = 0.35;
  hull.castShadow = true;
  group.add(hull);
  const bow = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.8, 1.6), hullMat);
  bow.position.set(0, 0.38, 3.2);
  bow.rotation.x = 0.5;
  group.add(bow);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.18, 3.4), new THREE.MeshLambertMaterial({ color: 0xf3ead2 }));
  deck.position.set(0, 0.82, -0.4);
  group.add(deck);
  const shield = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 0.08), new THREE.MeshLambertMaterial({ color: 0x9fd4e8 }));
  shield.position.set(0, 1.2, 0.9);
  shield.rotation.x = -0.25;
  group.add(shield);
  const bench = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 0.5), new THREE.MeshLambertMaterial({ color: 0x8a4b2a }));
  bench.position.set(0, 0.95, -1.2);
  group.add(bench);
  const motor = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.9, 0.4), new THREE.MeshLambertMaterial({ color: 0x22282c }));
  motor.position.set(0, 0.75, -3.05);
  group.add(motor);
  return group;
}

/** One boat in the water, whoever is driving it. */
export class Boat {
  constructor(colorHex, x, z, heading) {
    this.mesh = createBoatMesh(colorHex);
    this.mesh.position.set(x, 0, z);
    this.heading = heading;
    this.speed = 0;
    this.health = 100;
    this.radius = 2.7;
    this.dead = false;
    this.bobPhase = Math.random() * 6;
  }

  get pos() {
    return this.mesh.position;
  }

  forward() {
    return { x: Math.sin(this.heading), z: Math.cos(this.heading) };
  }
}

/**
 * One physics step on the water. controls: {throttle -1..1, steer -1..1}
 * (steer > 0 turns toward a larger heading, as with cars).
 */
export function stepBoat(boat, controls, dt, elapsed) {
  if (boat.dead) controls = { throttle: 0, steer: 0 };
  if (controls.throttle > 0) boat.speed += 11 * controls.throttle * dt * (1 - Math.max(0, boat.speed) / 34);
  else if (controls.throttle < 0) boat.speed = Math.max(-6, boat.speed - 7 * dt);
  boat.speed -= boat.speed * 0.5 * dt;
  if (Math.abs(boat.speed) < 0.03 && controls.throttle === 0) boat.speed = 0;
  const turn = controls.steer * Math.min(1, Math.abs(boat.speed) / 7) * 0.85;
  boat.heading += turn * dt * Math.sign(boat.speed || 1);

  const f = boat.forward();
  boat.pos.x += f.x * boat.speed * dt;
  boat.pos.z += f.z * boat.speed * dt;
  // The shore beaches a boat: ease it back into the water.
  if (boat.pos.z < WATER_Z + 3) {
    boat.pos.z = WATER_Z + 3;
    boat.speed *= 0.4;
  }
  boat.pos.x = Math.max(-700, Math.min(700, boat.pos.x));
  boat.pos.z = Math.min(1050, boat.pos.z);

  boat.bobPhase += dt * (1.4 + Math.abs(boat.speed) * 0.12);
  boat.mesh.position.y = -0.18 + Math.sin(boat.bobPhase) * 0.09;
  boat.mesh.rotation.y = boat.heading;
  boat.mesh.rotation.z = -controls.steer * Math.min(1, Math.abs(boat.speed) / 16) * 0.13;
  boat.mesh.rotation.x = Math.sin(boat.bobPhase * 0.7) * 0.02 - Math.max(0, boat.speed) * 0.004;
  return boat.speed;
}
