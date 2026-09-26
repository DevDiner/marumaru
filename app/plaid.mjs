// Plaid open-banking integration — the "today's rail" way to connect a bank, alongside the
// self-sovereign Reclaim zkTLS path. It is a DROP-IN verifier: verifyViaPlaid(...) returns the SAME
// { ok, value, context } shape the issuer already consumes (see app/reclaim.mjs), so app/issuer.mjs
// needs zero changes to accept a Plaid-backed fact.
//
// HONEST FRAMING (say this on stage): Plaid is an institution-controlled data pipe — the bank/aggregator
// holds the connection, not the borrower. We offer it because it's the rail that exists TODAY, and pair
// it with the borrower-owned zkTLS proof to show the inversion. Neither is faked.
//
// Verified against the Plaid Node Quickstart (plaid npm SDK): Configuration + PlaidApi +
// PlaidEnvironments; flow = linkTokenCreate → (Link UI) public_token → itemPublicTokenExchange →
// accountsGet. Sandbox can skip the Link UI with sandboxPublicTokenCreate({institution_id,
// initial_products}). /accounts/get returns { accounts:[{ type, subtype, balances:{ current, available }}] }.
//
// MODE: PLAID_MODE=real needs PLAID_CLIENT_ID + PLAID_SECRET (+ PLAID_ENV, default sandbox). Absent/mock
// → a Plaid-shaped canned response so tests + a no-creds demo work and the connect flow can fall back.

const PLAID_ENV = process.env.PLAID_ENV || 'sandbox';
const SANDBOX_INSTITUTION = 'ins_109508'; // First Platypus Bank — the standard Sandbox test institution
const SANDBOX_PRODUCTS = ['auth'];

// MOCK accounts: life-like QUALIFYING balances so a no-creds demo shows a real "pass" (the Quickstart's
// own sandbox figures — checking 110 / savings 210 — are token amounts that would fail every policy and
// make the demo look broken). Shape is identical to real /accounts/get. Real sandbox (user_good) returns
// its own balances; this mock is only the fallback when PLAID creds are absent.
const MOCK_ACCOUNTS = [
  { type: 'depository', subtype: 'checking', balances: { current: 12000, available: 12000 } },
  { type: 'depository', subtype: 'savings', balances: { current: 62500, available: 62500 } },
];

function isReal() {
  return (process.env.PLAID_MODE || 'mock') === 'real'
    && !!process.env.PLAID_CLIENT_ID && !!process.env.PLAID_SECRET;
}
export function plaidEnabled() { return isReal(); }

// Lazily build the real client only when needed (the `plaid` SDK is a real dep but we never import it
// in mock mode, so tests + a no-creds demo don't require it to be installed/resolvable).
async function client() {
  const { Configuration, PlaidApi, PlaidEnvironments } = await import('plaid');
  const cfg = new Configuration({
    basePath: PlaidEnvironments[PLAID_ENV],
    baseOptions: { headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    } },
  });
  return new PlaidApi(cfg);
}

/// Step 1 — create a link_token to initialize Plaid Link in the browser.
/// `clientUserId` should be stable per user; we pass the bound sessionId so the whole flow is tied to it.
export async function createLinkToken(clientUserId) {
  if (!isReal()) return { link_token: `mock-link-${clientUserId || 'user'}`, mock: true };
  const c = await client();
  const res = await c.linkTokenCreate({
    user: { client_user_id: String(clientUserId || 'maru-user') },
    client_name: 'MaruMaru',
    products: SANDBOX_PRODUCTS,
    language: 'en',
    country_codes: ['US'],
  });
  return res.data; // { link_token, expiration, request_id }
}

// A `user_custom` override so the REAL sandbox returns life-like QUALIFYING balances instead of Plaid's
// default token amounts (checking $110 / savings $210) — which would fail every policy and make the live
// demo look broken. Plaid reads this JSON when override_username='user_custom'. (Docs: Sandbox → Test
// user customization.) Login inside Link then becomes: username user_custom, password = this JSON string.
const CUSTOM_USER = {
  override_accounts: [
    { type: 'depository', subtype: 'checking', starting_balance: 12000, currency: 'USD' },
    { type: 'depository', subtype: 'savings',  starting_balance: 62500, currency: 'USD' },
  ],
};

