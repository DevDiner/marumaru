import { test } from 'node:test';
import assert from 'node:assert';
import { readMarks, readDetail } from './ens-gateway.mjs';

const client = {
  text: async (_l, key) => ({ 'maru.income': 'pass', 'maru.savings': 'fail', 'maru.human': 'verified' }[key] || ''),
  isLenderAuthorized: async (_l, lender) => lender === '0xGOOD',
  passportExpired: async () => false,
};

test('readMarks returns the public booleans', async () => {
  const m = await readMarks('aiko', client);
  assert.equal(m.income, 'pass');
  assert.equal(m.savings, 'fail');
  assert.equal(m.human, 'verified');
});

test('readMarks surfaces the assurance tier when set, omits it otherwise', async () => {
  // older passport (no assurance mark) → key absent, not empty-string leaked
  const m0 = await readMarks('aiko', client);
  assert.equal('assurance' in m0, false);
  // a tiered passport → the tier surfaces so a lender can price the assurance
  const tiered = { ...client, text: async (_l, key) =>
    ({ 'maru.income': 'pass', 'maru.savings': 'pass', 'maru.human': 'verified', 'maru.assurance': 'selfie' }[key] || '') };
  const m1 = await readMarks('aiko', tiered);
  assert.equal(m1.assurance, 'selfie');
});

test('readDetail is denied for an unauthorized lender', async () => {
  const d = await readDetail('aiko', '0xBAD', client);
  assert.equal(d.authorized, false);
});

test('readDetail is granted for an authorized lender', async () => {
  const d = await readDetail('aiko', '0xGOOD', client);
  assert.equal(d.authorized, true);
  assert.equal(d.marks.income, 'pass');
});

test('readDetail carries the assurance tier to a consented lender (the reliability flag path)', async () => {
  // The lender-view reliability note reads d.marks.assurance; prove the consented-detail path surfaces
  // it (readDetail reuses readMarks, so the tier must ride along — not just the public /api/passport read).
  const tiered = { ...client, text: async (_l, key) =>
    ({ 'maru.income': 'pass', 'maru.savings': 'pass', 'maru.human': 'verified', 'maru.assurance': 'selfie' }[key] || '') };
  const d = await readDetail('aiko', '0xGOOD', tiered);
  assert.equal(d.authorized, true);
  assert.equal(d.marks.assurance, 'selfie');   // the lender can price the (basic) assurance
});

test('readDetail is denied when the passport has expired even if authorized', async () => {
  const expiredClient = { ...client, passportExpired: async () => true };
  const d = await readDetail('aiko', '0xGOOD', expiredClient);
  assert.equal(d.authorized, false);
  assert.equal(d.expired, true);
});
