
export async function agentResolve(label, agentId, client, requiredMarks = { income: true }) {
  // 1. consent gate — the borrower must have granted THIS agent (same ledger as a lender).
  const authorized = await client.isLenderAuthorized(label, agentId);
  const expired = await client.passportExpired(label);
  if (!authorized || expired) {
    return { resolved: false, decision: expired ? 'expired' : 'no-access', agentId };
  }

  // 2. resolve only the permitted marks (booleans — never raw figures).
  const keys = Object.keys(requiredMarks).filter((k) => requiredMarks[k]);
  const marks = {};
  const reasons = {};
  for (const k of keys) {
    const v = await client.text(label, 'maru.' + k);   // 'pass' | 'fail' | ''
    marks[k] = v;
    reasons[k] = v || 'missing';
  }

  // 3. decide from booleans alone. No numeric data ever enters this function.
  const allPass = keys.every((k) => marks[k] === 'pass');
  return {
    resolved: true,
    agentId,
    marks,
    reasons,
    decision: allPass ? 'approve' : 'decline',
    note: 'agent read machine-discoverable marks via ENS resolution; raw figures never disclosed',
  };
}
