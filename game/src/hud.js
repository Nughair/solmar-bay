// hud.js — everything drawn over the 3D world: health, cash, wanted stars,
// the objective banner, toasts, the context prompt, and the minimap — a live
// top-down painting of the streets, the traffic, the police and the job.

import { ROADS, CITY_HALF } from './util.js';

export class HUD {
  constructor() {
    this.el = {
      healthFill: document.getElementById('health-fill'),
      healthText: document.getElementById('health-text'),
      cash: document.getElementById('cash'),
      stars: document.getElementById('stars'),
      objectiveTitle: document.getElementById('objective-title'),
      objectiveText: document.getElementById('objective-text'),
      objectiveDist: document.getElementById('objective-dist'),
      toast: document.getElementById('toast'),
      prompt: document.getElementById('prompt'),
      speed: document.getElementById('speed'),
      minimap: document.getElementById('minimap'),
      wanted: document.getElementById('wanted-label'),
    };
    this.mapCtx = this.el.minimap.getContext('2d');
    this.toastTimer = 0;
    this.lastStars = -1;
    this.cashShown = -1;
  }

  setHealth(v) {
    const pct = Math.max(0, Math.min(100, v));
    this.el.healthFill.style.width = pct + '%';
    this.el.healthFill.style.background = pct > 45 ? '#57d977' : pct > 22 ? '#ffb340' : '#ef5350';
    this.el.healthText.textContent = Math.ceil(pct) + '';
  }

  setCash(v) {
    const n = Math.round(v);
    if (n === this.cashShown) return;
    this.cashShown = n;
    this.el.cash.textContent = '$' + n.toLocaleString('en-US');
  }

  setStars(n) {
    if (n === this.lastStars) return;
    this.lastStars = n;
    let s = '';
    for (let i = 0; i < 5; i++) s += i < n ? '★' : '☆';
    this.el.stars.textContent = s;
    this.el.stars.style.opacity = n > 0 ? '1' : '0.25';
    this.el.wanted.textContent = n > 0 ? 'WANTED' : '';
  }

  setObjective(title, text, dist) {
    this.el.objectiveTitle.textContent = title || '';
    this.el.objectiveText.textContent = text || '';
    this.el.objectiveDist.textContent = dist !== null && dist !== undefined ? Math.round(dist) + ' m' : '';
  }

  toast(text, seconds = 3.4) {
    this.el.toast.textContent = text;
    this.el.toast.style.opacity = '1';
    this.toastTimer = seconds;
  }

  setPrompt(text) {
    this.el.prompt.textContent = text || '';
    this.el.prompt.style.opacity = text ? '1' : '0';
  }

  setSpeed(kmh) {
    if (kmh === null || kmh === undefined) {
      this.el.speed.style.opacity = '0';
    } else {
      this.el.speed.style.opacity = '1';
      this.el.speed.textContent = Math.round(kmh) + ' km/h';
    }
  }

  update(dt) {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.el.toast.style.opacity = '0';
    }
  }

  drawMinimap(state, time) {
    const g = this.mapCtx;
    const S = this.el.minimap.width;
    const toMap = (v) => ((v + CITY_HALF) / (CITY_HALF * 2)) * S;
    g.fillStyle = '#20262e';
    g.fillRect(0, 0, S, S);
    // blocks
    g.fillStyle = '#2c343f';
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        const cx = [-99, -33, 33, 99][i];
        const cz = [-99, -33, 33, 99][j];
        g.fillRect(toMap(cx - 24), toMap(cz - 24), (48 / (CITY_HALF * 2)) * S, (48 / (CITY_HALF * 2)) * S);
      }
    }
    // avenues
    g.strokeStyle = '#4a5563';
    g.lineWidth = Math.max(2, (15 / (CITY_HALF * 2)) * S);
    for (const r of ROADS) {
      g.beginPath();
      g.moveTo(toMap(r), 0);
      g.lineTo(toMap(r), S);
      g.stroke();
      g.beginPath();
      g.moveTo(0, toMap(r));
      g.lineTo(S, toMap(r));
      g.stroke();
    }
    // the bay
    g.fillStyle = '#3f8fbf';
    g.fillRect(toMap(CITY_HALF - 6), 0, S - toMap(CITY_HALF - 6), S);

    const dot = (x, z, r, color) => {
      g.fillStyle = color;
      g.beginPath();
      g.arc(toMap(x), toMap(z), r, 0, Math.PI * 2);
      g.fill();
    };
    for (const car of state.cars) {
      if (!car.parked) dot(car.x, car.z, 2, '#aeb8c2');
    }
    const flash = Math.floor(time * 2.4) % 2 === 0;
    for (const unit of state.police) dot(unit.x, unit.z, 3, flash ? '#ff4040' : '#4d7cff');
    if (state.targetCar && state.targetCar.alive !== false) dot(state.targetCar.x, state.targetCar.z, 3, '#ffd54f');

    // objective: a pulsing gold diamond
    if (state.objective) {
      const ox = toMap(state.objective.x);
      const oz = toMap(state.objective.z);
      const p = 5 + Math.sin(time * 4) * 1.6;
      g.fillStyle = '#ffd54f';
      g.beginPath();
      g.moveTo(ox, oz - p);
      g.lineTo(ox + p, oz);
      g.lineTo(ox, oz + p);
      g.lineTo(ox - p, oz);
      g.closePath();
      g.fill();
      g.strokeStyle = '#fff3c4';
      g.lineWidth = 1;
      g.stroke();
    }

    // player arrow, pointing where she (or her car) faces
    const px = toMap(state.player.x);
    const pz = toMap(state.player.z);
    const a = state.player.angle;
    // player arrow: the map's x is east and its y is south, so a heading of
    // angle a (forward = sin a east, cos a south) turns the up-drawn arrow
    // by PI - a.
    g.save();
    g.translate(px, pz);
    g.rotate(Math.PI - a);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(0, -6);
    g.lineTo(4, 5);
    g.lineTo(0, 2.4);
    g.lineTo(-4, 5);
    g.closePath();
    g.fill();
    g.restore();

    g.fillStyle = '#e8eef4';
    g.font = 'bold 11px Arial';
    g.textAlign = 'right';
    g.fillText('N', S - 6, 14);
  }
}