/// Sandbox-only shortcut: mint a public_token WITHOUT the Link UI (handy for a server-driven demo/test).
/// Uses the user_custom override so the balances that come back actually clear our demo thresholds.
export async function sandboxPublicToken() {
  if (!isReal()) return { public_token: 'mock-public-sandbox', mock: true };
  const c = await client();
  const res = await c.sandboxPublicTokenCreate({
    institution_id: SANDBOX_INSTITUTION,
    initial_products: SANDBOX_PRODUCTS,
    options: { override_username: 'user_custom', override_password: JSON.stringify(CUSTOM_USER) },
  });
  return res.data; // { public_token, request_id }
}

/// Step 3 — exchange a public_token (from Link's onSuccess, or the sandbox shortcut) for an access_token.
export async function exchangePublicToken(publicToken) {
  if (!isReal()) return { access_token: 'mock-access-sandbox', item_id: 'mock-item', mock: true };
  const c = await client();
  const res = await c.itemPublicTokenExchange({ public_token: publicToken });
  return res.data; // { access_token, item_id, request_id }
}

/// Step 4 — read the accounts for an Item. Returns the raw Plaid accounts array (real or mock).
export async function getAccounts(accessToken) {
  if (!isReal()) return MOCK_ACCOUNTS;
  const c = await client();
  const res = await c.accountsGet({ access_token: accessToken });
  return res.data.accounts || [];
}

/// Pull the balance we care about out of Plaid's accounts array. `kind`:
///   'savings' → sum of depository savings/CD current balances (our savings mark),
///   'income'  → checking available/current as a monthly-inflow PROXY (honest limit: Plaid /accounts
///               gives balances, not income; the real income signal is Plaid's Income product or zkTLS).
/// Returns a finite Number, or NaN if nothing usable (caller treats NaN as ok:false, never a silent 0).
export function pickBalance(accounts, kind) {
  const list = Array.isArray(accounts) ? accounts : [];
  const dep = list.filter((a) => a && a.type === 'depository');
  let n = NaN;
  if (kind === 'savings') {
    const sav = dep.filter((a) => a.subtype === 'savings' || a.subtype === 'cd');
    if (sav.length) n = sav.reduce((s, a) => s + num(a.balances && a.balances.current), 0);
  } else { // income proxy: checking
    const chk = dep.find((a) => a.subtype === 'checking') || dep[0];
    if (chk) n = num(chk.balances && (chk.balances.available ?? chk.balances.current));
  }
  return Number.isFinite(n) ? n : NaN;
}
function num(x) { const v = Number(x); return Number.isFinite(v) ? v : NaN; }

/// The issuer-facing verifier: given an access_token (or a mock marker) + which fact, return the SAME
/// { ok, value, context } contract as app/reclaim.mjs so it drops straight into issueCredential's deps.
/// `access` may be a "PLAID-ACCESS:<token>[:context]" string (parallel to MOCK-PROOF) so the demo can
/// thread the bound sessionId, or a bare token.
export async function verifyViaPlaid(access, kind = 'savings') {
  let token = access, context;
  if (typeof access === 'string' && access.startsWith('PLAID-ACCESS:')) {
    const rest = access.slice('PLAID-ACCESS:'.length);
    const i = rest.indexOf(':');
    token = i === -1 ? rest : rest.slice(0, i);
    context = i === -1 ? undefined : rest.slice(i + 1);
  }
  let accounts;
  try { accounts = await getAccounts(token); }
  catch { return { ok: false, reason: 'plaid-error' }; }
  const value = pickBalance(accounts, kind);
  if (!Number.isFinite(value)) return { ok: false, reason: 'no-usable-balance' };
  return { ok: true, value, context };
}
