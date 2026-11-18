// Solmar Bay itself: a sun-soaked 9x9 street grid of pastel towers, a promenade, a
// sandy beach, the harbour pier and open water to the south. One seeded build makes
// the same city every visit. Buildings are a single instanced mesh with a painted
// window texture; their footprints double as the collision set for everything that
// moves. The street centre lines form the node grid traffic drives on.

import * as THREE from 'three';
import { makeRng, range, pick, chance } from './rng.js';

export const BLOCK_PITCH = 60;
export const CITY_EDGE = 270;
export const WATER_Z = 332;
export const STREET_LINES = [-270, -210, -150, -90, -30, 30, 90, 150, 210, 270];

const PASTELS = [0xf7ead7, 0xf6cfa5, 0xf2a488, 0xe88ca0, 0xa8d8c8, 0x9fc8e8, 0xf7e08a, 0xe8b4d8, 0xcfe0a8, 0xffffff];

/** A canvas of lit and dark windows, repeated over every tower's faces. */
function makeWindowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#dfe6ea';
  ctx.fillRect(0, 0, 128, 256);
  const rng = makeRng(777);
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 6; x += 1) {
      const lit = rng() < 0.42;
      ctx.fillStyle = lit ? '#ffd98a' : '#33475c';
      ctx.fillRect(8 + x * 20, 10 + y * 15, 12, 8);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A canvas sign with big painted letters, for the garage and billboards. */
export function makeSignTexture(text, back, front) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = back;
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = front;
  ctx.font = '900 64px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 68);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Push a circle (x/z position object) out of every building footprint it overlaps. */
export function collideCircle(colliders, pos, radius) {
  for (const box of colliders) {
    const nearX = Math.max(box.minX, Math.min(pos.x, box.maxX));
    const nearZ = Math.max(box.minZ, Math.min(pos.z, box.maxZ));
    const dx = pos.x - nearX;
    const dz = pos.z - nearZ;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      pos.x = nearX + (dx / d) * radius;
      pos.z = nearZ + (dz / d) * radius;
    } else {
      // Centre inside the box: leave by the shallowest face.
      const left = pos.x - box.minX;
      const right = box.maxX - pos.x;
      const top = pos.z - box.minZ;
      const bottom = box.maxZ - pos.z;
      const min = Math.min(left, right, top, bottom);
      if (min === left) pos.x = box.minX - radius;
      else if (min === right) pos.x = box.maxX + radius;
      else if (min === top) pos.z = box.minZ - radius;
      else pos.z = box.maxZ + radius;
    }
  }
}

/** True when a point is on the water (south of the shoreline). */
export function isWater(x, z) {
  return z > WATER_Z;
}

