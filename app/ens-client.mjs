import { ethers } from 'ethers';

// The minimal read surface of our two deployed contracts.
const RESOLVER_READ_ABI = [
  'function text(bytes32 node, string key) view returns (string)',
];
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

  return {
    // Public mark read — resolves the ENS text record by namehash, exactly as any ENS-aware client would.
    text: async (label, key) => {
      try { return await resolver.text(node(label), key); }
      catch { return ''; }   // unset record / unknown name reads as empty, matching the store client
    },
    // Consent read — the on-chain time-boxed grant.
    isLenderAuthorized: async (label, lender) => {
      try { return await registrar.isLenderAuthorized(label, lender); }
      catch { return false; }
    },
    //  passportOf().expiry (0 = none). Matches the store client's "expired" semantics.
    passportExpired: async (label) => {
      try {
        const p = await registrar.passportOf(label);
        const exp = Number(p.expiry ?? 0);
        return exp !== 0 && exp <= Math.floor(Date.now() / 1000);
      } catch { return false; }
    },
  };
}
