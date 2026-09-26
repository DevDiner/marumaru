// plaid_sandbox_test.mjs — prove the REAL Plaid open-banking path works end to end, in isolation,
// before the demo. Run on YOUR machine (this can't run behind a corporate proxy that blocks Plaid).
//
// It does exactly what the demo's Plaid method does, server-side, so you can confirm:
//   (a) your Sandbox creds work, (b) a public_token → access_token exchange succeeds,
//   (c) /accounts/get returns balances, and (d) our pickBalance() extracts income+savings correctly.
//
// SETUP (one-time, ~3 min):
//   1. Sign up (free) at https://dashboard.plaid.com → it drops you in Sandbox.
//   2. Developers → Keys: copy your client_id and your **Sandbox** secret.
//   3. Put them in .env:  PLAID_MODE=real  PLAID_CLIENT_ID=...  PLAID_SECRET=...  PLAID_ENV=sandbox
//   4. npm install            (installs the `plaid` SDK — confirm the version resolves; see note below)
//   5. node scripts/plaid_sandbox_test.mjs
//
// The script uses the sandbox `user_custom` override so the balances are life-like (checking 12000 /
// savings 62500) and actually clear the demo thresholds — the same override the demo uses. In Plaid Link
// (the browser flow) the equivalent login is username `user_custom`, password = the printed JSON; the
// plain `user_good` / `pass_good` login returns Plaid's token balances ($110/$210) which would FAIL policy.
import 'dotenv/config';
import { createLinkToken, sandboxPublicToken, exchangePublicToken, getAccounts, pickBalance, plaidEnabled } from '../app/plaid.mjs';

async function main() {
  if (!plaidEnabled()) {
    console.error('Plaid is in MOCK mode. Set PLAID_MODE=real + PLAID_CLIENT_ID + PLAID_SECRET (Sandbox) in .env. See header.');
    process.exit(1);
  }
  console.log('Plaid env:', process.env.PLAID_ENV || 'sandbox', '· client_id set:', !!process.env.PLAID_CLIENT_ID, '\n');

  // 1. link-token (what the browser would use to open Plaid Link)
  const lt = await createLinkToken('maru-sandbox-test');
  console.log('1. link_token created:', String(lt.link_token).slice(0, 24) + '…');

  // 2. sandbox public_token (skips the Link UI; uses the user_custom balance override)
  const pub = await sandboxPublicToken();
  console.log('2. sandbox public_token:', String(pub.public_token).slice(0, 24) + '…');

  // 3. exchange for an access_token
  const ex = await exchangePublicToken(pub.public_token);
  console.log('3. access_token:', String(ex.access_token).slice(0, 24) + '…');

  // 4. read accounts + show the real balances Plaid returned
  const accounts = await getAccounts(ex.access_token);
  console.log('\n=== /accounts/get returned ===');
  for (const a of accounts) {
    console.log(`  ${a.type}/${a.subtype}: current=${a.balances?.current} available=${a.balances?.available} ${a.balances?.iso_currency_code || ''}`);
  }

  // 5. our extraction (exactly what the issuer consumes)
  const savings = pickBalance(accounts, 'savings');
  const income = pickBalance(accounts, 'income');
  console.log('\n=== our pickBalance() ===');
  console.log('  savings :', savings, savings >= 50000 ? '→ PASS (≥ 50000)' : '→ fail (< 50000)');
  console.log('  income  :', income,  income  >= 10000 ? '→ PASS (≥ 10000)' : '→ fail (< 10000)');
  console.log('\n✅ Real Plaid path works. Flip the demo: PLAID_MODE=real + these creds; pick "Open banking" in Step 2.');
  console.log('   (If balances came back ~110/210, the user_custom override didn\'t apply — check the plaid SDK version.)');
  process.exit(0);
}
main().catch((e) => {
  console.error('\n❌ Plaid sandbox test failed:', e && (e.response?.data || e.message || e));
  console.error('   Common causes: wrong/missing Sandbox secret, PLAID_ENV not sandbox, or the plaid SDK version.');
  process.exit(1);
});
