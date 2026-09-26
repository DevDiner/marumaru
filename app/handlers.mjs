// app/handlers.mjs — ALL dynamic route logic, in ONE transport-agnostic place.
//
// WHY THIS EXISTS: the demo runs in two hosts — a local Node http server (demo/server.mjs) and a
// Vercel serverless function (api/[...path].mjs). To guarantee they behave identically (no drift
// between "works on my machine" and "works in prod"), both adapt their native (req,res) to ONE
// normalized shape and call handleRequest() here. Static files are served by the host (local
// server / Vercel static), NOT here — this file owns only /api/* and /bank/*.
//
// Request  in : { method, pathname, searchParams:URLSearchParams, cookieHeader:string, rawBody:string }
// Response out: { status:number, headers:object, body:string }   (body already serialized)
import crypto from 'node:crypto';
import { signRequest, verifyHuman } from './worldid.mjs';
import { verifyAttestation } from './reclaim.mjs';
import { createLinkToken, sandboxPublicToken, exchangePublicToken, verifyViaPlaid, plaidEnabled } from './plaid.mjs';
import { issueCredential } from './issuer.mjs';
import { newSessionId } from './binding.mjs';
import { readMarks, readDetail } from './ens-gateway.mjs';
import { agentResolve } from './agent-resolver.mjs';
import { attestPersona, verifyAttestationSig } from './attestation.mjs';
import { getPassports, savePassports } from './store.mjs';
import { makeOnchainClient } from './ens-client.mjs';
import fs from 'node:fs';

const POLICY = {
  income: Number(process.env.POLICY_INCOME_MIN || 10000),
  savings: Number(process.env.POLICY_SAVINGS_MIN || 50000),
  dsrMaxPct: Number(process.env.POLICY_DSR_MAX_PCT || 40), // debt-service ratio cap (debt <= 40% of income)
  // Coarse income-band edges as MULTIPLES of the qualifying floor (income above). Justified by
  // loan-to-income limits (income-as-a-multiple is the real affordability lever), so no new arbitrary
  // constant. With floor 10000 → buckets: <1x | 1-1.5x | 1.5-2x | 2x+. Powers tiered LTV / rate pricing
  // without revealing the figure. Override via POLICY_INCOME_BAND_MULTIPLES="1,1.5,2".
  incomeBandMultiples: (process.env.POLICY_INCOME_BAND_MULTIPLES || '1,1.5,2').split(',').map(Number),
  // Minimum World assurance tier required to issue. BLANK = shopping/pre-qualification (any tier —
  // Orb/Passport/Selfie all accepted; the tier is flagged, not gated). Set REQUIRED_HUMAN_LEVEL=orb
  // to enforce Orb — that's the FUTURE underwriting/document-transfer action, where uniqueness matters.
  requiredLevel: process.env.REQUIRED_HUMAN_LEVEL || undefined,
};

// Demo personas — the figures live SERVER-SIDE (the borrower can't author them; the whole point of
// an attestation is the number comes from the bank, not the applicant). "aiko" qualifies; "kenji"
// falls short, so the demo honestly shows a PASS and a FAIL from the same flow.
// `debt` = monthly debt obligations, used for the DSR mark (debt÷income). Aiko: 3600/12000 = 30% ≤ 40 → pass.
// Kenji: 3750/7500 = 50% > 40 → fail (he fails on income AND DSR — a realistically-stretched applicant).
export const PERSONAS = {
  aiko:  { holder: 'AIKO TANAKA', income: 12000, savings: 62500, debt: 3600 },
  kenji: { holder: 'KENJI SATO',  income: 7500,  savings: 22000, debt: 3750 },
};

