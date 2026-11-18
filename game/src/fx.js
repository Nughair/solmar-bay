// Light and air: a full day-night cycle (sun, moon, sky, fog, window glow and
// street lamps all follow one clock) and a pooled particle system for muzzle
// sparks, impacts, splashes and engine smoke — no textures, all points.

import * as THREE from 'three';

// Keyframes of a Solmar day: hour, sky, fog, sun strength, sun colour, air strength.
const DAY_KEYS = [
  [0.0, 0x0a1626, 0x0a1626, 0.0, 0xffe3b3, 0.16],
  [4.8, 0x0d1c30, 0x0d1c30, 0.0, 0xffe3b3, 0.18],
  [6.5, 0xe8906a, 0xd9a37e, 0.55, 0xffb37a, 0.4],
  [8.5, 0xaadcf5, 0xbcd9e8, 1.45, 0xffe9c0, 0.7],
  [13.0, 0x9fd4f7, 0xc2dde8, 1.65, 0xfff2d0, 0.78],
  [17.5, 0x9fc3e8, 0xd8c9a8, 1.3, 0xffdf9e, 0.68],
  [19.2, 0xf08a54, 0xe0a37c, 0.5, 0xff9a5c, 0.42],
  [20.6, 0x27355c, 0x2c3a58, 0.05, 0xffb37a, 0.24],
  [22.5, 0x0a1626, 0x0a1626, 0.0, 0xffe3b3, 0.16],
  [24.0, 0x0a1626, 0x0a1626, 0.0, 0xffe3b3, 0.16],
];

function lerpColor(a, b, t) {
  return new THREE.Color(a).lerp(new THREE.Color(b), t);
}

export class DayNight {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.hour = 10.2;
    this.cycleSeconds = 300; // a full day in five minutes
    scene.fog = new THREE.Fog(0xc2dde8, 150, 980);
  }

  setHour(hour) {
    this.hour = ((hour % 24) + 24) % 24;
    this.apply();
  }

  update(dt) {
    this.hour = (this.hour + (dt * 24) / this.cycleSeconds) % 24;
    this.apply();
  }

  /** 0 at bright day, 1 at deep night. */
  nightFactor() {
    const h = this.hour;
    if (h < 5 || h > 21) return 1;
    if (h < 7.5) return 1 - (h - 5) / 2.5;
    if (h > 18.5) return (h - 18.5) / 2.5;
    return 0;
  }

  apply() {
    const h = this.hour;
    let a = DAY_KEYS[0];
    let b = DAY_KEYS[DAY_KEYS.length - 1];
    for (let i = 0; i < DAY_KEYS.length - 1; i += 1) {
      if (h >= DAY_KEYS[i][0] && h <= DAY_KEYS[i + 1][0]) {
        a = DAY_KEYS[i];
        b = DAY_KEYS[i + 1];
        break;
      }
    }
    const t = (h - a[0]) / Math.max(0.001, b[0] - a[0]);
    this.scene.background = lerpColor(a[1], b[1], t);
    this.scene.fog.color.copy(lerpColor(a[2], b[2], t));
    const sun = this.world.sun;
    sun.intensity = a[3] + (b[3] - a[3]) * t;
    sun.color.copy(lerpColor(a[4], b[4], t));
    const sunAngle = ((h - 6) / 12) * Math.PI;
    sun.position.set(Math.cos(sunAngle) * 320, Math.max(18, Math.sin(sunAngle) * 300), -140);
    this.world.moon.intensity = this.nightFactor() * 0.35;
    this.world.hemi.intensity = a[5] + (b[5] - a[5]) * t;
    this.world.setNight(this.nightFactor());
  }
}

const MAX_PARTICLES = 900;

