// city.js — Solmar Bay itself: a sun-soaked coastal grid of five avenues each
// way, sixteen blocks of towers and walk-ups, palms, lamps and three landmark
// buildings the story revolves around. Everything is generated from the seed,
// so the city is the same on every visit.

import * as THREE from 'three';
import {
  ROADS,
  ROAD_HALF,
  BLOCK_CENTERS,
  BLOCK_HALF,
  CITY_HALF,
  rand,
  randRange,
  randInt,
  pick,
} from './util.js';

const PALETTE = [0xf2e3c6, 0xe8b4a0, 0xbfd9e8, 0xf5f0e6, 0xe6cf9f, 0xd9e6d0, 0xf0c8d8, 0xcfe0ea];

// One shared canvas texture of lit and dark windows; each building tints it
// with its own colour so a whole district costs a single texture.
function makeWindowTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#9aa3ab';
  g.fillRect(0, 0, 128, 256);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 6; x++) {
      const lit = rand() > 0.42;
      g.fillStyle = lit ? '#ffe9a8' : '#2e3d4d';
      g.fillRect(8 + x * 20, 10 + y * 15, 12, 8);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// The ground is one big canvas painting: sand and grass under everything,
// concrete block slabs, asphalt avenues with dashed centre lines and zebra
// crossings where the avenues meet.
function makeGroundTexture() {
  const S = 2048;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  const w2c = (v) => ((v + CITY_HALF) / (CITY_HALF * 2)) * S;
  const scale = S / (CITY_HALF * 2);
  g.fillStyle = '#77a05e';
  g.fillRect(0, 0, S, S);
  // the bay: sand then water along the east edge
  g.fillStyle = '#ecd9a0';
  g.fillRect(w2c(CITY_HALF - 14), 0, 14 * scale, S);
  g.fillStyle = '#3f8fbf';
  g.fillRect(w2c(CITY_HALF - 4), 0, 4 * scale + 40, S);
  // block slabs
  for (const bx of BLOCK_CENTERS) {
    for (const bz of BLOCK_CENTERS) {
      g.fillStyle = '#c9c2b2';
      g.fillRect(w2c(bx - BLOCK_HALF), w2c(bz - BLOCK_HALF), BLOCK_HALF * 2 * scale, BLOCK_HALF * 2 * scale);
      g.fillStyle = '#bdb5a2';
      g.fillRect(w2c(bx - BLOCK_HALF + 2), w2c(bz - BLOCK_HALF + 2), (BLOCK_HALF * 2 - 4) * scale, (BLOCK_HALF * 2 - 4) * scale);
    }
  }
  // avenues
  g.fillStyle = '#3c4148';
  for (const r of ROADS) {
    g.fillRect(w2c(r - ROAD_HALF), 0, ROAD_HALF * 2 * scale, S);
    g.fillRect(0, w2c(r - ROAD_HALF), S, ROAD_HALF * 2 * scale);
  }
  // centre dashes
  g.fillStyle = '#f7d154';
  for (const r of ROADS) {
    for (let v = -CITY_HALF + 6; v < CITY_HALF - 6; v += 12) {
      if (ROADS.some((o) => Math.abs(v - o) < ROAD_HALF + 3)) continue;
      g.fillRect(w2c(r) - 1.5, w2c(v) - 3 * scale * 0.5, 3, 3 * scale);
      g.fillRect(w2c(v) - 3 * scale * 0.5, w2c(r) - 1.5, 3 * scale, 3);
    }
  }
  // zebra crossings at every intersection
  g.fillStyle = '#e8e8e2';
  for (const rx of ROADS) {
    for (const rz of ROADS) {
      for (let i = -3; i <= 3; i++) {
        g.fillRect(w2c(rx + i * 2.4) - 2, w2c(rz - ROAD_HALF) - 2, 4, 5);
        g.fillRect(w2c(rx + i * 2.4) - 2, w2c(rz + ROAD_HALF) - 3, 4, 5);
        g.fillRect(w2c(rx - ROAD_HALF) - 2, w2c(rz + i * 2.4) - 2, 5, 4);
        g.fillRect(w2c(rx + ROAD_HALF) - 3, w2c(rz + i * 2.4) - 2, 5, 4);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

function makeSignTexture(text, bg, fg) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 128);
  g.fillStyle = fg;
  g.font = 'bold 64px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 68);
  return new THREE.CanvasTexture(c);
}

export function buildCity(scene) {
  const colliders = [];
  const group = new THREE.Group();
  scene.add(group);

  // The painted ground spans exactly the city the texture was drawn for, so
  // avenues land where the traffic drives; a plain apron runs underneath out
  // to the horizon so the world never shows its edge.
  const apron = new THREE.Mesh(
    new THREE.PlaneGeometry(2400, 2400),
    new THREE.MeshLambertMaterial({ color: 0x77a05e }),
  );
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.08;
  group.add(apron);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY_HALF * 2, CITY_HALF * 2),
    new THREE.MeshLambertMaterial({ map: makeGroundTexture() }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  const windowTex = makeWindowTexture();
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x6b6259 });

  // Buildings: each block holds one tower, a pair, or a quad of walk-ups.
  // Blocks nearer the centre grow taller, like a real downtown.
  for (const bx of BLOCK_CENTERS) {
    for (const bz of BLOCK_CENTERS) {
      const centreDist = Math.sqrt(bx * bx + bz * bz);
      const layout = pick(['single', 'pair', 'quad', 'pair', 'quad']);
      const plots = [];
      if (layout === 'single') plots.push([bx, bz, 34, 34]);
      else if (layout === 'pair') {
        plots.push([bx - 12, bz, 20, 36], [bx + 12, bz, 20, 36]);
      } else {
        plots.push(
          [bx - 12, bz - 12, 20, 20],
          [bx + 12, bz - 12, 20, 20],
          [bx - 12, bz + 12, 20, 20],
          [bx + 12, bz + 12, 20, 20],
        );
      }
      for (const [px, pz, w, d] of plots) {
        const tall = centreDist < 90 ? randRange(26, 58) : randRange(10, 30);
        const h = layout === 'single' ? tall : tall * randRange(0.45, 0.8);
        const tex = windowTex.clone();
        tex.needsUpdate = true;
        tex.repeat.set(Math.max(1, Math.round(w / 11)), Math.max(2, Math.round(h / 9)));
        const mat = new THREE.MeshLambertMaterial({ map: tex, color: pick(PALETTE) });
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [mat, mat, roofMat, roofMat, mat, mat]);
        mesh.position.set(px, h / 2, pz);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        colliders.push({ minX: px - w / 2, maxX: px + w / 2, minZ: pz - d / 2, maxZ: pz + d / 2 });
        if (rand() > 0.45) {
          const ac = new THREE.Mesh(
            new THREE.BoxGeometry(w * 0.3, 1.6, d * 0.3),
            new THREE.MeshLambertMaterial({ color: 0x8f8a80 }),
          );
          ac.position.set(px + randRange(-w / 5, w / 5), h + 0.8, pz + randRange(-d / 5, d / 5));
          group.add(ac);
        }
      }
    }
  }

  addProps(group, colliders);
  const landmarks = addLandmarks(group, colliders);
  return { colliders, landmarks, group };
}

