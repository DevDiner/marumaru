// provision_parent.mjs — ONE-TIME event-day setup on ENSv2 Sepolia.
//
// Registers the parent name (marumaru.eth) on the ETHRegistrar (commit->reveal, paid in
// MockUSDC), deploys a UserRegistry + PermissionedResolver via the VerifiableFactory
// (with real initialize() role grants), and points marumaru.eth at the UserRegistry.
// Writes the resulting addresses to demo/addresses.json.
//
// RUN AT EVENT (needs live Sepolia + funded DEPLOYER_PK). Not runnable on the editing box.
// ENSv2 is a NOT-FINAL beta — CONFIRM every address + ABI against docs.ens.domains
// /learn/deployments (browser; the table is JS-rendered) and the contracts-v2 `staging`
// branch before running. The ABI fragments below are the documented shapes as of
// Sept 2026; verify names/args at the event.
//
// Usage: node scripts/provision_parent.mjs
import 'dotenv/config';
import { ethers } from 'ethers';
import fs from 'node:fs';

const {
  SEPOLIA_RPC, DEPLOYER_PK, PARENT_NAME = 'marumaru.eth',
  ENS_ETH_REGISTRY, ENS_ETH_REGISTRAR, ENS_USER_REGISTRY_IMPL, ENS_RESOLVER_IMPL,
  ENS_VERIFIABLE_FACTORY, ENS_MOCK_USDC,
} = process.env;

// --- verified role bit values (RegistryRolesLib / PermissionedResolverLib, sha-pinned 2026-09-26) ---
const ROLE_REGISTRAR       = 1n << 0n;
const ROLE_RENEW           = 1n << 16n;
const ROLE_SET_SUBREGISTRY = 1n << 20n;
const ROLE_SET_RESOLVER    = 1n << 24n;
const ROLE_SET_TEXT        = 1n << 4n;           // RESOLVER role (PermissionedResolverLib)
const ADMIN = (r) => r << 128n;                  // admin counterpart = role << 128
// REGISTRY roles we grant ourselves (so we can delegate register/renew to the registrar later).
const ALL_REGISTRY_ROLES = ROLE_REGISTRAR | ADMIN(ROLE_REGISTRAR) | ROLE_RENEW | ADMIN(ROLE_RENEW)
  | ROLE_SET_SUBREGISTRY | ADMIN(ROLE_SET_SUBREGISTRY) | ROLE_SET_RESOLVER | ADMIN(ROLE_SET_RESOLVER);
// RESOLVER roles we grant ourselves: ROLE_SET_TEXT + its ADMIN — the admin is what lets us CALL
// authorizeTextRoles(...) in deploy_ensv2.mjs to delegate per-key text writes to the registrar.
const ALL_RESOLVER_ROLES = ROLE_SET_TEXT | ADMIN(ROLE_SET_TEXT);

