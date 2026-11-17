// missions.js — Marina Sol's five jobs: the story of Solmar Bay.
// A small state machine. Each mission is a set of stages with an objective
// line, a world marker, and a cash reward; failing (a wrecked target car, an
// expired timer) restarts the mission, never the whole story. main.js owns
// the world; missions reach it through the `game` hooks object.

import * as THREE from '../vendor/three.module.min.js';
import { Pedestrian } from './people.js';
import { BLOCK } from './city.js';

export const MISSION_TITLES = [
  'Meet Marina',
  'First Wheels',
  'Hot Run',
  'Shake the Heat',
  'Harbour Rumble',
  'The Big Score',
];

const GARAGE = { x: 2 * BLOCK + BLOCK / 2, z: 2 * BLOCK + BLOCK / 2 - 12 };
const CLINIC = { x: -3 * BLOCK + BLOCK / 2, z: -3 * BLOCK + BLOCK / 2 + 12 };

export class Missions {
  constructor(game) {
    this.game = game;
    this.current = -1;        // -1 = free roam / story not started
    this.stage = 0;
    this.marker = null;       // {x, z} world marker for the HUD + beacon
    this.timer = 0;           // countdown for timed stages (0 = none)
    this.targetCar = null;    // the car a mission revolves around
    this.checkpoints = [];
    this.cpIndex = 0;
    this.gunmen = [];
    this.gunmanShootTimer = 0;
    this.done = false;        // whole story finished
    this.failCooldown = 0;
  }

  get active() { return this.current >= 0 && !this.done; }
  get title() { return this.active ? MISSION_TITLES[this.current] : 'Solmar Bay'; }

  startStory(fromMission = 0) {
    this.done = false;
    this.begin(fromMission);
  }

  begin(index) {
    this.current = index;
    this.stage = 0;
    this.timer = 0;
    this.targetCar = null;
    this.checkpoints = [];
    this.cpIndex = 0;
    this.clearGunmen();
    const g = this.game;
    if (index === 0) {
      this.marker = { ...GARAGE };
      g.objective(this.title, 'Meet Marina Sol at her garage by the marina', this.marker);
      g.toast('Marina Sol: "Rico. You drive, I pay. Get over to my garage."');
    } else if (index === 1) {
      this.marker = { ...GARAGE };
      g.objective(this.title, 'Marina has a job for you — head to the garage', this.marker);
    } else if (index === 2) {
      this.checkpoints = [
        { x: -92, z: -92 }, { x: 92, z: -46 }, { x: 46, z: 92 }, { x: -46, z: 46 },
      ];
      this.cpIndex = 0;
      this.timer = 175;
      this.marker = { ...this.checkpoints[0] };
      g.objective(this.title, 'Hit every checkpoint before the clock runs out — you need a car', this.marker);
      g.toast('Marina Sol: "A buyer is timing couriers today. Fastest lap gets paid."');
    } else if (index === 3) {
      this.marker = { x: -115, z: 23 };
      g.objective(this.title, 'Pick up the package at the old warehouses', this.marker);
      g.toast('Marina Sol: "Quiet job. Collect a package out west. Nothing can go wrong."');
    } else if (index === 4) {
      this.marker = { x: 115, z: 115 };
      g.objective(this.title, 'Trouble at the marina plaza — get over there', this.marker);
      g.toast('Marina Sol: "The Vostok crew jumped my dock crew. Handle it, Rico."');
    } else if (index === 5) {
      const car = g.spawnMissionCar({ color: 0xffc21f, kind: 'sport' }, 128, 128, -Math.PI / 2);
      this.targetCar = car;
      this.marker = { x: 128, z: 128 };
      g.objective(this.title, 'Steal the gold Vostok sports car at the marina', this.marker);
      g.toast('Marina Sol: "One last score. The gold car at my marina — take it north."');
    }
  }

