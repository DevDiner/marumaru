// demo/worldid-widget.js
// World ID frontend: obtain a server-signed request, launch IDKit,
// then return the proof to the caller for backend verification.
//
// Configuration is supplied through MaruWorldID.configure(...).
// The RP signing key stays on the server.

import {
  IDKit,
  orbLegacy,
  documentLegacy,
  selfieCheckLegacy,
} from '/vendor/idkit-core.js';

const PRESET = {
  orb: orbLegacy,
  passport: documentLegacy,
  selfie: selfieCheckLegacy,
};

window.MaruWorldID = (function () {
  let CFG = {
    mode: 'mock',
    env: 'staging',
    appId: '',
    rpId: '',
    action: 'marumaru-issue',
  };

  function configure(cfg) {
    CFG = { ...CFG, ...cfg };
  }

  // Read the response as text first: hosting errors may not be JSON.
  async function signRequest(action) {
    let response;

    try {
      response = await fetch('/api/sign-request', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({ action }),
      });
    } catch {
      throw new Error(
        'Could not reach /api/sign-request. Check that the backend is running and reachable.',
      );
    }

    const raw = await response.text();
    const preview = raw.replace(/\s+/g, ' ').trim().slice(0, 400);

    if (!response.ok) {
      throw new Error(
        `/api/sign-request failed (HTTP ${response.status}): ` +
          (preview || 'Empty response. Check the backend logs.'),
      );
    }

    let data;

    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(
        `/api/sign-request returned non-JSON (HTTP ${response.status}): ` +
          (preview || 'Empty response.'),
      );
    }

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error(
        '/api/sign-request returned an invalid response object.',
      );
    }

    if (data.success === false || data.error) {
      const message =
        typeof data.error === 'string'
          ? data.error
          : data.error?.message || data.message || data.code;

      throw new Error(
        `/api/sign-request rejected the request: ${
          message || 'Check the backend logs.'
        }`,
      );
    }

    if (
      typeof data.sig !== 'string' ||
      !data.sig ||
      typeof data.nonce !== 'string' ||
      !data.nonce ||
      data.created_at == null ||
      data.expires_at == null
    ) {
      throw new Error(
        '/api/sign-request is missing sig, nonce, created_at, or expires_at.',
      );
    }

    return data;
  }

  async function requestProofOfHuman({
    action = CFG.action,
    signal = 'human-1',
    humanId,
    method = 'orb',
    onConnect,
  } = {}) {
    const selectedMethod = Object.prototype.hasOwnProperty.call(
      PRESET,
      method,
    )
      ? method
      : 'orb';

    const preset = PRESET[selectedMethod];

    if (CFG.mode !== 'mock' && CFG.mode !== 'real') {
      throw new Error(
        `Invalid World ID mode "${CFG.mode}". Expected "mock" or "real".`,
      );
    }

    if (CFG.mode === 'real') {
      if (!CFG.appId || !CFG.rpId) {
        throw new Error(
          'World ID configuration is missing appId or rpId. Check /api/world-config and the server environment variables.',
        );
      }

      if (CFG.env !== 'staging' && CFG.env !== 'production') {
        throw new Error(
          `Invalid World ID environment "${CFG.env}". Expected "staging" or "production".`,
        );
      }

      if (typeof signal !== 'string' || !signal.trim()) {
        throw new Error(
          'A non-empty issuance-session signal is required.',
        );
      }
    }

    // Preserve the existing behavior: exercise the backend signing
    // endpoint in both modes. Real failures do not fall back to mock.
    const sig = await signRequest(action);

    if (CFG.mode === 'mock') {
      // Use a stable mock persona identifier when supplied.
      // The signal remains the separate issuance-session binding.
      const nullifier = humanId || signal;

      return {
        idkitResponse:
          `MOCK-HUMAN:${nullifier}:${signal}:${selectedMethod}`,
        connectorURI: null,
        method: selectedMethod,
      };
    }

    if (sig.sig === '0xMOCK') {
      throw new Error(
        'The frontend is in real mode, but the backend returned a mock signature. Set WORLD_ID_MODE=real on the backend and restart or redeploy.',
      );
    }

    const request = await IDKit.request({
      app_id: CFG.appId,
      action,
      rp_context: {
        rp_id: CFG.rpId,
        nonce: sig.nonce,
        created_at: sig.created_at,
        expires_at: sig.expires_at,
        signature: sig.sig,
      },
      allow_legacy_proofs: true,
      environment: CFG.env,
    }).preset(preset({ signal }));

    const connectorURI = request.connectorURI;

    if (!connectorURI) {
      throw new Error(
        'IDKit did not return a connector URI.',
      );
    }

    if (typeof onConnect === 'function') {
      onConnect(connectorURI);
    }

    const done = request.pollUntilCompletion().then((response) => ({
      idkitResponse: response,
      connectorURI,
      method: selectedMethod,
    }));

    return {
      connectorURI,
      done,
      method: selectedMethod,
    };
  }

  return {
    configure,
    requestProofOfHuman,

    get mode() {
      return CFG.mode;
    },

    get env() {
      return CFG.env;
    },
  };
})();