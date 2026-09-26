import { test } from 'node:test';
import assert from 'node:assert';
import { handleRequest } from './handlers.mjs';
import { _resetNullifiers } from './worldid.mjs';
import { savePassports } from './store.mjs';

// Integration tests for the shared router (app/handlers.mjs) — the seam both demo/server.mjs and
// the Vercel function call. The 7 unit modules are tested elsewhere; this file exercises the
// ROUTING + wiring: the /bank auth wall, the fail-closed attestor, the full issue→store→read flow,
// and the same-person-across-lenders counter (the headline World-ID payoff) end-to-end through the handler.
//
// Force mock mode so no network is touched. Force the IN-MEMORY store path (VERCEL=1) INSTEAD of the
// file path: node --test runs test files in parallel processes, and several of them write the shared
// demo/passports.json + demo/nullifiers.json. On some filesystems (WSL's 9p mount, and with Node's
// parallel test runner) those concurrent file writes/reads don't land reliably — a mint's write and a
// later read straddle another file-writing test, so the read returns empty (404 / undefined marks /
// stacking count undefined / a 2nd mint wrongly "issued"). The in-memory store (same store.mjs code,
// just the module-level object seeded from demo/seed.json) is process-local and deterministic, so this
// integration file no longer depends on cross-process disk state. It exercises the identical routing.
process.env.WORLD_ID_MODE = 'mock';
process.env.VERCEL = '1';

// Reset BOTH ledgers (nullifiers + the passport store). Since one-live-passport-per-human now keys
// off passport liveness, a test that mints must start from a clean store — otherwise a live passport
// left by a prior test/run blocks a re-mint. Call this at the start of every minting test.
// (In-memory mode: savePassports({}) replaces the whole object, clearing the seeded 'mei' too.)
function resetState() { _resetNullifiers(); savePassports({}); }

// tiny helper: call the handler like a host would.
function call(method, pathname, { query = {}, cookie = '', body = null } = {}) {
  const searchParams = new URLSearchParams(query);
  const rawBody = body == null ? '' : (typeof body === 'string' ? body : JSON.stringify(body));
  return handleRequest({ method, pathname, searchParams, cookieHeader: cookie, rawBody });
}
const parse = (r) => { try { return JSON.parse(r.body); } catch { return r.body; } };
const cookieOf = (r) => (r.headers['set-cookie'] || '').split(';')[0];

test('/api/world-config never leaks the signing key or any secret', async () => {
  const r = await call('GET', '/api/world-config');
  assert.equal(r.status, 200);
  const cfg = parse(r);
  const blob = JSON.stringify(cfg);
  assert.ok(!('signingKey' in cfg) && !('rpSigningKey' in cfg));
  assert.ok(!/RP_SIGNING_KEY|signing/i.test(blob), 'no signing-key material in world-config');
});

test('/bank auth wall: /bank/account is 401 until login, then 200 with the authed persona', async () => {
  const pre = await call('GET', '/bank/account');
  assert.equal(pre.status, 401);                                  // the wall

  const login = await call('POST', '/bank/login', { body: { user: 'kenji', pass: 'demo1234' } });
  assert.equal(login.status, 302);                                // redirect to overview
  const cookie = cookieOf(login);
  assert.match(cookie, /portal_sid=/);

  const acct = await call('GET', '/bank/account', { cookie });
  assert.equal(acct.status, 200);
  assert.equal(parse(acct).holder, 'KENJI SATO');                 // the persona I logged in as
  assert.equal(parse(acct).income, 7500);
});

test('/bank/login rejects a wrong password and an unknown user (401)', async () => {
  assert.equal((await call('POST', '/bank/login', { body: { user: 'aiko', pass: 'nope' } })).status, 401);
  assert.equal((await call('POST', '/bank/login', { body: { user: 'ghost', pass: 'demo1234' } })).status, 401);
});

test('/api/bank-attest FAILS CLOSED with no session and no valid persona (never silently signs a default)', async () => {
  const r = await call('POST', '/api/bank-attest', { body: {} });
  assert.equal(r.status, 401);                                    // not a 200 aiko attestation
});

test('/api/bank-attest REJECTS a body-supplied persona with no session (the DevTools attack)', async () => {
  // A judge who opens DevTools and POSTs {persona:'aiko'} WITHOUT crossing the /bank auth wall
  // must NOT get a signed attestation — otherwise the demo's "the bank signed it, you can't type
  // your own number" claim is false. The persona comes only from the session cookie.
  const r = await call('POST', '/api/bank-attest', { body: { persona: 'aiko' } });
  assert.equal(r.status, 401);
});

