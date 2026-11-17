// main.js — Solmar Bay, the whole game: boot, the loop, the camera, entering
// and stealing cars, crimes and their witnesses, busts and respawns, saving,
// and the staged scenes the screenshots are taken from.

import * as THREE from 'three';
import { setSeed, clamp, dist2D } from './util.js';
import { buildCity } from './city.js';
import { Vehicle, spawnTrafficCar, updateTraffic } from './vehicles.js';
import { Ped, spawnCrowd } from './pedestrians.js';
import { Player } from './player.js';
import { WantedSystem, PoliceForce } from './police.js';
import { Weapon, Effects } from './combat.js';
import { MissionManager } from './missions.js';
import { HUD } from './hud.js';
import { SoundFX } from './audio.js';
import { loadSave, storeSave, clearSave } from './save.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');
const SEED = parseInt(params.get('seed') || '7', 10) || 7;

export class Game {
  constructor() {
    setSeed(SEED);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('app').appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9fd3e8);
    this.scene.fog = new THREE.Fog(0xcfe0ea, 130, 340);
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 900);

    const hemi = new THREE.HemisphereLight(0xcfe5ff, 0x8a7a5a, 0.95);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(0xffe3b3, 1.9);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -95;
    sc.right = 95;
    sc.top = 95;
    sc.bottom = -95;
    sc.far = 320;
    this.sun.shadow.bias = -0.0006;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    const cityData = buildCity(this.scene);
    this.colliders = cityData.colliders;
    this.landmarks = cityData.landmarks;

    this.sound = new SoundFX();
    this.effects = new Effects(this.scene);
    this.hud = new HUD();
    this.wanted = new WantedSystem(() => this.sound.levelUpStar());
    this.police = new PoliceForce(this.scene, this.wanted);
    this.weapon = new Weapon(this.scene, this.effects, this.sound);
    this.player = new Player(this.scene, -52, 74);
    this.trafficCars = [];
    this.extraCars = [];
    this.peds = spawnCrowd(this.scene, 26);
    for (let i = 0; i < 13; i++) this.trafficCars.push(spawnTrafficCar(this.scene));
    this.spawnParkedCars();
    this.missions = new MissionManager(this);

    this.cash = 250;
    this.state = 'title'; // title | playing | paused | busted | wasted | complete
    this.keys = {};
    this.camYaw = Math.PI;
    this.camPitch = 0.32;
    this.pointerLocked = false;
    this.mouseDown = false;
    this.bustMeter = 0;
    this.shake = 0;
    this.time = 0;
    this.storyDone = false;
    this.saveTimer = 0;

    this.bindInput();
    this.bindUI();
    if (SHOT) this.stageShot(SHOT);
    else if (loadSave()) document.getElementById('btn-continue').style.display = '';

    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  spawnParkedCars() {
    // Kerbside spots: 8 units off an avenue's centre line, clear of the two
    // driving lanes (which sit 4.3 off centre), so traffic flows past them.
    const spots = [
      [-74, 40, 0], [8, -74, Math.PI / 2], [58, 140, -Math.PI / 2], [140, 90, Math.PI],
      [-140, -90, 0], [38, 8, Math.PI / 2], [-40, -140, -Math.PI / 2], [74, -20, Math.PI],
      [-124, 70, Math.PI], [30, 74, -Math.PI / 2],
    ];
    const kinds = ['sedan', 'hatch', 'van', 'sedan', 'hatch', 'sedan', 'taxi', 'hatch', 'sedan', 'van'];
    const colors = [0x3f7fbf, 0xf2f2f2, 0x50b86b, 0x9b59b6, 0xe8e3d5, 0xd64541, 0xffc61a, 0x16a3a3, 0x2b2f36, 0xf5a623];
    spots.forEach(([x, z, a], i) => {
      const car = new Vehicle(this.scene, kinds[i], colors[i], x, z, a);
      car.parked = true;
      this.extraCars.push(car);
    });
  }

  get allCars() {
    return [...this.trafficCars, ...this.extraCars, ...this.police.units];
  }

  bindInput() {
    addEventListener('keydown', (e) => {
      this.sound.ensure();
      if (e.code === 'KeyE' && this.state === 'playing') this.toggleCar();
      if ((e.code === 'KeyP' || e.code === 'Escape') && this.state === 'playing') this.pause();
      else if (e.code === 'KeyP' && this.state === 'paused') this.resume();
      this.keys[e.code] = true;
      if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });
    addEventListener('mousemove', (e) => {
      if (!this.pointerLocked || this.state !== 'playing') return;
      this.camYaw -= e.movementX * 0.0026;
      this.camPitch = clamp(this.camPitch + e.movementY * 0.0022, -0.12, 1.05);
    });
    addEventListener('mousedown', (e) => {
      this.sound.ensure();
      if (e.button === 0) this.mouseDown = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    this.renderer.domElement.addEventListener('click', () => {
      if (this.state === 'playing' && !this.pointerLocked && !SHOT) {
        this.renderer.domElement.requestPointerLock();
      }
    });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.renderer.domElement;
    });
    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });
  }

  bindUI() {
    const $ = (id) => document.getElementById(id);
    $('btn-start').addEventListener('click', () => this.newGame());
    $('btn-continue').addEventListener('click', () => this.continueGame());
    $('btn-resume').addEventListener('click', () => this.resume());
    $('btn-restart').addEventListener('click', () => this.newGame());
    $('btn-again').addEventListener('click', () => this.backToGame());
  }

  show(id, visible) {
    const el = document.getElementById(id);
    el.style.display = visible ? '' : 'none';
    el.classList.toggle('hidden', !visible);
  }

  newGame() {
    clearSave();
    this.cash = 250;
    this.storyDone = false;
    this.wanted.clear();
    this.police.clearAll();
    this.player.heal(100);
    this.player.dead = false;
    if (this.player.inCar) this.exitCar(true);
    this.player.teleport(-52, 74, Math.PI);
    this.player.setVisible(true);
    this.beginPlay();
    this.missions.start(0);
    this.hud.toast("Mars Solano just hit town with $250 and a borrowed name. Rey has work.", 6);
  }

  continueGame() {
    const save = loadSave();
    if (!save) return this.newGame();
    this.cash = save.cash;
    this.storyDone = !!save.storyDone;
    this.player.heal(save.health || 100);
    this.player.dead = false;
    this.player.teleport(save.x || -52, save.z || 74, Math.PI);
    this.beginPlay();
    if (this.storyDone) {
      this.missions.done = true;
      this.hud.toast('Welcome back to Solmar Bay. The streets are yours — free roam.', 5);
    } else {
      this.missions.start(save.missionIndex || 0);
      this.hud.toast('Welcome back. Rey still has work for you.', 4.5);
    }
  }

  beginPlay() {
    this.state = 'playing';
    this.show('title-screen', false);
    this.show('pause-screen', false);
    this.show('end-screen', false);
    this.show('hud', true);
    this.sound.ensure();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.show('pause-screen', true);
    if (document.pointerLockElement) document.exitPointerLock();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.show('pause-screen', false);
  }

  backToGame() {
    // from the busted/wasted/complete screen back into the streets
    this.show('end-screen', false);
    this.state = 'playing';
    this.show('hud', true);
  }

  saveProgress() {
    storeSave({
      cash: this.cash,
      missionIndex: this.missions.done ? 4 : this.missions.index,
      storyDone: this.storyDone,
      x: this.player.x,
      z: this.player.z,
      health: this.player.health,
    });
  }

  addCash(n) {
    this.cash += n;
  }

  onStoryComplete() {
    this.storyDone = true;
    this.state = 'complete';
    this.saveProgress();
    const end = document.getElementById('end-screen');
    document.getElementById('end-title').textContent = 'SOLMAR BAY IS YOURS';
    document.getElementById('end-text').textContent =
      'The van is delivered, the Vultures are done, and every driver in the bay knows the name Mars Solano. Final cash: $' +
      this.cash.toLocaleString('en-US') +
      '. Free roam is open — the city keeps turning.';
    this.show('end-screen', true);
    if (document.pointerLockElement) document.exitPointerLock();
    void end;
  }

  // --- cars: getting in, getting out, and what the law thinks of it ---------

  witnessed(x, z) {
    for (const ped of this.peds) {
      if (ped.alive && dist2D(ped.x, ped.z, x, z) < 27) return true;
    }
    for (const unit of this.police.units) {
      if (dist2D(unit.x, unit.z, x, z) < 48) return true;
    }
    return false;
  }

  commitCrime(points, x, z) {
    const seen = this.witnessed(x, z);
    this.wanted.addCrime(points, seen);
    if (seen) {
      for (const ped of this.peds) {
        if (ped.alive && dist2D(ped.x, ped.z, x, z) < 22) ped.panic(x, z, 2.5);
      }
    }
    return seen;
  }

  nearestCar(maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of this.allCars) {
      if (car.disabled) continue;
      const d = dist2D(car.x, car.z, this.player.x, this.player.z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  toggleCar() {
    if (this.player.inCar) this.exitCar(false);
    else {
      const car = this.nearestCar(3.6);
      if (car) this.enterCar(car);
    }
  }

  enterCar(car) {
    const ti = this.trafficCars.indexOf(car);
    if (ti >= 0) {
      this.trafficCars.splice(ti, 1);
      this.extraCars.push(car);
    }
    car.parked = false;
    car.speed = 0;
    this.player.inCar = car;
    this.player.setVisible(false);
    this.sound.carDoor();
    this.sound.ensure();
    this.sound.startEngine();
    if (!car.hotwired) {
      car.hotwired = true;
      const seen = this.commitCrime(car.isPolice ? 2.4 : 1.2, car.x, car.z);
      this.hud.toast(car.isPolice ? 'You just stole a police interceptor.' : seen ? 'Car stolen — and somebody saw it.' : 'Car stolen, quiet as a whisper.', 2.6);
    }
    this.camYaw = car.angle + Math.PI;
  }

  exitCar(silent) {
    const car = this.player.inCar;
    if (!car) return;
    car.speed = 0;
    const sideX = Math.cos(car.angle);
    const sideZ = -Math.sin(car.angle);
    let px = car.x + sideX * 2.4;
    let pz = car.z + sideZ * 2.4;
    this.player.teleport(px, pz, car.angle);
    this.player.inCar = null;
    this.player.setVisible(true);
    if (!silent) {
      this.sound.carDoor();
      this.sound.stopEngine();
      this.sound.setSiren(false, 0);
    }
  }

  // --- harm, law enforcement outcomes ---------------------------------------

  damagePlayer(amount) {
    if (this.state !== 'playing' || this.player.inCar) {
      if (this.player.inCar) {
        // bullets and rams chew the car first
        this.player.inCar.health -= amount * 0.8;
        return;
      }
      return;
    }
    const died = this.player.damage(amount);
    const vig = document.getElementById('vignette');
    vig.style.opacity = '0.55';
    setTimeout(() => (vig.style.opacity = '0'), 130);
    this.shake = Math.min(0.5, this.shake + 0.16);
    if (died) this.wasted();
  }

  enemyShoot(ped, dist) {
    this.sound.gunshot();
    this.effects.burst(ped.x, 1.3, ped.z, 0xffe9a0, 3, 2.5, 0.2, 0.1);
    const chance = clamp(0.72 - dist * 0.013, 0.22, 0.68);
    if (Math.random() < chance) {
      if (this.player.inCar) this.damagePlayer(2.5);
      else this.damagePlayer(3 + Math.random() * 3.5);
    }
  }

  busted() {
    this.state = 'busted';
    const fine = Math.floor(this.cash * 0.15);
    this.cash -= fine;
    this.wanted.clear();
    this.police.clearAll();
    if (this.player.inCar) this.exitCar(true);
    this.sound.bustedSting();
    this.sound.stopEngine();
    this.player.teleport(128, 36, Math.PI);
    document.getElementById('end-title').textContent = 'BUSTED';
    document.getElementById('end-text').textContent =
      'Solmar PD walks you out of the station with lighter pockets — $' + fine.toLocaleString('en-US') + ' in fines. Rey pretends not to know you for exactly one hour.';
    this.show('end-screen', true);
    if (document.pointerLockElement) document.exitPointerLock();
    this.saveProgress();
  }

  wasted() {
    this.state = 'wasted';
    const bill = Math.min(this.cash, 300);
    this.cash -= bill;
    this.wanted.clear();
    this.police.clearAll();
    if (this.player.inCar) this.exitCar(true);
    this.sound.bustedSting();
    this.sound.stopEngine();
    this.player.heal(100);
    this.player.dead = false;
    this.player.teleport(-120, 128, 0);
    document.getElementById('end-title').textContent = 'WASTED';
    document.getElementById('end-text').textContent =
      'You wake up at Bay General with a $' + bill + ' hospital bill and a nurse who has seen it all before. The job, if there was one, is still waiting.';
    this.show('end-screen', true);
    if (document.pointerLockElement) document.exitPointerLock();
    this.saveProgress();
  }

  // --- the loop ---------------------------------------------------------------

  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.time += dt;
    if (this.state === 'playing') this.update(dt);
    else if (this.state === 'title') {
      // a slow cinematic orbit over the bay while the title screen waits
      const t = this.time * 0.045;
      this.camera.position.set(Math.sin(t) * 128, 58, Math.cos(t) * 128);
      this.camera.lookAt(0, 8, 0);
      for (const car of this.trafficCars) {
        updateTraffic(car, dt, this.colliders, this.trafficCars, null);
      }
      const world = { colliders: this.colliders, vehicles: this.trafficCars, playerCar: null, onPedHit: null };
      for (const ped of this.peds) ped.update(dt, world);
      this.sun.position.set(90, 130, 50);
      this.sun.target.position.set(0, 0, 0);
    }
    this.effects.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  update(dt) {
    const player = this.player;
    const inCar = player.inCar;

    // driving or walking
    if (inCar) {
      const throttle = (this.keys.KeyW || this.keys.ArrowUp ? 1 : 0) - (this.keys.KeyS || this.keys.ArrowDown ? 1 : 0);
      const steer = (this.keys.KeyD || this.keys.ArrowRight ? 1 : 0) - (this.keys.KeyA || this.keys.ArrowLeft ? 1 : 0);
      const brake = !!this.keys.Space;
      inCar.drive(dt, SHOT ? 0.55 : throttle, SHOT ? 0 : steer, brake, this.colliders, (intensity) => {
        this.sound.crash(intensity);
        this.shake = Math.min(0.7, this.shake + intensity * 0.4);
        this.effects.burst(inCar.x, 0.8, inCar.z, 0xffc266, 8, 4, 0.35, 0.13);
      });
      this.sound.setEngine(Math.abs(inCar.speed) / inCar.spec.topSpeed, throttle !== 0 ? 1 : 0.4);
      this.hud.setPrompt('');
    } else {
      const input = {
        iz: (this.keys.KeyW || this.keys.ArrowUp ? 1 : 0) - (this.keys.KeyS || this.keys.ArrowDown ? 1 : 0),
        ix: (this.keys.KeyD || this.keys.ArrowRight ? 1 : 0) - (this.keys.KeyA || this.keys.ArrowLeft ? 1 : 0),
        sprint: !!(this.keys.ShiftLeft || this.keys.ShiftRight),
      };
      if (this.keys.ArrowLeft && !this.keys.KeyA) this.camYaw += dt * 1.9;
      if (this.keys.ArrowRight && !this.keys.KeyD) this.camYaw -= dt * 1.9;
      const aiming = this.mouseDown || this.pointerLocked;
      player.gunMesh.visible = true;
      player.update(dt, input, this.camYaw, this.colliders, aiming ? this.camYaw : null);
      if (this.mouseDown && this.weapon.ready) {
        this.weapon.fire(this.camera, player.group.position, { peds: this.peds, cars: this.allCars }, (ev) => this.onShotEvent(ev));
      }
      const near = this.nearestCar(3.6);
      this.hud.setPrompt(near ? (near.isMissionTarget ? 'E — Steal this car' : 'E — Enter vehicle') : '');
    }
    this.weapon.update(dt);

    // the living city
    const obstacles = [...this.allCars];
    if (!inCar) obstacles.push(player);
    for (let i = this.trafficCars.length - 1; i >= 0; i--) {
      const car = this.trafficCars[i];
      updateTraffic(car, dt, this.colliders, obstacles, null);
      const anchor = inCar || player;
      if (dist2D(car.x, car.z, anchor.x, anchor.z) > 250) {
        car.removeFrom(this.scene);
        this.trafficCars.splice(i, 1);
        this.trafficCars.push(spawnTrafficCar(this.scene));
      }
    }
    this.police.update(dt, player, this.colliders, (intensity, unit) => {
      if (inCar && dist2D(unit.x, unit.z, inCar.x, inCar.z) < 6) {
        this.sound.crash(intensity * 0.8);
        this.shake = Math.min(0.6, this.shake + 0.2);
      }
    });
    this.carCarCollisions();
    const pedWorld = {
      colliders: this.colliders,
      vehicles: this.allCars,
      playerCar: inCar,
      onPedHit: (ped, car) => {
        this.effects.burst(ped.x, 0.8, ped.z, 0xd43a2f, 10, 3.6, 0.45, 0.14);
        this.sound.hitThud();
        if (car === inCar || car === player.inCar) {
          this.commitCrime(2.2, ped.x, ped.z);
          this.hud.toast('You ran somebody down.', 2.4);
          this.shake = Math.min(0.6, this.shake + 0.25);
        } else {
          for (const p of this.peds) if (p.alive && dist2D(p.x, p.z, ped.x, ped.z) < 16) p.panic(ped.x, ped.z, 2);
        }
      },
    };
    for (const ped of this.peds) ped.update(dt, pedWorld);

    // engine smoke from anything badly hurt
    for (const car of this.allCars) {
      if (car.health < 45 && Math.random() < dt * 5) this.effects.smoke(car.x, 1.3, car.z);
    }

    this.wanted.update(dt);
    this.missions.update(dt, this.time);
    this.updateBust(dt);
    this.sound.setSiren(this.wanted.stars > 0 && this.police.nearestDistance(player) < 65, dt);

    // camera, sun and HUD follow the action
    this.updateCamera(dt);
    const focus = inCar || player;
    this.sun.position.set(focus.x + 70, 120, focus.z + 40);
    this.sun.target.position.set(focus.x, 0, focus.z);
    this.refreshHUD();

    this.saveTimer += dt;
    if (this.saveTimer > 20) {
      this.saveTimer = 0;
      this.saveProgress();
    }
  }

  onShotEvent(ev) {
    const p = this.player;
    if (ev.type === 'fired') {
      this.commitCrime(0.8, p.x, p.z);
      this.shake = Math.min(0.4, this.shake + 0.07);
    } else if (ev.type === 'pedShot') {
      const isGang = this.missions.gang.includes(ev.ped);
      if (!isGang) this.commitCrime(ev.died ? 2.6 : 1.4, ev.ped.x, ev.ped.z);
      if (ev.died) this.sound.hitThud();
    } else if (ev.type === 'carShot') {
      if (!ev.car.isPolice) this.commitCrime(0.7, ev.car.x, ev.car.z);
      else this.commitCrime(1.6, ev.car.x, ev.car.z);
    }
  }

  carCarCollisions() {
    const moving = [...this.trafficCars, ...this.police.units];
    if (this.player.inCar) moving.push(this.player.inCar);
    for (let i = 0; i < moving.length; i++) {
      for (let j = i + 1; j < moving.length; j++) {
        const a = moving[i];
        const b = moving[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d < 4.1 && d > 0.01) {
          const push = (4.1 - d) / 2;
          const ux = dx / d;
          const uz = dz / d;
          a.group.position.x -= ux * push;
          a.group.position.z -= uz * push;
          b.group.position.x += ux * push;
          b.group.position.z += uz * push;
          const rel = Math.abs(a.speed - b.speed);
          if (rel > 7) {
            a.health -= rel * 0.3;
            b.health -= rel * 0.3;
            if (a === this.player.inCar || b === this.player.inCar) {
              this.sound.crash(Math.min(1, rel / 26));
              this.shake = Math.min(0.6, this.shake + 0.2);
            }
            a.speed *= 0.55;
            b.speed *= 0.55;
          }
        }
      }
    }
  }

  updateBust(dt) {
    if (this.wanted.stars === 0) {
      this.bustMeter = Math.max(0, this.bustMeter - dt * 1.5);
      return;
    }
    const near = this.police.nearestDistance(this.player);
    const inCar = this.player.inCar;
    const slow = inCar ? Math.abs(inCar.speed) < 2.5 : this.player.speed < 2.6;
    const range = inCar ? 8 : 5;
    if (near < range && slow) this.bustMeter += dt * (inCar ? 0.55 : 1);
    else this.bustMeter = Math.max(0, this.bustMeter - dt * 0.8);
    if (this.bustMeter > 0.15) this.hud.setPrompt('BUSTED in ' + Math.max(0, 2.2 - this.bustMeter).toFixed(1) + ' — MOVE!');
    if (this.bustMeter >= 2.2) {
      this.bustMeter = 0;
      this.busted();
    }
  }

  updateCamera(dt) {
    const player = this.player;
    this.shake = Math.max(0, this.shake - dt * 1.8);
    const shX = (Math.random() - 0.5) * this.shake * 0.5;
    const shY = (Math.random() - 0.5) * this.shake * 0.35;
    if (player.inCar) {
      const car = player.inCar;
      const targetYaw = car.angle + Math.PI;
      let diff = targetYaw - this.camYaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.camYaw += diff * Math.min(1, dt * 3.2);
      const fx = Math.sin(car.angle);
      const fz = Math.cos(car.angle);
      const dist = 10.5 + Math.abs(car.speed) * 0.06;
      const cx = car.x - fx * dist;
      const cz = car.z - fz * dist;
      this.camera.position.lerp(new THREE.Vector3(cx, 4.4, cz), Math.min(1, dt * 5));
      this.camera.position.x += shX;
      this.camera.position.y += shY;
      this.camera.lookAt(car.x + fx * 7, 1.6, car.z + fz * 7);
    } else {
      const fx = Math.sin(this.camYaw);
      const fz = Math.cos(this.camYaw);
      const dist = 7.6;
      const cx = player.x - fx * dist;
      const cz = player.z - fz * dist;
      const cy = 2.4 + this.camPitch * 4.6;
      this.camera.position.lerp(new THREE.Vector3(cx, cy, cz), Math.min(1, dt * 10));
      this.camera.position.x += shX;
      this.camera.position.y += shY;
      this.camera.lookAt(player.x + fx * 5, 1.7 - this.camPitch * 2.2, player.z + fz * 5);
    }
  }

  refreshHUD() {
    const player = this.player;
    this.hud.setHealth(player.health);
    this.hud.setCash(this.cash);
    this.hud.setStars(this.wanted.stars);
    const mo = this.missions.objective;
    const p = this.missions.playerPos();
    const dist = this.missions.active ? dist2D(p.x, p.z, mo.x, mo.z) : null;
    this.hud.setObjective(this.missions.active ? mo.title : 'Free Roam', this.missions.active ? mo.text : 'The bay is yours. Rey has no more jobs — for now.', dist);
    this.hud.setSpeed(player.inCar ? Math.abs(player.inCar.speed) * 3.6 : null);
    this.hud.update(0.016);
    this.hud.drawMinimap(
      {
        player: { x: player.inCar ? player.inCar.x : player.x, z: player.inCar ? player.inCar.z : player.z, angle: player.inCar ? player.inCar.angle : player.angle },
        cars: this.allCars,
        police: this.police.units,
        targetCar: this.missions.targetCar,
        objective: this.missions.active ? { x: mo.x, z: mo.z } : null,
      },
      this.time,
    );
  }

  // --- staged scenes for the entry screenshots -------------------------------

  stageShot(mode) {
    window.__solmar = this;
    if (mode === 'title') {
      this.state = 'title';
      this.show('title-screen', true);
      this.show('hud', false);
      return;
    }
    this.beginPlay();
    if (mode === 'drive') {
      this.missions.start(0);
      const car = new Vehicle(this.scene, 'sedan', 0x3f7fbf, -34, 70.3, Math.PI / 2);
      car.hotwired = true; // the staged drive is not a fresh theft
      this.extraCars.push(car);
      this.enterCar(car);
      car.speed = 16;
      this.camYaw = car.angle + Math.PI;
      this.camera.position.set(car.x - 10, 4.4, car.z - 1);
    } else if (mode === 'chase') {
      this.missions.start(0);
      const car = new Vehicle(this.scene, 'sedan', 0xd64541, 10, -70.3, -Math.PI / 2);
      car.hotwired = true;
      this.extraCars.push(car);
      this.enterCar(car);
      car.speed = 19;
      this.wanted.setWantedAtLeast(3);
      // One interceptor in the oncoming lane ahead, one cutting in from the
      // side street — both inside the chase camera's view, not behind it.
      const copAhead = new Vehicle(this.scene, 'police', 0xf2f4f6, -20, -61.7, -Math.PI / 2);
      copAhead.isPolice = true;
      copAhead.speed = 15;
      this.police.units.push(copAhead);
      const copSide = new Vehicle(this.scene, 'police', 0xf2f4f6, 2, -84, -Math.PI / 2);
      copSide.isPolice = true;
      copSide.speed = 13;
      this.police.units.push(copSide);
      this.camYaw = car.angle + Math.PI;
      this.camera.position.set(car.x + 10, 4.4, car.z);
      this.hud.toast('Solmar PD is on you — lose them!', 30);
    } else if (mode === 'mission') {
      this.missions.start(0);
      const target = this.missions.targetCar;
      this.player.teleport(target.x - 9.5, target.z + 8.5, Math.atan2(9.5, -8.5));
      this.camYaw = Math.atan2(9.5, -8.5);
      this.camPitch = 0.22;
      const fx = Math.sin(this.camYaw);
      const fz = Math.cos(this.camYaw);
      this.camera.position.set(this.player.x - fx * 7.6, 3.4, this.player.z - fz * 7.6);
      this.camera.lookAt(target.x, 1.2, target.z);
    }
    this.refreshHUD();
  }
}

window.__solmar = new Game();