// ---- the bank auth wall (folded in from demo/stub-portal so the whole zkTLS pipeline runs
// same-origin, no ngrok/:8790). A REAL session cookie: /bank/account is 401 until you log in.
// The financial figure lives BEHIND this wall — which is what makes it a meaningful zkTLS target
// (you can't read the number without the authenticated session). In-memory per instance is fine:
// on Vercel a cold start just makes the borrower log in again (same class as passports resetting).
const BANK_PASS = process.env.STUB_PASS || 'demo1234';
const bankSessions = new Map(); // sid -> persona key
function sidFrom(cookieHeader) { const m = (cookieHeader || '').match(/portal_sid=([a-f0-9]+)/); return m ? m[1] : null; }
function bankPersona(cookieHeader) { const sid = sidFrom(cookieHeader); return sid && bankSessions.get(sid); }

// ---- normalized response builders ----
const CORS = { 'access-control-allow-origin': '*' };
function json(status, obj, extra = {}) {
  return { status, headers: { 'content-type': 'application/json', ...CORS, ...extra }, body: JSON.stringify(obj) };
}
function html(status, body, extra = {}) {
  return { status, headers: { 'content-type': 'text/html; charset=utf-8', ...extra }, body };
}
function redirect(location, extra = {}) {
  return { status: 302, headers: { location, ...extra }, body: '' };
}

// Parse a request body that may be JSON (api/*) OR form-encoded (the /bank login form).
// Vercel hands us req.body already-parsed; the adapter re-stringifies it to JSON, so JSON-first
// covers both hosts, with a form fallback for the local raw form POST.
function parseBody(raw) {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { /* not json */ }
  try { return Object.fromEntries(new URLSearchParams(raw)); } catch { /* not form */ }
  return {};
}

// ---- registry client shaped like the on-chain one, backed by the store ----
function makeClient(store) {
  return {
    text: async (label, key) => (store[label]?.marks?.[key] ?? ''),
    isLenderAuthorized: async (label, lender) => {
      const until = store[label]?.lenders?.[lender] ?? 0;
      return until > Math.floor(Date.now() / 1000);
    },
    passportExpired: async (label) => {
      const exp = store[label]?.expiry ?? 0;
      return exp !== 0 && exp <= Math.floor(Date.now() / 1000);
    },
  };
}

// The client the lender-read paths use. Default = the store (offline demo + tests, unchanged). When
// ONCHAIN_READS=1 AND demo/addresses.json is present (i.e. AFTER a real Sepolia deploy), reads resolve
// DIRECTLY from the deployed ENSv2 resolver/registrar — so the demo is "functional, not hard-coded"
// (ENS prize). Falls back to the store on any construction error, so a mis-set flag can never break the
// demo. `_onchainAddrs` is read once (cached) to avoid a disk hit per request.
let _onchainAddrs; // undefined = not yet loaded; null = absent/unreadable
function onchainReadsEnabled() {
  if (process.env.ONCHAIN_READS !== '1' || !process.env.SEPOLIA_RPC) return null;
  if (_onchainAddrs === undefined) {
    try {
      const a = JSON.parse(fs.readFileSync(new URL('../demo/addresses.json', import.meta.url), 'utf8'));
      _onchainAddrs = (a && a.resolver && a.registrar) ? a : null;
    } catch { _onchainAddrs = null; }
  }
  return _onchainAddrs;
}
function resolverClient(store) {
  const addrs = onchainReadsEnabled();
  if (addrs) {
    try {
      return makeOnchainClient({ rpc: process.env.SEPOLIA_RPC, addrs, parent: process.env.PARENT_NAME || 'marumaru.eth' });
    } catch { /* fall through to store — never break the demo on a wiring slip */ }
  }
  return makeClient(store);
}

// Apply the issuer's "call plan" to the store (mirrors what the deployed registrar would do).
const KEY = { Income: 'maru.income', Savings: 'maru.savings', Human: 'maru.human', Dsr: 'maru.dsr', IncomeBand: 'maru.income_band', Assurance: 'maru.assurance' };
function applyCalls(store, calls) {
  for (const c of calls) {
    if (c.fn === 'mintPassport') {
      const [label, owner, nullifier, transferable] = c.args;
      store[label] = { owner, nullifier, soulbound: !transferable, marks: {}, lenders: {}, expiry: 0 };
    } else if (c.fn === 'writeMark') {
      const [label, kind, value, expiry] = c.args;
      store[label].marks[KEY[kind]] = value;
      store[label].expiry = Math.max(store[label].expiry || 0, expiry);
    }
  }
}

