// ENS gateway — reads the passport from ENS and enforces:
//   readMarks(label)          -> the PUBLIC 〇/✕ booleans (anyone can read on-chain text)
//   readDetail(label, lender) -> fuller attestation detail, released ONLY if the
//                                on-chain consent ledger authorizes this lender AND
//                                the passport hasn't expired.
//


export async function readMarks(label, client) {
  const [income, savings, human, dsr, incomeBand, assurance] = await Promise.all([
    client.text(label, 'maru.income'),
    client.text(label, 'maru.savings'),
    client.text(label, 'maru.human'),
    client.text(label, 'maru.dsr'),          // debt-service ratio mark (may be '' if this passport predates it)
    client.text(label, 'maru.income_band'),  // coarse income band (may be '' if not issued)
    client.text(label, 'maru.assurance'),    // World tier: orb|passport|selfie (may be '' on older passports)
  ]);
  // Start from the always-present three; add the optional marks only when set, so older passports
  // (3-mark, or 4-mark without a band) 
  const marks = { income, savings, human };
  if (dsr) marks.dsr = dsr;
  if (incomeBand) marks.incomeBand = incomeBand;
  if (assurance) marks.assurance = assurance;
  return marks;
}

export async function readDetail(label, lender, client) {
  const authorized = await client.isLenderAuthorized(label, lender);
  const expired = await client.passportExpired(label);
  if (!authorized || expired) return { authorized: false, expired };
  const marks = await readMarks(label, client);
  // What a CONSENTED lender gets that a public reader does NOT: the attestation provenance
  // needed to independently trust the mark — the attestor identity, the proof reference, and
  // freshness — WITHOUT the raw figure. The public path (readMarks) returns only pass/fail
  const provenance = (await client.attestationMeta?.(label)) ?? {};
  return {
    authorized: true,
    marks,
    provenance: {
      attestor: provenance.attestor ?? 'reclaim-protocol',
      proofRef: provenance.proofRef ?? null,      // Reclaim signedClaim identifier (not the data)
      attestedAt: provenance.attestedAt ?? null,  // freshness of the underlying web proof
      expiry: provenance.expiry ?? null,
    },
    source: 'zktls-attested',
    note: 'point-in-time proof; economic-trust attestor (Reclaim); not final-underwriting KYC. Raw figures are never released — consent grants verifiability, not the number.',
  };
}
