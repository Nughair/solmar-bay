// missions.js — the story of Solmar Bay, in five jobs for fixer Tomas Rey:
// steal a car, run a checkpoint under heat, race the downtown grid, clear
// the Pier 9 crew, and bring home the armoured van. Each job pays cash and
// hands the next one over, with an intro card and a completion state.

import * as THREE from 'three';
import { dist2D } from './util.js';
import { Vehicle } from './vehicles.js';
import { Ped } from './pedestrians.js';

export const MISSION_DEFS = [
  {
    id: 'wheels',
    title: 'First Wheels',
    pay: 800,
    intro: "Rey: A collector left a red coupe by the marina. Bring it to my garage — clean, no dents in the story.",
  },
  {
    id: 'heat',
    title: 'Heat Check',
    pay: 1200,
    intro: 'Rey: The Solmar PD think they own these streets. Show them a tail-light, then disappear.',
  },
  {
    id: 'dash',
    title: 'Downtown Dash',
    pay: 2000,
    intro: 'Rey: Four drops across the grid, one clock. Prove the bay has a new fastest driver.',
  },
  {
    id: 'pier',
    title: 'Pier 9 Shootout',
    pay: 3000,
    intro: 'Rey: The Vulture crew took my Pier 9 storehouse. Take it back — they will not ask politely.',
  },
  {
    id: 'score',
    title: 'The Big Score',
    pay: 5000,
    intro: "Rey: One armoured van, one ride across town, every cop awake. Do this and Solmar Bay is yours.",
  },
];

export class MissionManager {
  constructor(game) {
    this.game = game;
    this.index = 0;
    this.stage = 0;
    this.active = false;
    this.done = false;
    this.timer = 0;
    this.spawned = []; // vehicles/peds this mission owns
    this.targetCar = null;
    this.gang = [];
    this.checkpoints = [];
    this.beacon = null;
    this.beaconMat = null;
    this.objective = { x: 0, z: 0, title: '', text: '' };
  }

  get def() {
    return MISSION_DEFS[this.index] || null;
  }

