// deploy_ensv2.mjs — deploy MaruMaruRegistrar and wire its EAC roles, then run a
// lifecycle smoke test. RUN AT EVENT (needs live Sepolia + demo/addresses.json from
// provision_parent.mjs + the compiled registrar artifact from `forge build`).
//
// Wiring:
//   - grant the registrar ROLE_REGISTRAR | ROLE_RENEW on the UserRegistry ROOT
//   - grant the registrar per-key ROLE_SET_TEXT on the resolver for the six keys
//     (maru.income / maru.savings / maru.human / maru.dsr / maru.income_band / maru.assurance) via authorizeTextRoles
// Then: mint -> writeMark x6 -> refresh -> grantLender -> isLenderAuthorized  
//
// Usage: node scripts/deploy_ensv2.mjs
import 'dotenv/config';
import { ethers } from 'ethers';
import fs from 'node:fs';

// A nonce-managed signer. Load-balanced public RPCs (publicnode etc.) round-robin across backends with
// different nonce views, so ethers' auto-nonce races on a burst of sequential txs → "nonce too low".
// This wraps the wallet, seeds the nonce ONCE from the pending count, and hands out sequential nonces
// locally for every send (contract deploy + all writes) — so the 13 txs here never race. Transparent:
// every Contract/ContractFactory built on it just works, no call-site changes.
class SeqNonceSigner extends ethers.Signer {
  constructor(wallet) { super(); this.wallet = wallet; this.provider = wallet.provider; this._next = null; }
  getAddress() { return this.wallet.getAddress(); }
  signMessage(m) { return this.wallet.signMessage(m); }
  signTransaction(t) { return this.wallet.signTransaction(t); }
  connect(p) { return new SeqNonceSigner(this.wallet.connect(p)); }
  async sendTransaction(txn) {
    if (this._next === null) { this._next = await this.provider.getTransactionCount(await this.getAddress(), 'pending'); }
    if (txn.nonce === undefined || txn.nonce === null) txn = { ...txn, nonce: this._next };
    this._next++;
    return this.wallet.sendTransaction(txn);
  }
}

const { SEPOLIA_RPC, DEPLOYER_PK } = process.env;

// Registry EAC role constants (verified 2026-09-20).
const ROLE_REGISTRAR = 1n << 0n;
const ROLE_RENEW = 1n << 16n;
const ROOT_RESOURCE = 0n;

const REGISTRY_ABI = [
  'function grantRootRoles(uint256 roleBitmap, address account) returns (bool)',
];
// RESOLVER ABI — aligned to the REAL PermissionedResolver (verified 2026-09-26 against sha-pinned
// github.com/ensdomains/contracts-v2). Per-key text auth is authorizeTextRoles(toName,key,acct,grant):
// we pass the EMPTY DNS name (0x00) so node==0 → resource(0, partHash(key)) = "write this key on ANY
// subname" — the exact primitive a registrar minting many subnames needs. setText takes a bytes32
// namehash (the registrar computes it in _node/_namehash). ⚠️ ENSv2 is beta — re-confirm these still
// hold at the ENS booth before the live deploy (THE_GUIDE §6.2), but the SHAPE is source-verified.
const RESOLVER_ABI = [
  'function grantRootRoles(uint256 roleBitmap, address account) returns (bool)',
  'function authorizeTextRoles(bytes toName, string key, address account, bool grant) returns (bool)',
  'function setText(bytes32 node, string key, string value)',
  // Read-back: the standard resolver text getter keyed by namehash node. Used AFTER the smoke
  // test to PROVE a written mark is actually resolvable — catches (a) a wrong authorizeTextRoles scope
  // and (b) a DNS-encode-vs-namehash node mismatch (§6.2), either of which would leave
  // the deploy "green" but the marks unreadable on-chain.
  'function text(bytes32 node, string key) view returns (string)',
];
// The three (and only three) text keys the registrar is ever allowed to write.
const MARU_KEYS = ['maru.income', 'maru.savings', 'maru.human', 'maru.dsr', 'maru.income_band', 'maru.assurance'];
const REGISTRAR_ABI = [
  'function mintPassport(string label, address owner, uint256 humanNullifier, bool transferable) returns (uint256)',
  'function writeMark(string label, uint8 kind, string value, uint64 expiry)',
  'function refresh(string label, uint64 newExpiry)',
  'function grantLender(string label, address lender, uint64 until)',
  'function isLenderAuthorized(string label, address lender) view returns (bool)',
  'function passportOf(string label) view returns (tuple(address owner, uint64 expiry, bool soulbound, uint256 humanKey))',
];

// Parse a numeric env var robustly: trim whitespace (a stray space after `=` is the #1
// hand-edit mistake), require a clean non-negative integer, and fail with a CLEAR message
// naming the var — instead of letting a bad value revert deep inside ethers' ABI encoder
// with a cryptic "invalid BigNumber string" (V7). Returns a BigInt.
// Accepts BOTH decimal (POLICY_* thresholds) AND 0x-hex — because a 256-bit value like
// WORLD_EXTERNAL_NULLIFIER is naturally a hash and is almost always pasted as 0x... . A
// decimal-only regex would THROW on the hash's natural form and block the event-day deploy.
function envUint(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || String(raw).trim() === '') return BigInt(fallback);
  const s = String(raw).trim();
  if (!/^(0x[0-9a-fA-F]+|[0-9]+)$/.test(s)) {
    throw new Error(`${name} must be a non-negative integer (decimal) or 0x-hex (got "${raw}"). Check .env — no quotes, no decimals, no trailing spaces.`);
  }
  return BigInt(s); // BigInt() parses both "123" and "0x7b"
}

function loadArtifact() {
  // forge build output. Present after `forge build` on the build machine.
  const p = new URL('../contracts/out/MaruMaruRegistrar.sol/MaruMaruRegistrar.json', import.meta.url);
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  return { abi: j.abi, bytecode: j.bytecode.object || j.bytecode };
}

// DNS-encode a name: "marumaru.eth" -> 0x08 marumaru 03 eth 00
function dnsEncode(name) {
  const parts = name.split('.').filter(Boolean);
  const bufs = parts.map((p) => Buffer.concat([Buffer.from([p.length]), Buffer.from(p)]));
  return '0x' + Buffer.concat([...bufs, Buffer.from([0])]).toString('hex');
}

