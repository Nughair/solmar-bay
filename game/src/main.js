// Solmar Bay: the game itself. One Game object owns the scene and every system —
// world, traffic, crowd, patrol, story, effects — and runs the loop: title screen
// over a living city, on-foot and driving and boating play, hitscan combat, the
// wanted response, Vera's eight errands, and the screenshot scenes.

import * as THREE from 'three';
import { Input } from './input.js';
import { SoundEngine } from './audio.js';
import { buildWorld, collideCircle, isWater, WATER_Z } from './world.js';
import { Car, TrafficSystem, stepVehicle, collideCarSet } from './vehicles.js';
import { Boat, stepBoat } from './boat.js';
import { createPersonMesh, animatePerson, Crowd } from './people.js';
import { Wanted, PoliceSystem, CRIMES } from './police.js';
import { Story } from './missions.js';
import { Hud } from './hud.js';
import { DayNight, Effects } from './fx.js';
import { freshSave, loadSave, storeSave, clearSave } from './save.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');

class Game {
  constructor() {
    this.canvas = document.getElementById('scene');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 2600);
    this.camera.position.set(120, 60, 420);

    this.world = buildWorld(this.scene, 20261117);
    this.dayNight = new DayNight(this.scene, this.world);
    this.dayNight.setHour(10.2);
    this.effects = new Effects(this.scene);
    this.traffic = new TrafficSystem(this.scene, this.world);
    this.crowd = new Crowd(this.scene, this.world);
    this.police = new PoliceSystem(this.scene, this.world);
    this.wanted = new Wanted();
    this.hud = new Hud();
    this.sound = new SoundEngine();
    this.input = new Input(this.canvas);
    if (SHOT) this.input.wantsLock = false;

    // The player figure: Nilo, in a coral shirt.
    const mesh = createPersonMesh(0xe85d3c, 0x2c3e50, 0xc68863);
    mesh.position.set(-232, 0, 262);
    this.scene.add(mesh);
    this.player = { mesh, heading: 2.8 };
    Object.defineProperty(this.player, 'pos', { get: () => mesh.position });
    this.playerHealth = 100;
    this.walkPhase = 0;

    // Vera, waiting by her garage door.
    this.vera = createPersonMesh(0x8a1f2d, 0x1c1c22, 0x8a5a3b);
    this.vera.position.set(-233, 0, 256);
    this.vera.rotation.y = 0.4;
    this.scene.add(this.vera);

    // Moored boats by the pier.
    this.boats = [];
    for (const [x, z, h, c] of [[-100, 338, 2.9, 0x37b6c9], [-140, 340, 3.3, 0xf2f2f2], [-120, 356, 3.14, 0xf2b134]]) {
      const boat = new Boat(c, x, z, h);
      this.scene.add(boat.mesh);
      this.boats.push(boat);
    }

