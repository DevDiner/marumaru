function toNumber(raw) {
  if (raw === null || raw === undefined) return NaN;
  const cleaned = String(raw).replace(/[^0-9.]/g, ''); // strip currency symbols, commas, spaces
  if (cleaned === '' || cleaned === '.') return NaN;    // nothing numeric was present
  if ((cleaned.match(/\./g) || []).length > 1) return NaN; // "1.2.3" is not a single number
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

/// A value is usable only if toNumber produced a finite number.
function isUsable(n) { return Number.isFinite(n); }

export function predicate(value, threshold) {
  return Number(value) >= Number(threshold) ? 'pass' : 'fail';
}

/// Returns { ok, value, context } — `context` is the bound session id carried in
/// Reclaim's proof context (set via reclaimProofRequest.setContext(sessionId, ...)),
/// so the issuer can check it matches the World ID signal (same-session binding).
export async function verifyAttestation(proof, providerVersion, providerKey) {
  const mode = process.env.RECLAIM_MODE || 'mock';

  if (mode === 'mock') {
    // MOCK-PROOF:<value>[:context] — the optional 3rd field carries the bound session.
    if (typeof proof === 'string' && proof.startsWith('MOCK-PROOF:')) {
      const rest = proof.slice('MOCK-PROOF:'.length);
      const ctxIdx = rest.indexOf(':');
      const valuePart = ctxIdx === -1 ? rest : rest.slice(0, ctxIdx);
      const context = ctxIdx === -1 ? undefined : rest.slice(ctxIdx + 1);
      const value = toNumber(valuePart);
      // V5: a verified proof with an UNUSABLE value is not a pass-able attestation — surface it
      // as ok:false (→ issuer's graceful `proof-failed`), never a silent 0.
      if (!isUsable(value)) return { ok: false, reason: 'unparseable-value' };
      return { ok: true, value, context };
    }
    return { ok: false };
  }

  const { verifyProof } = await import('@reclaimprotocol/js-sdk');
  const { isVerified, data } = await verifyProof(proof, providerVersion);
  if (!isVerified) return { ok: false };
  const raw = data?.[0]?.extractedParameters?.[providerKey];
  const value = toNumber(raw);
  // context.contextAddress = the sessionId we bound via setContext.
  const ctx = data?.[0]?.context;
  const context = typeof ctx === 'string' ? (safeParse(ctx)?.contextAddress) : ctx?.contextAddress;
  // V5: verified-but-unusable (wrong providerKey, changed response shape, empty field) →
  // ok:false so the issuer takes the graceful proof-failed path, not a silent income=fail mint.
  if (!isUsable(value)) return { ok: false, reason: 'unparseable-value' };
  return { ok: true, value, context };
}

function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }
