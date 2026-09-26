import { test } from 'node:test';
import assert from 'node:assert';
import { verifyViaPlaid, pickBalance, createLinkToken, exchangePublicToken, getAccounts, plaidEnabled } from './plaid.mjs';

// Tests for the Plaid open-banking verifier (app/plaid.mjs). All run against the MOCK path (no creds,
// no network) — PLAID_MODE unset → mock. They pin the two things a regression would break:
//   (1) the drop-in { ok, value, context } contract the issuer consumes (same as reclaim.mjs), and
//   (2) pickBalance's extraction from Plaid's real /accounts/get shape ({ type, subtype, balances }).
// The live sandbox calls themselves are exercised on a machine with PLAID creds; here we prove the
// wiring + the honest fail-closed behavior (no usable balance → ok:false, never a silent 0).

test('mock mode is on by default (no creds) and the flow helpers return mock markers', async () => {
  assert.equal(plaidEnabled(), false);                       // no PLAID_MODE=real + creds → mock
  const lt = await createLinkToken('u1');
  assert.ok(lt.link_token && lt.mock, 'link token is a mock marker');
  const ex = await exchangePublicToken('mock-public-sandbox');
  assert.ok(ex.access_token && ex.mock, 'exchange returns a mock access token');
});

test('getAccounts (mock) returns the Plaid-shaped accounts array', async () => {
  const accts = await getAccounts('mock-access');
  assert.ok(Array.isArray(accts) && accts.length >= 2);
  assert.equal(accts[0].type, 'depository');
  assert.ok('balances' in accts[0] && 'current' in accts[0].balances);
});

test('pickBalance extracts savings vs income(checking) from the accounts shape', () => {
  const accounts = [
    { type: 'depository', subtype: 'checking', balances: { current: 110, available: 100 } },
    { type: 'depository', subtype: 'savings', balances: { current: 210, available: 200 } },
    { type: 'depository', subtype: 'cd', balances: { current: 1000, available: null } },
  ];
  assert.equal(pickBalance(accounts, 'savings'), 1210);      // savings 210 + cd 1000
  assert.equal(pickBalance(accounts, 'income'), 100);        // checking available (income proxy)
});

test('pickBalance returns NaN when there is no usable balance (fail-closed, not 0)', () => {
  assert.ok(Number.isNaN(pickBalance([], 'savings')));
  assert.ok(Number.isNaN(pickBalance([{ type: 'credit', balances: { current: 5 } }], 'savings')));
  assert.ok(Number.isNaN(pickBalance([{ type: 'depository', subtype: 'checking', balances: {} }], 'income')));
});

test('verifyViaPlaid returns the drop-in { ok, value, context } contract (mock)', async () => {
  const r = await verifyViaPlaid('mock-access', 'savings');
  assert.equal(r.ok, true);
  assert.equal(r.value, 62500);                              // mock savings current (life-like qualifying)
  const inc = await verifyViaPlaid('mock-access', 'income');
  assert.equal(inc.value, 12000);                            // mock checking available
});

test('verifyViaPlaid threads the bound session context from a PLAID-ACCESS marker', async () => {
  const r = await verifyViaPlaid('PLAID-ACCESS:mock-access:sess-xyz', 'savings');
  assert.equal(r.ok, true);
  assert.equal(r.context, 'sess-xyz');                       // same-session binding survives (like MOCK-PROOF)
});
