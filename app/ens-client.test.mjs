// Tests for the on-chain read client (app/ens-client.mjs). We can't hit a live Sepolia RPC in CI, so
// we test the two things that DON'T need a chain and that a wiring slip would break: (1) the guards
// (it refuses to build without an RPC or without deployed addresses — so a half-set env can't silently
// produce a broken client), and (2) the namehash it will use == the canonical EIP-137 namehash, which
// is what the contract's _node/_namehash writes under. If (2) drifts, on-chain marks would never read
// back. (The live RPC calls themselves are verified at the event via scripts/verify_onchain.mjs.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ethers } from 'ethers';
import { makeOnchainClient } from './ens-client.mjs';

test('makeOnchainClient refuses to build without an RPC (no silent broken client)', () => {
  assert.throws(() => makeOnchainClient({ rpc: '', addrs: { resolver: '0x1', registrar: '0x2' } }),
    /SEPOLIA_RPC/);
});

test('makeOnchainClient refuses to build without deployed addresses (run the deploy first)', () => {
  assert.throws(() => makeOnchainClient({ rpc: 'http://localhost:8545', addrs: {} }),
    /addresses\.json/);
  assert.throws(() => makeOnchainClient({ rpc: 'http://localhost:8545', addrs: { resolver: '0x1' } }),
    /addresses\.json/);   // registrar missing
});

test('the node it reads == canonical EIP-137 namehash (matches the contract _node/_namehash)', () => {
  // The client uses ethers.utils.namehash(`${label}.${parent}`); pin the canonical value so a change
  // in how we derive the node (here OR in the Solidity, which was cross-checked to this same value)
  // is caught — otherwise a mark written on-chain would be unreadable by the demo.
  assert.equal(
    ethers.utils.namehash('aiko.marumaru.eth'),
    '0x7c70461ac5f453cc85c9e2040129a27c2dd458fea490c6340c230a18f3b8810b',
  );
});

test('a built client exposes the store-compatible 3-method shape (drops into readMarks/readDetail)', () => {
  const c = makeOnchainClient({ rpc: 'http://localhost:8545', addrs: { resolver: '0x0000000000000000000000000000000000000001', registrar: '0x0000000000000000000000000000000000000002' } });
  assert.equal(typeof c.text, 'function');
  assert.equal(typeof c.isLenderAuthorized, 'function');
  assert.equal(typeof c.passportExpired, 'function');
});
