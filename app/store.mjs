// app/store.mjs — one storage abstraction so the same route logic runs in two places:
//   • LOCAL / tests  → JSON files on disk (demo/passports.json, demo/nullifiers.json),
//                       exactly as the demo has always behaved.
//   • VERCEL          → a module-level in-memory object, seeded ONCE from demo/seed.json.
//
//
// The switch is `process.env.VERCEL` (Vercel sets this automatically in every deployment).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEMO_DIR = path.join(__dirname, '..', 'demo');
const PASSPORTS = path.join(DEMO_DIR, 'passports.json');
const NULLS = path.join(DEMO_DIR, 'nullifiers.json');
const SEED = path.join(DEMO_DIR, 'seed.json');

const ON_VERCEL = !!process.env.VERCEL;

// ---- in-memory state (Vercel path only), seeded lazily on first touch ----
let mem = null;
function memState() {
  if (mem) return mem;
  let seed = {};
  try { seed = JSON.parse(fs.readFileSync(SEED, 'utf8')); } catch { /* no seed bundled → empty */ }
  mem = { passports: seed.passports || {}, nulls: seed.nulls || {} };
  return mem;
}

function readJson(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; } }
function writeJson(file, obj) {
  try { fs.writeFileSync(file, JSON.stringify(obj, null, 2)); } catch { /* read-only dir (CI) → ignore */ }
}

// Passports (stands in for on-chain passport state in the local demo).
export function getPassports() { return ON_VERCEL ? memState().passports : readJson(PASSPORTS); }
export function savePassports(obj) { if (ON_VERCEL) memState().passports = obj; else writeJson(PASSPORTS, obj); }

// Nullifiers (the one-passport-per-human ledger).
export function getNulls() { return ON_VERCEL ? memState().nulls : readJson(NULLS); }
export function saveNulls(obj) { if (ON_VERCEL) memState().nulls = obj; else writeJson(NULLS, obj); }
