// city.js — Solmar Bay itself: a procedural sun-soaked harbour city.
// A regular street grid (roads every BLOCK units) with city blocks between
// them. Each block holds four buildings of seeded-random height and colour,
// sidewalks, street lamps, palms along the south shore and a few landmarks
// (the marina, Marina Sol's garage, the hill clinic) the story uses.
// The module also owns the collision data: every building is an axis-aligned
// box, and collideCircle() slides a circle (the player, a car) out of them.

import * as THREE from '../vendor/three.module.min.js';

export const BLOCK = 46;            // distance between road centrelines
export const ROAD_W = 13;           // asphalt width
export const GRID = 3;              // road lines run -GRID..GRID on both axes
export const CITY_EDGE = GRID * BLOCK + BLOCK / 2; // half-size of the world
export const ROADS = [];            // road centrelines on x and on z
for (let i = -GRID; i <= GRID; i++) ROADS.push(i * BLOCK);

// Deterministic little RNG so the city is the same on every visit.
export function makeRng(seed) {
  let s = seed >>> 0;
  return function rng() {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const BUILDING_PALETTE = [0xf2e3c6, 0xe8b4a0, 0xcfd8dc, 0xf7d774, 0x9fd8d2,
  0xe5989b, 0xb8c6db, 0xf6f0e1, 0xffc98a, 0xa8d5ba, 0xd9a5b3, 0x8ecae6];
const ROOF_PALETTE = [0xb5654d, 0x7a6a5f, 0x546e7a, 0x8d6e63, 0x6d4c41];

export class City {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];   // {minX,maxX,minZ,maxZ} for every solid building
    this.buildings = [];   // {x,z,w,d} footprints for the minimap
    this.group = new THREE.Group();
    scene.add(this.group);
    this.rng = makeRng(20261117);
    this.buildGroundAndRoads();
    this.buildBlocks();
    this.buildShore();
    this.buildLamps();
    this.buildLandmarks();
  }

  buildGroundAndRoads() {
    const size = CITY_EDGE * 2 + 80;
    const base = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshLambertMaterial({ color: 0xbfae8e })
    );
    base.rotation.x = -Math.PI / 2;
    base.position.y = -0.06;
    base.receiveShadow = true;
    this.group.add(base);

    const asphalt = new THREE.MeshLambertMaterial({ color: 0x33373d });
    const extent = CITY_EDGE + ROAD_W;
    for (const c of ROADS) {
      const alongX = new THREE.Mesh(new THREE.PlaneGeometry(extent * 2, ROAD_W), asphalt);
      alongX.rotation.x = -Math.PI / 2;
      alongX.position.set(0, 0, c);
      alongX.receiveShadow = true;
      this.group.add(alongX);
      const alongZ = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, extent * 2), asphalt);
      alongZ.rotation.x = -Math.PI / 2;
      alongZ.position.set(c, 0.01, 0);
      alongZ.receiveShadow = true;
      this.group.add(alongZ);
    }

    // Dashed centre lines: little white boxes laid on the asphalt, drawn as
    // one InstancedMesh so the whole set costs a single draw call.
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xf5eeda });
    const dashGeo = new THREE.BoxGeometry(3.2, 0.04, 0.5);
    const dashMats = [];
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const eu = new THREE.Euler();
    for (const c of ROADS) {
      for (let t = -CITY_EDGE; t <= CITY_EDGE; t += 9) {
        if (ROADS.some(r => Math.abs(r - t) < ROAD_W)) continue;
        eu.set(0, 0, 0); q.setFromEuler(eu);
        dashMats.push(m4.clone().compose(new THREE.Vector3(t, 0.03, c), q, new THREE.Vector3(1, 1, 1)));
        eu.set(0, Math.PI / 2, 0); q.setFromEuler(eu);
        dashMats.push(m4.clone().compose(new THREE.Vector3(c, 0.03, t), q, new THREE.Vector3(1, 1, 1)));
      }
    }
    const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashMats.length);
    dashMats.forEach((m, i) => dashes.setMatrixAt(i, m));
    this.group.add(dashes);

    // The sea, south of the city: a big flat blue plane past the last road.
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(size, 190),
      new THREE.MeshLambertMaterial({ color: 0x1d7a9e })
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, -0.04, CITY_EDGE + 108);
    this.group.add(sea);
    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(size, 16),
      new THREE.MeshLambertMaterial({ color: 0xe8d49a })
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(0, -0.02, CITY_EDGE + 10);
    this.group.add(sand);
  }

  buildBlocks() {
    const sidewalkMat = new THREE.MeshLambertMaterial({ color: 0x9aa0a3 });
    const inner = BLOCK - ROAD_W;              // buildable square per block
    const half = inner / 2;
    for (let bx = -GRID; bx < GRID; bx++) {
      for (let bz = -GRID; bz < GRID; bz++) {
        const cx = bx * BLOCK + BLOCK / 2;
        const cz = bz * BLOCK + BLOCK / 2;
        // Skip the marina plaza block (south-east) and the clinic block.
        if ((bx === 2 && bz === 2) || (bx === -3 && bz === -3)) continue;
        const walk = new THREE.Mesh(new THREE.BoxGeometry(inner + 3, 0.24, inner + 3), sidewalkMat);
        walk.position.set(cx, 0.12, cz);
        walk.receiveShadow = true;
        this.group.add(walk);
        // Four buildings per block, one per quadrant, with gaps for alleys.
        for (let qx = -1; qx <= 1; qx += 2) {
          for (let qz = -1; qz <= 1; qz += 2) {
            // Buildings stay inside their quadrant (offset 9.75, half-size
            // at most 6.25) so a clear sidewalk frame rings every block.
            const w = 9.5 + this.rng() * 3;
            const d = 9.5 + this.rng() * 3;
            const downtown = Math.max(0, 1 - (Math.abs(cx) + Math.abs(cz)) / (CITY_EDGE * 1.6));
            const h = 7 + this.rng() * 10 + downtown * downtown * 26;
            const x = cx + qx * (half / 2 + 1.5);
            const z = cz + qz * (half / 2 + 1.5);
            this.addBuilding(x, z, w, d, h);
          }
        }
      }
    }
  }

  addBuilding(x, z, w, d, h) {
    const color = BUILDING_PALETTE[Math.floor(this.rng() * BUILDING_PALETTE.length)];
    const mat = new THREE.MeshLambertMaterial({ color });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, h / 2 + 0.2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.7, 0.5, d + 0.7),
      new THREE.MeshLambertMaterial({ color: ROOF_PALETTE[Math.floor(this.rng() * ROOF_PALETTE.length)] })
    );
    roof.position.set(x, h + 0.45, z);
    roof.castShadow = true;
    this.group.add(roof);
    this.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    this.buildings.push({ x, z, w, d });
    return mesh;
  }

  buildShore() {
    // Palms along the beach promenade on the south edge — trunks and fronds
    // are instanced, so two dozen palms cost two draw calls.
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6b45 });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f9e4d });
    const spots = [];
    for (let x = -CITY_EDGE + 6; x < CITY_EDGE - 4; x += 15) {
      spots.push({ x, z: CITY_EDGE - 4 + this.rng() * 3, lean: (this.rng() - 0.5) * 0.16 });
    }
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const eu = new THREE.Euler();
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.34, 5.4, 6), trunkMat, spots.length);
    spots.forEach((s, i) => {
      eu.set(0, 0, s.lean); q.setFromEuler(eu);
      trunks.setMatrixAt(i, m4.clone().compose(new THREE.Vector3(s.x, 2.7, s.z), q, new THREE.Vector3(1, 1, 1)));
    });
    trunks.castShadow = true;
    this.group.add(trunks);
    const leaves = new THREE.InstancedMesh(new THREE.ConeGeometry(0.5, 3.6, 4), leafMat, spots.length * 5);
    let li = 0;
    for (const s of spots) {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        eu.set(Math.sin(a) * 1.15, 0, Math.cos(a) * 1.15 + Math.PI); q.setFromEuler(eu);
        leaves.setMatrixAt(li++, m4.clone().compose(
          new THREE.Vector3(s.x + Math.cos(a) * 1.1, 5.6, s.z + Math.sin(a) * 1.1), q, new THREE.Vector3(1, 1, 1)));
      }
    }
    this.group.add(leaves);
  }

  buildLamps() {
    // Street lamps at intersections: a pole and a glowing head. They are
    // pure decoration (no colliders) so driving stays forgiving.
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a4149 });
    const headMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
    const spots = [];
    for (const rx of ROADS) {
      for (const rz of ROADS) {
        for (const [ox, oz] of [[7.6, 7.6], [-7.6, -7.6]]) spots.push([rx + ox, rz + oz]);
      }
    }
    const m4 = new THREE.Matrix4();
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.16, 5.2, 5), poleMat, spots.length);
    const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.42, 8, 6), headMat, spots.length);
    spots.forEach(([x, z], i) => {
      poles.setMatrixAt(i, m4.clone().makeTranslation(x, 2.6, z));
      heads.setMatrixAt(i, m4.clone().makeTranslation(x, 5.3, z));
    });
    this.group.add(poles);
    this.group.add(heads);
    // Neon signs on a few downtown corners — flat coloured panels.
    const neonColors = [0xff5e7a, 0x35d0ff, 0xffb52e, 0x7be495];
    let n = 0;
    for (const b of this.buildings) {
      if (Math.abs(b.x) < BLOCK && Math.abs(b.z) < BLOCK && n < 6) {
        const sign = new THREE.Mesh(
          new THREE.BoxGeometry(4.6, 1.4, 0.2),
          new THREE.MeshBasicMaterial({ color: neonColors[n % neonColors.length] })
        );
        sign.position.set(b.x, 5.4, b.z + b.d / 2 + 0.2);
        this.group.add(sign);
        n++;
      }
    }
  }

  buildLandmarks() {
    // Marina Sol's garage: a low wide shed with a gold door, south-east.
    const garage = this.addBuilding(2 * BLOCK + BLOCK / 2, 2 * BLOCK + BLOCK / 2, 20, 14, 6);
    garage.material = new THREE.MeshLambertMaterial({ color: 0x546e7a });
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(9, 4.4, 0.3),
      new THREE.MeshBasicMaterial({ color: 0xffb52e })
    );
    door.position.set(2 * BLOCK + BLOCK / 2, 2.4, 2 * BLOCK + BLOCK / 2 - 7.2);
    this.group.add(door);
    // The hill clinic: white block in the north-west, where Rico wakes up.
    const clinic = this.addBuilding(-3 * BLOCK + BLOCK / 2, -3 * BLOCK + BLOCK / 2, 18, 13, 9);
    clinic.material = new THREE.MeshLambertMaterial({ color: 0xf4f7f7 });
    const crossMat = new THREE.MeshBasicMaterial({ color: 0xe8433c });
    const c1 = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1, 0.25), crossMat);
    c1.position.set(-3 * BLOCK + BLOCK / 2, 7.4, -3 * BLOCK + BLOCK / 2 - 6.7);
    this.group.add(c1);
    const c2 = new THREE.Mesh(new THREE.BoxGeometry(1, 3.4, 0.25), crossMat);
    c2.position.set(-3 * BLOCK + BLOCK / 2, 7.4, -3 * BLOCK + BLOCK / 2 - 6.7);
    this.group.add(c2);
  }
}

