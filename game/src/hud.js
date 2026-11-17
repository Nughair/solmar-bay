// hud.js — everything drawn over the 3D view: health, cash, wanted stars,
// the mission objective banner, prompts, big centre banners, the speedometer
// and the canvas minimap. The DOM lives in index.html; this class owns the
// elements and knows how to refresh them.

import { CITY_EDGE, ROADS, ROAD_W } from './city.js';

export class Hud {
  constructor() {
    this.el = {};
    const ids = ['hud', 'healthfill', 'cash', 'stars', 'district', 'objectivetitle',
      'objectivetext', 'objectivedist', 'prompt', 'banner', 'bannertitle', 'bannersub',
      'toast', 'speedo', 'speednum', 'minimap', 'controls', 'damage', 'hitmarker',
      'titlescreen', 'pausescreen', 'endscreen', 'endtitle', 'endsub', 'completescreen'];
    for (const id of ids) this.el[id] = document.getElementById(id);
    this.minimapCtx = this.el.minimap.getContext('2d');
    this.bannerTimer = 0;
    this.toastTimer = 0;
    this.lastStars = -1;
    this.lastCash = null;
  }

  show() { this.el.hud.classList.remove('hidden'); }
  hide() { this.el.hud.classList.add('hidden'); }

  setHealth(h) {
    this.el.healthfill.style.width = Math.max(0, Math.min(100, h)) + '%';
    if (h < 30) this.el.healthfill.style.background = '#e8433c';
    else this.el.healthfill.style.background = 'linear-gradient(90deg,#e8433c,#ff7a4d)';
  }

  setCash(amount) {
    if (amount === this.lastCash) return;
    this.lastCash = amount;
    this.el.cash.innerHTML = '$' + amount.toLocaleString('en-US') + ' <small>CASH</small>';
  }

  setDistrict(name) { this.el.district.textContent = name; }

  setStars(n) {
    if (n === this.lastStars) return;
    this.lastStars = n;
    let html = '';
    for (let i = 0; i < 5; i++) html += i < n ? '★' : '<span class="off">★</span>';
    this.el.stars.innerHTML = html;
  }

  setObjective(title, text, distText) {
    this.el.objectivetitle.textContent = title || 'Solmar Bay';
    this.el.objectivetext.textContent = text || 'Free roam';
    this.el.objectivedist.textContent = distText || '';
  }

  showPrompt(html) {
    if (html) {
      this.el.prompt.innerHTML = html;
      this.el.prompt.classList.remove('hidden');
    } else {
      this.el.prompt.classList.add('hidden');
    }
  }

  banner(title, sub, seconds = 2.6) {
    this.el.bannertitle.textContent = title;
    this.el.bannersub.textContent = sub || '';
    this.el.banner.style.opacity = '1';
    this.bannerTimer = seconds;
  }

  toast(text, seconds = 3.4) {
    this.el.toast.textContent = text;
    this.el.toast.classList.remove('hidden');
    this.toastTimer = seconds;
  }

  setSpeed(kmh, visible) {
    this.el.speedo.classList.toggle('hidden', !visible);
    if (visible) this.el.speednum.textContent = String(Math.round(Math.abs(kmh)));
  }

  setControls(html) { this.el.controls.innerHTML = html; }

  flashDamage(strength) {
    this.el.damage.style.opacity = String(Math.min(0.9, 0.25 + strength * 0.5));
    setTimeout(() => { this.el.damage.style.opacity = '0'; }, 130);
  }

  hitmark() {
    this.el.hitmarker.style.opacity = '1';
    setTimeout(() => { this.el.hitmarker.style.opacity = '0'; }, 110);
  }

  update(dt) {
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.el.banner.style.opacity = '0';
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.el.toast.classList.add('hidden');
    }
  }

  // The minimap: roads as a grid, buildings as blocks, blips for the player
  // (white, pointing up = facing), traffic (grey), police (flashing blue),
  // the mission objective (gold ring) and mission cars (gold dot).
  drawMinimap(state) {
    const ctx = this.minimapCtx;
    const S = 188;
    const scale = S / (CITY_EDGE * 2 + 30);
    const px = (x) => (x + CITY_EDGE + 15) * scale;
    const pz = (z) => (z + CITY_EDGE + 15) * scale;
    ctx.fillStyle = '#22303f';
    ctx.fillRect(0, 0, S, S);
    // Blocks.
    ctx.fillStyle = '#31465a';
    for (const b of state.buildings) {
      ctx.fillRect(px(b.x - b.w / 2), pz(b.z - b.d / 2), b.w * scale, b.d * scale);
    }
    // Roads.
    ctx.fillStyle = '#4a5a6a';
    for (const r of ROADS) {
      ctx.fillRect(px(r - ROAD_W / 2), 0, ROAD_W * scale, S);
      ctx.fillRect(0, pz(r - ROAD_W / 2), S, ROAD_W * scale);
    }
    // The sea at the south edge.
    ctx.fillStyle = '#1d7a9e';
    ctx.fillRect(0, pz(CITY_EDGE + 2), S, S - pz(CITY_EDGE + 2));
    // Objective.
    if (state.objective) {
      const t = performance.now() / 300;
      ctx.strokeStyle = '#ffd94d';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(px(state.objective.x), pz(state.objective.z), 6 + Math.sin(t) * 1.6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ffd94d';
      ctx.fillRect(px(state.objective.x) - 2, pz(state.objective.z) - 2, 4, 4);
    }
    // Cars.
    for (const c of state.cars) {
      ctx.fillStyle = c.police ? (Math.floor(performance.now() / 250) % 2 ? '#3d8bff' : '#ff4b3e')
        : c.mission ? '#ffd94d' : '#aebfd0';
      ctx.fillRect(px(c.x) - 2.4, pz(c.z) - 2.4, 4.8, 4.8);
    }
    // Player arrow.
    const cx = px(state.playerX), cy = pz(state.playerZ);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI - state.playerHeading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -6.5);
    ctx.lineTo(4.4, 5);
    ctx.lineTo(-4.4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
