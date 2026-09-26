// Credential issuer — the orchestration that ties World ID + Reclaim + registrar.
//
// Outcomes (the World "meaningful alternative path" requirement lives here):
//   - issued       : human OK + proofs OK  -> mint + writeMarks planned
//   - ineligible   : no Proof-of-Human      -> graceful "can't issue lender-grade passport"
//   - rejected     : human already has a passport (nullifier reused) -> one-per-human
//   - proof-failed : a zkTLS attestation didn't verify
import { predicate } from './reclaim.mjs';
import { sameSession } from './binding.mjs';

export async function issueCredential(input, deps) {
  const { label, owner, transferable = false, incomeProof, savingsProof, debtProof, sessionId, allowUnbound = false } = input;
  const { verifyHuman, verifyIncome, verifySavings, verifyDebt, policy } = deps;

  // 1. Personhood gate (World ID). Any accepted tier (Orb/Passport/Selfie) proves a live human;
  //    `human.level` is which tier they achieved (see app/worldid.mjs canonicalLevel).
  const human = await verifyHuman(input);
  if (!human.success) {
    if (human.code === 'nullifier_already_used') {
      return { status: 'rejected', reason: 'already-has-passport', calls: [] };
    }
    return { status: 'ineligible', reason: 'no-poh', calls: [] };
  }
  const level = human.level || 'orb';   // effective assurance tier (undefined only from bare test mocks → orb)

  // 1b. Assurance gate — the "Orb strictly enforced at underwriting" rule, wired but OFF by default.
  //     policy.requiredLevel is a MINIMUM tier: 'orb' accepts only Orb; 'passport' accepts Passport-or-
  //     Orb; unset (the demo/shopping default) accepts any tier.
  if (policy && policy.requiredLevel) {
    const RANK = { unknown: 0, device: 1, selfie: 2, passport: 3, orb: 4 };
    if ((RANK[level] ?? 0) < (RANK[policy.requiredLevel] ?? 99)) {
      return { status: 'insufficient-assurance', reason: `requires-${policy.requiredLevel}`, level, calls: [] };
    }
  }

  // 2. zkTLS-attested facts. `verifyDebt` is OPTIONAL — supplied only when the deployment adds the
  //    debt-service-ratio mark (maru.dsr). Absent it, issuance is exactly the original 3-mark flow.
  const inc = await verifyIncome(incomeProof);
  const sav = await verifySavings(savingsProof);
  if (!inc.ok || !sav.ok) {
    return { status: 'proof-failed', calls: [] };
  }
  const debt = verifyDebt ? await verifyDebt(debtProof) : null;
  if (verifyDebt && !debt.ok) {
    return { status: 'proof-failed', calls: [] };
  }

  // 2b. Same-session binding: the human who verified (World signal) must be the one who held
  // the bank session (Reclaim context). Blocks a replayed/borrowed proof 
  if (!allowUnbound) {
    if (!sessionId) return { status: 'binding-failed', reason: 'missing-session', calls: [] };
    let bound = sameSession({ worldSignal: human.signal, reclaimContext: inc.context, expected: sessionId })
      && sameSession({ worldSignal: human.signal, reclaimContext: sav.context, expected: sessionId });
    if (debt) bound = bound && sameSession({ worldSignal: human.signal, reclaimContext: debt.context, expected: sessionId });
    if (!bound) return { status: 'binding-failed', reason: 'session-mismatch', calls: [] };
  }

  // 3. Reduce to privacy-preserving marks
  const marks = {
    income: predicate(inc.value, policy.income),
    savings: predicate(sav.value, policy.savings),
    human: 'verified',
    assurance: level,
  };

  const ttlSecs = Number(process.env.CREDENTIAL_TTL_DAYS || 30) * 86400;
  const expiry = Math.floor(Date.now() / 1000) + ttlSecs;

  const calls = [
    { fn: 'mintPassport', args: [label, owner, human.nullifier, transferable] },
    { fn: 'writeMark', args: [label, 'Income', marks.income, expiry] },
    { fn: 'writeMark', args: [label, 'Savings', marks.savings, expiry] },
    { fn: 'writeMark', args: [label, 'Human', marks.human, expiry] },
    { fn: 'writeMark', args: [label, 'Assurance', marks.assurance, expiry] },
  ];

  
  if (debt) {
    const income = Number(inc.value);
    const dsrPct = income > 0 ? (Number(debt.value) / income) * 100 : Infinity;
    const dsrCap = Number(policy.dsrMaxPct ?? 40);          // e.g. debt must be <= 40% of income
    marks.dsr = dsrPct <= dsrCap ? 'pass' : 'fail';         // INVERTED: low ratio = pass
    marks.dsrPct = Math.round(dsrPct);                       // for the demo's under-the-hood view (never a public mark)
    calls.push({ fn: 'writeMark', args: [label, 'Dsr', marks.dsr, expiry] });
  }

  
  if (Array.isArray(policy.incomeBandMultiples) && policy.incomeBandMultiples.length && policy.income > 0) {
    marks.incomeBand = bandLabel(Number(inc.value) / Number(policy.income), policy.incomeBandMultiples);
    calls.push({ fn: 'writeMark', args: [label, 'IncomeBand', marks.incomeBand, expiry] });
  }

  return { status: 'issued', nullifier: human.nullifier, level, marks, expiry, calls };
}

/// Map a ratio (income ÷ floor) to a coarse, human-readable band label from ascending edges.
/// edges [1, 1.5, 2] → "<1x" | "1-1.5x" | "1.5-2x" | "2x+"
export function bandLabel(ratio, edges) {
  if (ratio < edges[0]) return `<${edges[0]}x`;
  for (let i = 0; i < edges.length - 1; i++) {
    if (ratio < edges[i + 1]) return `${edges[i]}-${edges[i + 1]}x`;
  }
  return `${edges[edges.length - 1]}x+`;
}
