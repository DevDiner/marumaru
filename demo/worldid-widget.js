// World ID v4 frontend — REAL IDKit flow (staging Simulator by default, production at the event),
// with an offline MOCK fallback so the demo never hard-fails.
//
// Real flow (verified against docs.world.org/world-id/idkit/integrate, Step 4):
//   1. POST /api/sign-request -> RP signature (server holds the signing key; never in the browser)
//   2. IDKit.request({ rp_context, allow_legacy_proofs, environment }).preset(orbLegacy({ signal }))
//   3. request.connectorURI  -> show as a QR / "open in World App or Simulator" link
//   4. await request.pollUntilCompletion()  -> the IDKit response
//   5. caller forwards the response to POST /api/verify-human (server verifies against World's v4 API)
//
// TIERED VERIFICATION: the borrower picks Orb / Passport / Selfie. We use the *Legacy* preset for
// each (orbLegacy / documentLegacy / selfieCheckLegacy) because ONLY the legacy presets bind our
// sessionId as the signal_hash — the pure-v4 presets (proofOfHuman/passport/selfieCheck) set
// signal_hash=0x0 and would NOT bind our session (which powers same-session bank-binding). All three
// are still a v4 integration (v4 SDK + v4 verify endpoint, allow_legacy_proofs:true).
// TIER MEANING (Selfie Check is BETA — we make NO uniqueness claim at that tier):
//   orb → uniqueness (one human, one passport) · passport → unique document (high) · selfie → basic liveness.
import { IDKit, orbLegacy, documentLegacy, selfieCheckLegacy } from '/vendor/idkit-core.js';

// method → the signal-binding legacy preset. Default 'orb'.
const PRESET = { orb: orbLegacy, passport: documentLegacy, selfie: selfieCheckLegacy };

window.MaruWorldID = (function () {
  let CFG = { mode: 'mock', env: 'staging', appId: '', rpId: '', action: 'marumaru-issue' };

  // The SPA calls this once on load with the server's non-secret /api/world-config.
  function configure(cfg) { CFG = { ...CFG, ...cfg }; }

  async function signRequest(action) {
    const r = await fetch('/api/sign-request', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    return r.json();
  }

  // Kick off a verification at a chosen assurance tier (method: 'orb' | 'passport' | 'selfie').
  //   mock  -> resolves immediately to { idkitResponse: "MOCK-HUMAN:<signal>:<signal>:<method>" }
  //            (offline, labeled; the 4th part carries the tier so the server flags it honestly).
  //   real  -> resolves to { connectorURI, done } where `done` is a promise for the IDKit response;
  //            the caller shows the QR/link from connectorURI, then `await done` and forwards it.
  async function requestProofOfHuman({ action = CFG.action, signal = 'human-1', humanId, method = 'orb', onConnect } = {}) {
    const preset = PRESET[method] || orbLegacy;   // unknown tier → safest (orb)
    const sig = await signRequest(action); // exercises the v4 RP-signature step in both modes

    if (CFG.mode !== 'real') {
      // MOCK-HUMAN:<nullifier>:<signal>:<level>.
      // The NULLIFIER (slot 1) is the HUMAN's identity and must be independent of the passport name —
      // exactly like a real World ID nullifier, which comes from the person's Orb proof, not their chosen
      // ENS label. So it derives from `humanId` (the persona being verified), NOT the signal/label. Tying
      // it to the label was a demo-only bug: renaming the passport minted a "new human" and defeated
      // one-live-passport-per-human. The SIGNAL (slot 2) stays the per-session binding value; the server
      // re-stamps it to its own sessionId anyway (see stampHuman in handlers.mjs). Slot 4 carries the tier.
      const nullifier = humanId || signal;   // fall back to signal only if no humanId supplied (back-compat)
      return { idkitResponse: `MOCK-HUMAN:${nullifier}:${signal}:${method}`, connectorURI: null, method };
    }

    // REAL: build the request, hand back the connect URL, and poll to completion.
    // Shape matches docs.world.org/world-id/idkit/integrate Step 4 EXACTLY: top-level app_id + action,
    // rp_context carries the RP signature as `signature` (+ nonce/created_at/expires_at), legacy preset.
    const request = await IDKit.request({
      app_id: CFG.appId,              // `app_id` from the Developer Portal
      action,                          // the action this proof is scoped to (uniqueness nullifier input)
      rp_context: {
        rp_id: CFG.rpId,               // `rp_id` from the Developer Portal
        nonce: sig.nonce,
        created_at: sig.created_at,
        expires_at: sig.expires_at,
        signature: sig.sig,            // the RP signature from /api/sign-request (docs field name: `signature`)
      },
      allow_legacy_proofs: true,
      environment: CFG.env,           // 'staging' (World Simulator, in-browser) | 'production' (World App)
    }).preset(preset({ signal }));    // the chosen tier's SIGNAL-BINDING legacy preset

    const connectorURI = request.connectorURI;
    if (typeof onConnect === 'function') onConnect(connectorURI);
    const done = request.pollUntilCompletion().then((response) => ({ idkitResponse: response, connectorURI, method }));
    return { connectorURI, done, method };
  }

  return { requestProofOfHuman, configure, get mode() { return CFG.mode; }, get env() { return CFG.env; } };
})();