    // The mission beacon: a pillar of gold light at the current objective.
    this.beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(3.2, 3.2, 34, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd75e, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.beacon.position.y = 17;
    this.scene.add(this.beacon);

    this.mode = 'title'; // title | play | pause | down
    this.save = freshSave();
    this.story = new Story(this.save);
    this.currentCar = null;
    this.currentBoat = null;
    this.markedCar = null;
    this.rivalBoat = null;
    this.rivalHp = 100;
    this.camYaw = 2.8;
    this.camPitch = 0.32;
    this.fireCooldown = 0;
    this.bustProgress = 0;
    this.smokeClock = 0;
    this.splashClock = 0;
    this.lastCashShown = -1;
    this.fixedCamera = null;
    this.shotDrive = null;
    this.menuAngle = 0;
    this.downKind = 'down';

    this.bindScreens();
    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });

    if (SHOT) {
      stageShot(this, SHOT);
    }
    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  get playerMode() {
    if (this.currentBoat) return 'boat';
    if (this.currentCar) return 'car';
    return 'foot';
  }

  playerPos() {
    if (this.currentBoat) return this.currentBoat.pos;
    if (this.currentCar) return this.currentCar.pos;
    return this.player.pos;
  }

  playerSpeed() {
    if (this.currentBoat) return this.currentBoat.speed;
    if (this.currentCar) return this.currentCar.speed;
    return this.footSpeed || 0;
  }

  bindScreens() {
    const show = (id, on) => document.getElementById(id).classList.toggle('on', on);
    this.showScreen = show;
    document.getElementById('btn-new').addEventListener('click', () => { this.sound.unlock(); this.beginPlay(true); });
    document.getElementById('btn-continue').addEventListener('click', () => { this.sound.unlock(); this.beginPlay(false); });
    document.getElementById('btn-resume').addEventListener('click', () => this.resume());
    document.getElementById('btn-quit').addEventListener('click', () => this.toTitle());
    document.getElementById('btn-respawn').addEventListener('click', () => this.respawn());
    const stored = loadSave();
    document.getElementById('btn-continue').style.display = stored ? '' : 'none';
  }

  /** Start (or restart) a career and drop into the world. */
  beginPlay(fresh) {
    if (fresh) {
      clearSave();
      this.save = freshSave();
    } else {
      this.save = loadSave() || this.save;
    }
    this.story = new Story(this.save);
    this.wanted.clear();
    this.playerHealth = 100;
    this.exitVehicle(true);
    this.player.pos.set(-232, 0, 262);
    this.player.heading = 2.8;
    this.showScreen('start-screen', false);
    this.showScreen('down-screen', false);
    this.showScreen('pause-screen', false);
    this.hud.show();
    this.mode = 'play';
    this.sound.unlock();
  }

  toTitle() {
    this.mode = 'title';
    this.hud.hide();
    this.showScreen('pause-screen', false);
    this.showScreen('start-screen', true);
    const stored = loadSave();
    document.getElementById('btn-continue').style.display = stored ? '' : 'none';
  }

  resume() {
    this.showScreen('pause-screen', false);
    this.mode = 'play';
  }

  respawn() {
    this.showScreen('down-screen', false);
    this.exitVehicle(true);
    this.player.pos.set(-232, 0, 262);
    this.player.heading = 2.8;
    this.playerHealth = 100;
    this.wanted.clear();
    this.bustProgress = 0;
    this.hud.show();
    this.mode = 'play';
  }

  goDown(kind) {
    this.downKind = kind;
    this.mode = 'down';
    this.sound.stopEngine();
    this.sound.setSiren(false, 0);
    const fee = kind === 'busted' ? Math.min(200, Math.round(this.save.cash * 0.12)) : 100;
    this.save.cash = Math.max(0, this.save.cash - fee);
    storeSave(this.save);
    document.getElementById('down-title').textContent = kind === 'busted' ? 'BUSTED' : 'TAKEN DOWN';
    document.getElementById('down-text').textContent = kind === 'busted'
      ? `The Baywatch patrol walks you to the kerb and takes $${fee} for its trouble.`
      : `You wake up outside Solmar General, $${fee} lighter and somehow alive.`;
    this.showScreen('down-screen', true);
  }

  enterCar(car) {
    this.currentCar = car;
    if (this.police.releaseCar(car)) this.traffic.cars.push(car); // a stolen patrol car joins traffic
    this.traffic.drivenCar = car;
    const wasParked = car.parked;
    car.parked = false;
    this.player.mesh.visible = false;
    this.sound.door();
    if (!wasParked && this.police.anyCloseTo(car.pos, 42)) this.wanted.addCrime(CRIMES.carStolen);
    if (wasParked && this.police.anyCloseTo(car.pos, 26)) this.wanted.addCrime(CRIMES.carStolen);
  }

  enterBoat(boat) {
    this.currentBoat = boat;
    this.player.mesh.visible = false;
    this.sound.door();
    this.sound.splash();
  }

  exitVehicle(silent = false) {
    if (this.currentCar) {
      const car = this.currentCar;
      const f = car.forward();
      this.player.pos.set(car.pos.x + f.z * 2.6, 0, car.pos.z - f.x * 2.6);
      this.player.heading = car.heading;
      car.parked = true; // a car the player leaves stays where it was left
      this.traffic.drivenCar = null;
      this.currentCar = null;
      if (!silent) this.sound.door();
    }
    if (this.currentBoat) {
      const boat = this.currentBoat;
      this.player.pos.set(Math.max(-290, Math.min(290, boat.pos.x)), 0, 330.5);
      this.player.heading = Math.PI;
      this.currentBoat = null;
      if (!silent) this.sound.splash();
    }
    this.player.mesh.visible = true;
  }

  nearestEnterable() {
    const p = this.player.pos;
    let best = null;
    let bestDist = 3.6;
    for (const car of [...this.traffic.cars, ...this.police.vehicles()]) {
      const d = Math.hypot(car.pos.x - p.x, car.pos.z - p.z);
      if (d < bestDist) { best = { kind: 'car', vehicle: car }; bestDist = d; }
    }
    if (this.markedCar) {
      const d = Math.hypot(this.markedCar.pos.x - p.x, this.markedCar.pos.z - p.z);
      if (d < bestDist) { best = { kind: 'car', vehicle: this.markedCar }; bestDist = d; }
    }
    for (const boat of this.boats) {
      const d = Math.hypot(boat.pos.x - p.x, boat.pos.z - p.z);
      if (d < 8.6 && d < bestDist + 5) best = { kind: 'boat', vehicle: boat };
    }
    if (this.rivalBoat) {
      const d = Math.hypot(this.rivalBoat.pos.x - p.x, this.rivalBoat.pos.z - p.z);
      if (d < 8.6) best = { kind: 'boat', vehicle: this.rivalBoat };
    }
    return best;
  }

  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    const elapsed = this.clock.elapsedTime;
    if (this.mode === 'play') this.step(dt, elapsed);
    else if (this.mode === 'title') this.stepTitle(dt, elapsed);
    this.world.update(dt, elapsed);
    this.effects.update(dt);
    this.hud.update(dt);
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  }

  stepTitle(dt, elapsed) {
    this.traffic.update(dt, null);
    this.crowd.update(dt);
    this.dayNight.update(dt);
    this.menuAngle += dt * 0.045;
    const r = 330;
    this.camera.position.set(Math.sin(this.menuAngle) * r, 92, Math.cos(this.menuAngle) * r * 0.72 + 60);
    this.camera.lookAt(0, 6, 30);
    this.camera.fov = 58;
    this.camera.updateProjectionMatrix();
    void elapsed;
  }

  step(dt, elapsed) {
    const input = this.input;
    if (input.hit('KeyP')) {
      this.mode = 'pause';
      this.showScreen('pause-screen', true);
      return;
    }
    if (input.hit('KeyM')) this.sound.setMuted(!this.sound.muted);

    // --- Player control ------------------------------------------------------
    let vehicleControls = null;
    if (this.currentCar) {
      vehicleControls = this.readDriveControls(this.currentCar);
      const impact = stepVehicle(this.currentCar, vehicleControls, dt, this.world);
      if (impact > 2.4) {
        this.sound.crash(impact);
        this.playerHealth -= impact * 0.16;
        this.effects.impact({ x: this.currentCar.pos.x, y: 0.8, z: this.currentCar.pos.z }, true);
      }
      this.player.pos.copy(this.currentCar.pos);
      if (input.hit('KeyE')) this.exitVehicle();
    } else if (this.currentBoat) {
      vehicleControls = this.readDriveControls(this.currentBoat);
      stepBoat(this.currentBoat, vehicleControls, dt, elapsed);
      this.player.pos.copy(this.currentBoat.pos);
      if (input.hit('KeyE')) this.exitVehicle();
    } else {
      this.stepOnFoot(dt);
      const near = this.nearestEnterable();
      if (near) {
        this.hud.setPrompt(near.kind === 'car' ? '<b>E</b> Enter vehicle' : '<b>E</b> Board boat');
        if (input.hit('KeyE')) {
          if (near.kind === 'car') this.enterCar(near.vehicle);
          else this.enterBoat(near.vehicle);
        }
      } else {
        this.hud.setPrompt(null);
      }
    }
    if (this.playerMode !== 'foot') this.hud.setPrompt(null);

    // --- Combat ----------------------------------------------------------------
    this.fireCooldown -= dt;
    const wantsFire = (input.firing || input.down('KeyF')) && this.mode === 'play';
    if (wantsFire && this.fireCooldown <= 0) {
      this.fireCooldown = 0.21;
      this.shoot();
    }
    this.hud.setCrosshair(true);

    // --- World systems -----------------------------------------------------------
    const playerPos = this.playerPos();
    const trafficEvents = this.traffic.update(dt, playerPos);
    for (const event of trafficEvents) {
      if (Math.hypot(event.car.pos.x - playerPos.x, event.car.pos.z - playerPos.z) < 55) this.sound.crash(event.strength);
    }
    this.crowd.update(dt);
    this.runOverChecks(dt);
    const allCars = [...this.traffic.cars, ...this.police.vehicles()];
    if (this.currentCar && !allCars.includes(this.currentCar)) allCars.push(this.currentCar);
    if (this.markedCar && !allCars.includes(this.markedCar)) allCars.push(this.markedCar);
    collideCarSet(allCars, (a, b, strength) => this.onCarCrash(a, b, strength));
    this.updateRival(dt);
    for (const boat of this.boats) if (boat !== this.currentBoat) stepBoat(boat, { throttle: 0, steer: 0 }, dt, elapsed);

    // --- Police --------------------------------------------------------------------
    const seen = this.police.anyCloseTo(playerPos, 55);
    this.wanted.update(dt, seen);
    const policeEvents = this.police.update(dt, {
      playerPos,
      playerSpeed: this.playerSpeed(),
      playerInBoat: this.playerMode === 'boat',
      playerInVehicle: this.playerMode !== 'foot',
      stars: this.wanted.stars,
    });
    let touched = false;
    for (const event of policeEvents) {
      if (event.type === 'shot') {
        this.effects.muzzle(event.from);
        this.sound.shot();
        if (event.hit) this.hurtPlayer(5.5);
      } else if (event.type === 'touch') {
        touched = true;
      }
    }
    if (touched && this.playerMode === 'foot') {
      this.bustProgress += dt;
      if (this.bustProgress > 1.6) {
        this.goDown('busted');
        return;
      }
    } else {
      this.bustProgress = Math.max(0, this.bustProgress - dt * 1.4);
    }

    // --- Story -----------------------------------------------------------------------
    const storyEvents = this.story.update({
      pos: playerPos,
      mode: this.playerMode,
      car: this.currentCar,
      markedCar: this.markedCar,
      rivalPos: this.rivalBoat ? this.rivalBoat.pos : null,
      stars: this.wanted.stars,
      dt,
    });
    this.handleStoryEvents(storyEvents);

    // --- Ambience, audio, HUD ---------------------------------------------------------
    this.dayNight.update(dt);
    this.updateAudio(dt);
    this.updateFx(dt);
    this.updateCamera(dt);
    this.updateHud();
    if (this.playerHealth <= 0) {
      this.goDown('down');
    }
  }

  readDriveControls(vehicle) {
    if (this.shotDrive) {
      return { throttle: this.shotDrive.throttle, steer: Math.sin(this.clock.elapsedTime * 0.7) * this.shotDrive.steerWave, brake: false };
    }
    const input = this.input;
    let throttle = 0;
    if (input.down('KeyW') || input.down('ArrowUp')) throttle = 1;
    if (input.down('KeyS') || input.down('ArrowDown')) throttle = -1;
    let steer = 0;
    if (input.down('KeyA') || input.down('ArrowLeft')) steer = 1;
    if (input.down('KeyD') || input.down('ArrowRight')) steer = -1;
    return { throttle, steer, brake: input.down('Space') };
  }

  stepOnFoot(dt) {
    const input = this.input;
    this.camYaw -= input.lookDX * 0.0026;
    this.camPitch = Math.max(-0.5, Math.min(1.1, this.camPitch + input.lookDY * 0.0026));
    let mx = 0;
    let mz = 0;
    if (input.down('KeyW') || input.down('ArrowUp')) mz += 1;
    if (input.down('KeyS') || input.down('ArrowDown')) mz -= 1;
    if (input.down('KeyA') || input.down('ArrowLeft')) mx -= 1;
    if (input.down('KeyD') || input.down('ArrowRight')) mx += 1;
    const moving = mx !== 0 || mz !== 0;
    const sprint = input.down('ShiftLeft') || input.down('ShiftRight');
    const speed = sprint ? 8.6 : 5.1;
    this.footSpeed = moving ? speed : 0;
    if (moving) {
      const sin = Math.sin(this.camYaw);
      const cos = Math.cos(this.camYaw);
      // Camera forward on the ground is -(sin, cos) of the yaw; right is (cos, -sin).
      const wx = mx * cos - mz * sin;
      const wz = -mx * sin - mz * cos;
      const len = Math.hypot(wx, wz) || 1;
      const dx = (wx / len) * speed * dt;
      const dz = (wz / len) * speed * dt;
      this.player.pos.x += dx;
      this.player.pos.z += dz;
      const targetHeading = Math.atan2(wx, wz);
      let diff = targetHeading - this.player.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.player.heading += Math.max(-11 * dt, Math.min(11 * dt, diff));
      this.walkPhase += dt * speed * 1.9;
    } else if (input.firing || input.down('KeyF')) {
      this.player.heading = this.camYaw + Math.PI;
    }
    const p = this.player.pos;
    collideCircle(this.world.colliders, p, 0.55);
    p.x = Math.max(-300, Math.min(300, p.x));
    const pierSpan = p.x > -158 && p.x < -82;
    p.z = Math.max(-300, Math.min(pierSpan ? 364 : 336, p.z));
    p.y = 0;
    this.player.mesh.position.copy(p);
    this.player.mesh.rotation.y = this.player.heading;
    animatePerson(this.player.mesh, moving ? this.walkPhase : 0);
    animatePerson(this.vera, Math.sin(this.clock.elapsedTime * 0.8) * 0.12);
  }

  /** Raycast one hitscan shot from the camera's centre. */
  shoot() {
    this.sound.unlock();
    this.sound.shot();
    this.wanted.addCrime(CRIMES.shotFired);
    const origin = this.camera.position.clone();
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const from = this.playerPos();
    this.crowd.scareAll(from, 26);
    this.effects.muzzle({ x: from.x + dir.x * 1.4, y: 1.5, z: from.z + dir.z * 1.4 });

    const targets = [];
    for (const ped of this.crowd.peds) {
      if (ped.state !== 'down') targets.push({ kind: 'ped', ref: ped, x: ped.pos.x, y: 1.05, z: ped.pos.z, r: 0.95 });
    }
    const carTargets = [...this.traffic.cars, ...this.police.vehicles()];
    if (this.markedCar) carTargets.push(this.markedCar);
    for (const car of carTargets) {
      if (car !== this.currentCar) targets.push({ kind: 'car', ref: car, x: car.pos.x, y: 0.85, z: car.pos.z, r: 2.7 });
    }
    for (const boat of this.boats) {
      if (boat !== this.currentBoat) targets.push({ kind: 'boat', ref: boat, x: boat.pos.x, y: 0.9, z: boat.pos.z, r: 3 });
    }
    if (this.rivalBoat && this.rivalBoat !== this.currentBoat) {
      targets.push({ kind: 'rival', ref: this.rivalBoat, x: this.rivalBoat.pos.x, y: 0.9, z: this.rivalBoat.pos.z, r: 3.1 });
    }
    if (this.police.boatUnit) {
      const b = this.police.boatUnit.boat;
      targets.push({ kind: 'boat', ref: b, x: b.pos.x, y: 0.9, z: b.pos.z, r: 3 });
    }

    let best = null;
    for (const t of targets) {
      const cx = t.x - origin.x;
      const cy = t.y - origin.y;
      const cz = t.z - origin.z;
      const along = cx * dir.x + cy * dir.y + cz * dir.z;
      if (along < 1 || along > 240) continue;
      const px = origin.x + dir.x * along - t.x;
      const py = origin.y + dir.y * along - t.y;
      const pz = origin.z + dir.z * along - t.z;
      const dist = Math.hypot(px, py, pz);
      if (dist < t.r && (!best || along < best.along)) best = { ...t, along, hx: origin.x + dir.x * along, hy: origin.y + dir.y * along, hz: origin.z + dir.z * along };
    }
    // Buildings block the shot.
    if (best && this.rayBlocked(origin, dir, best.along)) best = null;
    if (!best) {
      // A miss still lands somewhere: water splashes, the street sparks.
      const t = 60;
      const hx = origin.x + dir.x * t;
      const hz = origin.z + dir.z * t;
      if (isWater(hx, hz)) this.effects.splash({ x: hx, y: 0.1, z: hz });
      return;
    }
    const hitPos = { x: best.hx, y: best.hy, z: best.hz };
    if (best.kind === 'ped') {
      const wasAlive = !best.ref.dead;
      best.ref.knockDown();
      this.sound.hitFlesh();
      this.effects.impact(hitPos);
      if (wasAlive) this.wanted.addCrime(CRIMES.pedKilled);
    } else if (best.kind === 'car') {
      const car = best.ref;
      const wasDead = car.dead;
      car.health -= 9;
      if (car.health <= 0) { car.health = 0; car.dead = true; }
      this.sound.hitMetal();
      this.effects.impact(hitPos, true);
      if (car.kind === 'police') {
        this.wanted.addCrime(wasDead ? 4 : CRIMES.policeHit);
        if (car.dead && !wasDead) this.wanted.addCrime(CRIMES.policeKilled);
      }
    } else if (best.kind === 'rival') {
      this.rivalHp -= 9;
      this.story.damageRival(9, this.rivalBoat.pos);
      this.sound.hitMetal();
      this.effects.impact(hitPos, true);
      if (this.rivalHp < 50) this.effects.smoke({ x: best.x, y: 1.4, z: best.z });
    } else if (best.kind === 'boat') {
      best.ref.health -= 9;
      if (best.ref.health <= 0) { best.ref.health = 0; best.ref.dead = true; }
      this.sound.hitMetal();
      this.effects.splash(hitPos);
    }
  }

  /** Is the straight line from origin along dir blocked by a building before t? */
  rayBlocked(origin, dir, maxT) {
    const steps = Math.ceil(maxT / 2);
    for (let i = 1; i < steps; i += 1) {
      const t = i * 2;
      const x = origin.x + dir.x * t;
      const z = origin.z + dir.z * t;
      const y = origin.y + dir.y * t;
      if (y > 60) continue;
      for (const box of this.world.colliders) {
        if (x > box.minX && x < box.maxX && z > box.minZ && z < box.maxZ) return true;
      }
    }
    return false;
  }

  /** Cars (anyone's) versus pedestrians: running someone down has consequences. */
  runOverChecks(dt) {
    const cars = [...this.traffic.cars, ...this.police.vehicles()];
    if (this.currentCar) cars.push(this.currentCar);
    if (this.markedCar) cars.push(this.markedCar);
    for (const car of cars) {
      if (Math.abs(car.speed) < 2.5 || car.parked) continue;
      const f = car.forward();
      const noseX = car.pos.x + f.x * 2;
      const noseZ = car.pos.z + f.z * 2;
      for (const ped of this.crowd.peds) {
        if (ped.state === 'down') continue;
        if (Math.hypot(ped.pos.x - noseX, ped.pos.z - noseZ) < 1.5 || Math.hypot(ped.pos.x - car.pos.x, ped.pos.z - car.pos.z) < 2) {
          ped.knockDown();
          this.sound.hitFlesh();
          if (car === this.currentCar) {
            this.wanted.addCrime(CRIMES.pedKilled);
            this.hurtPlayer(2);
          }
        }
      }
      // And the player, if a car finds them on foot.
      if (this.playerMode === 'foot' && car !== this.currentCar) {
        const p = this.player.pos;
        if (Math.hypot(p.x - noseX, p.z - noseZ) < 1.5 && Math.abs(car.speed) > 4) {
          this.hurtPlayer(Math.min(20, Math.abs(car.speed) * 0.8));
          p.x += f.x * 3;
          p.z += f.z * 3;
          this.sound.crash(4);
        }
      }
    }
    void dt;
  }

  onCarCrash(a, b, strength) {
    const playerPos = this.playerPos();
    if (Math.hypot(a.pos.x - playerPos.x, a.pos.z - playerPos.z) < 55) this.sound.crash(strength);
    if (a === this.currentCar || b === this.currentCar) {
      this.playerHealth -= strength * 0.14;
      const other = a === this.currentCar ? b : a;
      if (other.kind === 'police') this.wanted.addCrime(CRIMES.carRam);
      if (other === this.rivalBoat) this.story.damageRival(strength * 1.4, this.rivalBoat.pos);
      this.effects.impact({ x: playerPos.x, y: 0.8, z: playerPos.z }, true);
    }
    if (a === this.rivalBoat || b === this.rivalBoat) {
      // Cars never meet the rival boat; kept for symmetry with boat rams below.
    }
  }

  updateRival(dt) {
    const rival = this.rivalBoat;
    if (!rival) return;
    if (rival === this.currentBoat) return;
    const target = { x: 60, z: 985 };
    const dx = target.x - rival.pos.x;
    const dz = target.z - rival.pos.z;
    const desired = Math.atan2(dx, dz);
    let diff = desired - rival.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    stepBoat(rival, { throttle: 0.72, steer: Math.max(-1, Math.min(1, diff * 1.5)) }, dt, this.clock.elapsedTime);
    // Ramming the rival hurts it.
    if (this.currentBoat && Math.hypot(this.currentBoat.pos.x - rival.pos.x, this.currentBoat.pos.z - rival.pos.z) < 5) {
      const rel = Math.abs(this.currentBoat.speed - rival.speed);
      if (rel > 2) {
        this.rivalHp -= rel * 2.2;
        this.story.damageRival(rel * 2.2, rival.pos);
        this.sound.crash(rel);
        this.effects.splash({ x: rival.pos.x, y: 0.4, z: rival.pos.z }, true);
        rival.speed *= 0.5;
        this.currentBoat.speed *= 0.6;
      }
    }
    if (this.rivalHp <= 0 && !rival.dead) {
      rival.dead = true;
      this.effects.splash({ x: rival.pos.x, y: 0.4, z: rival.pos.z }, true);
    }
    if (rival.dead) {
      rival.mesh.rotation.x += dt * 0.5;
      rival.mesh.position.y -= dt * 0.5;
    }
  }

  hurtPlayer(amount) {
    this.playerHealth -= amount;
    this.sound.hurt();
  }

  handleStoryEvents(events) {
    for (const event of events) {
      if (event.type === 'dialogue') {
        this.hud.dialogue(event.who, event.line);
      } else if (event.type === 'missionStart') {
        this.sound.missionStart();
        this.hud.toast(event.mission.title.toUpperCase(), 'New errand from Vera Castellan');
      } else if (event.type === 'spawnCar') {
        const step = event.step;
        const isAzure = this.story.active && this.story.active.mission.id === 'azure-coupe';
        const car = new Car(step.kind || 'sport', isAzure ? 0x2a7de8 : 0xd23c2a, step.carAt.x, step.carAt.z, step.carAt.heading || 0);
        car.parked = true;
        this.scene.add(car.mesh);
        this.markedCar = car;
      } else if (event.type === 'spawnRival') {
        const rival = new Boat(0xd23c2a, event.step.rivalAt.x, event.step.rivalAt.z, Math.PI);
        this.scene.add(rival.mesh);
        this.rivalBoat = rival;
        this.rivalHp = 100;
      } else if (event.type === 'heat') {
        this.wanted.addCrime(event.points);
      } else if (event.type === 'setHour') {
        this.dayNight.setHour(event.hour);
      } else if (event.type === 'pickup') {
        this.sound.coin();
        this.effects.confetti({ x: this.playerPos().x, y: 1.6, z: this.playerPos().z });
      } else if (event.type === 'stepDone') {
        this.sound.coin();
      } else if (event.type === 'missionComplete') {
        this.save.cash += event.mission.pay;
        this.save.totalEarned += event.mission.pay;
        this.save.missionIndex = this.story.nextIndex;
        this.save.finishedStory = this.story.finished;
        storeSave(this.save);
        this.sound.missionDone();
        this.hud.toast('MISSION COMPLETE', `+${'$' + event.mission.pay.toLocaleString('en-US')} — ${event.mission.title}`);
        const p = this.playerPos();
        this.effects.confetti({ x: p.x, y: 1.8, z: p.z });
      } else if (event.type === 'missionFailed') {
        this.sound.missionFailed();
        this.hud.toast('MISSION FAILED', event.reason);
      } else if (event.type === 'clearEntities') {
        if (this.rivalBoat) {
          if (this.currentBoat === this.rivalBoat) this.exitVehicle(true);
          this.scene.remove(this.rivalBoat.mesh);
          this.rivalBoat = null;
        }
        if (this.markedCar && this.currentCar !== this.markedCar) {
          this.scene.remove(this.markedCar.mesh);
          this.markedCar = null;
        } else if (this.markedCar) {
          this.traffic.cars.push(this.markedCar);
          this.markedCar = null;
        }
      }
    }
  }

  updateAudio(dt) {
    void dt;
    if (this.currentCar) {
      const load = this.input.down('KeyW') ? 1 : 0.4;
      this.sound.setEngine('car', Math.abs(this.currentCar.speed) / 34, load);
    } else if (this.currentBoat) {
      this.sound.setEngine('boat', Math.abs(this.currentBoat.speed) / 15, 0.8);
    } else {
      this.sound.stopEngine();
    }
    const near = this.police.nearest;
    if (this.wanted.stars > 0 && near !== undefined && near < 70) {
      this.sound.setSiren(true, 1 - near / 70);
    } else {
      this.sound.setSiren(false, 0);
    }
    const p = this.playerPos();
    this.sound.setAmbienceLevel(Math.max(0, Math.min(1, (p.z - 120) / 200)));
  }

  updateFx(dt) {
    this.smokeClock -= dt;
    if (this.smokeClock <= 0) {
      this.smokeClock = 0.13;
      const smokers = [...this.traffic.cars, ...this.police.vehicles()];
      if (this.markedCar) smokers.push(this.markedCar);
      for (const car of smokers) {
        if (car.health < 45 && car.health > 0) {
          const f = car.forward();
          this.effects.smoke({ x: car.pos.x + f.x * 1.8, y: 1.1, z: car.pos.z + f.z * 1.8 });
        } else if (car.dead) {
          this.effects.smoke({ x: car.pos.x, y: 1.2, z: car.pos.z });
        }
      }
      if (this.rivalBoat && this.rivalHp < 55 && this.rivalHp > 0) {
        this.effects.smoke({ x: this.rivalBoat.pos.x, y: 1.3, z: this.rivalBoat.pos.z });
      }
    }
    this.splashClock -= dt;
    if (this.splashClock <= 0) {
      this.splashClock = 0.12;
      const boats = [...this.boats];
      if (this.rivalBoat) boats.push(this.rivalBoat);
      if (this.police.boatUnit) boats.push(this.police.boatUnit.boat);
      for (const boat of boats) {
        if (Math.abs(boat.speed) > 5) {
          const f = boat.forward();
          this.effects.splash({ x: boat.pos.x - f.x * 3, y: 0.15, z: boat.pos.z - f.z * 3 });
        }
      }
    }
    // The beacon stands on the current objective.
    const marker = this.story.marker();
    if (marker) {
      this.beacon.visible = true;
      this.beacon.position.x = marker.x;
      this.beacon.position.z = marker.z;
      this.beacon.material.opacity = 0.24 + Math.sin(this.clock.elapsedTime * 3) * 0.08;
    } else {
      this.beacon.visible = false;
    }
  }

  updateCamera(dt) {
    const cam = this.camera;
    if (this.fixedCamera) {
      cam.position.set(...this.fixedCamera.pos);
      cam.lookAt(...this.fixedCamera.look);
      cam.fov = 55;
      cam.updateProjectionMatrix();
      return;
    }
    if (this.currentCar || this.currentBoat) {
      const vehicle = this.currentCar || this.currentBoat;
      const f = vehicle.forward();
      const dist = this.currentBoat ? 12.5 : 10.5;
      const height = this.currentBoat ? 4.6 : 4.1;
      const want = new THREE.Vector3(
        vehicle.pos.x - f.x * dist,
        height,
        vehicle.pos.z - f.z * dist,
      );
      cam.position.lerp(want, Math.min(1, dt * 5.5));
      cam.lookAt(vehicle.pos.x + f.x * 7, 1.6, vehicle.pos.z + f.z * 7);
      const targetFov = 62 + Math.min(10, Math.abs(vehicle.speed) * 0.32);
      if (Math.abs(cam.fov - targetFov) > 0.1) {
        cam.fov += (targetFov - cam.fov) * Math.min(1, dt * 4);
        cam.updateProjectionMatrix();
      }
      this.camYaw = vehicle.heading + Math.PI;
      return;
    }
    // On foot: orbit-follow from the mouse-look yaw and pitch.
    if (!this.input.locked) {
      let diff = this.player.heading + Math.PI - this.camYaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.camYaw += diff * Math.min(1, dt * 2.2);
    }
    const p = this.player.pos;
    const dist = 7.6;
    const cx = p.x + Math.sin(this.camYaw) * Math.cos(this.camPitch) * dist;
    const cz = p.z + Math.cos(this.camYaw) * Math.cos(this.camPitch) * dist;
    const cy = 1.7 + Math.sin(this.camPitch) * dist;
    cam.position.lerp(new THREE.Vector3(cx, Math.max(1.1, cy), cz), Math.min(1, dt * 14));
    cam.lookAt(p.x, 1.55, p.z);
    if (Math.abs(cam.fov - 62) > 0.1) {
      cam.fov = 62;
      cam.updateProjectionMatrix();
    }
  }

  updateHud() {
    if (this.save.cash !== this.lastCashShown) {
      this.hud.setCash(this.save.cash);
      this.lastCashShown = this.save.cash;
    }
    this.hud.setWanted(this.wanted.stars);
    this.hud.setHealth(Math.max(0, this.playerHealth) / 100);
    const objective = this.story.objective();
    this.hud.setMission(objective.title, objective.text, objective.timer);
    if (this.currentCar) {
      this.hud.setVehicle(this.currentCar.kind === 'police' ? 'PATROL CAR' : this.currentCar.kind === 'taxi' ? 'TAXI' : this.currentCar.kind === 'sport' ? 'SPORT COUPE' : 'CAR', this.currentCar.speed * 3.6);
    } else if (this.currentBoat) {
      this.hud.setVehicle('RUNABOUT', this.currentBoat.speed * 3.6);
    } else {
      this.hud.setVehicle('', null);
    }
    const p = this.playerPos();
    const cars = this.traffic.cars.map((c) => c.pos);
    if (this.markedCar) cars.push(this.markedCar.pos);
    this.hud.drawMinimap({
      player: { x: p.x, z: p.z, heading: this.currentCar ? this.currentCar.heading : this.currentBoat ? this.currentBoat.heading : this.player.heading },
      cars,
      police: this.police.units.map((u) => u.pos),
      boats: [...this.boats.map((b) => b.pos), ...(this.police.boatUnit ? [this.police.boatUnit.boat.pos] : [])],
      marker: this.story.marker(),
      rival: this.rivalBoat ? this.rivalBoat.pos : null,
    });
  }
}

new Game();
