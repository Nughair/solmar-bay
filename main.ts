// Solmar Bay — our gta6-01 entry, handed in by this program.
// The game itself is the game/ folder beside this file: plain static files
// (game/index.html plus its ES modules and the vendored three.js build) that
// a desktop browser loads fully offline. This program's whole job is the
// hand-in: copy game/ and screenshots/ into the output directory and write
// dossier.json there with the kit's buildDossier, so the scorer and the
// judge see exactly the files we committed. Node 22, standard library only.
//
// Run it locally the same way the grader does, with MAKEFUN_OUTPUT_DIR
// standing in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Play the game with `node serve.ts`, then open http://localhost:8080.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps, named once so the hand-in reads clearly: at most 4
// screenshots of 256 KiB each; at most 993 files and 48 MiB under game/; no
// path under game/ longer than 1000 bytes; the dossier text capped at
// 163,840 bytes. An entry outside these is one the scorer would refuse.
const ENTRY_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, ENTRY_CAPS),
);
