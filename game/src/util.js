// util.js — small shared helpers for Solmar Bay: seeded randomness, math and
// the city layout constants every other module builds on.

let rngState = 7;

export function setSeed(seed) {
  rngState = (seed >>> 0) || 7;
}

// mulberry32: tiny deterministic generator so a given seed always grows the
// same city, the same traffic and the same crowd.
export function rand() {
  rngState = (rngState + 0x6d2b79f5) >>> 0;
  let t = rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randRange(min, max) {
  return min + rand() * (max - min);
}

export function randInt(min, max) {
  return Math.floor(randRange(min, max + 1));
}

export function pick(list) {
  return list[Math.floor(rand() * list.length) % list.length];
}

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Shortest-path interpolation between two headings, so cars and the camera
// never spin the long way around when a direction wraps past PI.
export function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function dist2D(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

// The street plan of Solmar Bay: five avenues each way, four block columns
// between them. Everything procedural derives from these numbers.
export const ROADS = [-132, -66, 0, 66, 132];
export const ROAD_HALF = 9;
export const BLOCK_CENTERS = [-99, -33, 33, 99];
export const BLOCK_HALF = 24;
export const CITY_HALF = 168;

export function nearestRoad(value) {
  let best = ROADS[0];
  let bestD = Infinity;
  for (const r of ROADS) {
    const d = Math.abs(r - value);
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  return best;
}

export function onRoad(x, z) {
  for (const r of ROADS) {
    if (Math.abs(x - r) < ROAD_HALF || Math.abs(z - r) < ROAD_HALF) return true;
  }
  return false;
}

// Push a circle (the player, or a car's centre) out of every building box it
// overlaps. Colliders are plain {minX, maxX, minZ, maxZ} records from city.js.
export function collideCircle(x, z, radius, colliders) {
  for (const c of colliders) {
    const nx = clamp(x, c.minX, c.maxX);
    const nz = clamp(z, c.minZ, c.maxZ);
    const dx = x - nx;
    const dz = z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    if (d2 > 0.000001) {
      const d = Math.sqrt(d2);
      x = nx + (dx / d) * radius;
      z = nz + (dz / d) * radius;
    } else {
      // Centre is inside the box: leave by the shallowest face.
      const left = x - c.minX;
      const right = c.maxX - x;
      const top = z - c.minZ;
      const bottom = c.maxZ - z;
      const m = Math.min(left, right, top, bottom);
      if (m === left) x = c.minX - radius;
      else if (m === right) x = c.maxX + radius;
      else if (m === top) z = c.minZ - radius;
      else z = c.maxZ + radius;
    }
  }
  return [x, z];
}

export function keepInCity(x, z, margin) {
  const lim = CITY_HALF - margin;
  return [clamp(x, -lim, lim), clamp(z, -lim, lim)];
}