test('/api/bank-attest signs exactly the AUTHENTICATED session persona', async () => {
  const login = await call('POST', '/bank/login', { body: { user: 'kenji', pass: 'demo1234' } });
  const cookie = cookieOf(login);
  const r = await call('POST', '/api/bank-attest', { cookie, body: {} });
  assert.equal(r.status, 200);
  assert.equal(parse(r).claim.holder, 'KENJI SATO');              // session wins, not a passed persona
  assert.equal(parse(r).claim.income, 7500);
});

test('full issue flow: mock human + persona proofs → issued, marks derived, readable from the store', async () => {
  resetState();
  const issue = await call('POST', '/api/issue', { body: {
    label: 'auditaiko', idkitResponse: 'MOCK-HUMAN:audit-a',
    incomeProof: 'MOCK-PROOF:12000', savingsProof: 'MOCK-PROOF:62500',
  } });
  assert.equal(issue.status, 200);
  const res = parse(issue);
  assert.equal(res.status, 'issued');
  assert.equal(res.marks.income, 'pass');
  assert.equal(res.marks.savings, 'pass');
  assert.equal(res.marks.human, 'verified');
  // income band is on by default in the demo policy: 12000 / floor 10000 = 1.2x → "1-1.5x" bucket.
  assert.equal(res.marks.incomeBand, '1-1.5x');

  const read = await call('GET', '/api/passport/auditaiko');
  assert.equal(read.status, 200);
  assert.equal(parse(read).marks.income, 'pass');                 // applyCalls wrote to the store
  assert.equal(parse(read).marks.incomeBand, '1-1.5x');           // the band is readable by a lender too
});

// TIERED VERIFICATION through the handler. REGRESSION: the mock session-rebinding (stampHuman) once
// dropped the 4th slot (the tier), silently collapsing every proof to 'orb' and defeating the gate.
// (1) the chosen tier must survive stamping and land on maru.assurance; (2) the underwriting gate
// (requiredLevel=orb) must reject a selfie-tier human end-to-end; (3) shopping (no requiredLevel) accepts it.
test('tiered issue: the chosen tier survives session-binding and is flagged on the passport', async () => {
  resetState();
  const issued = parse(await call('POST', '/api/issue', { body: {
    label: 'tierself', idkitResponse: 'MOCK-HUMAN:tier-nf:sT:selfie', sessionId: 'sT',
    incomeProof: 'MOCK-PROOF:12000', savingsProof: 'MOCK-PROOF:62500',
  } }));
  assert.equal(issued.status, 'issued');                          // shopping accepts any tier
  assert.equal(issued.marks.assurance, 'selfie');                 // NOT collapsed to orb by stamping
  const read = parse(await call('GET', '/api/passport/tierself'));
  assert.equal(read.marks.assurance, 'selfie');                   // and it's readable by a lender
});

test('underwriting gate through the handler: requiredLevel=orb rejects a selfie-tier human', async () => {
  resetState();
  const blocked = parse(await call('POST', '/api/issue', { body: {
    label: 'tieruw', idkitResponse: 'MOCK-HUMAN:uw-nf:sU:selfie', sessionId: 'sU', requiredLevel: 'orb',
    incomeProof: 'MOCK-PROOF:12000', savingsProof: 'MOCK-PROOF:62500',
  } }));
  assert.equal(blocked.status, 'insufficient-assurance');
  assert.equal(blocked.reason, 'requires-orb');
  // nothing was written — a later read finds no passport
  assert.equal((await call('GET', '/api/passport/tieruw')).status, 404);

  // and an orb-tier human clears the same bar
  const ok = parse(await call('POST', '/api/issue', { body: {
    label: 'tierorb', idkitResponse: 'MOCK-HUMAN:orb-nf:sO:orb', sessionId: 'sO', requiredLevel: 'orb',
    incomeProof: 'MOCK-PROOF:12000', savingsProof: 'MOCK-PROOF:62500',
  } }));
  assert.equal(ok.status, 'issued');
  assert.equal(ok.marks.assurance, 'orb');
});

