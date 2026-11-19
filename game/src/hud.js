// hud.js — DOM HUD: health, cash, wanted stars, weapon cooldown, mission
// banner and objective text, toasts, and the canvas-2D minimap (roads, player,
// cars, peds, police, mission marker). Also the title and pause overlays.
export function createHud(root) {
  root.innerHTML = `
  <div id="hud" style="display:none">
    <div id="topbar">
      <div id="cash">$0</div>
      <div id="stars"></div>
    </div>
    <div id="healthwrap"><div id="healthbar"></div><span id="healthtext">100</span></div>
    <div id="weapon">PISTOL · ∞ · ready</div>
    <div id="banner"></div>
    <div id="objective"></div>
    <div id="toast"></div>
    <div id="prompt"></div>
    <canvas id="minimap" width="180" height="180"></canvas>
    <div id="clock"></div>
  </div>
  <div id="title">
    <h1>SOLMAR BAY</h1>
    <p class="tag">Sun, sea and second chances. An open-world crime story in a bay city that never sleeps.</p>
    <button id="btn-new">NEW GAME</button>
    <button id="btn-continue">CONTINUE</button>
    <div class="controls">
      WASD move · Shift run · Mouse look · Click shoot · E enter/exit car &amp; boat<br>
      F carjack · Space handbrake · M minimap zoom · P / Esc pause · H help
    </div>
  </div>
  <div id="pause" style="display:none">
    <h2>PAUSED — SOLMAR BAY</h2>
    <div class="controls">
      WASD / Arrows — move &amp; drive<br>
      Shift — run · Mouse — aim · Left click — shoot<br>
      E — enter / exit car or boat · F — carjack nearest car<br>
      Space — handbrake · P / Esc — resume · H — this help
    </div>
    <p>Survive the bay. Finish all 8 jobs for Mara and become King of the Bay.</p>
  </div>`;
  const el = (id) => root.querySelector('#' + id);
  const hud = el('hud'), cashEl = el('cash'), starsEl = el('stars');
  const healthBar = el('healthbar'), healthText = el('healthtext');
  const weaponEl = el('weapon'), bannerEl = el('banner'), objectiveEl = el('objective');
  const toastEl = el('toast'), promptEl = el('prompt'), clockEl = el('clock');
  const minimap = el('minimap').getContext('2d');
  let toastTimer = 0, bannerTimer = 0;

  function toast(msg, seconds) {
    toastEl.textContent = msg;
    toastEl.style.opacity = '1';
    toastTimer = seconds || 3;
  }
  function banner(title, sub) {
    bannerEl.innerHTML = `<div class="btitle">${title}</div><div class="bsub">${sub || ''}</div>`;
    bannerEl.style.opacity = '1';
    bannerTimer = 4.5;
  }

  return {
    toast, banner,
    showGame() { hud.style.display = 'block'; el('title').style.display = 'none'; },
    showTitle(hasSave) {
      hud.style.display = 'none';
      el('title').style.display = 'flex';
      el('btn-continue').style.display = hasSave ? 'block' : 'none';
    },
    setPaused(p) { el('pause').style.display = p ? 'flex' : 'none'; },
    onNew: null, onContinue: null,
    bindButtons() {
      el('btn-new').addEventListener('click', () => this.onNew && this.onNew());
      el('btn-continue').addEventListener('click', () => this.onContinue && this.onContinue());
    },
    setPrompt(text) { promptEl.textContent = text || ''; promptEl.style.opacity = text ? '1' : '0'; },
    update(dt, state) {
      if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) toastEl.style.opacity = '0'; }
      if (bannerTimer > 0) { bannerTimer -= dt; if (bannerTimer <= 0) bannerEl.style.opacity = '0'; }
      cashEl.textContent = '$' + Math.floor(state.cash).toLocaleString('en-US');
      starsEl.textContent = '★'.repeat(state.wanted) + '☆'.repeat(5 - state.wanted);
      starsEl.style.color = state.wanted > 0 ? '#ffc93c' : 'rgba(255,255,255,0.25)';
      healthBar.style.width = Math.max(0, state.health) + '%';
      healthBar.style.background = state.health > 30 ? '#6bcb77' : '#e5534b';
      healthText.textContent = Math.ceil(Math.max(0, state.health));
      weaponEl.textContent = state.mode === 'foot'
        ? `PISTOL · ∞ · ${state.shootCd > 0 ? 'cycling…' : 'ready'}`
        : state.mode === 'boat' ? 'BOAT · throttle ' + Math.round(Math.abs(state.speed)) + ' kn' : 'DRIVING · ' + Math.round(Math.abs(state.speed) * 3.6) + ' km/h';
      clockEl.textContent = state.clockText;
      objectiveEl.textContent = state.objective || '';
    },
    drawMinimap(state, world) {
      const c = minimap, S = 180, half = 300;
      c.fillStyle = '#10151d'; c.fillRect(0, 0, S, S);
      const px = (x) => (x + half) / (half * 2) * S;
      const pz = (z) => (z + half) / (half * 2) * S;
      // water + beach
      c.fillStyle = '#1d6f98'; c.fillRect(px(268), 0, S - px(268), S);
      c.fillStyle = '#d9c078'; c.fillRect(px(258), 0, px(268) - px(258), S);
      // roads
      c.strokeStyle = '#3d4450'; c.lineWidth = 3;
      for (let i = 0; i <= 9; i++) {
        const rc = -252 + i * 56 + 8;
        c.beginPath(); c.moveTo(px(rc), 0); c.lineTo(px(rc), S); c.stroke();
        c.beginPath(); c.moveTo(0, pz(rc)); c.lineTo(S, pz(rc)); c.stroke();
      }
      const dot = (x, z, color, r) => { c.fillStyle = color; c.beginPath(); c.arc(px(x), pz(z), r, 0, 7); c.fill(); };
      for (const p of world.peds) if (!p.dead) dot(p.pos.x, p.pos.z, '#cfd6dd', 1.4);
      for (const car of world.cars) if (!car.dead) dot(car.pos.x, car.pos.z, '#f2f2f2', 2);
      for (const car of world.policeCars) dot(car.pos.x, car.pos.z, '#4d7cff', 2.4);
      for (const o of world.officers) if (!o.dead) dot(o.pos.x, o.pos.z, '#4d7cff', 1.8);
      if (world.objective) {
        c.fillStyle = '#ffc93c';
        c.beginPath(); c.arc(px(world.objective.x), pz(world.objective.z), 4.5, 0, 7); c.fill();
        c.strokeStyle = '#ffc93c'; c.beginPath(); c.arc(px(world.objective.x), pz(world.objective.z), 7 + Math.sin(performance.now() * 0.006) * 1.5, 0, 7); c.stroke();
      }
      // player arrow
      const x = px(state.pos.x), y = pz(state.pos.z);
      c.save(); c.translate(x, y); c.rotate(state.heading);
      c.fillStyle = '#ffc93c';
      c.beginPath(); c.moveTo(0, -6); c.lineTo(4, 5); c.lineTo(-4, 5); c.closePath(); c.fill();
      c.restore();
    },
  };
}
