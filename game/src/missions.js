// Vera Castellan's errands: an eight-mission story campaign for Solmar Bay, run by
// a small step engine. Steps are reached on foot, by car or by boat; there are
// timed checkpoint runs, a steal-and-deliver with a damage limit, cash pickups
// under a locked wanted level, a harbour chase against a rival boat, and two
// escapes. Missions start at the glowing beacon outside Vera's garage.

export const GARAGE_BEACON = { x: -240, z: 266, r: 7 };

export const MISSIONS = [
  {
    id: 'first-wheels',
    title: 'First Wheels',
    pay: 800,
    intro: [
      ['VERA', 'Nilo. You walk everywhere like a tourist. Fix that.'],
      ['VERA', 'There is a coupe parked on the promenade with my name on it. Bring it home.'],
    ],
    steps: [
      { type: 'steal', text: 'Steal the marked coupe on the promenade', carAt: { x: 60, z: 282, heading: 0.2 }, kind: 'sport' },
      { type: 'deliver', text: 'Deliver the coupe to Vera\u2019s garage', x: -240, z: 266, r: 10 },
    ],
  },
  {
    id: 'timed-delivery',
    title: 'The Timed Delivery',
    pay: 1200,
    intro: [
      ['VERA', 'Three parcels, three doorsteps, one impatient harbour. The clock is the job.'],
    ],
    steps: [
      {
        type: 'checkpoints', text: 'Make all 3 deliveries before the timer runs out', time: 150,
        points: [{ x: 150, z: -90 }, { x: -30, z: -210 }, { x: 210, z: 90 }],
      },
    ],
  },
  {
    id: 'beach-run',
    title: 'Beach Run',
    pay: 1500,
    intro: [
      ['VERA', 'A crate washed up east of the pier. Pick it up — and expect company on the way back.'],
    ],
    steps: [
      { type: 'goto', text: 'Pick up the crate on the east beach', x: 185, z: 312, r: 6 },
      { type: 'escape', text: 'Lose the patrol (wanted level to zero)', heat: 120 },
    ],
  },
  {
    id: 'harbour-chase',
    title: 'Harbour Chase',
    pay: 2000,
    intro: [
      ['VERA', 'A smuggler in a red runabout is poaching my water. Take a boat. Stop him.'],
    ],
    steps: [
      { type: 'boat', text: 'Take a boat out to the harbour buoy', x: 60, z: 520, r: 22 },
      { type: 'chase', text: 'Stop the red runabout before it escapes south', rivalAt: { x: 60, z: 540 } },
    ],
  },
  {
    id: 'downtown-dash',
    title: 'Downtown Dash',
    pay: 2500,
    intro: [
      ['VERA', 'Five rooftops owe me rent and every one swears the traffic is terrible. Prove them wrong.'],
    ],
    steps: [
      {
        type: 'checkpoints', text: 'Hit all 5 checkpoints before the timer runs out', time: 175,
        points: [{ x: -210, z: -210 }, { x: 210, z: -150 }, { x: 30, z: 30 }, { x: -150, z: 210 }, { x: 240, z: -30 }],
      },
    ],
  },
  {
    id: 'azure-coupe',
    title: 'The Azure Coupe',
    pay: 3000,
    intro: [
      ['VERA', 'A collector left his azure coupe by the marina and his keys in his pride. Bring it back unmarked.'],
    ],
    steps: [
      { type: 'steal', text: 'Steal the azure coupe at the marina pier', carAt: { x: -131, z: 322, heading: 1.57 }, kind: 'sport' },
      { type: 'deliver', text: 'Deliver it to the garage — gently (keep it above 40% condition)', x: -240, z: 266, r: 10, minHealth: 40 },
    ],
  },
  {
    id: 'night-run',
    title: 'Night Run',
    pay: 4000,
    intro: [
      ['VERA', 'After dark, three drops light up across the bay. The patrol will be watching. Collect them all.'],
    ],
    steps: [
      {
        type: 'pickups', text: 'Collect all 3 night drops', setHour: 22.4, heatFloor: 3,
        points: [{ x: -210, z: -210 }, { x: 210, z: -30 }, { x: 30, z: 210 }],
      },
    ],
  },
  {
    id: 'last-tide',
    title: 'Last Tide',
    pay: 5000,
    intro: [
      ['VERA', 'Last job, Nilo. Everything I own is on a yacht past the bay. The whole patrol will try to stop you.'],
      ['VERA', 'Get to the yacht. Then Solmar Bay is yours.'],
    ],
    steps: [
      { type: 'goto', text: 'Get to the marina pier', x: -120, z: 330, r: 12 },
      { type: 'boat', text: 'Race to the yacht rendezvous — and shake the patrol', x: 260, z: 900, r: 26, heat: 200 },
    ],
  },
];