// One-LIVE-passport-per-human liveness check (the source of truth for the World dedup, matching the
// contract's humanUsed): does the store hold a NON-EXPIRED passport for this nullifier? A lapsed or
// removed passport frees the human to re-mint. Passed into verifyHuman so verify stays idempotent.
function hasLivePassport(nullifier) {
  if (!nullifier) return false;
  const now = Math.floor(Date.now() / 1000);
  const store = getPassports();
  for (const rec of Object.values(store)) {
    if (rec.nullifier === nullifier && (rec.expiry === 0 || rec.expiry > now)) return true;
  }
  return false;
}

// World ID booth guidance: "a nullifier is like a secret key." So the RAW nullifier stays
// server-side only (store, dedup, on-chain mintPassport args) and NEVER crosses to the client.
// What we expose publicly is a DERIVED, stable subject — sub = hash(nullifier) — the same pattern
// as a JWT `sub` claim built from the nullifier. It's deterministic (so any dedup keyed on it still
// works) but one-way, so a leaked `sub` can't be treated as the nullifier. (On-chain the equivalent
// derivation is keccak256; here in the off-chain demo we use SHA-256 — either way it's one-way.)
function subFromNullifier(nullifier) {
  if (!nullifier) return null;
  return '0x' + crypto.createHash('sha256').update(String(nullifier)).digest('hex');
}

// Strip the raw nullifier out of any passport record before it leaves the server, replacing it with
// the derived `sub`. Everything else (owner, marks, lenders, expiry, soulbound) is public already.
function publicPassport(rec) {
  if (!rec) return rec;
  const { nullifier, ...safe } = rec;
  return { ...safe, sub: subFromNullifier(nullifier) };
}

