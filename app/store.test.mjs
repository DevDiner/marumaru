import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPassports, savePassports, getNulls, saveNulls } from './store.mjs';

// Direct tests for the storage seam (app/store.mjs). It has TWO modes selected by process.env.VERCEL,
// read at CALL TIME (onVercel()) — not an import-time const — so a caller/test can flip it. This pins:
//   (1) the VERCEL path is in-memory, seeded from demo/seed.json, and round-trips WITHOUT touching disk,
//   (2) the call-time switch is honored (flip env → the other backend; NOT frozen at import),
//   (3) the local path round-trips through the JSON files,
//   (4) a missing file reads as {} and writes never throw (the catch{} that keeps Vercel alive).
// It's the unit-level safety net for a regression like "someone turns onVercel() back into an
// import-time const" — the handler integration tests exercise the store only indirectly.
//
// ⚠️ WHY ONE TEST, NOT FOUR: these assertions mutate PROCESS-WIDE state (process.env.VERCEL) and the
// module `mem` singleton, and write the shared demo/*.json files. node:test runs top-level tests
// CONCURRENTLY on Node ≥ 20 (serially on 18), so multiple env-flipping / file-writing tests race — a
// prior version did exactly that (seed 'mei' check raced a round-trip wiping mem; two file writers
// clobbered the JSON; `describe({concurrency:1})` tripped a Node-18 aggregation bug). A SINGLE test
// runs its steps sequentially and cannot race with itself on ANY Node version. That's the fix.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEMO_DIR = path.join(__dirname, '..', 'demo');
const PASSPORTS = path.join(DEMO_DIR, 'passports.json');
const NULLS = path.join(DEMO_DIR, 'nullifiers.json');

const snapshot = (file) => { try { return fs.readFileSync(file, 'utf8'); } catch { return null; } };
const restore = (file, snap) => {
  try { if (snap === null) fs.rmSync(file, { force: true }); else fs.writeFileSync(file, snap); } catch { /* ignore */ }
};

test('store.mjs: VERCEL in-memory + local file backends, and the call-time switch', async () => {
  const savedEnv = process.env.VERCEL;
  const beforePass = snapshot(PASSPORTS);
  const beforeNulls = snapshot(NULLS);
  try {
    // ── VERCEL / in-memory backend ──────────────────────────────────────────────────────────────
    process.env.VERCEL = '1';

    // (1a) Seeded from demo/seed.json: a FRESH module instance re-runs memState() → 'mei' present.
    const fresh = await import('./store.mjs?seedcheck=' + Date.now());
    const seeded = fresh.getPassports();
    assert.ok(seeded && typeof seeded === 'object', 'passports is an object');
    assert.ok('mei' in seeded, 'memory store is seeded from demo/seed.json (mei present)');

    // (1b) Round-trip in memory — and prove it did NOT touch the file.
    savePassports({ zoe: { owner: '0xZ', marks: { 'maru.assurance': 'selfie' } } });
    let back = getPassports();
    assert.equal(back.zoe.owner, '0xZ');
    assert.equal(back.zoe.marks['maru.assurance'], 'selfie');
    assert.equal(snapshot(PASSPORTS), beforePass, 'VERCEL mode must NOT write demo/passports.json');

    // (1c) Nulls round-trip in memory too.
    saveNulls({ 'marumaru-issue:n1': 123 });
    assert.equal(getNulls()['marumaru-issue:n1'], 123);

    // ── call-time switch ────────────────────────────────────────────────────────────────────────
    // (2) Unset VERCEL → the SAME functions read the FILE backend (proves onVercel() isn't frozen).
    delete process.env.VERCEL;
    assert.ok(!('zoe' in getPassports()), 'unsetting VERCEL switches reads to the file store (call-time switch)');

    // ── local / file backend ───────────────────────────────────────────────────────────────────
    // (3) Round-trip through the JSON file.
    savePassports({ aiko: { owner: '0xB0B', marks: { 'maru.human': 'verified' } } });
    back = getPassports();
    assert.ok(back.aiko, 'the written passport reads back from the file');
    assert.equal(back.aiko.owner, '0xB0B');
    assert.equal(back.aiko.marks['maru.human'], 'verified');
    assert.ok(fs.existsSync(PASSPORTS), 'file mode writes the JSON file to disk');
    saveNulls({ 'a:1': 1 });
    assert.equal(getNulls()['a:1'], 1);

    // (4) A missing file reads as {} and writes never throw (the catch{} that keeps Vercel from crashing).
    restore(NULLS, null);
    assert.deepEqual(getNulls(), {}, 'a missing file reads as empty, not an error');
    assert.doesNotThrow(() => saveNulls({ 'x:1': 1 }));
  } finally {
    restore(PASSPORTS, beforePass);                        // never leave the demo store dirty
    restore(NULLS, beforeNulls);
    if (savedEnv === undefined) delete process.env.VERCEL; else process.env.VERCEL = savedEnv;
  }
});
