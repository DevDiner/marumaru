import { test } from 'node:test';
import assert from 'node:assert';
import { verifyHuman, signRequest, _resetNullifiers, canonicalLevel } from './worldid.mjs';

test('mock mode accepts MOCK-HUMAN and returns a nullifier', async () => {
  process.env.WORLD_ID_MODE = 'mock';
  _resetNullifiers();
  const r = await verifyHuman({ idkitResponse: 'MOCK-HUMAN', rpId: 'rp_test', action: 'marumaru-issue' });
  assert.equal(r.success, true);
  assert.ok(r.nullifier);
});

test('mock mode rejects a reused nullifier (one passport per human)', async () => {
  process.env.WORLD_ID_MODE = 'mock';
  // Use an IN-MEMORY liveness ledger (the path the real demo injects) instead of the shared
  // demo/nullifiers.json file. Injecting it keeps this test self-contained: node --test runs test
  // FILES in parallel processes, and another file (handlers.test.mjs) also writes that same file —
  // on Windows the concurrent write throws EPERM and the store swallows it, so a file-backed ledger
  // flakes. The in-memory ledger is deterministic AND exercises the demo's actual dedupe branch.
  const live = new Set();
  const hasLivePassport = async (nf) => live.has(nf);
  const a = await verifyHuman({ idkitResponse: 'MOCK-HUMAN:n1', rpId: 'rp_test', action: 'marumaru-issue', hasLivePassport });
  assert.equal(a.success, true);
  live.add(a.nullifier);                     // minting records the human as live (as the demo does)
  const b = await verifyHuman({ idkitResponse: 'MOCK-HUMAN:n1', rpId: 'rp_test', action: 'marumaru-issue', hasLivePassport });
  assert.equal(b.success, false);
  assert.match(b.code, /already/i);
});

test('mock mode rejects a non-MOCK-HUMAN payload (invalid)', async () => {
  process.env.WORLD_ID_MODE = 'mock';
  _resetNullifiers();
  const r = await verifyHuman({ idkitResponse: 'garbage', rpId: 'rp_test', action: 'marumaru-issue' });
  assert.equal(r.success, false);
  assert.equal(r.code, 'invalid_mock');
});

test('same nullifier under a DIFFERENT action is allowed (action-scoped)', async () => {
  process.env.WORLD_ID_MODE = 'mock';
  _resetNullifiers();
  const a = await verifyHuman({ idkitResponse: 'MOCK-HUMAN:shared', rpId: 'rp_test', action: 'action-A' });
  const b = await verifyHuman({ idkitResponse: 'MOCK-HUMAN:shared', rpId: 'rp_test', action: 'action-B' });
  assert.equal(a.success, true);
  assert.equal(b.success, true);
});

test('signRequest in mock mode returns a stub signature', async () => {
  process.env.WORLD_ID_MODE = 'mock';
  const s = await signRequest({ action: 'marumaru-issue' });
  assert.ok(s.sig);
  assert.ok('nonce' in s);
});

// REAL-MODE nullifier extraction. The World ID v4 verify endpoint returns
// { success, results:[{ action, nullifier, ... }] } — the nullifier is nested under results[],
// NOT top-level and NOT "nullifier_hash" (the v3 name). Reading the wrong path silently collapses
// every human onto one dedupe key (breaking one-passport-per-human). These tests stub fetch to the
// documented v4 shape so that regression can never come back. Restore mock mode + fetch after.
test('real mode extracts results[].nullifier and enforces one-per-human', async () => {
  const savedMode = process.env.WORLD_ID_MODE;
  const savedFetch = globalThis.fetch;
  process.env.WORLD_ID_MODE = 'real';
  globalThis.fetch = async () => ({ ok: true, json: async () => ({
    success: true,
    results: [{ identifier: 'proof_of_human', action: 'marumaru-issue', nullifier: '0xNULLA', created_at: 'x', environment: 'staging' }],
  }) });
  try {
    // In-memory liveness ledger (see the mock reused-nullifier test above for why we don't touch the
    // shared demo/nullifiers.json here — parallel test files + Windows file locking make it flake).
    const live = new Set();
    const hasLivePassport = async (nf) => live.has(nf);
    const a = await verifyHuman({ idkitResponse: {}, rpId: 'rp_x', action: 'marumaru-issue', signal: 's1', hasLivePassport });
    assert.equal(a.success, true);
    assert.equal(a.nullifier, '0xNULLA');
    live.add(a.nullifier);                    // this human now holds a live passport
    const b = await verifyHuman({ idkitResponse: {}, rpId: 'rp_x', action: 'marumaru-issue', signal: 's2', hasLivePassport });
    assert.equal(b.success, false);           // same nullifier → rejected
    assert.match(b.code, /already/i);
  } finally { process.env.WORLD_ID_MODE = savedMode; globalThis.fetch = savedFetch; }
});