export function buildWorld(scene, seed = 20261117) {
  const rng = makeRng(seed);
  const colliders = [];
  const group = new THREE.Group();
  scene.add(group);

  // ---- Lights and sky -------------------------------------------------------
  const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x8a6f4d, 0.75);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe3b3, 1.6);
  sun.position.set(180, 260, -120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -340;
  sun.shadow.camera.right = 340;
  sun.shadow.camera.top = 340;
  sun.shadow.camera.bottom = -340;
  sun.shadow.camera.far = 900;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);
  const moon = new THREE.DirectionalLight(0x8fb4ff, 0);
  moon.position.set(-120, 200, 140);
  scene.add(moon);

  // ---- Ground: asphalt city, promenade, sand, sea ---------------------------
  const asphalt = new THREE.Mesh(
    new THREE.PlaneGeometry(620, 620),
    new THREE.MeshLambertMaterial({ color: 0x3d454e }),
  );
  asphalt.rotation.x = -Math.PI / 2;
  asphalt.position.set(0, 0, -12);
  asphalt.receiveShadow = true;
  group.add(asphalt);

  const promenade = new THREE.Mesh(
    new THREE.BoxGeometry(620, 0.24, 18),
    new THREE.MeshLambertMaterial({ color: 0xd8c49a }),
  );
  promenade.position.set(0, 0.12, 285);
  promenade.receiveShadow = true;
  group.add(promenade);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(1400, 90),
    new THREE.MeshLambertMaterial({ color: 0xeed9a4 }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, -0.05, 332);
  sand.receiveShadow = true;
  group.add(sand);

  const waterMat = new THREE.MeshPhongMaterial({ color: 0x14708c, shininess: 160, specular: 0xbfefff, transparent: true, opacity: 0.94 });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(2400, 1100), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.55, WATER_Z + 548);
  group.add(water);

  // Foam lines that breathe at the shoreline.
  const foams = [];
  const foamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });
  for (let i = 0; i < 3; i += 1) {
    const foam = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1.6), foamMat.clone());
    foam.rotation.x = -Math.PI / 2;
    foam.position.set(0, 0.02, WATER_Z - 2 + i * 3.4);
    group.add(foam);
    foams.push(foam);
  }

  // ---- Blocks: sidewalks, buildings, roofs ----------------------------------
  const slabGeo = new THREE.BoxGeometry(46, 0.24, 46);
  const slabMat = new THREE.MeshLambertMaterial({ color: 0x9aa0a2 });
  const slabs = new THREE.InstancedMesh(slabGeo, slabMat, 81);
  slabs.receiveShadow = true;

  const windowTexture = makeWindowTexture();
  const towerGeo = new THREE.BoxGeometry(1, 1, 1);
  towerGeo.translate(0, 0.5, 0);
  const towerMat = new THREE.MeshLambertMaterial({ map: windowTexture, emissive: 0xffc873, emissiveMap: windowTexture, emissiveIntensity: 0 });
  const MAX_TOWERS = 340;
  const towers = new THREE.InstancedMesh(towerGeo, towerMat, MAX_TOWERS);
  towers.castShadow = true;
  towers.receiveShadow = true;

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let slabIndex = 0;
  let towerIndex = 0;
  const garageBlock = { bx: -4, bz: 4 }; // south-west corner block is Vera's yard

  function addTower(x, z, w, d, h, tint) {
    if (towerIndex >= MAX_TOWERS) return;
    dummy.position.set(x, 0.24, z);
    dummy.scale.set(w, h, d);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    towers.setMatrixAt(towerIndex, dummy.matrix);
    towers.setColorAt(towerIndex, color.setHex(tint));
    towerIndex += 1;
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  }

  for (let bx = -4; bx <= 4; bx += 1) {
    for (let bz = -4; bz <= 4; bz += 1) {
      const cx = bx * BLOCK_PITCH;
      const cz = bz * BLOCK_PITCH;
      dummy.position.set(cx, 0.12, cz);
      dummy.scale.set(1, 1, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      slabs.setMatrixAt(slabIndex, dummy.matrix);
      slabIndex += 1;
      if (bx === garageBlock.bx && bz === garageBlock.bz) continue; // Vera's yard, built below
      const layout = rng();
      if (layout < 0.52) {
        for (const ox of [-11.5, 11.5]) {
          for (const oz of [-11.5, 11.5]) {
            addTower(cx + ox, cz + oz, range(rng, 16, 20), range(rng, 16, 20), range(rng, 12, 44), pick(rng, PASTELS));
          }
        }
      } else if (layout < 0.8) {
        addTower(cx - 11, cz, 19, range(rng, 30, 40), range(rng, 18, 52), pick(rng, PASTELS));
        addTower(cx + 12, cz, 17, range(rng, 24, 36), range(rng, 14, 38), pick(rng, PASTELS));
      } else if (layout < 0.93) {
        addTower(cx, cz, range(rng, 26, 32), range(rng, 26, 32), range(rng, 52, 96), pick(rng, PASTELS));
      }
      // The remaining blocks stay open: plazas and parking bays.
    }
  }
  towers.count = towerIndex;
  group.add(slabs);
  group.add(towers);

  // ---- Vera's garage: the story's home base ----------------------------------
  const garage = new THREE.Group();
  const garageBody = new THREE.Mesh(
    new THREE.BoxGeometry(34, 9, 22),
    new THREE.MeshLambertMaterial({ color: 0xf2e3c2 }),
  );
  garageBody.position.set(-240, 4.74, 240);
  garageBody.castShadow = true;
  garage.add(garageBody);
  const garageSign = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 7),
    new THREE.MeshBasicMaterial({ map: makeSignTexture("VERA'S GARAGE", '#17303e', '#ffd75e') }),
  );
  garageSign.position.set(-240, 8.2, 251.2);
  garage.add(garageSign);
  const garageDoor = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 6),
    new THREE.MeshLambertMaterial({ color: 0x4d6a78 }),
  );
  garageDoor.position.set(-240, 3.4, 251.15);
  garage.add(garageDoor);
  group.add(garage);
  colliders.push({ minX: -257, maxX: -223, minZ: 229, maxZ: 251 });
  const garagePos = new THREE.Vector3(-240, 0, 264);

  // ---- Billboards -------------------------------------------------------------
  const ads = [
    ['SOLMAR COLA', '#0d4d5c', '#aef2ff'],
    ['HOTEL AZURE', '#20386e', '#ffe9a8'],
    ['BAY BOAT HIRE', '#6e2f1d', '#ffd0a8'],
    ['PALMS CASINO', '#3d1454', '#f2a8ff'],
  ];
  ads.forEach(([text, back, front], i) => {
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(26, 6.5),
      new THREE.MeshBasicMaterial({ map: makeSignTexture(text, back, front), side: THREE.DoubleSide }),
    );
    const spots = [
      [-90, 46, -122], [150, 58, 62], [32, 40, 178], [-152, 52, -58],
    ];
    board.position.set(spots[i][0], spots[i][1], spots[i][2]);
    board.rotation.y = i % 2 === 0 ? 0 : Math.PI / 2;
    group.add(board);
  });

  // ---- Palms and lamps ---------------------------------------------------------
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.3, 5.4, 5);
  trunkGeo.translate(0, 2.7, 0);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a42 });
  const frondGeo = new THREE.ConeGeometry(3.1, 1.5, 7);
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x2e8c4f });
  const palmSpots = [];
  for (let x = -290; x <= 290; x += 29) {
    palmSpots.push([x + range(rng, -3, 3), 296 + range(rng, -2, 2)]);
    if (chance(rng, 0.6)) palmSpots.push([x + 12, 318 + range(rng, 0, 6)]);
  }
  for (let i = 0; i < 26; i += 1) {
    const line = pick(rng, STREET_LINES);
    const along = range(rng, -285, 285);
    palmSpots.push(chance(rng, 0.5) ? [line + 24, along] : [along, line + 24]);
  }
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
  const fronds = new THREE.InstancedMesh(frondGeo, frondMat, palmSpots.length);
  trunks.castShadow = true;
  palmSpots.forEach(([x, z], i) => {
    const tilt = range(rng, -0.09, 0.09);
    dummy.position.set(x, 0, z);
    dummy.rotation.set(tilt, range(rng, 0, Math.PI * 2), tilt);
    dummy.scale.set(1, range(rng, 0.85, 1.25), 1);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    dummy.position.y = 5.4 * dummy.scale.y - 0.4;
    dummy.updateMatrix();
    fronds.setMatrixAt(i, dummy.matrix);
  });
  group.add(trunks);
  group.add(fronds);

  const poleGeo = new THREE.CylinderGeometry(0.09, 0.09, 6.4, 5);
  poleGeo.translate(0, 3.2, 0);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2c3438 });
  const lampGeo = new THREE.SphereGeometry(0.42, 8, 6);
  const lampMat = new THREE.MeshLambertMaterial({ color: 0xfff2c8, emissive: 0xffca66, emissiveIntensity: 0 });
  const lampSpots = [];
  for (const lx of STREET_LINES) {
    for (const lz of STREET_LINES) {
      lampSpots.push([lx + 8.6, lz + 8.6]);
    }
  }
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, lampSpots.length);
  const lampHeads = new THREE.InstancedMesh(lampGeo, lampMat, lampSpots.length);
  lampSpots.forEach(([x, z], i) => {
    dummy.position.set(x, 0, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    poles.setMatrixAt(i, dummy.matrix);
    dummy.position.y = 6.5;
    dummy.updateMatrix();
    lampHeads.setMatrixAt(i, dummy.matrix);
  });
  group.add(poles);
  group.add(lampHeads);

  // ---- Marina pier and moored boats' dock --------------------------------------
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x9a7a52 });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(70, 1.2, 10), pierMat);
  pier.position.set(-120, 0.1, 322);
  pier.receiveShadow = true;
  group.add(pier);
  const jetty = new THREE.Mesh(new THREE.BoxGeometry(8, 1.2, 60), pierMat);
  jetty.position.set(-120, 0.1, 356);
  group.add(jetty);
  colliders.push({ minX: -157, maxX: -83, minZ: 316, maxZ: 328 });
  const pierPos = new THREE.Vector3(-120, 0, 330);

  // Beach umbrellas.
  const umbrellaMat = new THREE.MeshLambertMaterial({ color: 0xe85d75 });
  for (let i = 0; i < 9; i += 1) {
    const ux = range(rng, -280, 280);
    const uz = range(rng, 300, 322);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 5), poleMat);
    pole.position.set(ux, 1.3, uz);
    const top = new THREE.Mesh(new THREE.ConeGeometry(2.2, 0.8, 8), umbrellaMat);
    top.position.set(ux, 2.7, uz);
    group.add(pole);
    group.add(top);
  }

  const world = {
    group,
    colliders,
    sun,
    moon,
    hemi,
    towerMat,
    lampMat,
    waterMat,
    garagePos,
    pierPos,
    towerCount: towerIndex,
    update(dt, elapsed) {
      waterMat.color.setHSL(0.54, 0.72, 0.3 + Math.sin(elapsed * 0.4) * 0.02);
      foams.forEach((foam, i) => {
        foam.material.opacity = 0.28 + 0.22 * Math.sin(elapsed * 0.9 + i * 1.7);
        foam.position.z = WATER_Z - 2 + i * 3.4 + Math.sin(elapsed * 0.5 + i) * 0.7;
      });
    },
    /** f: 0 at noon, 1 at deep night — drives window glow and lamp light. */
    setNight(f) {
      towerMat.emissiveIntensity = f * 0.85;
      lampMat.emissiveIntensity = f * 1.6;
    },
  };
  return world;
}