// Minimal ABIs (documented shapes — CONFIRM at event against contracts-v2).
const USDC_ABI = [
  'function mint(address to, uint256 amount)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
];
// Signatures aligned to the REAL deployed ETHRegistrar (ensdomains/contracts-v2, verified 2026-09-26):
//   - `referrer` is bytes32 (NOT address) on BOTH makeCommitment + register — the old address shape
//     mis-encodes and makeCommitment reverts with 0x (the CALL_EXCEPTION we hit).
//   - `subregistry` is IRegistry (ABI-encodes as an address — passing AddressZero is fine).
//   - `makeCommitment` is `pure` (not `view`) — harmless for a call, kept accurate.
//   - price is `getRegisterPrice(label, duration, paymentToken)` (NOT rentPrice) — we don't need it to
//     register (register pulls payment itself via approve), so it's dropped from the flow.
const REGISTRAR_ABI = [
  'function makeCommitment(string label,address owner,bytes32 secret,address subregistry,address resolver,uint64 duration,bytes32 referrer) pure returns (bytes32)',
  'function commit(bytes32 commitment)',
  'function register(string label,address owner,bytes32 secret,address subregistry,address resolver,uint64 duration,address paymentToken,bytes32 referrer) returns (uint256)',
  'function getRegisterPrice(string label,uint64 duration,address paymentToken) view returns (uint256 base,uint256 premium)',
  'function isAvailable(string label) view returns (bool)',
];
const REGISTRY_ABI = [
  'function setSubregistry(uint256 tokenId,address subregistry)',
  'function grantRootRoles(uint256 roleBitmap,address account) returns (bool)',
];
const FACTORY_ABI = [
  'function deployProxy(address implementation,uint256 salt,bytes initData) returns (address)',
  // verified vs ensdomains/verifiable-factory (2026-09-26): 4 args, proxy is `proxyAddress` (2nd).
  'event ProxyDeployed(address indexed sender,address indexed proxyAddress,uint256 salt,address implementation)',
];
// The UserRegistry and the PermissionedResolver take DIFFERENT initialize() shapes. These are verified
// against the ACTUAL DEPLOYED BYTECODE on Sepolia (selector-probed 2026-09-26) — the deployed beta is an
// OLDER version than the current contracts-v2 source, so trust the chain, not the repo:
//  • UserRegistry:         initialize((address account,uint256 roleBitmap)[] grants)                 (0x37cb53a8)
//  • PermissionedResolver: initialize((address account,uint256 roleBitmap)[] grants, bytes[] setters) (0x…) — grants FIRST, then setters
const REGISTRY_INIT_ABI = ['function initialize((address account,uint256 roleBitmap)[] grants)'];
const RESOLVER_INIT_ABI = ['function initialize((address account,uint256 roleBitmap)[] grants, bytes[] setters)'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Explicit nonce control. Public/load-balanced RPCs (publicnode, etc.) round-robin across backend
// nodes with slightly different views of the account nonce, so ethers' auto-nonce races and you get
// "nonce too low: next nonce N, tx nonce N-1". We seed ONE nonce from the pending count and pass it
// explicitly on every tx, incrementing locally — immune to which backend answers. `tx()` also retries
// once on a transient nonce/replacement error by re-reading the pending nonce.
let NONCE = 0;
let WALLET = null;
async function seedNonce(wallet) { WALLET = wallet; NONCE = await wallet.provider.getTransactionCount(wallet.address, 'pending'); console.log('  starting nonce:', NONCE); }
// Send a tx with our explicit nonce; on a nonce/replacement error, re-read the pending nonce ONCE and retry.
async function tx(label, sendFn) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try { const t = await sendFn(NONCE); NONCE++; const r = await t.wait(); return r; }
    catch (e) {
      const msg = String((e && (e.error?.message || e.reason || e.message)) || e);
      if (attempt === 0 && /nonce (too low|has already been used)|replacement|already known/i.test(msg)) {
        NONCE = await WALLET.provider.getTransactionCount(WALLET.address, 'pending');
        console.log(`  (${label}: nonce race, re-seeded to ${NONCE}, retrying)`);
        continue;
      }
      throw e;
    }
  }
}