export class Story {
  constructor(save) {
    this.nextIndex = save.missionIndex || 0;
    this.active = null; // { mission, stepIndex, timer, pickups }
    this.pendingDialogue = [];
    this.dialogueClock = 0;
    this.startGuard = 0; // seconds before the beacon may start another mission
  }

  get finished() {
    return this.nextIndex >= MISSIONS.length;
  }

  currentStep() {
    if (!this.active) return null;
    return this.active.mission.steps[this.active.stepIndex];
  }

  /** Where the HUD marker points: the step target, or the garage when idle. */
  marker() {
    const step = this.currentStep();
    if (!step) return this.finished ? null : { x: GARAGE_BEACON.x, z: GARAGE_BEACON.z };
    if (step.type === 'checkpoints' || step.type === 'pickups') {
      const point = step.points[this.active.pickups];
      return point ? { x: point.x, z: point.z } : null;
    }
    if (step.type === 'steal') return { x: step.carAt.x, z: step.carAt.z };
    if (step.type === 'chase') return this.active.rivalPos || { x: step.rivalAt.x, z: step.rivalAt.z };
    if (step.type === 'escape') return null;
    return { x: step.x, z: step.z };
  }

  objective() {
    if (!this.active) {
      if (this.finished) return { title: 'SOLMAR BAY', text: 'The bay is yours. Free roam — the garage beacon starts a new legend any time.', timer: null };
      const next = MISSIONS[this.nextIndex];
      return { title: 'NEXT ERRAND', text: `Meet Vera at the garage beacon — “${next.title}” pays $${next.pay.toLocaleString('en-US')}.`, timer: null };
    }
    const step = this.currentStep();
    let text = step.text;
    if (step.type === 'checkpoints') text += ` (${this.active.pickups + 1} of ${step.points.length})`;
    if (step.type === 'pickups') text += ` (${this.active.pickups} of ${step.points.length})`;
    return { title: this.active.mission.title.toUpperCase(), text, timer: this.active.timer };
  }

  startMission(events) {
    const mission = MISSIONS[this.nextIndex];
    this.active = { mission, stepIndex: 0, timer: null, pickups: 0, rivalPos: null };
    this.beginStep(events);
    for (const [who, line] of mission.intro) this.pendingDialogue.push({ who, line });
    events.push({ type: 'missionStart', mission });
  }

  beginStep(events) {
    const step = this.currentStep();
    this.active.pickups = 0;
    this.active.timer = step.time || null;
    if (step.type === 'steal') events.push({ type: 'spawnCar', step });
    if (step.type === 'chase') events.push({ type: 'spawnRival', step });
    if (step.type === 'escape' || step.heat) events.push({ type: 'heat', points: step.heat || step.points });
    if (step.setHour !== undefined) events.push({ type: 'setHour', hour: step.setHour });
  }

  fail(events, reason) {
    events.push({ type: 'missionFailed', mission: this.active.mission, reason });
    events.push({ type: 'clearEntities' });
    this.active = null;
    this.startGuard = 3;
  }