// World ID booth: "a nullifier is like a secret key." The RAW nullifier must NEVER cross to the
// client — /api/issue and /api/passport expose a DERIVED `sub` (hash of the nullifier) instead.
test('the raw nullifier never leaves the server — /api/issue and /api/passport expose only a derived `sub`', async () => {
  resetState();
  const issued = parse(await call('POST', '/api/issue', { body: {
    label: 'audit-sub', idkitResponse: 'MOCK-HUMAN:audit-sub-nf',
    incomeProof: 'MOCK-PROOF:12000', savingsProof: 'MOCK-PROOF:62500',
  } }));
  assert.equal(issued.status, 'issued');
  assert.equal(issued.nullifier, undefined, 'raw nullifier must not be in the issue response');
  assert.equal(issued.calls, undefined, 'internal on-chain call plan must not be in the issue response');
  assert.match(issued.sub, /^0x[0-9a-f]{64}$/, 'derived sub is present and hash-shaped');
  // sub is DERIVED (one-way): it is not the raw nullifier value.
  assert.notEqual(issued.sub, 'audit-sub-nf');
  assert.ok(!issued.sub.includes('audit-sub-nf'));

  const read = parse(await call('GET', '/api/passport/audit-sub'));
  assert.equal(read.nullifier, undefined, 'raw nullifier must not be in the passport read');
  assert.equal(read.sub, issued.sub, 'the passport read exposes the SAME derived sub (stable per human)');
});

// ONE LIVE PASSPORT PER HUMAN (not "one ever") + the real-mode double-verify fix. Verifying at
// step 1 must NOT consume the nullifier so the step-3 issue still works for the SAME human; a
// SECOND passport for a human who already holds a LIVE one must reject.
test('verify-human then issue works for the same human, but a 2nd live passport is rejected', async () => {
  resetState();
  const v = parse(await call('POST', '/api/verify-human', { body: { idkitResponse: 'MOCK-HUMAN:liveguy', action: 'marumaru-issue', signal: 's1' } }));
  assert.equal(v.success, true);                                   // step 1 verifies…
  const issued = parse(await call('POST', '/api/issue', { body: {
    label: 'liveguy', idkitResponse: 'MOCK-HUMAN:liveguy', incomeProof: 'MOCK-PROOF:12000', savingsProof: 'MOCK-PROOF:62500' } }));
  assert.equal(issued.status, 'issued');                          // …and step 3 still mints (was broken: double-consume)
  const again = parse(await call('POST', '/api/issue', { body: {
    label: 'liveguy2', idkitResponse: 'MOCK-HUMAN:liveguy', incomeProof: 'MOCK-PROOF:12000', savingsProof: 'MOCK-PROOF:62500' } }));
  assert.equal(again.status, 'rejected');                         // a 2nd LIVE passport for the same human → rejected
});

test('same-person-across-lenders detection: a second lender for the same human raises the count and flags stacking', async () => {
  resetState();
  await call('POST', '/api/issue', { body: {
    label: 'auditstack', idkitResponse: 'MOCK-HUMAN:audit-stack',
    incomeProof: 'MOCK-PROOF:12000', savingsProof: 'MOCK-PROOF:62500',
  } });
  await call('POST', '/api/grant', { body: { label: 'auditstack', lender: '0xA', days: 14 } });
  const one = parse(await call('GET', '/api/detail/auditstack', { query: { lender: '0xA' } }));
  assert.equal(one.humanActiveLenders, 1);
  assert.equal(one.stackingFlag, false);

  await call('POST', '/api/grant', { body: { label: 'auditstack', lender: '0xB', days: 14 } });
  const two = parse(await call('GET', '/api/detail/auditstack', { query: { lender: '0xB' } }));
  assert.equal(two.humanActiveLenders, 2);                        // the headline World-ID payoff
  assert.equal(two.stackingFlag, true);

  // The stacking count is CONSENT-GATED detail: an UNauthorized lender who knows the label must
  // NOT be able to harvest the human's active-lender count without a grant.
  const nosy = parse(await call('GET', '/api/detail/auditstack', { query: { lender: '0xNOSY' } }));
  assert.equal(nosy.authorized, false);
  assert.equal(nosy.humanActiveLenders, undefined);               // hidden until authorized
  assert.equal(nosy.stackingFlag, undefined);
});

test('a tampered attestation fails verification through the handler (real crypto, not scripted)', async () => {
  const login = await call('POST', '/bank/login', { body: { user: 'aiko', pass: 'demo1234' } });
  const cookie = cookieOf(login);
  const att = parse(await call('POST', '/api/bank-attest', { cookie, body: {} }));

  const clean = parse(await call('POST', '/api/verify-attestation', { body: { claim: att.claim, signature: att.signature } }));
  assert.equal(clean.verified, true);

  const forged = { ...att.claim, income: 999999 };
  const bad = parse(await call('POST', '/api/verify-attestation', { body: { claim: forged, signature: att.signature } }));
  assert.equal(bad.verified, false);                              // editing the signed figure breaks it
});
