// Same-session binding — ties the World ID proof and the Reclaim zkTLS bank proof
// to one issuance session

import crypto from 'node:crypto';

/// Server-generated per-issuance session id (also usable as the World signal).
export function newSessionId() {
  return crypto.randomBytes(16).toString('hex');
}

/// The value we put into Reclaim's context.contextAddress for a given session.
/// (Kept identity here so the demo's mock can compare directly; in production you
/// may hash it — just be consistent on both write and check.)
export function contextValueFor(sessionId) {
  return sessionId;
}

/// True iff the World ID signal AND the Reclaim context both equal the expected
/// session id — i.e. both proofs belong to the same bound issuance session.
export function sameSession({ worldSignal, reclaimContext, expected }) {
  if (!expected) return false;
  return worldSignal === expected && reclaimContext === contextValueFor(expected);
}