async function main() {
  if (!SEPOLIA_RPC || !DEPLOYER_PK) throw new Error('Set SEPOLIA_RPC + DEPLOYER_PK in .env');
  const provider = new ethers.providers.JsonRpcProvider(SEPOLIA_RPC);
  const wallet = new SeqNonceSigner(new ethers.Wallet(DEPLOYER_PK, provider));   // nonce-managed (public-RPC safe)
  const ME = await wallet.getAddress();   // SeqNonceSigner has no sync .address; capture it once
  const addrs = JSON.parse(fs.readFileSync(new URL('../demo/addresses.json', import.meta.url), 'utf8'));
  console.log('Deployer:', ME, '\nAddresses:', addrs);

  // 1. Deploy the registrar (issuer = deployer for the demo; a backend key in prod).
  const { abi, bytecode } = loadArtifact();
  const Factory = new ethers.ContractFactory(abi, bytecode, wallet);
  // 4th arg = Reclaim's on-chain verifier (RECLAIM_VERIFIER env). address(0) = off-chain-
  // verified mode (writeMark path); a real verifier enables the trustless writeMarkWithProof.
  // trim address envs too — a trailing space makes ethers reject the address (V7).
  const trimAddr = (v, dflt) => { const s = (v || '').trim(); return s === '' ? dflt : s; };
  const reclaimVerifier = trimAddr(process.env.RECLAIM_VERIFIER, ethers.constants.AddressZero);
  // 5th arg = WorldIdConfig for the permissionless mintWithProofs path. WORLD_ID_ROUTER is
  // the v3 WorldIDRouter on Sepolia (0x469449f2...2157); address(0) disables the on-chain path.
  // externalNullifier = the action's external-nullifier hash (precompute for "marumaru-issue").
  const worldCfg = {
    router: trimAddr(process.env.WORLD_ID_ROUTER, ethers.constants.AddressZero),
    groupId: 1, // Orb
    externalNullifier: envUint('WORLD_EXTERNAL_NULLIFIER', 0),
  };
  // 6th arg = PolicyConfig: IMMUTABLE credential thresholds. A self-minting borrower can NOT
  // supply these (that was the C2 bug); the protocol fixes the bar so "pass" means the same
  // for everyone. Sourced from POLICY_INCOME_MIN / POLICY_SAVINGS_MIN (robustly parsed).
  const policyCfg = {
    incomeMin: envUint('POLICY_INCOME_MIN', 10000),
    savingsMin: envUint('POLICY_SAVINGS_MIN', 50000),
  };
  // 7th arg = DNS-encoded parent (e.g. "marumaru.eth") so setText targets label.parent, not bare label.
  const parentDns = dnsEncode(process.env.PARENT_NAME || 'marumaru.eth');
  const registrar = await Factory.deploy(addrs.userRegistry, addrs.resolver, ME, reclaimVerifier, worldCfg, policyCfg, parentDns);
  await registrar.deployed();
  console.log('MaruMaruRegistrar:', registrar.address);

  // 2. Grant registry roles on ROOT (global) so the registrar can register + renew.
  const registry = new ethers.Contract(addrs.userRegistry, REGISTRY_ABI, wallet);
  await (await registry.grantRootRoles(ROLE_REGISTRAR | ROLE_RENEW, registrar.address)).wait();
  console.log('Granted ROLE_REGISTRAR|ROLE_RENEW to registrar on ROOT.');

  // 3. Grant PER-KEY setText authorization on the RESOLVER (not the registry!) — the registrar
  //    may write ONLY maru.income / maru.savings / maru.human / maru.dsr / maru.income_band /
  //    maru.assurance, nothing else. This is the ENS prize's literal example ("let an account edit only
  //    certain text records on a name") and real least-privilege: if the issuer key leaked it's confined to those six maru.*
  //    key TYPES (it can't touch avatar/url/any other record). (This matches the test suite.) We
  //    deliberately do NOT grant resolver-wide root ROLE_SET_TEXT.
  const resolver = new ethers.Contract(addrs.resolver, RESOLVER_ABI, wallet);
  // The EMPTY DNS name (root terminator only) → the resolver namehashes it to node 0, so the grant
  // lands on resource(0, partHash(key)) = "may write this key on ANY subname". That's the correct
  // primitive for a registrar that mints many subnames on the fly (we can't pre-grant names that
  // don't exist yet). The deployer must hold ROLE_SET_TEXT_ADMIN to authorize — granted just below.
  const EMPTY_DNS_NAME = '0x00';
  for (const key of MARU_KEYS) {
    await (await resolver.authorizeTextRoles(EMPTY_DNS_NAME, key, registrar.address, true)).wait();
    console.log(`Authorized setText("${key}") on ANY subname for the registrar.`);
  }
  console.log('Registrar can write ONLY the 5 maru.* keys (least privilege — ENS prize\'s literal example).');

  // 4. Lifecycle smoke. CredentialKind enum: Income=0, Savings=1, Human=2, Dsr=3, IncomeBand=4.
  const reg = new ethers.Contract(registrar.address, REGISTRAR_ABI, wallet);
  const now = Math.floor(Date.now() / 1000);
  await (await reg.mintPassport('aiko', ME, 12345, false)).wait();
  console.log('✅ minted aiko (soulbound)');
  await (await reg.writeMark('aiko', 0, 'pass', now + 30 * 86400)).wait(); // Income
  await (await reg.writeMark('aiko', 1, 'pass', now + 30 * 86400)).wait(); // Savings
  await (await reg.writeMark('aiko', 2, 'verified', now + 30 * 86400)).wait(); // Human
  await (await reg.writeMark('aiko', 3, 'pass', now + 30 * 86400)).wait(); // Dsr (debt-service ratio)
  await (await reg.writeMark('aiko', 4, '1-1.5x', now + 30 * 86400)).wait(); // IncomeBand (a range, not pass/fail)
  await (await reg.writeMark('aiko', 5, 'orb', now + 30 * 86400)).wait(); // Assurance (World tier: orb|passport|selfie)
  console.log('✅ wrote 6 marks (incl. maru.dsr + maru.income_band + maru.assurance)');
  await (await reg.refresh('aiko', now + 60 * 86400)).wait();
  console.log('✅ refreshed expiry');
  await (await reg.grantLender('aiko', '0x000000000000000000000000000000000000dEaD', now + 14 * 86400)).wait();
  const authed = await reg.isLenderAuthorized('aiko', '0x000000000000000000000000000000000000dEaD');
  console.log('✅ lender authorized:', authed);

  // 5. READ-BACK GATE — prove a written mark is actually resolvable, don't just trust that the
  //    writeMark tx succeeded. If authorizeTextRoles targeted the wrong resource, setText would have reverted
  //    (the writeMark .wait() above would have thrown) — but a subtler failure is a node mismatch:
  //    the registrar writes under _dnsEncode(name) while a normal reader queries by namehash. If
  //    those differ on the live beta, the mark is written but UNREADABLE, and the ENS demo silently
  //    shows nothing. Read the human mark back by namehash and FAIL LOUDLY if it's empty.
  const parentName = process.env.PARENT_NAME || 'marumaru.eth';
  const node = ethers.utils.namehash(`aiko.${parentName}`);
  const readback = await resolver.text(node, 'maru.human');
  if (readback !== 'verified') {
    throw new Error(
      `READ-BACK FAILED: wrote maru.human='verified' but text(namehash) returned '${readback}'. ` +
      `The mark is written but not resolvable by namehash — likely a DNS-encode-vs-namehash node ` +
      `mismatch or a wrong authorizeTextRoles scope. DO NOT DEMO until §6.2 diagnosis is done: ` +
      `confirm the resolver's expected node derivation and the setter-blob encoding against the live beta.`
    );
  }
  console.log('✅ read-back: maru.human resolves to "verified" by namehash — marks are on-chain AND resolvable');

  addrs.registrar = registrar.address;
  fs.writeFileSync(new URL('../demo/addresses.json', import.meta.url), JSON.stringify(addrs, null, 2));
  console.log('Updated demo/addresses.json with registrar address.');
}

main().catch((e) => { console.error(e); process.exit(1); });
