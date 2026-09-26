// World ID verification (IDKit v4). Two responsibilities:
//   1. signRequest({action})  — backend RP signature required before each request.
//   2. verifyHuman(...)        — forward the IDKit result AS-IS to the v4 verify
//      endpoint, then enforce ONE LIVE PASSPORT PER HUMAN OURSELVES, because the
//      Developer Portal validates cryptographic validity only — it does NOT track
//      nullifier reuse.
//
// "ONE LIVE PASSPORT PER HUMAN" (not "one ever") — matching MaruMaruRegistrar.sol: a human whose
// passport has LAPSED/been removed may verify + mint a fresh one. So the source of truth is passport
// LIVENESS, not a write-once ledger. Callers pass `hasLivePassport(nullifier)` (the demo reads the
// passport store); verifyHuman rejects only if a LIVE passport already exists for this human. This
// also makes verify idempotent — the step-1 personhood check and the step-3 issue can BOTH run for
// the same human without the first "using up" the nullifier (the real-mode double-verify bug).
// (Unit tests with no store injected fall back to a simple write-once ledger — see below.)
//
// Verified against docs.world.org/api-reference/developer-portal/verify (2026-09-23):
//   endpoint = POST https://developer.world.org/api/v4/verify/{rp_id}
//   request  = the IDKit result forwarded verbatim (no field remapping)
//   response = { success: true, results: [{ action, nullifier, created_at, environment, session_id }] }
//              → the nullifier is nested under results[0].nullifier (NOT top-level, NOT nullifier_hash;
//                that was the v3 name). Reading the wrong path silently breaks one-passport-per-human.
//
// The write-once fallback ledger lives behind app/store.mjs so the SAME code runs against JSON files
// locally and an in-memory object on Vercel (see app/store.mjs).
import { getNulls, saveNulls } from './store.mjs';

const loadNulls = getNulls;
export function _resetNullifiers() { saveNulls({}); }

/// Canonicalize whatever the IDKit result calls the credential into ONE of our tier strings.
/// World's v4 result carries the credential either as `verification_level` (native) or `identifier`
/// (the SDK normalizes "face" → "selfie", see idkit-core normalizeLegacyResponseIdentifier). We fold
/// every spelling into: 'orb' | 'passport' | 'selfie' | 'device'. Anything unrecognized → 'unknown'
/// (never silently treated as Orb — the tier gates real behavior, so an unknown must be visible).
/// TIER MEANING (load-bearing for the World prize + Selfie-Check Beta compliance):
///   orb      = Proof of Human — the ONLY tier that establishes uniqueness (one-human-one-passport).
///   passport = a unique government DOCUMENT (NFC), high assurance, not a uniqueness guarantee.
///   selfie   = Selfie Check (BETA) — liveness + face match, BASIC assurance, NO uniqueness claim.
/// Orb is enforced only at the underwriting/document-transfer action (policy.requiredLevel='orb');
/// shopping/pre-qualification accepts any tier and flags the assurance so the lender prices it.
export function canonicalLevel(x) {
  const s = String(x || '').toLowerCase();
  if (s === 'orb' || s === 'proof_of_human' || s === 'proofofhuman') return 'orb';
  if (s === 'passport' || s === 'document' || s === 'secure_document' || s === 'securedocument') return 'passport';
  if (s === 'selfie' || s === 'face' || s === 'selfie_check' || s === 'selfiecheck') return 'selfie';
  if (s === 'device') return 'device';
  return 'unknown';
}

/// Backend RP signature (IDKit v4) — docs.world.org Step 3.
/// IMPORTANT (packaging bug workaround): @worldcoin/idkit-core/signing pulls in @worldcoin/idkit-server,
/// whose ESM build has a broken esbuild `__require` shim ("Dynamic require of 'crypto' is not supported")
/// that throws under our ESM server. We load the SDK's CJS build via createRequire instead — there
/// `require` genuinely exists, so the shim never fires. Same official SDK, correct signature, no fork.
/// The SDK returns camelCase (createdAt/expiresAt); we remap to the snake_case (created_at/expires_at)
/// the browser's rp_context / IDKit.request expects.
import { createRequire } from 'node:module';
const _cjsRequire = createRequire(import.meta.url);
export async function signRequest({ action }) {
  if ((process.env.WORLD_ID_MODE || 'mock') === 'mock') {
    return { sig: '0xMOCK', nonce: 'mock-nonce', created_at: 0, expires_at: 0 };
  }
  const sr = _cjsRequire('@worldcoin/idkit-core/signing').signRequest;
  const s = await sr({ signingKeyHex: process.env.WORLD_RP_SIGNING_KEY, action });
  return { sig: s.sig, nonce: s.nonce, created_at: s.createdAt ?? s.created_at, expires_at: s.expiresAt ?? s.expires_at };
}

