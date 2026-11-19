// boat.js — the driveable hire boat: hull, cabin, outboard wake, throttle and
// steering on the water east of the beach, plus mooring at the dock.
import * as THREE from 'three';
import { CITY } from './config.js';

const mat = (color, opts) => new THREE.MeshLambertMaterial(Object.assign({ color }, opts || {}));

export function createBoat(scene) {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1, 6.4), mat(0xf2f2f2));
  hull.position.y = 0.55; g.add(hull);
  const bow = new THREE.Mesh(new THREE.ConeGeometry(1.3, 2.2, 4), mat(0xd23b2e));
  bow.rotation.x = Math.PI / 2; bow.rotation.y = Math.PI / 4;
  bow.position.set(0, 0.55, 4.1); bow.scale.set(1, 1, 0.45); g.add(bow);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.65, 0.3, 6.0), mat(0xd23b2e));
  stripe.position.y = 0.85; g.add(stripe);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 1.6), mat(0x2e6fd2));
  seat.position.set(0, 1.25, -0.8); g.add(seat);
  const motor = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, 0.5), mat(0x22262c));
  motor.position.set(0, 0.9, -3.4); g.add(motor);
  scene.add(g);

  // Wake: a fading foam quad trail behind the boat.
  const wakeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 });
  const wake = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 9), wakeMat);
  wake.rotation.x = -Math.PI / 2;
  scene.add(wake);

  const boat = {
    mesh: g, wake,
    pos: new THREE.Vector3(CITY.dockX + 16, 0, CITY.dockZ + 10),
    heading: -Math.PI / 2, speed: 0, occupied: false,
  };
  g.position.copy(boat.pos);
  return boat;
}

export function updateBoat(boat, dt, input) {
  if (boat.occupied && input) {
    if (input.forward) boat.speed += 11 * dt;
    else if (input.back) boat.speed -= 8 * dt;
    else boat.speed -= boat.speed * 0.55 * dt;
    boat.speed = Math.max(-6, Math.min(19, boat.speed));
    const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    if (Math.abs(boat.speed) > 0.3) boat.heading += steer * dt * 0.95 * Math.sign(boat.speed);
  } else {
    boat.speed -= boat.speed * 0.8 * dt;
    // Gentle bobbing drift back toward the mooring when empty.
  }
  boat.pos.x += Math.sin(boat.heading) * boat.speed * dt;
  boat.pos.z += Math.cos(boat.heading) * boat.speed * dt;
  // Stay on the water: soft bounds keep the boat off the beach and in the bay.
  boat.pos.x = Math.max(CITY.seaX - 6, Math.min(560, boat.pos.x));
  boat.pos.z = Math.max(-320, Math.min(320, boat.pos.z));
  const bob = Math.sin(performance.now() * 0.002) * 0.08;
  boat.mesh.position.set(boat.pos.x, bob, boat.pos.z);
  boat.mesh.rotation.y = boat.heading;
  boat.mesh.rotation.z = Math.sin(performance.now() * 0.0016) * 0.02;
  // Wake follows behind, scaled by speed.
  const back = 5 + Math.abs(boat.speed) * 0.35;
  boat.wake.position.set(
    boat.pos.x - Math.sin(boat.heading) * back,
    0.2,
    boat.pos.z - Math.cos(boat.heading) * back,
  );
  boat.wake.rotation.z = -boat.heading;
  boat.wake.material.opacity = Math.min(0.4, Math.abs(boat.speed) * 0.03);
  return Math.abs(boat.speed);
}
