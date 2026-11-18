// The HUD: cash, wanted stars, health, speedo, prompts, toasts, dialogue and the
// mission panel in DOM, plus the minimap — a pre-rendered street plan of Solmar
// Bay with live blips for traffic, patrols, the player and the objective.

const MAP_SPAN = 780; // world metres across the square map
const MAP_SIZE = 192;

function el(id) {
  return document.getElementById(id);
}

export class Hud {
  constructor() {
    this.root = el('hud');
    this.cash = el('cash');
    this.stars = el('stars').children;
    this.healthFill = el('healthfill');
    this.vehicleLabel = el('vehiclelabel');
    this.speedo = el('speedo');
    this.prompt = el('prompt');
    this.toastBox = el('toast');
    this.dialogueBox = el('dialogue');
    this.missionBox = el('missionbox');
    this.missionTitle = el('mission-title');
    this.missionObj = el('mission-obj');
    this.missionTimer = el('mission-timer');
    this.crosshair = el('crosshair');
    this.vignette = el('vignette');
    this.toastTimer = 0;
    this.dialogueTimer = 0;
    this.mapCtx = el('minimap').getContext('2d');
    this.mapBase = this.renderMapBase();
  }

  show() {
    this.root.classList.add('on');
  }

  hide() {
    this.root.classList.remove('on');
  }

  setCash(amount) {
    this.cash.textContent = '$' + Math.round(amount).toLocaleString('en-US');
  }

  setWanted(stars) {
    for (let i = 0; i < 5; i += 1) {
      this.stars[i].className = i < stars ? 'lit' : '';
    }
  }

  setHealth(frac) {
    this.healthFill.style.width = Math.max(0, Math.min(100, frac * 100)) + '%';
    this.vignette.style.boxShadow = frac < 0.32
      ? `inset 0 0 140px rgba(200, 10, 0, ${0.75 * (1 - frac / 0.32)})`
      : 'inset 0 0 140px rgba(200, 10, 0, 0)';
  }

  setVehicle(label, speedKmh) {
    this.vehicleLabel.textContent = label || '';
    if (speedKmh === null) {
      this.speedo.style.display = 'none';
    } else {
      this.speedo.style.display = 'block';
      this.speedo.textContent = Math.round(Math.abs(speedKmh)) + ' km/h';
    }
  }

  setPrompt(html) {
    if (!html) {
      this.prompt.style.display = 'none';
      return;
    }
    this.prompt.style.display = 'block';
    this.prompt.innerHTML = html;
  }

  toast(title, sub = '', seconds = 3.4) {
    this.toastBox.innerHTML = title + (sub ? `<small>${sub}</small>` : '');
    this.toastBox.style.display = 'block';
    this.toastTimer = seconds;
  }

  dialogue(who, line, seconds = 4.2) {
    this.dialogueBox.querySelector('.who').textContent = who;
    this.dialogueBox.querySelector('.line').textContent = line;
    this.dialogueBox.style.display = 'block';
    this.dialogueTimer = seconds;
  }

  setMission(title, objective, timerSeconds = null) {
    if (!title) {
      this.missionBox.style.display = 'none';
      return;
    }
    this.missionBox.style.display = 'block';
    this.missionTitle.textContent = title;
    this.missionObj.textContent = objective;
    if (timerSeconds === null) {
      this.missionTimer.textContent = '';
    } else {
      const s = Math.max(0, Math.ceil(timerSeconds));
      this.missionTimer.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    }
  }

  setCrosshair(on) {
    this.crosshair.style.display = on ? 'block' : 'none';
  }

  update(dt) {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastBox.style.display = 'none';
    }
    if (this.dialogueTimer > 0) {
      this.dialogueTimer -= dt;
      if (this.dialogueTimer <= 0) this.dialogueBox.style.display = 'none';
    }
  }

  /** The static street plan, drawn once: sea, sand, slabs and street grid. */
  renderMapBase() {
    const canvas = document.createElement('canvas');
    canvas.width = MAP_SIZE;
    canvas.height = MAP_SIZE;
    const ctx = canvas.getContext('2d');
    const toMap = (v) => ((v + MAP_SPAN / 2) / MAP_SPAN) * MAP_SIZE;
    ctx.fillStyle = '#274b5c';
    ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
    ctx.fillStyle = '#14708c';
    ctx.fillRect(0, toMap(332), MAP_SIZE, MAP_SIZE - toMap(332));
    ctx.fillStyle = '#e8d194';
    ctx.fillRect(0, toMap(292), MAP_SIZE, toMap(332) - toMap(292));
    ctx.fillStyle = '#39424b';
    ctx.fillRect(toMap(-302), toMap(-302), toMap(302) - toMap(-302), toMap(292) - toMap(-302));
    ctx.fillStyle = '#6a7378';
    for (let bx = -4; bx <= 4; bx += 1) {
      for (let bz = -4; bz <= 4; bz += 1) {
        ctx.fillRect(toMap(bx * 60 - 23), toMap(bz * 60 - 23), toMap(46) - toMap(0), toMap(46) - toMap(0));
      }
    }
    ctx.fillStyle = '#ffd75e';
    ctx.fillRect(toMap(-244), toMap(236), 5, 5); // Vera's garage
    return canvas;
  }

  worldToMap(x, z) {
    return [((x + MAP_SPAN / 2) / MAP_SPAN) * MAP_SIZE, ((z + MAP_SPAN / 2) / MAP_SPAN) * MAP_SIZE];
  }

  /**
   * blips: { player:{x,z,heading}, cars:[pos], police:[pos], boats:[pos],
   *          marker:{x,z}|null, rival:{x,z}|null }
   */
  drawMinimap(blips) {
    const ctx = this.mapCtx;
    ctx.clearRect(0, 0, MAP_SIZE, MAP_SIZE);
    ctx.drawImage(this.mapBase, 0, 0);
    const dot = (x, z, color, r) => {
      const [mx, my] = this.worldToMap(x, z);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(mx, my, r, 0, Math.PI * 2);
      ctx.fill();
    };
    for (const car of blips.cars) dot(car.x, car.z, 'rgba(240,240,240,0.75)', 1.6);
    for (const boat of blips.boats) dot(boat.x, boat.z, 'rgba(160,225,255,0.9)', 1.8);
    const flash = Math.floor(performance.now() / 300) % 2 === 0;
    for (const cop of blips.police) dot(cop.x, cop.z, flash ? '#ff4040' : '#3a7bff', 2.4);
    if (blips.rival) dot(blips.rival.x, blips.rival.z, '#ff2a2a', 3);
    if (blips.marker) {
      const [mx, my] = this.worldToMap(blips.marker.x, blips.marker.z);
      const pulse = 4.5 + Math.sin(performance.now() / 240) * 1.4;
      ctx.strokeStyle = '#ffd75e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(mx, my, pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ffd75e';
      ctx.beginPath();
      ctx.arc(mx, my, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    if (blips.player) {
      const [mx, my] = this.worldToMap(blips.player.x, blips.player.z);
      ctx.save();
      ctx.translate(mx, my);
      // The map's y axis is world z, so a heading turns the arrow the other way.
      ctx.rotate(-blips.player.heading);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#c25e1e';
      ctx.beginPath();
      ctx.moveTo(0, 6);
      ctx.lineTo(-4, -4);
      ctx.lineTo(4, -4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }
}
