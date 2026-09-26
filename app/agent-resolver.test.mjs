import { test } from 'node:test';
import assert from 'node:assert';
import { agentResolve } from './agent-resolver.mjs';

// A lender's underwriting AGENT is the consumer here (not the borrower). It resolves the
// ENS passport and reads only the marks it's permitted to see — it can't read a PDF, but
// it CAN resolve a name + read booleans. The human stays the subject; the agent verifies.
const client = {
  text: async (_l, key) => ({ 'maru.income':'pass','maru.savings':'pass','maru.human':'verified' }[key] || ''),
  isLenderAuthorized: async (_l, who) => who === 'agent://mufg-underwriter',
  passportExpired: async () => false,
};

test('authorized agent resolves the name and gets an underwriting decision', async () => {
  const r = await agentResolve('aiko', 'agent://mufg-underwriter', client, { income:true, savings:true });
  assert.equal(r.resolved, true);
  assert.equal(r.decision, 'approve');       // both required marks pass
  assert.deepEqual(r.reasons, { income:'pass', savings:'pass' });
});

test('the agent NEVER receives the raw figure — only marks', async () => {
  const r = await agentResolve('aiko', 'agent://mufg-underwriter', client, { income:true });
  // the returned object must not carry any numeric income/balance anywhere
  const blob = JSON.stringify(r).toLowerCase();
  assert.ok(!/\d{4,}/.test(blob), 'no raw multi-digit figure should appear');
  assert.equal('income' in (r.marks||{}), true);
  assert.equal(r.marks.income, 'pass');
});

test('unauthorized agent cannot resolve the marks (consent-gated)', async () => {
  const r = await agentResolve('aiko', 'agent://rogue', client, { income:true });
  assert.equal(r.resolved, false);
  assert.equal(r.decision, 'no-access');
});

test('missing a required mark -> decline, still no raw data', async () => {
  const failClient = { ...client, text: async (_l,k)=>({ 'maru.income':'fail','maru.savings':'pass','maru.human':'verified' }[k]||'') };
  const r = await agentResolve('aiko', 'agent://mufg-underwriter', failClient, { income:true, savings:true });
  assert.equal(r.decision, 'decline');
  assert.equal(r.reasons.income, 'fail');
});
