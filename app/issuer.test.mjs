import { test } from 'node:test';
import assert from 'node:assert';
import { issueCredential, bandLabel } from './issuer.mjs';

// verifiers now also echo the bound session value (World: signal; Reclaim: context)
const SID = 'sess-xyz';
const okHuman = async () => ({ success: true, nullifier: 'n1', signal: SID });
const badHuman = async () => ({ success: false, code: 'invalid_mock' });
const dupHuman = async () => ({ success: false, code: 'nullifier_already_used' });
const att = (v) => async () => ({ ok: true, value: v, context: SID });
const failAtt = async () => ({ ok: false });
// verifiers that return a MISMATCHED bound value (replay attack)
const okHumanWrongSig = async () => ({ success: true, nullifier: 'n1', signal: 'WRONG' });
const attWrongCtx = (v) => async () => ({ ok: true, value: v, context: 'WRONG' });

test('happy path issues marks and plans mint + 3 writeMarks', async () => {
  const r = await issueCredential(
    { label: 'aiko', owner: '0xB0B', transferable: false, incomeProof: 'x', savingsProof: 'y', sessionId: SID },
    { verifyHuman: okHuman, verifyIncome: att(12000), verifySavings: att(60000), policy: { income: 10000, savings: 50000 } });
  assert.equal(r.status, 'issued');
  assert.equal(r.marks.income, 'pass');
  assert.equal(r.marks.savings, 'pass');
  assert.equal(r.calls.filter((c) => c.fn === 'writeMark').length, 4); // income/savings/human/assurance
  assert.equal(r.calls[0].fn, 'mintPassport');
  assert.equal(r.marks.assurance, 'orb');   // bare mock has no level → defaults to orb
});

test('income below threshold still issues, but mark is fail', async () => {
  const r = await issueCredential(
    { label: 'aiko', owner: '0xB0B', incomeProof: 'x', savingsProof: 'y', sessionId: SID },
    { verifyHuman: okHuman, verifyIncome: att(8000), verifySavings: att(60000), policy: { income: 10000, savings: 50000 } });
  assert.equal(r.status, 'issued');
  assert.equal(r.marks.income, 'fail');
  assert.equal(r.marks.savings, 'pass');
});

test('binding-failed: World signal and Reclaim context are NOT the same session', async () => {
  const r = await issueCredential(
    { label: 'aiko', owner: '0xB0B', incomeProof: 'x', savingsProof: 'y', sessionId: SID },
    { verifyHuman: okHumanWrongSig, verifyIncome: att(12000), verifySavings: att(60000), policy: { income: 10000, savings: 50000 } });
  assert.equal(r.status, 'binding-failed');
  assert.equal(r.calls.length, 0);
});

test('binding-failed: a replayed bank proof (wrong context) is rejected', async () => {
  const r = await issueCredential(
    { label: 'aiko', owner: '0xB0B', incomeProof: 'x', savingsProof: 'y', sessionId: SID },
    { verifyHuman: okHuman, verifyIncome: attWrongCtx(12000), verifySavings: att(60000), policy: { income: 10000, savings: 50000 } });
  assert.equal(r.status, 'binding-failed');
  assert.equal(r.calls.length, 0);
});

test('no-PoH short-circuits to ineligible (World alt path) with no mint', async () => {
  const r = await issueCredential(
    { label: 'x', owner: '0x1', incomeProof: 'x', savingsProof: 'y' },
    { verifyHuman: badHuman, verifyIncome: att(1), verifySavings: att(1), policy: { income: 1, savings: 1 } });
  assert.equal(r.status, 'ineligible');
  assert.equal(r.reason, 'no-poh');
  assert.equal(r.calls.length, 0);
});

test('duplicate human is rejected (World alt path) with no mint', async () => {
  const r = await issueCredential(
    { label: 'x', owner: '0x1', incomeProof: 'x', savingsProof: 'y' },
    { verifyHuman: dupHuman, verifyIncome: att(1), verifySavings: att(1), policy: { income: 1, savings: 1 } });
  assert.equal(r.status, 'rejected');
  assert.equal(r.reason, 'already-has-passport');
  assert.equal(r.calls.length, 0);
});

test('a failed zkTLS proof aborts issuance', async () => {
  const r = await issueCredential(
    { label: 'x', owner: '0x1', incomeProof: 'x', savingsProof: 'y' },
    { verifyHuman: okHuman, verifyIncome: failAtt, verifySavings: att(1), policy: { income: 1, savings: 1 } });
  assert.equal(r.status, 'proof-failed');
  assert.equal(r.calls.length, 0);
});

