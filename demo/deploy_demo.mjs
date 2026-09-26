// deploy_demo.mjs — reset local demo state from the single seed source (demo/seed.json), so the
// demo has something to show on load. Local-only (writes demo/passports.json + nullifiers.json).
//
// Seeds a pre-existing passport under "mei" so Lender view + My-passport have something on load.
// Deliberately NOT "aiko"/"kenji" — those personas stay FREE so the borrower flow can mint them
// LIVE in front of a judge (seeding them would trip one-passport-per-human = a confusing on-stage
// "rejected"). The dupe-rejection demo button reuses mei's nullifier ("seed-mei") on purpose.
//
// On Vercel there is NO seed step — app/store.mjs loads demo/seed.json into memory on first touch.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PASSPORTS = path.join(__dirname, 'passports.json');
const NULLS = path.join(__dirname, 'nullifiers.json');
const SEED = path.join(__dirname, 'seed.json');

const seed = JSON.parse(fs.readFileSync(SEED, 'utf8'));

fs.writeFileSync(PASSPORTS, JSON.stringify(seed.passports || {}, null, 2));
fs.writeFileSync(NULLS, JSON.stringify(seed.nulls || {}, null, 2));
console.log('Seeded demo/passports.json + nullifiers.json from demo/seed.json (mei = pre-existing passport).');
console.log('The borrower flow can mint aiko / kenji LIVE (their nullifiers are free).');
console.log('Start the demo:  npm run demo   ->  http://localhost:8788');