/// Verify a Proof-of-Human result and enforce ONE LIVE PASSPORT PER HUMAN.
/// `signal` is the bound session id (World signal) — echoed back so the issuer can
/// check same-session binding against the Reclaim context. Use a *legacy* preset in real
/// mode (orbLegacy/documentLegacy/selfieCheckLegacy) so the signal is actually bound —
/// pure-v4 (proofOfHuman/passport/selfieCheck) sets signal_hash=0x0 and would NOT bind it.
/// `hasLivePassport(nullifier) -> bool` (optional) is the liveness source of truth: the demo
/// passes one that scans the passport store, so a lapsed/removed passport frees the human to
/// re-mint (matching the contract). Reject ONLY if a LIVE passport already exists — this is
/// idempotent, so the step-1 personhood check and the step-3 issue can both run for the same
/// human. If NO liveness fn is provided (unit tests), fall back to a write-once nullifier ledger.
/// Returns { success, nullifier, signal, level } or { success:false, code }. `level` is the achieved
/// verification tier ('orb'|'passport'|'selfie'|'device'|'unknown') — the issuer flags it on the
/// passport and (optionally) enforces 'orb' at underwriting via policy.requiredLevel.
export async function verifyHuman({ idkitResponse, rpId, action, signal, hasLivePassport }) {
  const mode = process.env.WORLD_ID_MODE || 'mock';
  let nullifier;
  let boundSignal = signal;
  let level = 'orb';   // the achieved verification tier (canonicalLevel); overwritten by both paths below

  if (mode === 'mock') {
    if (typeof idkitResponse !== 'string' || !idkitResponse.startsWith('MOCK-HUMAN')) {
      return { success: false, code: 'invalid_mock' };
    }
    // MOCK-HUMAN[:nullifier[:signal[:level]]] — lets the demo carry the bound session AND the chosen
    // tier (orb|passport|selfie). Old 2-/3-part mock strings still parse; absent a 4th part → 'orb'.
    const parts = idkitResponse.split(':');
    nullifier = parts[1] || 'mock-nullifier';
    if (parts[2] !== undefined) boundSignal = parts[2];
    level = canonicalLevel(parts[3] || 'orb');
  } else {
    const res = await fetch(`https://developer.world.org/api/v4/verify/${rpId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(idkitResponse), // forward as-is; no remapping
    });
    if (!res.ok) return { success: false, code: 'verification_error' };
    const body = await res.json();
    if (!body.success) return { success: false, code: body.code || 'failed' };
    // v4 nests the nullifier under results[]; take the Proof-of-Human result (fall back to the
    // first). Guard against a shape change so a missing nullifier fails CLOSED (never mints a
    // passport keyed to "undefined") instead of silently collapsing every human onto one key.
    const results = Array.isArray(body.results) ? body.results : [];
    const poh = results.find((r) => r && (r.identifier === 'proof_of_human' || r.nullifier)) || results[0];
    nullifier = poh && poh.nullifier;
    if (!nullifier) return { success: false, code: 'missing_nullifier' };
    // Capture the achieved tier. World's result names it `verification_level` (native) or `identifier`
    // (SDK-normalized); take whichever is present and fold to our canonical set. Never assume 'orb'
    // in real mode — an unrecognized value surfaces as 'unknown' so the assurance flag stays honest.
    level = canonicalLevel(poh.verification_level || poh.identifier);
    // In real mode the caller must have asserted signal_hash === keccak256(signal)
    // on the IDKit result BEFORE forwarding (the portal doesn't echo signal_hash).
  }

  // ONE LIVE PASSPORT PER HUMAN.
  if (typeof hasLivePassport === 'function') {
    // Liveness path (the demo): reject only if this human ALREADY holds a live passport. No write
    // here — the passport store is the source of truth, so verify is idempotent and self-healing
    // (an expired/removed passport frees the human). Recording happens when the passport is minted.
    if (await hasLivePassport(nullifier)) return { success: false, code: 'nullifier_already_used' };
  } else {
    // Fallback (unit tests with no store): a simple write-once (action, nullifier) ledger.
    const store = loadNulls();
    const key = `${action}:${nullifier}`;
    if (store[key]) return { success: false, code: 'nullifier_already_used' };
    store[key] = Date.now();
    saveNulls(store);
  }
  return { success: true, nullifier, signal: boundSignal, level };
}
