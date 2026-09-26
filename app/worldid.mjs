// Backend World ID signing and verification.
// Browser IDKit code belongs in demo/worldid-widget.js.

import { createRequire } from 'node:module';
import { getNulls, saveNulls } from './store.mjs';

const cjsRequire = createRequire(import.meta.url);

export function _resetNullifiers() {
  saveNulls({});
}

export function canonicalLevel(value) {
  const s = String(value || '').toLowerCase();

  if (['orb', 'proof_of_human', 'proofofhuman'].includes(s)) {
    return 'orb';
  }

  if (
    ['passport', 'document', 'secure_document', 'securedocument'].includes(s)
  ) {
    return 'passport';
  }

  if (['selfie', 'face', 'selfie_check', 'selfiecheck'].includes(s)) {
    return 'selfie';
  }

  if (s === 'device') return 'device';

  return 'unknown';
}

export async function signRequest({ action }) {
  if ((process.env.WORLD_ID_MODE || 'mock') === 'mock') {
    return {
      sig: '0xMOCK',
      nonce: 'mock-nonce',
      created_at: 0,
      expires_at: 0,
    };
  }

  if (!process.env.WORLD_RP_SIGNING_KEY) {
    throw new Error('WORLD_RP_SIGNING_KEY is missing on the backend.');
  }

  const { signRequest: sdkSignRequest } =
    cjsRequire('@worldcoin/idkit-core/signing');

  const signed = await sdkSignRequest({
    signingKeyHex: process.env.WORLD_RP_SIGNING_KEY,
    action,
  });

  return {
    sig: signed.sig,
    nonce: signed.nonce,
    created_at: signed.createdAt ?? signed.created_at,
    expires_at: signed.expiresAt ?? signed.expires_at,
  };
}

// Restores the verification behavior from your previously pasted backend.
// Real-mode session binding must be checked by the calling backend code;
// returning `signal` here is not itself cryptographic binding verification.
export async function verifyHuman({
  idkitResponse,
  rpId,
  action,
  signal,
  hasLivePassport,
}) {
  const mode = process.env.WORLD_ID_MODE || 'mock';

  let nullifier;
  let boundSignal = signal;
  let level;

  if (mode === 'mock') {
    if (
      typeof idkitResponse !== 'string' ||
      !idkitResponse.startsWith('MOCK-HUMAN')
    ) {
      return { success: false, code: 'invalid_mock' };
    }

    const parts = idkitResponse.split(':');

    nullifier = parts[1] || 'mock-nullifier';

    if (parts[2] !== undefined) {
      boundSignal = parts[2];
    }

    level = canonicalLevel(parts[3] || 'orb');
  } else {
    const response = await fetch(
      `https://developer.world.org/api/v4/verify/${rpId}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(idkitResponse),
      },
    );

    if (!response.ok) {
      return { success: false, code: 'verification_error' };
    }

    const body = await response.json();

    if (!body.success) {
      return {
        success: false,
        code: body.code || 'failed',
      };
    }

    const results = Array.isArray(body.results) ? body.results : [];

    const result =
      results.find(
        (r) => r && (r.identifier === 'proof_of_human' || r.nullifier),
      ) || results[0];

    nullifier = result?.nullifier;

    if (!nullifier) {
      return { success: false, code: 'missing_nullifier' };
    }

    level = canonicalLevel(
      result.verification_level || result.identifier,
    );
  }

  if (typeof hasLivePassport === 'function') {
    if (await hasLivePassport(nullifier)) {
      return { success: false, code: 'nullifier_already_used' };
    }
  } else {
    const store = getNulls();
    const key = `${action}:${nullifier}`;

    if (store[key]) {
      return { success: false, code: 'nullifier_already_used' };
    }

    store[key] = Date.now();
    saveNulls(store);
  }

  return {
    success: true,
    nullifier,
    signal: boundSignal,
    level,
  };
}