  completeStep(events) {
    events.push({ type: 'stepDone', step: this.currentStep() });
    this.active.stepIndex += 1;
    if (this.active.stepIndex >= this.active.mission.steps.length) {
      const mission = this.active.mission;
      this.active = null;
      this.nextIndex += 1;
      this.startGuard = 3;
      events.push({ type: 'clearEntities' });
      events.push({ type: 'missionComplete', mission });
    } else {
      this.beginStep(events);
    }
  }

  /** The rival boat in a chase step took damage (shooting or ramming). */
  damageRival(amount, rivalPos) {
    if (!this.active || !this.currentStep() || this.currentStep().type !== 'chase') return;
    this.active.rivalHp = (this.active.rivalHp === undefined ? 100 : this.active.rivalHp) - amount;
    this.active.rivalPos = rivalPos;
  }

  /**
   * ctx: { pos, mode: 'foot'|'car'|'boat', car, markedCar, rivalPos, stars, dt }
   * Returns the events main.js must act on this frame.
   */
  update(ctx) {
    const events = [];
    // Queued dialogue lines arrive one at a time.
    this.dialogueClock -= ctx.dt;
    if (this.pendingDialogue.length && this.dialogueClock <= 0) {
      const next = this.pendingDialogue.shift();
      events.push({ type: 'dialogue', who: next.who, line: next.line });
      this.dialogueClock = 4.6;
    }
    if (!this.active) {
      if (this.startGuard > 0) {
        this.startGuard -= ctx.dt;
        return events;
      }
      if (!this.finished && Math.hypot(ctx.pos.x - GARAGE_BEACON.x, ctx.pos.z - GARAGE_BEACON.z) < GARAGE_BEACON.r) {
        this.startMission(events);
      }
      return events;
    }

    const step = this.currentStep();
    if ((step.type === 'steal' || step.type === 'deliver') && ctx.markedCar && ctx.markedCar.dead) {
      this.fail(events, 'The marked car was wrecked.');
      return events;
    }
    if (this.active.timer !== null && this.active.timer !== undefined) {
      this.active.timer -= ctx.dt;
      if (this.active.timer <= 0) {
        this.fail(events, 'Out of time.');
        return events;
      }
    }
    if (step.heatFloor && ctx.stars < step.heatFloor) {
      events.push({ type: 'heat', points: 26 });
    }

    const distTo = (x, z) => Math.hypot(ctx.pos.x - x, ctx.pos.z - z);
    switch (step.type) {
      case 'goto':
        if (distTo(step.x, step.z) < step.r) this.completeStep(events);
        break;
      case 'boat':
        if (ctx.mode === 'boat' && distTo(step.x, step.z) < step.r) this.completeStep(events);
        break;
      case 'steal':
        if (ctx.markedCar && ctx.car === ctx.markedCar) this.completeStep(events);
        break;
      case 'deliver':
        if (ctx.car && ctx.car === ctx.markedCar && distTo(step.x, step.z) < step.r) {
          if (step.minHealth && ctx.markedCar.health < step.minHealth) {
            this.fail(events, `The coupe arrived at ${Math.round(ctx.markedCar.health)}% — Vera wanted it above ${step.minHealth}%.`);
          } else {
            this.completeStep(events);
          }
        }
        break;
      case 'checkpoints':
      case 'pickups': {
        const point = step.points[this.active.pickups];
        if (point && distTo(point.x, point.z) < 8) {
          this.active.pickups += 1;
          events.push({ type: 'pickup', point });
          if (this.active.pickups >= step.points.length) this.completeStep(events);
        }
        break;
      }
      case 'escape':
        if (ctx.stars === 0) this.completeStep(events);
        break;
      case 'chase': {
        if (ctx.rivalPos) this.active.rivalPos = ctx.rivalPos;
        if (this.active.rivalHp !== undefined && this.active.rivalHp <= 0) {
          this.completeStep(events);
        } else if (ctx.rivalPos && ctx.rivalPos.z > 950) {
          this.fail(events, 'The runabout escaped south.');
        }
        break;
      }
      default:
        break;
    }
    return events;
  }
}
