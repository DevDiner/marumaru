import { getNulls, saveNulls } from './store.mjs';

const loadNulls = getNulls;
export function _resetNullifiers() {  saveNulls({}); }


export function canonicalLevel(x) {
  const s = String(x || '').toLowerCase();
  if (s === 'orb' || s === 'proof_of_human' || s === 'proofofhuman') return 'orb';
  if (s === 'passport' || s === 'document' || s === 'secure_document' || s === 'securedocument') return 'passport';
  if (s === 'selfie' || s === 'face' || s === 'selfie_check' || s === 'selfiecheck') return 'selfie';
  if (s === 'device') return 'device';
  return 'unknown';
}

/// Backend RP signature (IDKit v4). Real mode uses @worldcoin/idkit-core/signing.
export async function signRequest({ action }) {
  if ((process.env.WORLD_ID_MODE || 'mock') === 'mock') {
    return { sig: '0xMOCK', nonce: 'mock-nonce', created_at: 0, expires_at: 0 };
  }
  const { signRequest: sr } = await import('@worldcoin/idkit-core/signing');
  return sr({ signingKeyHex: process.env.WORLD_RP_SIGNING_KEY, action });
}

export async function verifyHuman({ idkitResponse, rpId, action, signal, hasLivePassport }) {
  const mode = process.env.WORLD_ID_MODE || 'mock';
  let nullifier;
  let boundSignal = signal;
  let level = 'orb';   // the achieved verification tier (canonicalLevel); overwritten by both paths below

  if (mode === 'mock') {
    if (typeof idkitResponse !== 'string' || !idkitResponse.startsWith('MOCK-HUMAN')) {
      return { success: false, code: 'invalid_mock' };
    }
    // MOCK-HUMAN[:nullifier[:signal[:level]]] lets the demo carry the bound session and the chosen
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
    const results = Array.isArray(body.results) ? body.results : [];
    const poh = results.find((r) => r && (r.identifier === 'proof_of_human' || r.nullifier)) || results[0];
    nullifier = poh && poh.nullifier;
    if (!nullifier) return { success: false, code: 'missing_nullifier' };
    level = canonicalLevel(poh.verification_level || poh.identifier);
      }

  // ONE LIVE PASSPORT PER HUMAN.
  if (typeof hasLivePassport === 'function') {
    
    if (await hasLivePassport(nullifier)) return { success: false, code: 'nullifier_already_used' };
  } else {
    // Fallback (unit tests with no store): a simple write-once (action, nullifier) ledger.
    const store = await loadNulls();
    const key = `${action}:${nullifier}`;
    if (store[key]) return { success: false, code: 'nullifier_already_used' };
    store[key] = Date.now();
    await saveNulls(store);
  }
  return { success: true, nullifier, signal: boundSignal, level };
}