// V6: binding is FAIL-CLOSED. A caller that reaches the binding step with NO sessionId (and no
// explicit allowUnbound) must be rejected — the headline anti-replay defense can't be skipped by
// simply forgetting a field. (Human + proofs pass here, so it reaches step 2b.)
test('missing sessionId fails closed (binding not silently skipped)', async () => {
  const r = await issueCredential(
    { label: 'aiko', owner: '0xB0B', incomeProof: 'x', savingsProof: 'y' }, // no sessionId
    { verifyHuman: okHuman, verifyIncome: att(12000), verifySavings: att(60000), policy: { income: 10000, savings: 50000 } });
  assert.equal(r.status, 'binding-failed');
  assert.equal(r.reason, 'missing-session');
  assert.equal(r.calls.length, 0);
});

// V6: the ONLY way to skip binding is the explicit, loud allowUnbound flag (issuer-relay/legacy).
test('allowUnbound:true intentionally skips binding and issues', async () => {
  const r = await issueCredential(
    { label: 'aiko', owner: '0xB0B', incomeProof: 'x', savingsProof: 'y', allowUnbound: true }, // no sessionId, but explicit
    { verifyHuman: okHuman, verifyIncome: att(12000), verifySavings: att(60000), policy: { income: 10000, savings: 50000 } });
  assert.equal(r.status, 'issued');
  assert.equal(r.marks.income, 'pass');
});

// DSR (debt-service ratio) — the optional 4th mark. It's a COMPUTED, INVERTED predicate over two
// attested facts: pass when debt÷income is at or BELOW the cap. Only appears when verifyDebt is wired.
test('DSR mark: debt 3600 / income 12000 = 30% <= 40% cap → pass (+ a 4th writeMark)', async () => {
  const r = await issueCredential(
    { label: 'aiko', owner: '0xB0B', incomeProof: 'x', savingsProof: 'y', debtProof: 'd', sessionId: SID },
    { verifyHuman: okHuman, verifyIncome: att(12000), verifySavings: att(60000), verifyDebt: att(3600),
      policy: { income: 10000, savings: 50000, dsrMaxPct: 40 } });
  assert.equal(r.status, 'issued');
  assert.equal(r.marks.dsr, 'pass');                                   // 30% <= 40%
  assert.equal(r.calls.filter((c) => c.fn === 'writeMark').length, 5); // income/savings/human/assurance/dsr
  assert.ok(r.calls.some((c) => c.fn === 'writeMark' && c.args[1] === 'Dsr'));
});

test('DSR mark INVERTS: debt 3750 / income 7500 = 50% > 40% cap → fail', async () => {
  const r = await issueCredential(
    { label: 'kenji', owner: '0xB0B', incomeProof: 'x', savingsProof: 'y', debtProof: 'd', sessionId: SID },
    { verifyHuman: okHuman, verifyIncome: att(7500), verifySavings: att(60000), verifyDebt: att(3750),
      policy: { income: 10000, savings: 50000, dsrMaxPct: 40 } });
  assert.equal(r.status, 'issued');
  assert.equal(r.marks.dsr, 'fail');                                   // 50% > 40% → the low-ratio-passes rule fails
});

test('no verifyDebt wired → no DSR mark, original 3-writeMark flow unchanged', async () => {
  const r = await issueCredential(
    { label: 'aiko', owner: '0xB0B', incomeProof: 'x', savingsProof: 'y', sessionId: SID },
    { verifyHuman: okHuman, verifyIncome: att(12000), verifySavings: att(60000), policy: { income: 10000, savings: 50000 } });
  assert.equal(r.marks.dsr, undefined);
  assert.equal(r.calls.filter((c) => c.fn === 'writeMark').length, 4); // income/savings/human/assurance (no dsr)
});

// Income BAND — coarse buckets as multiples of the qualifying floor (justified by loan-to-income
// limits, so no arbitrary constant). Opt-in via policy.incomeBandMultiples; the band is the ONLY
// income signal that leaves, and it's a range, never the figure.
test('bandLabel maps ratio → coarse public bucket (edges 1, 1.5, 2)', () => {
  const E = [1, 1.5, 2];
  assert.equal(bandLabel(0.75, E), '<1x');    // below floor
  assert.equal(bandLabel(1.0, E), '1-1.5x');  // exactly at floor
  assert.equal(bandLabel(1.2, E), '1-1.5x');  // Aiko: 12000 / 10000
  assert.equal(bandLabel(1.9, E), '1.5-2x');
  assert.equal(bandLabel(2.5, E), '2x+');     // top open-ended bucket
});