// Slide a circle at (x,z) with radius r out of every building box and clamp
// it inside the world. Returns [x, z, hit] — hit is true when it pushed.
export function collideCircle(city, x, z, r) {
  let hit = false;
  for (const b of city.colliders) {
    const nx = Math.max(b.minX, Math.min(x, b.maxX));
    const nz = Math.max(b.minZ, Math.min(z, b.maxZ));
    const dx = x - nx;
    const dz = z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        x = nx + (dx / d) * r;
        z = nz + (dz / d) * r;
      } else {
        // Centre inside the box: push out along the smallest penetration.
        const left = x - b.minX, right = b.maxX - x, top = z - b.minZ, bot = b.maxZ - z;
        const m = Math.min(left, right, top, bot);
        if (m === left) x = b.minX - r;
        else if (m === right) x = b.maxX + r;
        else if (m === top) z = b.minZ - r;
        else z = b.maxZ + r;
      }
    }
  }
  const lim = CITY_EDGE + 14;
  if (x < -lim) { x = -lim; hit = true; }
  if (x > lim) { x = lim; hit = true; }
  if (z < -lim) { z = -lim; hit = true; }
  if (z > CITY_EDGE + 16) { z = CITY_EDGE + 16; hit = true; }
  return [x, z, hit];
}

// Nearest point on the road network to (x,z) — used to spawn traffic and
// police sensibly, and by the AI when it plans a route.
export function nearestRoadPoint(x, z) {
  let bx = ROADS[0], bz = ROADS[0];
  for (const r of ROADS) {
    if (Math.abs(r - x) < Math.abs(bx - x)) bx = r;
    if (Math.abs(r - z) < Math.abs(bz - z)) bz = r;
  }
  // Snap to whichever axis is closer: a point on a road, not an intersection.
  if (Math.abs(bx - x) < Math.abs(bz - z)) return { x: bx, z };
  return { x, z: bz };
}

// A friendly district name for the HUD, from position.
export function districtName(x, z) {
  if (z > BLOCK * 1.5) return 'Marina District';
  if (z < -BLOCK * 1.5 && x < -BLOCK) return 'Clinic Hill';
  if (x > BLOCK * 1.5) return 'Casino Strip';
  if (x < -BLOCK * 1.5) return 'Old Warehouses';
  if (Math.abs(x) < BLOCK && Math.abs(z) < BLOCK) return 'Downtown';
  return 'Old Harbour';
}
