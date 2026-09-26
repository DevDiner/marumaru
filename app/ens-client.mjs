// app/ens-client.mjs — a READ-ONLY client that resolves passport marks + consent DIRECTLY from the
// deployed ENSv2 contracts on Sepolia. Same 3-method shape as handlers.mjs's makeClient(store), so it
// drops into readMarks / readDetail / agentResolve unchanged — but every read hits the CHAIN, not a
// local JSON store. This is what makes the demo "functional, not hard-coded" against the ENS prize:
// the lender view resolves the exact passport we deployed, from Sepolia.
//
// ⚠️ EVENT-DAY, correct-by-inspection: this file could NOT be run against a live chain on the build
// box (no RPC, no deployed contracts). Wire it after the Sepolia deploy (addresses.json present) and
// confirm one read with scripts/verify_onchain.mjs BEFORE relying on it in the demo. It is OFF by
// default — handlers.mjs only uses it when ONCHAIN_READS=1 AND demo/addresses.json exists; otherwise
// the store-backed client runs exactly as before (so the offline demo + the 60 unit tests are untouched).
//
// ethers v5 (matches package.json + scripts/*). node = ethers.utils.namehash("<label>.<parent>"),
// which is the canonical EIP-137 namehash — IDENTICAL to the contract's _node/_namehash (verified
// against this same function: aiko.marumaru.eth = 0x7c70…810b), so a mark written on-chain reads back here.
import { ethers } from 'ethers';

// The minimal read surface of our two deployed contracts.
// The deployed ENSv2-beta PermissionedResolver has NO plain text(bytes32,string) — reads go through
// ENSIP-10 resolve(dnsName, calldata) (verified live 2026-09-27: maru.human => "verified"). We try
// resolve() first and fall back to plain text() so this ALSO works against a standard resolver.
const RESOLVER_READ_ABI = [
  'function resolve(bytes name, bytes data) view returns (bytes)',
  'function text(bytes32 node, string key) view returns (string)',
];
// Encode the inner text(node,key) call that we wrap inside resolve().
const TEXT_IFACE = new ethers.utils.Interface(['function text(bytes32 node, string key) view returns (string)']);
// DNS-encode a name for ENSIP-10 resolve(): "aiko.marumaru.eth" -> 0x04 aiko 08 marumaru 03 eth 00
function dnsEncode(name) {
  const out = [];
  for (const p of String(name).split('.').filter(Boolean)) { out.push(p.length); for (const c of p) out.push(c.charCodeAt(0)); }
  out.push(0);
  return '0x' + Buffer.from(out).toString('hex');
}
const REGISTRAR_READ_ABI = [
  'function isLenderAuthorized(string label, address lender) view returns (bool)',
  'function passportOf(string label) view returns (tuple(address owner, uint64 expiry, bool soulbound, uint256 humanKey))',
  'function exists(string label) view returns (bool)',
];

/// Build the on-chain read client. `addrs` = demo/addresses.json (needs .resolver + .registrar).
/// `rpc` = SEPOLIA_RPC. `parent` = the parent name (e.g. "marumaru.eth") so we namehash label.parent.
export function makeOnchainClient({ rpc, addrs, parent = 'marumaru.eth' }) {
  if (!rpc) throw new Error('makeOnchainClient: SEPOLIA_RPC not set');
  if (!addrs?.resolver || !addrs?.registrar) {
    throw new Error('makeOnchainClient: addresses.json missing resolver/registrar (run the deploy first)');
  }
  const provider = new ethers.providers.JsonRpcProvider(rpc);
  const resolver = new ethers.Contract(addrs.resolver, RESOLVER_READ_ABI, provider);
  const registrar = new ethers.Contract(addrs.registrar, REGISTRAR_READ_ABI, provider);
  const node = (label) => ethers.utils.namehash(`${label}.${parent}`);
  const dns = (label) => dnsEncode(`${label}.${parent}`);

  return {
    // Public mark read. The deployed beta resolver reads via ENSIP-10 resolve(dnsName, text-calldata);
    // we try that first, then fall back to a plain text(node,key) for a standard resolver. Either way an
    // unset record / unknown name reads as '' (matching the store client), so the demo never breaks.
    text: async (label, key) => {
      try {
        const inner = TEXT_IFACE.encodeFunctionData('text', [node(label), key]);
        const raw = await resolver.resolve(dns(label), inner);
        return TEXT_IFACE.decodeFunctionResult('text', raw)[0];
      } catch { /* resolve() not supported or reverted — try the standard getter */ }
      try { return await resolver.text(node(label), key); }
      catch { return ''; }
    },
    // Consent read — the on-chain time-boxed grant.
    isLenderAuthorized: async (label, lender) => {
      try { return await registrar.isLenderAuthorized(label, lender); }
      catch { return false; }
    },
    // Freshness — passportOf().expiry (0 = none). Matches the store client's "expired" semantics.
    passportExpired: async (label) => {
      try {
        const p = await registrar.passportOf(label);
        const exp = Number(p.expiry ?? 0);
        return exp !== 0 && exp <= Math.floor(Date.now() / 1000);
      } catch { return false; }
    },
  };
}