test('income band: 12000 / floor 10000 = 1.2x → "1-1.5x", written as a 4th mark', async () => {
  const r = await issueCredential(
    { label: 'aiko', owner: '0xB0B', incomeProof: 'x', savingsProof: 'y', sessionId: SID },
    { verifyHuman: okHuman, verifyIncome: att(12000), verifySavings: att(60000),
      policy: { income: 10000, savings: 50000, incomeBandMultiples: [1, 1.5, 2] } });
  assert.equal(r.status, 'issued');
  assert.equal(r.marks.incomeBand, '1-1.5x');
  assert.ok(r.calls.some((c) => c.fn === 'writeMark' && c.args[1] === 'IncomeBand' && c.args[2] === '1-1.5x'));
});

test('no incomeBandMultiples → no band mark (opt-in, additive)', async () => {
  const r = await issueCredential(
    { label: 'aiko', owner: '0xB0B', incomeProof: 'x', savingsProof: 'y', sessionId: SID },
    { verifyHuman: okHuman, verifyIncome: att(12000), verifySavings: att(60000), policy: { income: 10000, savings: 50000 } });
  assert.equal(r.marks.incomeBand, undefined);
  assert.ok(!r.calls.some((c) => c.fn === 'writeMark' && c.args[1] === 'IncomeBand'));
});

// --- TIERED ASSURANCE: the achieved World tier is published as a mark, and policy.requiredLevel is
// the "Orb strictly enforced at underwriting" gate — wired but OFF in the shopping/demo default. ---
const humanAt = (level) => async () => ({ success: true, nullifier: 'n1', signal: SID, level });

test('assurance mark carries the achieved tier (selfie) + always written', async () => {
  const r = await issueCredential(
    { label: 'aiko', owner: '0xB0B', incomeProof: 'x', savingsProof: 'y', sessionId: SID },
    { verifyHuman: humanAt('selfie'), verifyIncome: att(12000), verifySavings: att(60000), policy: { income: 10000, savings: 50000 } });
  assert.equal(r.status, 'issued');
  assert.equal(r.marks.assurance, 'selfie');
  assert.equal(r.level, 'selfie');
  assert.ok(r.calls.some((c) => c.fn === 'writeMark' && c.args[1] === 'Assurance' && c.args[2] === 'selfie'));
});

test('shopping default (no requiredLevel) accepts a selfie-tier human', async () => {
  const r = await issueCredential(
    { label: 'aiko', owner: '0xB0B', incomeProof: 'x', savingsProof: 'y', sessionId: SID },
    { verifyHuman: humanAt('selfie'), verifyIncome: att(12000), verifySavings: att(60000), policy: { income: 10000, savings: 50000 } });
  assert.equal(r.status, 'issued');   // no money moves at shopping → any tier is sufficient
});

test('underwriting gate: requiredLevel=orb REJECTS a selfie-tier human (meaningful alt path)', async () => {
  const r = await issueCredential(
    { label: 'aiko', owner: '0xB0B', incomeProof: 'x', savingsProof: 'y', sessionId: SID },
    { verifyHuman: humanAt('selfie'), verifyIncome: att(12000), verifySavings: att(60000),
      policy: { income: 10000, savings: 50000, requiredLevel: 'orb' } });
  assert.equal(r.status, 'insufficient-assurance');
  assert.equal(r.reason, 'requires-orb');
  assert.equal(r.level, 'selfie');
  assert.equal(r.calls.length, 0);    // nothing minted — the gate fires BEFORE any write
});

test('underwriting gate: requiredLevel=orb ACCEPTS an orb-tier human', async () => {
  const r = await issueCredential(
    { label: 'aiko', owner: '0xB0B', incomeProof: 'x', savingsProof: 'y', sessionId: SID },
    { verifyHuman: humanAt('orb'), verifyIncome: att(12000), verifySavings: att(60000),
      policy: { income: 10000, savings: 50000, requiredLevel: 'orb' } });
  assert.equal(r.status, 'issued');
  assert.equal(r.marks.assurance, 'orb');
});

test('requiredLevel is a MINIMUM: requiredLevel=passport accepts orb (higher tier)', async () => {
  const r = await issueCredential(
    { label: 'aiko', owner: '0xB0B', incomeProof: 'x', savingsProof: 'y', sessionId: SID },
    { verifyHuman: humanAt('orb'), verifyIncome: att(12000), verifySavings: att(60000),
      policy: { income: 10000, savings: 50000, requiredLevel: 'passport' } });
  assert.equal(r.status, 'issued');   // orb (rank 4) >= passport (rank 3)
});
