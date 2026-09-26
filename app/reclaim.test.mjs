import { test } from 'node:test';
import assert from 'node:assert';
import { predicate, verifyAttestation } from './reclaim.mjs';

test('predicate returns pass when value >= threshold, fail otherwise', () => {
  assert.equal(predicate(12000, 10000), 'pass');
  assert.equal(predicate(10000, 10000), 'pass'); // boundary inclusive
  assert.equal(predicate(9000, 10000), 'fail');
});

test('mock verifyAttestation extracts the attested value', async () => {
  process.env.RECLAIM_MODE = 'mock';
  const r = await verifyAttestation('MOCK-PROOF:15000', null, 'balance');
  assert.equal(r.ok, true);
  assert.equal(r.value, 15000);
});

test('mock verifyAttestation rejects a non-proof payload', async () => {
  process.env.RECLAIM_MODE = 'mock';
  const r = await verifyAttestation('nope', null, 'balance');
  assert.equal(r.ok, false);
});

test('mock verifyAttestation strips currency formatting', async () => {
  process.env.RECLAIM_MODE = 'mock';
  const r = await verifyAttestation('MOCK-PROOF:RM 62,500.00', null, 'balance');
  assert.equal(r.ok, true);
  assert.equal(r.value, 62500); // 62,500.00 -> 62500 after strip+Number
});

// V5: a verified proof carrying an UNUSABLE attested value must be ok:false — NOT a silent 0
// that mints a wrong-marked passport. Covers empty, non-numeric, and malformed multi-dot.
test('verifyAttestation rejects an empty attested value (not a silent 0)', async () => {
  process.env.RECLAIM_MODE = 'mock';
  const r = await verifyAttestation('MOCK-PROOF:', null, 'balance'); // empty value part
  assert.equal(r.ok, false);
});

test('verifyAttestation rejects a non-numeric attested value', async () => {
  process.env.RECLAIM_MODE = 'mock';
  const r = await verifyAttestation('MOCK-PROOF:abc', null, 'balance');
  assert.equal(r.ok, false);
});

test('verifyAttestation rejects a malformed multi-dot value', async () => {
  process.env.RECLAIM_MODE = 'mock';
  const r = await verifyAttestation('MOCK-PROOF:1.2.3', null, 'balance');
  assert.equal(r.ok, false);
});

test('a legitimate zero is still usable (ok:true, value 0)', async () => {
  process.env.RECLAIM_MODE = 'mock';
  const r = await verifyAttestation('MOCK-PROOF:0', null, 'balance');
  assert.equal(r.ok, true);     // "0" is a real number → usable; predicate will fail it, but honestly
  assert.equal(r.value, 0);
});
