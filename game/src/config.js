// config.js — world dimensions and tuning constants for Solmar Bay.
export const CITY = {
  blocks: 9,          // 9 x 9 city grid
  cell: 56,           // one block + one road pitch, in metres
  block: 40,          // building block footprint
  road: 16,           // road width
  half: 252,          // city extends -252..252 on x and z
  beachX: 268,        // sand starts here on the east edge
  seaX: 294,          // open water starts here
  dockX: 284,         // boat hire dock position
  dockZ: 28,
};

// Centre line of road i (0..9) on either axis; roads run between the blocks.
export function roadCoord(i) { return -252 + i * CITY.cell + 8; }
// Centre of block i (0..8) on either axis.
export function blockCoord(i) { return -252 + i * CITY.cell + 28; }

export const PLAYER = {
  walkSpeed: 7,
  runSpeed: 12.5,
  radius: 0.9,
  maxHealth: 100,
};

export const WANTED = {
  decayDelay: 14,     // seconds unseen before stars start to decay
  decayStep: 9,       // seconds per star lost
};

export const SAVE_KEY = 'solmar-bay-save-v1';

export const BUILDING_COLORS = [
  0xf2e3c6, 0xe8b4a0, 0xa8c8d8, 0xf5f0e6, 0xd9a441, 0x7fb3b0,
  0xe2725b, 0xc0c8d0, 0xf7d774, 0x9db38a, 0xe6e6fa, 0xffc9a3,
];

export const CAR_COLORS = [
  0xd23b2e, 0x2e6fd2, 0xf2f2f2, 0x222226, 0xf2c230, 0x3aa655,
  0x8844cc, 0xff7f2a, 0x18b8c4, 0xc0c4cc,
];