async function main() {
  if (!SEPOLIA_RPC || !DEPLOYER_PK) throw new Error('Set SEPOLIA_RPC + DEPLOYER_PK in .env');
  const provider = new ethers.providers.JsonRpcProvider(SEPOLIA_RPC);
  const wallet = new ethers.Wallet(DEPLOYER_PK, provider);
  const label = PARENT_NAME.replace(/\.eth$/, '');
  console.log('Deployer:', wallet.address, '· registering', PARENT_NAME);
  await seedNonce(wallet);

  // 1. MockUSDC: mint (free on Sepolia) + approve the registrar. Registration is ERC20-paid.
  const usdc = new ethers.Contract(ENS_MOCK_USDC, USDC_ABI, wallet);
  await tx('mint', (nonce) => usdc.mint(wallet.address, 100_000000n, { nonce }));      // 100 USDC (6 decimals)
  await tx('approve', (nonce) => usdc.approve(ENS_ETH_REGISTRAR, 100_000000n, { nonce }));
  console.log('MockUSDC minted + approved to registrar.');

  // 2. Commit -> wait MIN_COMMITMENT_AGE (60s) -> register on the ETHRegistrar.
  const registrar = new ethers.Contract(ENS_ETH_REGISTRAR, REGISTRAR_ABI, wallet);
  const secret = ethers.utils.hexlify(ethers.utils.randomBytes(32));
  const duration = 365n * 86400n;
  // referrer is bytes32 (HashZero), NOT an address — subregistry stays AddressZero (IRegistry ⇒ address).
  const NO_REFERRER = ethers.constants.HashZero;
  const commitment = await registrar.makeCommitment(
    label, wallet.address, secret, ethers.constants.AddressZero, ENS_RESOLVER_IMPL, duration, NO_REFERRER,
  );  // view call — no nonce needed
  // If the name is already registered (a prior run got this far), skip commit+register instead of reverting.
  let alreadyRegistered = false;
  try { alreadyRegistered = (await registrar.isAvailable(label)) === false; } catch { /* isAvailable may not exist on all builds; fall through */ }
  if (alreadyRegistered) {
    console.log(`"${PARENT_NAME}" is already registered (prior run) — skipping commit+register.`);
  } else {
    await tx('commit', (nonce) => registrar.commit(commitment, { nonce }));
    console.log('Committed; waiting 65s for MIN_COMMITMENT_AGE…');
    await sleep(65_000);
    await tx('register', (nonce) => registrar.register(
      label, wallet.address, secret, ethers.constants.AddressZero, ENS_RESOLVER_IMPL, duration, ENS_MOCK_USDC, NO_REFERRER, { nonce },
    ));
    console.log('Parent', PARENT_NAME, 'registered.');
  }

  // 3. Deploy UserRegistry + PermissionedResolver proxies via the factory. Each takes its OWN
  //    initialize() shape (see the two ABIs above): the registry gets our registry roles, the
  //    resolver gets our resolver roles (ROLE_SET_TEXT + its ADMIN, so step 3b can delegate text
  //    writes to the registrar via authorizeTextRoles).
  const factory = new ethers.Contract(ENS_VERIFIABLE_FACTORY, FACTORY_ABI, wallet);
  // grants = [{account, roleBitmap}] with US as the sole root grantee (deployed shape: array-of-structs).
  const registryInit = new ethers.utils.Interface(REGISTRY_INIT_ABI)
    .encodeFunctionData('initialize', [[{ account: wallet.address, roleBitmap: ALL_REGISTRY_ROLES }]]);
  const resolverInit = new ethers.utils.Interface(RESOLVER_INIT_ABI)
    .encodeFunctionData('initialize', [[{ account: wallet.address, roleBitmap: ALL_RESOLVER_ROLES }], []]);  // grants, then no pre-authorized setters

  async function deployProxy(impl, saltSeed, initData) {
    const salt = ethers.BigNumber.from(ethers.utils.id(saltSeed));
    const rc = await tx('deployProxy:' + saltSeed, (nonce) => factory.deployProxy(impl, salt, initData, { nonce }));
    const ev = rc.logs.map((l) => { try { return factory.interface.parseLog(l); } catch { return null; } }).find((x) => x && x.name === 'ProxyDeployed');
    if (!ev) throw new Error('deployProxy: no ProxyDeployed event found in logs — cannot determine the proxy address (do NOT fall back to the factory address). Check the event ABI.');
    return ev.args.proxyAddress;
  }
  const userRegistry = await deployProxy(ENS_USER_REGISTRY_IMPL, 'marumaru:userRegistry', registryInit);
  const resolver = await deployProxy(ENS_RESOLVER_IMPL, 'marumaru:resolver', resolverInit);
  console.log('UserRegistry:', userRegistry, '· Resolver:', resolver);

  // 4. Point marumaru.eth at the UserRegistry (else subnames mint but never RESOLVE).
  const ethRegistry = new ethers.Contract(ENS_ETH_REGISTRY, REGISTRY_ABI, wallet);
  const parentTokenId = ethers.BigNumber.from(ethers.utils.id(label));
  await tx('setSubregistry', (nonce) => ethRegistry.setSubregistry(parentTokenId, userRegistry, { nonce }));
  console.log('marumaru.eth -> UserRegistry wired (setSubregistry).');

  const out = {
    parent: PARENT_NAME, ethRegistry: ENS_ETH_REGISTRY, userRegistry, resolver,
    provisionedBy: wallet.address, note: 'ENSv2 Sepolia beta — addresses re-confirmed at event',
  };
  fs.writeFileSync(new URL('../demo/addresses.json', import.meta.url), JSON.stringify(out, null, 2));
  console.log('Wrote demo/addresses.json.\nNEXT: node scripts/deploy_ensv2.mjs');
}

main().catch((e) => { console.error(e); process.exit(1); });