test('real mode FAILS CLOSED when the response carries no nullifier', async () => {
  const savedMode = process.env.WORLD_ID_MODE;
  const savedFetch = globalThis.fetch;
  process.env.WORLD_ID_MODE = 'real';
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ success: true, results: [{}] }) });
  try {
    _resetNullifiers();
    const r = await verifyHuman({ idkitResponse: {}, rpId: 'rp_x', action: 'marumaru-issue' });
    assert.equal(r.success, false);           // never mint a passport keyed to "undefined"
    assert.equal(r.code, 'missing_nullifier');
  } finally { process.env.WORLD_ID_MODE = savedMode; globalThis.fetch = savedFetch; }
});

// --- TIERED VERIFICATION: the achieved credential tier must survive verify (orb|passport|selfie). ---
// The tier gates real behavior downstream (assurance flag, Orb-at-underwriting gate, Selfie-Beta
// no-uniqueness labeling), so a dropped/mis-mapped level is a correctness bug. These pin the mapping.
test('canonicalLevel folds every World spelling into our tier set', () => {
  assert.equal(canonicalLevel('orb'), 'orb');
  assert.equal(canonicalLevel('proof_of_human'), 'orb');
  assert.equal(canonicalLevel('document'), 'passport');       // NFC document → passport tier
  assert.equal(canonicalLevel('secure_document'), 'passport');
  assert.equal(canonicalLevel('passport'), 'passport');
  assert.equal(canonicalLevel('selfie'), 'selfie');
  assert.equal(canonicalLevel('face'), 'selfie');             // SDK normalizes face→selfie
  assert.equal(canonicalLevel('device'), 'device');
  assert.equal(canonicalLevel('something-new'), 'unknown');   // never silently → orb
  assert.equal(canonicalLevel(undefined), 'unknown');
});

test('mock mode carries the chosen tier in the 4th slot; absent → orb (backward compatible)', async () => {
  process.env.WORLD_ID_MODE = 'mock';
  _resetNullifiers();
  const selfie = await verifyHuman({ idkitResponse: 'MOCK-HUMAN:nA:sA:selfie', rpId: 'rp', action: 'a1' });
  assert.equal(selfie.success, true);
  assert.equal(selfie.level, 'selfie');
  const passport = await verifyHuman({ idkitResponse: 'MOCK-HUMAN:nB:sB:passport', rpId: 'rp', action: 'a2' });
  assert.equal(passport.level, 'passport');
  const legacy = await verifyHuman({ idkitResponse: 'MOCK-HUMAN:nC:sC', rpId: 'rp', action: 'a3' }); // 3-part
  assert.equal(legacy.level, 'orb');           // no 4th part → default orb, old strings still work
});

test('real mode reads the tier from verification_level (falls back to identifier)', async () => {
  const savedMode = process.env.WORLD_ID_MODE;
  const savedFetch = globalThis.fetch;
  process.env.WORLD_ID_MODE = 'real';
  globalThis.fetch = async () => ({ ok: true, json: async () => ({
    success: true,
    results: [{ identifier: 'selfie', verification_level: 'selfie', action: 'marumaru-issue', nullifier: '0xSELF' }],
  }) });
  try {
    _resetNullifiers();
    const r = await verifyHuman({ idkitResponse: {}, rpId: 'rp_x', action: 'marumaru-issue', signal: 's1' });
    assert.equal(r.success, true);
    assert.equal(r.level, 'selfie');           // the tier the human actually achieved, not assumed orb
  } finally { process.env.WORLD_ID_MODE = savedMode; globalThis.fetch = savedFetch; }
});
