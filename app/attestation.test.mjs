import { test } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { signAttestation, verifyAttestationSig, attestPersona, bankPublicKeyPem } from './attestation.mjs';

// This is the "how do we prove the attested mark can't be forged" test. It exercises the REAL
// Ed25519 property the demo shows live: a signature is over the value, so any edit breaks it.

const CLAIM = { holder: 'AIKO TANAKA', income: 12000, savings: 62500, issuedAt: 1_700_000_000 };

test('a clean attestation verifies (the honest happy path)', () => {
  const { claim, signature } = signAttestation(CLAIM);
  assert.equal(verifyAttestationSig(claim, signature), true);
});

test('tampering the income makes verification FAIL (the forgery is caught)', () => {
  const { signature } = signAttestation(CLAIM);
  const forged = { ...CLAIM, income: 50000 }; // the attacker edits the number...
  assert.equal(verifyAttestationSig(forged, signature), false); // ...but the signature no longer matches
});

test('tampering ANY field fails (holder / savings / issuedAt)', () => {
  const { signature } = signAttestation(CLAIM);
  assert.equal(verifyAttestationSig({ ...CLAIM, holder: 'MALLORY' }, signature), false);
  assert.equal(verifyAttestationSig({ ...CLAIM, savings: 999999 }, signature), false);
  assert.equal(verifyAttestationSig({ ...CLAIM, issuedAt: 1 }, signature), false);
});

test('a signature from a DIFFERENT key does not verify against the bank key', () => {
  const other = crypto.generateKeyPairSync('ed25519');
  const forgedSig = crypto.sign(null, Buffer.from(JSON.stringify({
    holder: CLAIM.holder, income: CLAIM.income, savings: CLAIM.savings, issuedAt: CLAIM.issuedAt,
  })), other.privateKey).toString('base64');
  // right bytes, WRONG signer → rejected against the stub bank's real public key
  assert.equal(verifyAttestationSig(CLAIM, forgedSig), false);
});

test('a malformed signature is rejected, not thrown', () => {
  assert.equal(verifyAttestationSig(CLAIM, 'not-a-real-signature'), false);
});

test('attestPersona produces a verifiable attestation + exposes the bank pubkey', () => {
  const { claim, signature, bankPubKey } = attestPersona(CLAIM);
  assert.equal(verifyAttestationSig(claim, signature), true);
  assert.ok(bankPubKey.includes('BEGIN PUBLIC KEY'));
  assert.equal(bankPublicKeyPem(), bankPubKey); // stable within the process
});