// Palms along the avenues, lamps at the corners, benches and hydrants for
// street dressing. Props never collide; only buildings block movement.
function addProps(group) {
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6b46 });
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x3f9e4d });
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3f45 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });

  for (const r of ROADS) {
    for (let v = -CITY_HALF + 16; v < CITY_HALF - 10; v += 24) {
      if (ROADS.some((o) => Math.abs(v - o) < ROAD_HALF + 6)) continue;
      for (const side of [-1, 1]) {
        if (rand() > 0.4) {
          const palm = new THREE.Group();
          const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 5.4, 6), trunkMat);
          trunk.position.y = 2.7;
          trunk.rotation.z = side * 0.06;
          palm.add(trunk);
          const crown = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.6, 7), frondMat);
          crown.position.y = 5.9;
          crown.castShadow = true;
          palm.add(crown);
          palm.position.set(r + side * (ROAD_HALF + 2.2), 0, v + randRange(-3, 3));
          group.add(palm);
        }
        if (rand() > 0.55) {
          const lamp = new THREE.Group();
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.6, 6), poleMat);
          pole.position.y = 2.8;
          lamp.add(pole);
          const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), lampMat);
          bulb.position.y = 5.7;
          lamp.add(bulb);
          // lamps line the same avenue as the palms: along its length, at
          // either kerb — an earlier draft transposed the axes and planted
          // them across the blocks instead
          lamp.position.set(r + side * (ROAD_HALF + 1.2), 0, v + randRange(-2, 2));
          group.add(lamp);
        }
      }
    }
  }
}