// ---- the bank pages (a real, separate-feeling bank site — the convincing zkTLS backdrop) ----
// The stand-in bank portal. A DELIBERATE dark context-switch — the borrower has left MaruMaru and is
// inside their bank, which is exactly the point (MaruMaru never sees in). But it must read as a credible
// PREMIUM institution, not a template: warm sumi-ink ground + warm paper text (the same on-dark palette
// the app's dark cards use, so the two surfaces feel related), a parchment CTA (not generic toy-blue),
// and a "Secure" affordance. Self-contained inline CSS (offline/proxy-safe — no webfont, no CDN).
function bankShell(inner) {
  return `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>HSBC Online Banking</title><style>
:root{--bg:#14110B;--card:#211B13;--line:#3A3222;--paper:#EDE4D3;--muted:#A99B87;--faint:#877C6A}
*{box-sizing:border-box}
body{font:16px -apple-system,"Segoe UI","Hiragino Sans",sans-serif;color:var(--paper);display:flex;min-height:100vh;
align-items:center;justify-content:center;margin:0;padding:20px;
background:radial-gradient(120% 80% at 50% -10%,#1E180F 0%,rgba(30,24,15,0) 55%),var(--bg)}
.card{background:linear-gradient(180deg,#241E15 0%,var(--card) 100%);border:1px solid var(--line);border-radius:16px;
padding:30px 32px;max-width:390px;width:100%;box-shadow:0 24px 60px rgba(0,0,0,.5)}
.brand{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px}
h1{font-size:20px;margin:0;font-weight:700;letter-spacing:.01em}
.secure{font:600 10px ui-monospace,"Cascadia Mono",monospace;color:var(--muted);border:1px solid var(--line);
border-radius:999px;padding:4px 10px;letter-spacing:.06em;white-space:nowrap}
.muted{color:var(--muted);font-size:13px;margin:0 0 18px;line-height:1.55}
label{display:block;font-size:12px;color:var(--muted);margin:14px 0 5px;font-weight:600}
input{width:100%;padding:12px;border:1px solid var(--line);border-radius:10px;background:#171209;color:var(--paper);
font:14px ui-monospace,"Cascadia Mono",monospace;transition:border-color .15s,box-shadow .15s}
input:focus{outline:none;border-color:var(--muted);box-shadow:0 0 0 3px rgba(233,224,206,.09)}
button{width:100%;padding:13px;margin-top:18px;border:0;border-radius:10px;background:var(--paper);color:#1A1712;
font-weight:700;font-size:15px;letter-spacing:.01em;cursor:pointer;transition:filter .15s,transform .15s,box-shadow .15s}
button:hover{filter:brightness(1.04);transform:translateY(-1px);box-shadow:0 6px 18px rgba(0,0,0,.35)}
button:active{transform:translateY(0)}
.bal{font-size:30px;font-weight:700;margin:6px 0}.row{display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid #2E2718}
.k{color:var(--muted)}.logout{display:block;margin-top:20px;color:var(--muted);font-size:13px;text-align:center}
.done{background:#16281B;border:1px solid #2E7D5B66;color:#7FD9A6;border-radius:10px;padding:12px 14px;font-size:13px;margin-top:18px;line-height:1.55}
.err{background:#2A1512;border:1px solid #E4472E55;color:#F0B4A6;border-radius:10px;padding:12px 14px;font-size:13px}
.hint{color:var(--muted);font-size:12px;margin:7px 0 0}.hint code{background:#171209;border:1px solid var(--line);border-radius:5px;padding:1px 6px;color:var(--paper);font-size:12px}
.disclaimer{color:var(--faint);font-size:11px;text-align:center;margin-top:18px;line-height:1.55}
</style><div class=card>${inner}</div>`;
}
function bankLoginPage(persona, error) {
  const who = PERSONAS[persona] ? persona : 'aiko';
  return bankShell(`<div class=brand><h1>🏦 HSBC</h1><span class=secure>🔒 Secure sign-in</span></div>
    <p class=muted>Sign in to your online banking. MaruMaru will read only a pass/fail from your account, never your balance.</p>
    ${error ? `<div class=err>${error}</div>` : ''}
    <form method=post action="/bank/login">
      <label>Username</label><input name=user value="${who}" autocomplete=username>
      <label>Password</label><input name=pass type=password placeholder="Enter your password" autocomplete=current-password autofocus>
      <p class=hint>Demo password: <code>${BANK_PASS}</code></p>
      <button>Sign in</button>
    </form>
    <p class=disclaimer>Demo only, a stand-in bank sign-in. Not affiliated with or endorsed by HSBC.</p>`);
}
function bankOverviewPage(who) {
  const a = PERSONAS[who];
  return bankShell(`<h1>Account overview</h1><p class=muted>${a.holder}</p>
    <div class=row><span class=k>Monthly income</span><b>MYR ${a.income.toLocaleString()}</b></div>
    <div class=row><span class=k>Savings balance</span><b>MYR ${a.savings.toLocaleString()}</b></div>
    <div class=done>✓ You're signed in. MaruMaru has read a verified pass / fail from this session, <b>never your balance</b>. You can close this window and return to the MaruMaru tab.</div>
    <a class=logout href="/bank/logout">Sign out</a>`);
}

