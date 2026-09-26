// reclaim_real_test.mjs — land ONE real zkTLS proof, end to end, to prove the
// "real Reclaim" path works before the event. Run THIS WEEK on your own machine.
//
// It does exactly what the demo does in real mode, in isolation, so you can confirm
// (a) a real proof generates, (b) our verifyAttestation() reads the value, (c) the
// same-session binding (context) round-trips — before you flip the whole demo.
//
// SETUP (one-time):
//   1. Create an app at https://dev.reclaimprotocol.org  ->  APP_ID + APP_SECRET
//   2. Pick a PROVIDER_ID. Reliable options (see THE_GUIDE.md §3 Phase 6.3):
//        - Reclaim TEST provider  ff4d7afe-4b78-4795-9429-d20df2deaad7  (proves mechanism)
//        - Binance KYC Level      2b22db5c...                          (a real financial number)
//      (EPF/KWSP has NO provider + is Cloudflare-hard — production target, not demo.)
//   3. npm install @reclaimprotocol/js-sdk
//   4. export RECLAIM_APP_ID=... RECLAIM_APP_SECRET=... RECLAIM_PROVIDER_ID=... RECLAIM_PROVIDER_KEY=<the extractedParameters key>
//   5. node scripts/reclaim_real_test.mjs   ->  scan the printed QR / open the URL, log in, watch the proof verify.
import 'dotenv/config';
import { newSessionId, contextValueFor } from '../app/binding.mjs';

const { RECLAIM_APP_ID, RECLAIM_APP_SECRET, RECLAIM_PROVIDER_ID, RECLAIM_PROVIDER_KEY } = process.env;

async function main() {
  if (!RECLAIM_APP_ID || !RECLAIM_APP_SECRET || !RECLAIM_PROVIDER_ID) {
    console.error('Set RECLAIM_APP_ID, RECLAIM_APP_SECRET, RECLAIM_PROVIDER_ID (+ optionally RECLAIM_PROVIDER_KEY). See header.');
    process.exit(1);
  }
  const { ReclaimProofRequest, verifyProof } = await import('@reclaimprotocol/js-sdk');

  // 1. init + bind this issuance to a session id (same value we'd put in the World signal)
  const sessionId = newSessionId();
  const req = await ReclaimProofRequest.init(RECLAIM_APP_ID, RECLAIM_APP_SECRET, RECLAIM_PROVIDER_ID);
  req.setContext(contextValueFor(sessionId), 'marumaru-bank-session'); // <- the binding
  console.log('sessionId (bind value):', sessionId);

  // 2. get the URL the borrower opens (scan QR or paste in a browser)
  const url = await req.getRequestUrl();
  console.log('\nOPEN THIS TO GENERATE THE PROOF:\n', url, '\n');

  // 3. wait for the proof, then verify it server-side + read the value + check the binding
  await req.startSession({
    onSuccess: async (proofs) => {
      const proof = Array.isArray(proofs) ? proofs[0] : proofs;
      const { isVerified, data } = await verifyProof(proof, req.getProviderVersion());
      console.log('\n=== RESULT ===');
      console.log('isVerified:', isVerified);
      if (isVerified) {
        const params = data[0].extractedParameters || {};
        console.log('extractedParameters:', params);
        const key = RECLAIM_PROVIDER_KEY || Object.keys(params)[0];
        console.log(`value @ "${key}":`, params[key], '(set RECLAIM_PROVIDER_KEY to this in your .env for the demo)');
        const boundBack = data[0].context?.contextAddress;
        console.log('binding round-trip:', boundBack === contextValueFor(sessionId) ? 'OK ✅ (context == sessionId)' : `MISMATCH (${boundBack})`);
        console.log('\n✅ Real Reclaim path works. Flip demo: RECLAIM_MODE=real + these creds + RECLAIM_PROVIDER_KEY.');
      } else {
        console.log('❌ proof did not verify — check provider/creds.');
      }
      process.exit(0);
    },
    onError: (e) => { console.error('proof error:', e); process.exit(1); },
  });
  console.log('waiting for you to complete the flow in the browser...');
}
main().catch((e) => { console.error(e); process.exit(1); });