// Landmark buildings the story uses: Rey's Customs (the garage you deliver
// to), the Solmar Police station, Bay General hospital (where you wake up
// after being wasted) and the Pier 9 storage hideout by the water.
function addLandmarks(group, colliders) {
  const defs = [
    { key: 'garage', name: "REY'S CUSTOMS", x: -20, z: -112, color: 0xffb340, signBg: '#20303c', signFg: '#ffb340', pad: 0xffcf4d },
    { key: 'police', name: 'SOLMAR POLICE', x: 112, z: 20, color: 0x9fc6e8, signBg: '#16283e', signFg: '#cfe6ff', pad: 0x7fb2e5 },
    { key: 'hospital', name: 'BAY GENERAL', x: -112, z: 112, color: 0xf4f6f4, signBg: '#f4f6f4', signFg: '#d43a2f', pad: 0xef9a94 },
    { key: 'hideout', name: 'PIER 9 STORAGE', x: 148, z: -112, color: 0xb8c4c9, signBg: '#37474f', signFg: '#eceff1', pad: 0xffd54f },
  ];
  const landmarks = {};
  for (const def of defs) {
    const w = 26;
    const d = 18;
    const h = def.key === 'hospital' ? 22 : 9;
    const mat = new THREE.MeshLambertMaterial({ color: def.color });
    const roof = new THREE.MeshLambertMaterial({ color: 0x55504a });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [mat, mat, roof, roof, mat, mat]);
    mesh.position.set(def.x, h / 2, def.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push({ minX: def.x - w / 2, maxX: def.x + w / 2, minZ: def.z - d / 2, maxZ: def.z + d / 2 });

    const signTex = makeSignTexture(def.name, def.signBg, def.signFg);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 5),
      new THREE.MeshBasicMaterial({ map: signTex }),
    );
    // Face the sign toward the nearest avenue so it reads from the street.
    const faceSouth = Math.abs(def.z - 132) < Math.abs(def.z + 132) || def.key === 'garage';
    sign.position.set(def.x, h - 2, def.z + (faceSouth ? d / 2 + 0.15 : -d / 2 - 0.15));
    if (!faceSouth) sign.rotation.y = Math.PI;
    if (def.key === 'hideout') {
      sign.position.set(def.x - w / 2 - 0.15, h - 2, def.z);
      sign.rotation.y = -Math.PI / 2;
    }
    group.add(sign);

    // The delivery pad: a painted apron on the ground in front of the door.
    const padZ = def.key === 'hideout' ? def.z : def.z + (faceSouth ? d / 2 + 7 : -d / 2 - 7);
    const padX = def.key === 'hideout' ? def.x - w / 2 - 8 : def.x;
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(13, 0.12, 11),
      new THREE.MeshBasicMaterial({ color: def.pad, transparent: true, opacity: 0.55 }),
    );
    pad.position.set(padX, 0.06, padZ);
    group.add(pad);
    landmarks[def.key] = { x: def.x, z: def.z, padX, padZ, name: def.name };
  }

  // Rooftop billboards over the central avenue, pure city flavour.
  const ads = [
    ['SOLMAR BAY', '#0d3b56', '#7fe3ff'],
    ['HOTEL AZUL', '#5c2e0e', '#ffd9a0'],
    ['CAFE DEL MAR', '#402020', '#ffb3a0'],
  ];
  ads.forEach(([text, bg, fg], i) => {
    const tex = makeSignTexture(text, bg, fg);
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 6),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }),
    );
    board.position.set(-40 + i * 40, 34 + i * 3, -14);
    board.rotation.y = Math.PI / 2;
    group.add(board);
  });

  return landmarks;
}