class PointPool {
  constructor(scene, { size, additive, opacity }) {
    this.positions = new Float32Array(MAX_PARTICLES * 3);
    this.colors = new Float32Array(MAX_PARTICLES * 3);
    this.velocities = new Float32Array(MAX_PARTICLES * 3);
    this.life = new Float32Array(MAX_PARTICLES);
    this.maxLife = new Float32Array(MAX_PARTICLES);
    this.baseColor = new Float32Array(MAX_PARTICLES * 3);
    this.gravity = new Float32Array(MAX_PARTICLES);
    this.head = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    const mat = new THREE.PointsMaterial({
      size,
      vertexColors: true,
      transparent: true,
      opacity,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    for (let i = 0; i < MAX_PARTICLES; i += 1) this.positions[i * 3 + 1] = -50;
  }

  spawn(x, y, z, vx, vy, vz, life, colorHex, gravity) {
    const i = this.head;
    this.head = (this.head + 1) % MAX_PARTICLES;
    this.positions.set([x, y, z], i * 3);
    this.velocities.set([vx, vy, vz], i * 3);
    const c = new THREE.Color(colorHex);
    this.baseColor.set([c.r, c.g, c.b], i * 3);
    this.life[i] = life;
    this.maxLife[i] = life;
    this.gravity[i] = gravity;
  }

  burst(pos, { count, colors, speed, up = 2, life = 0.5, gravity = -6, spread = 1 }) {
    for (let n = 0; n < count; n += 1) {
      const a = Math.random() * Math.PI * 2;
      const r = (0.3 + Math.random() * 0.7) * speed;
      this.spawn(
        pos.x, pos.y, pos.z,
        Math.cos(a) * r * spread, up * (0.4 + Math.random() * 0.9), Math.sin(a) * r * spread,
        life * (0.6 + Math.random() * 0.7),
        colors[Math.floor(Math.random() * colors.length)],
        gravity,
      );
    }
  }

  update(dt) {
    for (let i = 0; i < MAX_PARTICLES; i += 1) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const j = i * 3;
      if (this.life[i] <= 0) {
        this.positions[j + 1] = -50;
        continue;
      }
      this.velocities[j + 1] += this.gravity[i] * dt;
      this.velocities[j] *= 1 - 0.6 * dt;
      this.velocities[j + 2] *= 1 - 0.6 * dt;
      this.positions[j] += this.velocities[j] * dt;
      this.positions[j + 1] += this.velocities[j + 1] * dt;
      this.positions[j + 2] += this.velocities[j + 2] * dt;
      if (this.positions[j + 1] < 0.05 && this.gravity[i] < 0) this.positions[j + 1] = 0.05;
      const fade = this.life[i] / this.maxLife[i];
      this.colors[j] = this.baseColor[j] * fade;
      this.colors[j + 1] = this.baseColor[j + 1] * fade;
      this.colors[j + 2] = this.baseColor[j + 2] * fade;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}

export class Effects {
  constructor(scene) {
    this.glow = new PointPool(scene, { size: 0.55, additive: true, opacity: 0.95 });
    this.puff = new PointPool(scene, { size: 1.6, additive: false, opacity: 0.32 });
    this.flash = new THREE.PointLight(0xffc873, 0, 26);
    scene.add(this.flash);
  }

  muzzle(pos) {
    this.glow.burst(pos, { count: 5, colors: [0xffd75e, 0xff9a3c, 0xffffff], speed: 2.4, up: 0.4, life: 0.13, gravity: 0 });
    this.flash.position.set(pos.x, pos.y, pos.z);
    this.flash.intensity = 2.6;
  }

  impact(pos, metal = false) {
    this.glow.burst(pos, {
      count: metal ? 10 : 6,
      colors: metal ? [0xffc873, 0xfff2c8, 0xff8a3c] : [0xd8cfc0, 0xb8a888],
      speed: 3.4, up: 1.6, life: 0.4, gravity: -7,
    });
  }

  splash(pos, big = false) {
    this.glow.burst(pos, { count: big ? 22 : 9, colors: [0xbfefff, 0x7fc8e8, 0xffffff], speed: 2.6, up: 3.4, life: 0.55, gravity: -8 });
  }

  smoke(pos) {
    this.puff.burst(pos, { count: 1, colors: [0x555c60, 0x3c4245], speed: 0.5, up: 2.2, life: 1.15, gravity: 1.2 });
  }

  confetti(pos) {
    this.glow.burst(pos, { count: 26, colors: [0xffd75e, 0xaef2b0, 0x9fd8e8, 0xff9fb0], speed: 3.6, up: 4.4, life: 0.9, gravity: -5 });
  }

  update(dt) {
    this.glow.update(dt);
    this.puff.update(dt);
    if (this.flash.intensity > 0) this.flash.intensity = Math.max(0, this.flash.intensity - dt * 16);
  }
}
