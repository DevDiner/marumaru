// Real Ed25519 attestation
import crypto from 'node:crypto';


function loadKeypair() {
  const b64 = process.env.ATTESTOR_KEY_B64;
  if (b64) {
    const pem = Buffer.from(b64, 'base64').toString('utf8');
    const privateKey = crypto.createPrivateKey(pem);
    const publicKey = crypto.createPublicKey(privateKey); // derive the matching public key
    return { publicKey, privateKey };
  }
  
  if (process.env.VERCEL) {
    console.warn('[MaruMaru] ⚠ ATTESTOR_KEY_B64 is NOT set on Vercel — a fresh Ed25519 key is generated ' +
      'per cold start, so attestation sign/verify can FAIL across instances. Set it (npm run gen:attestor-key ' +
      '→ add as a Production env var). See THE_GUIDE §9.');
  }
  return crypto.generateKeyPairSync('ed25519');
}
const { publicKey, privateKey } = loadKeypair();

/// The stub bank's public key (SPKI PEM) — a verifier uses this to check signatures.
export function bankPublicKeyPem() {
  return publicKey.export({ type: 'spki', format: 'pem' }).toString();
}


function claimBytes(claim) {
  const ordered = {
    holder: claim.holder,
    income: claim.income,
    savings: claim.savings,
    issuedAt: claim.issuedAt,
    debt: claim.debt,   // monthly debt obligations, when the bank attests it (for the DSR mark)
  };
  return Buffer.from(JSON.stringify(ordered), 'utf8');
}

/// The stub bank signs a claim about a holder's figures. Returns the claim + a real signature.
/// (Ed25519 in Node uses the one-shot sign(null, data, key) form )
export function signAttestation(claim) {
  const signature = crypto.sign(null, claimBytes(claim), privateKey).toString('base64');
  return { claim, signature, bankPubKey: bankPublicKeyPem() };
}

/// Verify a claim against a signature. Returns TRUE only if the signature was produced by the
/// stub bank over EXACTLY these claim bytes. Edit any field of `claim` → the bytes change → this
/// returns FALSE. Optionally verify against a supplied pubKey (defaults to the stub bank's).
export function verifyAttestationSig(claim, signatureB64, pubKeyPem) {
  try {
    const key = pubKeyPem ? crypto.createPublicKey(pubKeyPem) : publicKey;
    return crypto.verify(null, claimBytes(claim), key, Buffer.from(signatureB64, 'base64'));
  } catch {
    return false; // malformed signature / key → not verified (never throw to the caller)
  }
}

/// Convenience for the server: sign a persona's figures as a fresh attestation.
/// issuedAt is passed in (callers stamp the time) so this stays pure/testable.
/// `debt` (monthly obligations) is optional — included in the signed claim only when the persona
/// carries it, so the DSR mark is derived from a bank-signed figure like every other fact.
export function attestPersona({ holder, income, savings, debt, issuedAt }) {
  return signAttestation({ holder, income, savings, debt, issuedAt });
}