  complete(reward, bannerSub) {
    const g = this.game;
    g.addCash(reward);
    g.sound.cash();
    g.sound.missionDone();
    g.banner('Mission passed', bannerSub || ('+$' + reward.toLocaleString('en-US')));
    this.marker = null;
    const next = this.current + 1;
    if (next >= MISSION_TITLES.length) {
      this.done = true;
      this.current = -1;
      g.objective('Solmar Bay', 'Free roam — the city is yours', null);
      g.onStoryComplete();
    } else {
      setTimeout(() => { if (!this.done) this.begin(next); }, 2600);
      this.current = -2; // interlude: banner shows, next job loads shortly
      g.objective('Solmar Bay', 'Marina will call with the next job…', null);
    }
    g.saveGame();
  }

  fail(reason) {
    const g = this.game;
    if (this.failCooldown > 0) return;
    this.failCooldown = 3;
    g.sound.missionFailed();
    g.banner('Mission failed', reason);
    const again = this.current;
    setTimeout(() => { this.begin(again); }, 2800);
  }

  clearGunmen() {
    for (const p of this.gunmen) this.game.scene.remove(p.mesh);
    this.gunmen = [];
  }

  spawnGunmen() {
    const g = this.game;
    const spots = [[106, 108], [124, 106], [108, 124], [126, 126]];
    for (const [x, z] of spots) {
      const ped = new Pedestrian(g.scene);
      ped.state = 'gunman';
      ped.health = 60;
      ped.x = x;
      ped.z = z;
      ped.mesh.position.set(x, 0.24, z);
      ped.mesh.rotation.y = Math.atan2(g.player.x - x, g.player.z - z);
      this.gunmen.push(ped);
    }
  }

  // Called by main.js when Rico gets into any car.
  onEnterCar(car) {
    const g = this.game;
    if (!this.active) return;
    if (this.current === 1 && this.stage === 1 && car === this.targetCar) {
      this.stage = 2;
      this.marker = { ...GARAGE };
      g.objective(this.title, 'Deliver the coupe to Marina\'s garage', this.marker);
      g.toast('That\'s the car. Marina is waiting — and drive it gently.');
    } else if (this.current === 5 && this.stage === 0 && car === this.targetCar) {
      this.stage = 1;
      this.timer = 210;
      g.wanted.setAtLeast(3);
      this.marker = { x: -115, z: -115 };
      g.objective(this.title, 'Deliver the gold car to the north gate — the law is awake', this.marker);
      g.toast('Every patrol in the bay just heard that engine. GO.');
    }
  }

  // Called by main.js when Rico leaves a car (deliveries are checked here).
  onExitCar() { /* deliveries are proximity-based in update(); nothing needed */ }

  distTo(x, z) {
    const p = this.game.playerPos();
    return Math.hypot(p.x - x, p.z - z);
  }

  update(dt) {
    if (this.failCooldown > 0) this.failCooldown -= dt;
    if (!this.active) return;
    const g = this.game;
    const p = g.playerPos();

    if (this.timer > 0) {
      this.timer -= dt;
      g.objectiveDist('Time left: ' + Math.ceil(this.timer) + 's');
      if (this.timer <= 0) { this.fail('Out of time. Marina is not impressed.'); return; }
    }

    if (this.current === 0) {
      if (this.distTo(GARAGE.x, GARAGE.z) < 7) {
        g.toast('Marina Sol: "So you\'re the wheelman. There\'s a coupe on the Strip with my name on it."');
        this.complete(0, 'Marina has work for you');
      }
    } else if (this.current === 1) {
      if (this.stage === 0 && this.distTo(GARAGE.x, GARAGE.z) < 7) {
        const car = g.spawnMissionCar({ color: 0x2e86de, kind: 'coupe' }, 100, -52, Math.PI / 2);
        this.targetCar = car;
        this.stage = 1;
        this.marker = { x: 100, z: -52 };
        g.objective(this.title, 'Steal the blue coupe parked on the Casino Strip', this.marker);
      } else if (this.stage === 1 && this.targetCar && this.targetCar.wrecked) {
        this.fail('The coupe is wrecked. Marina wanted a car, not scrap.');
      } else if (this.stage === 2) {
        if (this.targetCar.wrecked) { this.fail('The coupe is wrecked. Marina wanted a car, not scrap.'); return; }
        if (g.playerCar === this.targetCar && this.distTo(GARAGE.x, GARAGE.z) < 9) {
          g.exitCar(true);
          this.complete(800, 'First Wheels — $800');
        } else if (this.distTo(GARAGE.x, GARAGE.z) < 9 && g.playerCar !== this.targetCar) {
          g.objectiveDist('Bring the blue coupe itself into the gold circle');
        }
      }
    } else if (this.current === 2) {
      const cp = this.checkpoints[this.cpIndex];
      if (g.playerCar && this.distTo(cp.x, cp.z) < 10) {
        g.sound.cash();
        this.cpIndex++;
        if (this.cpIndex >= this.checkpoints.length) {
          this.timer = 0;
          this.complete(1200, 'Hot Run — $1,200');
          return;
        }
        this.marker = { ...this.checkpoints[this.cpIndex] };
        g.objective(this.title, 'Checkpoint ' + (this.cpIndex + 1) + ' of ' + this.checkpoints.length, this.marker);
      }
    } else if (this.current === 3) {
      if (this.stage === 0 && this.distTo(-115, 23) < 6) {
        this.stage = 1;
        g.wanted.setAtLeast(3);
        this.marker = { x: -92, z: 128 };
        g.objective(this.title, 'The package is hot! Lose the police at the beach hideout', this.marker);
        g.toast('It was a set-up — half the bay\'s patrols are rolling. Lose them at the hideout.');
        g.hideoutActive = true;
      } else if (this.stage === 1) {
        const inHideout = this.distTo(-92, 128) < 11;
        if (inHideout && g.wanted.stars === 0) {
          g.hideoutActive = false;
          this.complete(1800, 'Shake the Heat — $1,800');
        } else if (inHideout) {
          g.objectiveDist('Stay hidden — the heat is cooling…');
        }
      }
    } else if (this.current === 4) {
      if (this.stage === 0 && this.distTo(115, 115) < 16) {
        this.stage = 1;
        this.spawnGunmen();
        g.objective(this.title, 'Drop the four Vostok gunmen at the marina plaza', { x: 115, z: 115 });
        g.toast('There they are. Four of them. Rico — be careful.');
      } else if (this.stage === 1) {
        this.gunmanShootTimer -= dt;
        const alive = this.gunmen.filter(ped => ped.state !== 'down');
        for (const ped of alive) {
          ped.mesh.rotation.y = Math.atan2(p.x - ped.x, p.z - ped.z);
        }
        if (this.gunmanShootTimer <= 0 && alive.length) {
          this.gunmanShootTimer = 1.15;
          const shooter = alive[Math.floor(Math.random() * alive.length)];
          const d = Math.hypot(p.x - shooter.x, p.z - shooter.z);
          if (d < 34) {
            const hit = Math.random() < 0.55;
            g.enemyShot(shooter, hit);
          }
        }
        g.objectiveDist('Gunmen left: ' + alive.length);
        if (alive.length === 0) this.complete(2500, 'Harbour Rumble — $2,500');
      }
    } else if (this.current === 5) {
      if (this.stage === 1) {
        if (this.targetCar.wrecked) { this.fail('The gold car is wrecked. The score is gone.'); return; }
        if (g.playerCar === this.targetCar && this.distTo(-115, -115) < 10) {
          this.timer = 0;
          g.exitCar(true);
          g.wanted.clear();
          this.complete(5000, 'The Big Score — $5,000');
        }
      }
    }
  }
}

export { GARAGE, CLINIC };
