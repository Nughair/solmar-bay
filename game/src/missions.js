// missions.js — the 8-mission story chain of Solmar Bay: markers, intros,
// objectives, payouts, a state machine with fail/retry. Missions unlock in
// order; each is started by walking into its glowing marker.
import * as THREE from 'three';
import { CITY, blockCoord, roadCoord } from './config.js';

export const MISSIONS = [
  {
    id: 'first-wheels', name: 'First Wheels',
    intro: 'Mara: "Welcome to Solmar Bay, cousin. Grab that parked coupe by the plaza and bring it to my garage."',
    objective: 'Steal the marked coupe and deliver it to Mara\'s garage',
    pay: 800, type: 'deliver-car',
    start: { x: roadCoord(1), z: roadCoord(4) },
    target: { x: roadCoord(1) + 4, z: roadCoord(4) + 20 },
    dest: { x: roadCoord(6), z: roadCoord(2) },
  },
  {
    id: 'pier-pressure', name: 'Pier Pressure',
    intro: 'Mara: "A package is waiting at the east pier. Take the hire boat, fetch it, and do not get it wet."',
    objective: 'Take the boat, reach the package buoy, return to the dock',
    pay: 1200, type: 'boat-fetch',
    start: { x: CITY.dockX - 6, z: CITY.dockZ - 8 },
    target: { x: 430, z: -120 },
    dest: { x: CITY.dockX + 16, z: CITY.dockZ + 10 },
  },
  {
    id: 'hot-pursuit', name: 'Hot Pursuit',
    intro: 'Mara: "The cops impounded my ride. Take it back from the lot — they will not be pleased."',
    objective: 'Take the marked car at the lot and lose the police',
    pay: 1600, type: 'escape',
    start: { x: roadCoord(4), z: roadCoord(7) },
    target: { x: roadCoord(4) + 4, z: roadCoord(7) + 18 },
    dest: null,
  },
  {
    id: 'bay-runner', name: 'Bay Runner',
    intro: 'Mara: "Rival crew is moving goods by boat. Chase them down on the water and ram their runabout."',
    objective: 'Boat chase: ram the rival boat until it stops',
    pay: 2200, type: 'boat-chase',
    start: { x: CITY.dockX - 6, z: CITY.dockZ + 60 },
    target: { x: 380, z: 150 },
    dest: null,
  },
  {
    id: 'express', name: 'Solmar Express',
    intro: 'Mara: "Ninety seconds. Cross town to the hotel, no excuses, no dents in the schedule."',
    objective: 'Timed delivery: reach the hotel in 90 seconds',
    pay: 2500, type: 'timed',
    start: { x: roadCoord(1), z: roadCoord(1) },
    target: { x: roadCoord(8), z: roadCoord(8) },
    dest: null, timeLimit: 90,
  },
  {
    id: 'turf', name: 'Turf Trouble',
    intro: 'Mara: "Rivals are leaning on our shops on 5th. Show them the bay bites back."',
    objective: 'Drive off 3 rival lookouts at the marked corners',
    pay: 3000, type: 'clear',
    start: { x: roadCoord(5), z: roadCoord(5) },
    target: { x: roadCoord(5) + 14, z: roadCoord(5) + 14 },
    dest: null, count: 3,
  },
  {
    id: 'grand-tour', name: 'Grand Tour',
    intro: 'Mara: "A buyer wants the scenic route: beach, pier, then the hilltop block. Drive."',
    objective: 'Visit the beach, the pier and the north-east block in order',
    pay: 3800, type: 'tour',
    start: { x: roadCoord(2), z: roadCoord(6) },
    target: { x: CITY.beachX, z: -160 },
    dest: null,
    waypoints: [
      { x: CITY.beachX, z: -160 },
      { x: CITY.dockX, z: CITY.dockZ },
      { x: blockCoord(8), z: blockCoord(0) },
    ],
  },
  {
    id: 'bay-king', name: 'King of the Bay',
    intro: 'Mara: "One last job. Take the cash van downtown, survive the heat, reach the dock. Then Solmar is ours."',
    objective: 'Grab the downtown cash van and reach the dock with 3+ stars on you',
    pay: 5000, type: 'finale',
    start: { x: roadCoord(4), z: roadCoord(4) },
    target: { x: roadCoord(4) + 4, z: roadCoord(4) - 20 },
    dest: { x: CITY.dockX + 10, z: CITY.dockZ },
  },
];

export function createMissionSystem(scene) {
  const markerMat = new THREE.MeshBasicMaterial({ color: 0xffc93c, transparent: true, opacity: 0.5 });
  const marker = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 14, 14, 1, true), markerMat);
  marker.visible = false;
  scene.add(marker);
  const destMat = new THREE.MeshBasicMaterial({ color: 0x4dc3ff, transparent: true, opacity: 0.5 });
  const destMarker = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 14, 14, 1, true), destMat);
  destMarker.visible = false;
  scene.add(destMarker);

  const sys = {
    index: 0,               // next mission to offer
    active: null,           // active mission def
    stage: 0,               // objective stage within the mission
    timer: 0,
    hits: 0,                // boat-chase rams / turf lookouts scared off
    completed: [],
    marker, destMarker,
    onEvent: null,          // callback(kind, mission)
  };

  function emit(kind, m) { if (sys.onEvent) sys.onEvent(kind, m); }

  sys.currentOffer = function () {
    return sys.index < MISSIONS.length ? MISSIONS[sys.index] : null;
  };

  sys.updateMarkers = function (time) {
    const offer = sys.currentOffer();
    if (!sys.active && offer) {
      marker.visible = true;
      marker.position.set(offer.start.x, 7, offer.start.z);
      markerMat.opacity = 0.4 + Math.sin(time * 3) * 0.15;
    } else marker.visible = false;
    if (sys.active && sys.active.dest) {
      destMarker.visible = true;
      destMarker.position.set(sys.active.dest.x, 7, sys.active.dest.z);
      destMat.opacity = 0.4 + Math.sin(time * 3 + 1) * 0.15;
    } else destMarker.visible = false;
  };

  sys.tryStart = function (playerPos) {
    const offer = sys.currentOffer();
    if (!offer || sys.active) return false;
    if (Math.hypot(playerPos.x - offer.start.x, playerPos.z - offer.start.z) < 4) {
      sys.active = offer;
      sys.stage = 0;
      sys.hits = 0;
      sys.timer = offer.timeLimit || 0;
      emit('start', offer);
      return true;
    }
    return false;
  };

  sys.complete = function () {
    const m = sys.active;
    sys.completed.push(m.id);
    sys.index++;
    sys.active = null;
    emit('complete', m);
  };

  sys.fail = function (reason) {
    const m = sys.active;
    sys.active = null;
    emit('fail', m, reason);
  };

  // The objective point the minimap/HUD should point at right now.
  sys.objectivePos = function () {
    if (sys.active) {
      const m = sys.active;
      if (m.type === 'tour') return m.waypoints[Math.min(sys.stage, m.waypoints.length - 1)];
      if ((m.type === 'deliver-car' || m.type === 'finale') && sys.stage >= 1) return m.dest;
      if (m.type === 'boat-fetch' && sys.stage >= 1) return m.dest;
      return m.target;
    }
    const offer = sys.currentOffer();
    return offer ? offer.start : null;
  };

  return sys;
}