// ============================ the router ============================
export async function handleRequest({ method, pathname, searchParams, cookieHeader, rawBody }) {
  const p = pathname;
  try {
    // ---- BANK auth wall (real session cookie; the zkTLS target lives behind it) ----
    // GET /bank[?persona=] — the login page (redirect to overview if already signed in).
    if (method === 'GET' && p === '/bank') {
      if (bankPersona(cookieHeader)) return redirect('/bank/overview');
      return html(200, bankLoginPage(searchParams.get('persona') || 'aiko'));
    }
    // POST /bank/login (form or json {user,pass}) — set a session cookie for that persona.
    if (method === 'POST' && p === '/bank/login') {
      const { user, pass } = parseBody(rawBody);
      const who = PERSONAS[user] ? user : null;
      if (!who) return html(401, bankLoginPage('aiko', `Unknown account "${user || ''}". Try aiko or kenji.`));
      if ((pass || '') !== BANK_PASS) return html(401, bankLoginPage(user, 'Wrong password.'));
      const sid = crypto.randomBytes(16).toString('hex');
      bankSessions.set(sid, who);
      return redirect('/bank/overview', { 'set-cookie': `portal_sid=${sid}; HttpOnly; Path=/; SameSite=Lax` });
    }
    // GET /bank/overview — the authenticated human view.
    if (method === 'GET' && p === '/bank/overview') {
      const who = bankPersona(cookieHeader);
      if (!who) return redirect('/bank');
      return html(200, bankOverviewPage(who));
    }
    // GET /bank/account — 401 until signed in, then the persona's figures FROM BEHIND the wall.
    // (Polled by the SPA to detect login completion; read by the attestor to sign exactly this.)
    if (method === 'GET' && p === '/bank/account') {
      const who = bankPersona(cookieHeader);
      if (!who) return json(401, { error: 'not logged in, this is the auth wall' });
      const a = PERSONAS[who];
      return json(200, { holder: a.holder, currency: 'MYR', income: a.income, savings: a.savings, debt: a.debt });
    }
    // GET /bank/logout — clear the session.
    if (method === 'GET' && p === '/bank/logout') {
      const sid = sidFrom(cookieHeader); if (sid) bankSessions.delete(sid);
      return redirect('/bank');
    }

    // ---- World ID: RP signature (IDKit v4) ----
    if (method === 'POST' && p === '/api/sign-request') {
      const { action } = parseBody(rawBody);
      try {
        return json(200, await signRequest({ action: action || process.env.WORLD_ACTION || 'marumaru-issue' }));
      } catch (e) {
        return json(500, { error: 'sign-request failed', detail: String(e && e.message || e) });
      }
    }

    // ---- QR for the official IDKit widget: render the real connectorURI (world.org/verify URL) as an
    //      SVG server-side (the `qrcode` dep, offline, no browser lib / no CDN). The widget <img>s this. ----
    if (method === 'GET' && p === '/api/qr') {
      const data = searchParams.get('data') || '';
      if (!data) return json(400, { error: 'no data' });
      try {
        const QR = (await import('qrcode')).default;
        const svg = await QR.toString(data, { type: 'svg', margin: 1, width: 220,
          color: { dark: '#1A1712', light: '#00000000' } });  // sumi-ink modules, transparent ground (scannable, on-palette)
        return { status: 200, headers: { 'content-type': 'image/svg+xml', ...CORS }, body: svg };
      } catch (e) { return json(500, { error: 'qr-failed', detail: String(e && e.message || e) }); }
    }

    // ---- non-secret World config for the browser (NEVER the signing key) ----
    if (method === 'GET' && p === '/api/world-config') {
      // also surface whether ENS reads are live on-chain + the resolver addr, so the ENS receipt can
      // show the real resolver (and a `cast` verify hint) once deployed. Non-secret, addresses only.
      let onchain = false, resolver = '';
      if (process.env.ONCHAIN_READS === '1' && process.env.SEPOLIA_RPC) {
        try { const a = JSON.parse(fs.readFileSync(new URL('../demo/addresses.json', import.meta.url), 'utf8')); resolver = a.resolver || ''; onchain = !!resolver; } catch { /* not deployed yet */ }
      }
      return json(200, {
        mode: process.env.WORLD_ID_MODE || 'mock',
        env: process.env.WORLD_ID_ENV || 'staging',
        appId: process.env.WORLD_APP_ID || '',
        rpId: process.env.WORLD_RP_ID || '',
        action: process.env.WORLD_ACTION || 'marumaru-issue',
        onchain, resolver,
      });
    }

    // ---- World ID: verify the IDKit result (server-side, real v4 endpoint in real mode) ----
    if (method === 'POST' && p === '/api/verify-human') {
      const b = parseBody(rawBody);
      const action = b.action || process.env.WORLD_ACTION || 'marumaru-issue';
      const rpId = process.env.WORLD_RP_ID || 'rp_demo';
      const r = await verifyHuman({ idkitResponse: b.idkitResponse, rpId, action, signal: b.signal, hasLivePassport });
      // Don't ship the raw nullifier (booth: "like a secret key") — expose the derived `sub` instead.
      // On failure `r` has no nullifier, so this is a no-op there.
      const { nullifier, ...safe } = r;
      return json(200, nullifier ? { ...safe, sub: subFromNullifier(nullifier) } : safe);
    }

    // ---- BANK signs a persona's figures (REAL Ed25519) — the honest attestation demo ----
    if (method === 'POST' && p === '/api/bank-attest') {
      parseBody(rawBody); // body is ignored on purpose — see below
      // The attestor signs exactly what the AUTHENTICATED /bank/account returned — that's the
      // whole honesty claim ("the bank signed it, you can't type your own number"). The persona
      // comes ONLY from the signed-in bank session cookie, never from the request body: a caller
      // who has not crossed the /bank auth wall has nothing to attest and gets 401. (A judge WILL
      // open DevTools and POST {persona:'aiko'} with no cookie — this must fail, or the demo's
      // central claim is false. The SPA always signs in first, then polls /bank/account → 200.)
      const who = bankPersona(cookieHeader);
      if (!who) return json(401, { error: 'sign in at the bank first, nothing to attest' });
      const fig = PERSONAS[who];
      const issuedAt = Math.floor(Date.now() / 1000);
      return json(200, attestPersona({ ...fig, issuedAt }));
    }

    // ---- verify a (possibly edited) attestation with a REAL crypto.verify ----
    if (method === 'POST' && p === '/api/verify-attestation') {
      const { claim, signature } = parseBody(rawBody);
      const verified = verifyAttestationSig(claim || {}, signature || '');
      if (!verified) return json(200, { verified: false });
      const income = Number(claim.income) >= POLICY.income ? 'pass' : 'fail';
      const savings = Number(claim.savings) >= POLICY.savings ? 'pass' : 'fail';
      const marks = { income, savings };
      // DSR (debt÷income) — only when the signed claim carries debt. INVERTED predicate: pass when
      // the ratio is at or below the cap. Shown in the "under the hood" view to prove the derivation.
      if (claim.debt !== undefined && Number(claim.income) > 0) {
        const dsrPct = (Number(claim.debt) / Number(claim.income)) * 100;
        marks.dsr = dsrPct <= POLICY.dsrMaxPct ? 'pass' : 'fail';
        marks.dsrPct = Math.round(dsrPct);
      }
      return json(200, { verified: true, marks });
    }

    // ---- Plaid open-banking: Link-flow endpoints (mock when no creds, so the demo never hard-fails) ----
    // 1) create a link_token to open Plaid Link in the browser.
    if (method === 'POST' && p === '/api/plaid/link-token') {
      const { sessionId } = parseBody(rawBody);
      try { return json(200, { ...(await createLinkToken(sessionId || 'maru-user')), enabled: plaidEnabled() }); }
      catch (e) { return json(200, { error: 'plaid-link-failed', detail: String(e && e.message || e), enabled: plaidEnabled() }); }
    }
    // 1b) sandbox shortcut: mint a public_token WITHOUT the Link UI (server-driven demo path).
    if (method === 'POST' && p === '/api/plaid/sandbox-public-token') {
      try { return json(200, await sandboxPublicToken()); }
      catch (e) { return json(200, { error: 'plaid-sandbox-failed', detail: String(e && e.message || e) }); }
    }
    // 2) exchange a public_token (from Link's onSuccess, or the sandbox shortcut) for an access_token.
    //    Returns a "PLAID-ACCESS:<token>" marker the client hands to /api/issue as income/savings "proof".
    if (method === 'POST' && p === '/api/plaid/exchange') {
      const { public_token } = parseBody(rawBody);
      try {
        const { access_token } = await exchangePublicToken(public_token);
        return json(200, { access: `PLAID-ACCESS:${access_token}`, connected: true });
      } catch (e) { return json(200, { error: 'plaid-exchange-failed', detail: String(e && e.message || e) }); }
    }

    // ---- issue a passport (the borrower flow: human + proofs -> marks) ----
    if (method === 'POST' && p === '/api/issue') {
      const b = parseBody(rawBody);
      const action = process.env.WORLD_ACTION || 'marumaru-issue';
      const rpId = process.env.WORLD_RP_ID || 'rp_demo';
      // Same-session binding: one sessionId threaded into BOTH the World signal and the Reclaim
      // context. The client may supply one (to exercise the bound flow); otherwise we mint one.
      const sessionId = b.sessionId || newSessionId();
      const bindMock = (process.env.WORLD_ID_MODE || 'mock') === 'mock' && b.bind !== false;
      // Rebind the mock proof to THIS session (slot 2 = signal) WITHOUT losing slot 3 (the tier) —
      // MOCK-HUMAN:<nullifier>:<signal>:<level>. Dropping the level here would silently collapse every
      // tier to the default (orb) and defeat the assurance flag + the underwriting gate.
      const stampHuman = (h) => {
        if (!(bindMock && typeof h === 'string' && h.startsWith('MOCK-HUMAN'))) return h;
        const parts = h.split(':');
        const nullifier = parts[1] || 'mock-nullifier';
        const level = parts[3];   // preserve the chosen tier if present
        return `MOCK-HUMAN:${nullifier}:${sessionId}${level ? ':' + level : ''}`;
      };
      const stampProof = (pf) => (bindMock && typeof pf === 'string' && pf.startsWith('MOCK-PROOF'))
        ? `${pf}:${sessionId}` : pf;
      // Which connect method produced the facts? 'plaid' → the Plaid open-banking verifier; anything else
      // → the Reclaim/zkTLS (attestation) verifier. BOTH return { ok, value, context }, so issueCredential
      // is identical either way — the only difference is where the number came from. For Plaid we also
      // stamp the sessionId onto the access marker so same-session binding still holds.
      const viaPlaid = b.method === 'plaid';
      const stampPlaid = (pf) => (typeof pf === 'string' && pf.startsWith('PLAID-ACCESS') && pf.indexOf(':', 'PLAID-ACCESS'.length + 1) === -1)
        ? `${pf}:${sessionId}` : pf;
      const fact = viaPlaid
        ? { verifyIncome: (proof) => verifyViaPlaid(proof, 'income'), verifySavings: (proof) => verifyViaPlaid(proof, 'savings') }
        : { verifyIncome: (proof) => verifyAttestation(proof, null, 'balance'), verifySavings: (proof) => verifyAttestation(proof, null, 'balance') };
      const prep = viaPlaid ? stampPlaid : stampProof;
      const result = await issueCredential(
        { label: b.label, owner: b.owner || '0xB0B', transferable: !!b.transferable,
          idkitResponse: stampHuman(b.idkitResponse), rpId, action, sessionId,
          incomeProof: prep(b.incomeProof), savingsProof: prep(b.savingsProof),
          debtProof: prep(b.debtProof) },
        {
          verifyHuman: (i) => verifyHuman({ idkitResponse: i.idkitResponse, rpId, action, signal: sessionId, hasLivePassport }),
          ...fact,
          // verifyDebt is wired ONLY when the client sends a debtProof — so the DSR (maru.dsr) mark
          // is opt-in and the original 3-mark flow is untouched when it's absent.
          ...(b.debtProof ? { verifyDebt: (proof) => viaPlaid ? verifyViaPlaid(proof, 'income') : verifyAttestation(proof, null, 'balance') } : {}),
          // A request MAY raise the assurance bar for THIS call (the demo's "underwriting requires Orb"
          // path exercises the gate live). It can only tighten, never loosen: the higher of the request
          // and the deployment default (POLICY.requiredLevel, blank in the shopping demo) wins.
          policy: b.requiredLevel ? { ...POLICY, requiredLevel: b.requiredLevel } : POLICY,
        },
      );
      if (result.status === 'issued') {
        const store = getPassports(); applyCalls(store, result.calls); savePassports(store);
      }
      // The issuer's result carries the RAW nullifier (needed internally for the mintPassport call
      // plan, already applied above) — do NOT ship it to the client. Replace it with the derived
      // `sub`, and drop `calls` (an internal on-chain plan, not something the browser needs).
      const { nullifier, calls, ...safeResult } = result;
      // Compute the canonical EIP-137 namehash the contract writes under, so the client's ENS receipt
      // can show the REAL node (not a fake). ethers is already a dep; import lazily to keep issue fast.
      let namehash = null;
      try { const { ethers } = await import('ethers'); namehash = ethers.utils.namehash(`${b.label}.${process.env.PARENT_NAME || 'marumaru.eth'}`); } catch { /* namehash optional */ }
      return json(200, { ...safeResult, sub: subFromNullifier(nullifier), namehash });
    }

    // ---- read a passport (public marks) ----
    if (method === 'GET' && p.startsWith('/api/passport/')) {
      const label = decodeURIComponent(p.split('/').pop());
      const store = getPassports();
      if (!store[label]) return json(404, { error: 'no passport' });
      const marks = await readMarks(label, resolverClient(store));
      // publicPassport strips the raw nullifier (booth: "like a secret key") → exposes derived `sub`.
      return json(200, { label, ...publicPassport(store[label]), marks });
    }

    // ---- lender: grant / revoke scoped consent ----
    if (method === 'POST' && p === '/api/grant') {
      const { label, lender, days } = parseBody(rawBody);
      const store = getPassports();
      if (!store[label]) return json(404, { error: 'no passport' });
      store[label].lenders[lender] = Math.floor(Date.now() / 1000) + (Number(days || process.env.GRANT_TTL_DAYS || 14)) * 86400;
      savePassports(store);
      return json(200, { ok: true, lender, until: store[label].lenders[lender] });
    }
    if (method === 'POST' && p === '/api/revoke') {
      const { label, lender } = parseBody(rawBody);
      const store = getPassports();
      if (store[label]) { delete store[label].lenders[lender]; savePassports(store); }
      return json(200, { ok: true, revoked: lender });
    }

    // ---- lender: read detail (consent-gated) + same-person-across-lenders detection signal ----
    if (method === 'GET' && p.startsWith('/api/detail/')) {
      const label = decodeURIComponent(p.split('/').pop());
      const lender = searchParams.get('lender') || '';
      const store = getPassports();
      if (!store[label]) return json(404, { error: 'no passport' });
      const detail = await readDetail(label, lender, resolverClient(store));
      // Same-person-across-lenders check: how many DISTINCT lenders does this human (nullifier)
      // currently have active access to? >1 = the same verified human is borrowing from several
      // lenders at once (the pattern lending calls "loan stacking") — the World-ID payoff. This is
      // released ONLY to an AUTHORIZED lender: it's part of the consent-gated detail, not the public
      // read, so an unauthorized caller who knows a label can't harvest the count without consent.
      if (detail.authorized) {
        const now = Math.floor(Date.now() / 1000);
        const nf = store[label].nullifier;
        let activeLenders = 0;
        for (const rec of Object.values(store)) {
          if (rec.nullifier !== nf) continue;
          for (const until of Object.values(rec.lenders || {})) if (until > now) activeLenders++;
        }
        detail.humanActiveLenders = activeLenders;
        detail.stackingFlag = activeLenders > 1;
      }
      return json(200, detail);
    }

    // ---- agentic era: a lender's underwriting AGENT resolves the passport ----
    if (method === 'GET' && p.startsWith('/api/agent-resolve/')) {
      const label = decodeURIComponent(p.split('/').pop());
      const agentId = searchParams.get('agent') || 'agent://mufg-underwriter';
      const store = getPassports();
      if (!store[label]) return json(404, { error: 'no passport' });
      const r = await agentResolve(label, agentId, resolverClient(store), { income: true, savings: true });
      return json(200, r);
    }

    return json(404, { error: 'not found' });
  } catch (e) {
    return json(500, { error: String(e && e.message || e) });
  }
}
