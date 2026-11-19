// city.js — builds the Solmar Bay city: 9x9 grid of blocks with ~240 varied
// buildings, roads with markings, sidewalks, street props, the beach, the sea
// and the boat dock. Exposes building colliders and the day/night materials.
import * as THREE from 'three';
import { CITY, BUILDING_COLORS, blockCoord, roadCoord } from './config.js';
import { pick, randRange } from './rng.js';

export function createCity(scene, rng) {
  const colliders = [];       // {minX,maxX,minZ,maxZ} building footprints
  const windowMats = [];      // emissive window materials, glow at night
  const lampLights = [];      // street light glow sprites toggled at night
  const group = new THREE.Group();
  scene.add(group);

  const mat = (color, opts) => new THREE.MeshLambertMaterial(Object.assign({ color }, opts || {}));

  // Ground base (under everything): warm pavement tone.
  const base = new THREE.Mesh(new THREE.PlaneGeometry(760, 760), mat(0x8f8a80));
  base.rotation.x = -Math.PI / 2; base.position.set(60, -0.05, 0);
  group.add(base);

  // Roads: dark strips along every road line, both directions.
  const roadMat = mat(0x33363c);
  const roadGeoH = new THREE.PlaneGeometry(560, CITY.road);
  const roadGeoV = new THREE.PlaneGeometry(CITY.road, 560);
  for (let i = 0; i <= CITY.blocks; i++) {
    const c = roadCoord(i);
    const h = new THREE.Mesh(roadGeoH, roadMat);
    h.rotation.x = -Math.PI / 2; h.position.set(0, 0.01, c); group.add(h);
    const v = new THREE.Mesh(roadGeoV, roadMat);
    v.rotation.x = -Math.PI / 2; v.position.set(c, 0.01, 0); group.add(v);
  }
  // Road markings: dashed centre lines.
  const dashMat = mat(0xf5eeda);
  const dashGeo = new THREE.PlaneGeometry(5, 0.5);
  for (let i = 0; i <= CITY.blocks; i++) {
    const c = roadCoord(i);
    for (let d = -252; d < 252; d += 14) {
      const a = new THREE.Mesh(dashGeo, dashMat);
      a.rotation.x = -Math.PI / 2; a.position.set(d + 7, 0.03, c); group.add(a);
      const b = new THREE.Mesh(dashGeo, dashMat);
      b.rotation.x = -Math.PI / 2; b.rotation.z = Math.PI / 2; b.position.set(c, 0.03, d + 7); group.add(b);
    }
  }
  // Sidewalks + buildings per block.
  const walkMat = mat(0xb9b2a4);
  const walkGeo = new THREE.BoxGeometry(CITY.block + 4, 0.3, CITY.block + 4);
  const winMatA = new THREE.MeshLambertMaterial({ color: 0x9db8c8, emissive: 0x000000 });
  const winMatB = new THREE.MeshLambertMaterial({ color: 0xcbb27f, emissive: 0x000000 });
  windowMats.push(winMatA, winMatB);
  let buildingCount = 0;
  for (let bx = 0; bx < CITY.blocks; bx++) {
    for (let bz = 0; bz < CITY.blocks; bz++) {
      const cx = blockCoord(bx), cz = blockCoord(bz);
      const walk = new THREE.Mesh(walkGeo, walkMat);
      walk.position.set(cx, 0.15, cz); group.add(walk);
      // 2-4 buildings per block on a sub-grid.
      const spots = [[-10, -10], [10, -10], [-10, 10], [10, 10]];
      const n = 2 + Math.floor(rng() * 3);
      for (let s = 0; s < n; s++) {
        const [ox, oz] = spots[s];
        const w = randRange(rng, 13, 17), d = randRange(rng, 13, 17);
        const h = randRange(rng, 9, 46) * (1 + rng() * 0.4);
        const color = pick(rng, BUILDING_COLORS);
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
        b.position.set(cx + ox, h / 2 + 0.3, cz + oz);
        group.add(b);
        // Window band: slightly larger thin box with emissive material.
        const win = new THREE.Mesh(
          new THREE.BoxGeometry(w + 0.15, h * 0.82, d + 0.15),
          rng() > 0.5 ? winMatA : winMatB,
        );
        win.position.copy(b.position);
        // Taller towers get a window shell: a slightly larger, shorter box in
        // dark glass that glows amber at night via its emissive material.
        if (h > 16) group.add(win);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6), mat(0x5a5348));
        roof.position.set(cx + ox, h + 0.55, cz + oz); group.add(roof);
        colliders.push({ minX: cx + ox - w / 2, maxX: cx + ox + w / 2, minZ: cz + oz - d / 2, maxZ: cz + oz + d / 2 });
        buildingCount++;
      }
    }
  }

  // Street props: lamps at intersections, palms along streets, hydrants, crates.
  const poleMat = mat(0x3c4148);
  const lampHeadMat = new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0x000000 });
  windowMats.push(lampHeadMat);
  const poleGeo = new THREE.CylinderGeometry(0.18, 0.22, 6, 6);
  const headGeo = new THREE.SphereGeometry(0.45, 8, 6);
  for (let i = 0; i <= CITY.blocks; i += 2) {
    for (let j = 0; j <= CITY.blocks; j += 2) {
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(roadCoord(i) + 9, 3, roadCoord(j) + 9); group.add(pole);
      const head = new THREE.Mesh(headGeo, lampHeadMat);
      head.position.set(roadCoord(i) + 9, 6.1, roadCoord(j) + 9); group.add(head);
    }
  }
  const trunkMat = mat(0x7a5c38);
  const leafMat = mat(0x3f9e4d);
  const trunkGeo = new THREE.CylinderGeometry(0.3, 0.45, 5, 6);
  const leafGeo = new THREE.ConeGeometry(2.6, 3.4, 7);
  for (let i = 0; i < 46; i++) {
    const along = randRange(rng, -250, 250);
    const side = roadCoord(Math.floor(rng() * 10)) + (rng() > 0.5 ? 10 : -10);
    const horiz = rng() > 0.5;
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(horiz ? along : side, 2.5, horiz ? side : along); group.add(trunk);
    const leaf = new THREE.Mesh(leafGeo, leafMat);
    leaf.position.set(trunk.position.x, 6.4, trunk.position.z); group.add(leaf);
  }
  const crateMat = mat(0xa4713a);
  for (let i = 0; i < 26; i++) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), crateMat);
    const bx = blockCoord(Math.floor(rng() * 9)), bz = blockCoord(Math.floor(rng() * 9));
    crate.position.set(bx + randRange(rng, -20, 20), 1, bz + randRange(rng, -20, 20));
    crate.rotation.y = rng() * Math.PI; group.add(crate);
  }

  // Beach: sand strip, then the sea.
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(46, 620), mat(0xeed9a0));
  sand.rotation.x = -Math.PI / 2; sand.position.set(CITY.beachX + 10, 0.02, 0); group.add(sand);
  const seaMat = new THREE.MeshLambertMaterial({ color: 0x1d7fa8, transparent: true, opacity: 0.92 });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(360, 700), seaMat);
  sea.rotation.x = -Math.PI / 2; sea.position.set(CITY.seaX + 178, 0.12, 0); group.add(sea);
  // Beach umbrellas.
  for (let i = 0; i < 10; i++) {
    const um = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.1, 8), mat(pick(rng, [0xff5a5a, 0xffc93c, 0x4dc3ff])));
    um.position.set(CITY.beachX + randRange(rng, 0, 16), 2.2, randRange(rng, -240, 240)); group.add(um);
  }
  // Dock: wooden pier out into the water with a hire sign post.
  const dockMat = mat(0x8a6844);
  const pier = new THREE.Mesh(new THREE.BoxGeometry(30, 0.8, 8), dockMat);
  pier.position.set(CITY.dockX + 8, 0.7, CITY.dockZ); group.add(pier);
  for (let i = 0; i < 5; i++) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2.4, 6), dockMat);
    post.position.set(CITY.dockX - 4 + i * 7, 0.2, CITY.dockZ + 3.6); group.add(post);
  }
  const sign = new THREE.Mesh(new THREE.BoxGeometry(5, 2, 0.3), mat(0xffc93c));
  sign.position.set(CITY.dockX - 4, 3.4, CITY.dockZ - 4); group.add(sign);
  const signPost = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 3.4, 6), dockMat);
  signPost.position.set(CITY.dockX - 4, 1.7, CITY.dockZ - 4); group.add(signPost);

  function collide(pos, radius) {
    for (const c of colliders) {
      if (pos.x > c.minX - radius && pos.x < c.maxX + radius && pos.z > c.minZ - radius && pos.z < c.maxZ + radius) {
        // Push out along the smallest penetration axis.
        const dxl = pos.x - (c.minX - radius), dxr = (c.maxX + radius) - pos.x;
        const dzl = pos.z - (c.minZ - radius), dzr = (c.maxZ + radius) - pos.z;
        const m = Math.min(dxl, dxr, dzl, dzr);
        if (m === dxl) pos.x = c.minX - radius;
        else if (m === dxr) pos.x = c.maxX + radius;
        else if (m === dzl) pos.z = c.minZ - radius;
        else pos.z = c.maxZ + radius;
        return true;
      }
    }
    return false;
  }

  return { group, colliders, collide, windowMats, lampLights, seaMat, buildingCount };
}