  makeBeacon(x, z, color = 0xffd54f) {
    this.clearBeacon();
    this.beaconMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.17,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.beacon = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 34, 18, 1, true), this.beaconMat);
    this.beacon.position.set(x, 17, z);
    this.game.scene.add(this.beacon);
  }

  clearBeacon() {
    if (this.beacon) {
      this.game.scene.remove(this.beacon);
      this.beacon.geometry.dispose();
      this.beacon = null;
    }
  }

  setObjective(x, z, text) {
    this.objective.x = x;
    this.objective.z = z;
    this.objective.text = text;
    this.objective.title = this.def ? this.def.title : '';
  }

  cleanup() {
    this.releaseSpawned();
    for (const e of this.spawned) {
      if (e.group) this.game.scene.remove(e.group);
    }
    this.spawned = [];
    this.targetCar = null;
    this.gang = [];
    this.checkpoints = [];
    this.clearBeacon();
  }

  start(index) {
    this.cleanup();
    this.index = index;
    this.stage = 0;
    this.active = true;
    this.done = false;
    const g = this.game;
    const def = this.def;
    if (!def) return;
    g.hud.toast(def.intro, 6.5);
    g.sound.missionSting(true);

    if (def.id === 'wheels') {
      const car = new Vehicle(g.scene, 'sedan', 0xd42427, 124, -38, Math.PI);
      car.parked = true;
      car.isMissionTarget = true;
      this.targetCar = car;
      this.spawned.push(car);
      g.extraCars.push(car);
      this.makeBeacon(car.x, car.z);
      this.setObjective(car.x, car.z, 'Steal the red coupe by the marina');
    } else if (def.id === 'heat') {
      this.timer = 75;
      this.makeBeacon(66, 66, 0x4dd0e1);
      this.setObjective(66, 66, 'Reach the checkpoint — ' + Math.ceil(this.timer) + 's');
    } else if (def.id === 'dash') {
      this.checkpoints = [
        [-120, -120],
        [118, -58],
        [6, 122],
        [-118, 58],
      ];
      this.timer = 170;
      const [cx, cz] = this.checkpoints[0];
      this.makeBeacon(cx, cz, 0x4dd0e1);
      this.setObjective(cx, cz, 'Checkpoint 1 of 4 — ' + Math.ceil(this.timer) + 's');
    } else if (def.id === 'pier') {
      // The crew holds the forecourt west of the storehouse, on open ground
      // in front of the delivery pad — never inside the building itself.
      const spots = [
        [130, -104],
        [131, -120],
        [124, -112],
        [136, -98],
      ];
      for (const [x, z] of spots) {
        const ped = new Ped(g.scene, x, z, { armed: true, hp: 62, shirt: 0x21262b });
        ped.postX = x;
        ped.postZ = z;
        this.gang.push(ped);
        this.spawned.push(ped);
        g.peds.push(ped);
      }
      this.makeBeacon(128, -112, 0xef5350);
      this.setObjective(128, -112, 'Clear the Vulture crew at Pier 9 (0/4)');
    } else if (def.id === 'score') {
      const van = new Vehicle(g.scene, 'armored', 0x37474f, 12, -58, Math.PI / 2);
      van.parked = true;
      van.isMissionTarget = true;
      this.targetCar = van;
      this.spawned.push(van);
      g.extraCars.push(van);
      this.makeBeacon(van.x, van.z);
      this.setObjective(van.x, van.z, 'Steal the armoured van by the bank tower');
    }
  }

  // Take this mission's entities out of the game's shared lists (their meshes
  // stay in the scene until cleanup) — used when a job ends or restarts.
  releaseSpawned() {
    const g = this.game;
    for (const e of this.spawned) {
      const ci = g.extraCars.indexOf(e);
      if (ci >= 0) g.extraCars.splice(ci, 1);
      const pi = g.peds.indexOf(e);
      if (pi >= 0) g.peds.splice(pi, 1);
    }
  }

  complete() {
    const g = this.game;
    const def = this.def;
    this.active = false;
    // A delivered target car becomes the player's own ride, not scrap.
    if (this.targetCar) {
      const si = this.spawned.indexOf(this.targetCar);
      if (si >= 0) this.spawned.splice(si, 1);
      this.targetCar.isMissionTarget = false;
      this.targetCar = null;
    }
    this.releaseSpawned();
    this.clearBeacon();
    g.addCash(def.pay);
    g.sound.cashRegister();
    g.hud.toast(def.title + ' complete — $' + def.pay.toLocaleString('en-US'), 4.5);
    g.saveProgress();
    if (this.index + 1 >= MISSION_DEFS.length) {
      this.done = true;
      g.onStoryComplete();
    } else {
      this.start(this.index + 1);
    }
  }

  fail(reason) {
    const g = this.game;
    this.active = false;
    g.sound.missionSting(false);
    g.hud.toast('Job failed: ' + reason + ' — Rey sends you back out.', 4.5);
    this.releaseSpawned();
    this.start(this.index);
  }

  playerPos() {
    const p = this.game.player;
    return p.inCar ? { x: p.inCar.x, z: p.inCar.z } : { x: p.x, z: p.z };
  }

  update(dt, time) {
    if (this.beaconMat) this.beaconMat.opacity = 0.15 + Math.sin(time * 3.2) * 0.045;
    if (!this.active || !this.def) return;
    const g = this.game;
    const p = this.playerPos();
    const def = this.def;

    if (def.id === 'wheels') {
      if (this.stage === 0) {
        if (this.targetCar && this.targetCar.disabled) return this.fail('the coupe is wrecked');
        if (g.player.inCar && g.player.inCar === this.targetCar) {
          this.stage = 1;
          const pad = g.landmarks.garage;
          this.makeBeacon(pad.padX, pad.padZ);
          this.setObjective(pad.padX, pad.padZ, "Deliver the coupe to Rey's Customs");
          g.hud.toast('Wheels up. Get it to the garage.', 3.5);
        }
      } else if (this.stage === 1) {
        if (this.targetCar.disabled) return this.fail('the coupe is wrecked');
        const pad = g.landmarks.garage;
        if (g.player.inCar === this.targetCar && dist2D(p.x, p.z, pad.padX, pad.padZ) < 8.5) return this.complete();
      }
    }

    if (def.id === 'heat') {
      if (this.stage === 0) {
        this.timer -= dt;
        this.objective.text = 'Reach the checkpoint — ' + Math.max(0, Math.ceil(this.timer)) + 's';
        if (this.timer <= 0) return this.fail('too slow');
        if (dist2D(p.x, p.z, 66, 66) < 9.5) {
          this.stage = 1;
          g.wanted.setWantedAtLeast(3);
          this.clearBeacon();
          this.setObjective(p.x, p.z, 'Lose the heat: stay out of sight until the stars fade');
          g.hud.toast('Every unit in the bay is awake. Vanish.', 4);
        }
      } else if (this.stage === 1) {
        this.objective.x = p.x;
        this.objective.z = p.z;
        if (g.wanted.stars === 0) return this.complete();
      }
    }

    if (def.id === 'dash') {
      this.timer -= dt;
      const idx = this.checkpoints.length > 0 ? 4 - this.checkpoints.length : 4;
      const cur = this.checkpoints[0];
      if (cur) this.objective.text = 'Checkpoint ' + (idx + 1) + ' of 4 — ' + Math.max(0, Math.ceil(this.timer)) + 's';
      if (this.timer <= 0) return this.fail('the clock ran out');
      if (cur && dist2D(p.x, p.z, cur[0], cur[1]) < 10.5) {
        this.checkpoints.shift();
        g.sound.cashRegister();
        if (this.checkpoints.length === 0) return this.complete();
        const [nx, nz] = this.checkpoints[0];
        this.makeBeacon(nx, nz, 0x4dd0e1);
        this.setObjective(nx, nz, this.objective.text);
      }
    }

    if (def.id === 'pier') {
      let down = 0;
      for (const ped of this.gang) {
        if (!ped.alive) {
          down++;
          continue;
        }
        // hold the post: the crew defends the forecourt instead of joining
        // the sidewalk crowd, so their walk target is always home
        if (ped.postX !== undefined) {
          ped.targetX = ped.postX;
          ped.targetZ = ped.postZ;
        }
        const d = dist2D(ped.x, ped.z, p.x, p.z);
        if (d < 34) {
          ped.panic(p.x, p.z, 0.4); // keeps them skittish, not fleeing the fight
          ped.state = 'walk';
          ped.shootCooldown -= dt;
          if (ped.shootCooldown <= 0) {
            ped.shootCooldown = 0.85 + Math.random() * 0.9;
            g.enemyShoot(ped, d);
          }
        }
      }
      this.objective.text = 'Clear the Vulture crew at Pier 9 (' + down + '/4)';
      if (down >= 4) return this.complete();
    }

    if (def.id === 'score') {
      if (this.stage === 0) {
        if (this.targetCar && this.targetCar.disabled) return this.fail('the van is wrecked');
        if (g.player.inCar && g.player.inCar === this.targetCar) {
          this.stage = 1;
          g.wanted.setWantedAtLeast(3);
          const pad = g.landmarks.hideout;
          this.makeBeacon(pad.padX, pad.padZ);
          this.setObjective(pad.padX, pad.padZ, 'Deliver the van to Pier 9 Storage — and survive');
          g.hud.toast('The whole bay just heard that engine. GO.', 4);
        }
      } else if (this.stage === 1) {
        if (this.targetCar.disabled) return this.fail('the van is wrecked');
        const pad = g.landmarks.hideout;
        if (g.player.inCar === this.targetCar && dist2D(p.x, p.z, pad.padX, pad.padZ) < 9.5) return this.complete();
      }
    }
  }
}
