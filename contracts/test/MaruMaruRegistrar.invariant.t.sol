// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {MaruMaruRegistrar} from "../src/MaruMaruRegistrar.sol";
import {MockENSv2} from "./mocks/MockENSv2.sol";
import {IRegistry, IPermissionedResolver} from "../src/interfaces/IENSv2.sol";
import {IReclaimVerifier} from "../src/interfaces/IReclaimVerifier.sol";
import {IWorldID} from "../src/interfaces/IWorldID.sol";

/// Handler drives random mint / grant / revoke / UNREGISTER sequences and keeps an
/// INDEPENDENT shadow model of what the truth should be, so the invariants below compare
/// the contract's state against a separately-computed expectation (not a tautology).
///
/// V4: the handler now includes unregister() and models teardown, because V1 (counter leak)
/// and V2 (teardown-list DoS) both lived in the teardown path — an invariant suite that never
/// unregisters would give a false correctness signal exactly where the real bugs were.
contract MaruHandler is Test {
    MaruMaruRegistrar public reg;
    address public issuer;

    // NOTE: we track everything in humanKey space (= reg.humanKeyOf(rawNullifier)), because the
    // contract stores/keys/emits the DERIVED key, never the raw nullifier. So `nullifiers[]` holds
    // humanKeys, and the invariants below read the contract with those same keys — apples to apples.
    uint256[] public nullifiers;                      // distinct humanKeys ever minted
    mapping(uint256 => bool) internal _sawNullifier;
    string[] public labels;                           // labels ever minted (may now be dead)
    mapping(bytes32 => bool) internal _labelLive;     // keccak(label) => currently registered here

    // shadow model of active (nullifier,lender) grants → expected activeLenderCount
    mapping(uint256 => uint32) public expectedActive;
    mapping(bytes32 => bool) internal _grantOn;       // keccak(nf,lender) currently counted
    // which lenders are currently counted for a given label (to unwind on unregister)
    mapping(bytes32 => address[]) internal _labelLenders;   // keccak(label) => lenders granted on it
    mapping(bytes32 => mapping(address => bool)) internal _labelLenderSeen;
    // the label that currently holds a nullifier live (mirrors _humanPassport)
    mapping(uint256 => bytes32) internal _liveLabelOf;

    constructor(MaruMaruRegistrar _reg, address _issuer) { reg = _reg; issuer = _issuer; }

    function mint(uint96 nf, uint16 salt) external {
        if (nf == 0) return;
        string memory label = string(abi.encodePacked("n", vm.toString(uint256(salt)), "_", vm.toString(uint256(nf))));
        bytes32 lk = keccak256(bytes(label));
        vm.prank(issuer);
        try reg.mintPassport(label, address(uint160(uint256(nf) + 1)), nf, false) {
            uint256 hk = reg.humanKeyOf(nf);          // track in humanKey space (what the contract stores)
            if (!_sawNullifier[hk]) { _sawNullifier[hk] = true; nullifiers.push(hk); }
            if (!_labelLive[lk]) { labels.push(label); }
            _labelLive[lk] = true;
            _liveLabelOf[hk] = lk;
        } catch {}
    }

    function grant(uint16 li, uint8 lender) external {
        if (labels.length == 0) return;
        string memory label = labels[li % labels.length];
        bytes32 lk = keccak256(bytes(label));
        address l = address(uint160(uint256(lender) + 100));
        vm.prank(issuer);
        try reg.grantLender(label, l, uint64(block.timestamp + 1 days)) {
            uint256 nf = reg.passportOf(label).humanKey;
            bytes32 key = keccak256(abi.encode(nf, l));
            if (nf != 0 && !_grantOn[key]) {
                _grantOn[key] = true;
                expectedActive[nf] += 1;
                if (!_labelLenderSeen[lk][l]) { _labelLenderSeen[lk][l] = true; _labelLenders[lk].push(l); }
            }
        } catch {}
    }

    function revoke(uint16 li, uint8 lender) external {
        if (labels.length == 0) return;
        string memory label = labels[li % labels.length];
        address l = address(uint160(uint256(lender) + 100));
        vm.prank(issuer);
        try reg.revokeLender(label, l) {
            uint256 nf = reg.passportOf(label).humanKey;
            bytes32 key = keccak256(abi.encode(nf, l));
            if (nf != 0 && _grantOn[key]) { _grantOn[key] = false; expectedActive[nf] -= 1; }
        } catch {}
    }

    /// The path V1/V2 lived in. Unregister a passport and mirror the teardown in the model:
    /// every still-counted lender on that label is unwound from expectedActive.
    function unregister(uint16 li) external {
        if (labels.length == 0) return;
        string memory label = labels[li % labels.length];
        bytes32 lk = keccak256(bytes(label));
        if (!_labelLive[lk]) return;                  // already gone
        uint256 nf = reg.passportOf(label).humanKey;
        vm.prank(issuer);
        try reg.unregisterPassport(label) {
            // unwind the model exactly as _teardownPassport does
            address[] storage ls = _labelLenders[lk];
            for (uint256 i = 0; i < ls.length; i++) {
                address l = ls[i];
                bytes32 key = keccak256(abi.encode(nf, l));
                if (_grantOn[key]) { _grantOn[key] = false; if (expectedActive[nf] != 0) expectedActive[nf] -= 1; }
                _labelLenderSeen[lk][l] = false;
            }
            delete _labelLenders[lk];
            _labelLive[lk] = false;
            if (_liveLabelOf[nf] == lk) _liveLabelOf[nf] = bytes32(0);
        } catch {}
    }

    // ---- views the invariant reads ----
    function nullifierCount() external view returns (uint256) { return nullifiers.length; }
    function nullifierAt(uint256 i) external view returns (uint256) { return nullifiers[i]; }
    function humanIsLive(uint256 nf) external view returns (bool) { return _liveLabelOf[nf] != bytes32(0); }
}

contract MaruMaruRegistrarInvariant is Test {
    MockENSv2 ens;
    MaruMaruRegistrar reg;
    MaruHandler handler;
    address issuer = address(0xABCD);

    function setUp() public {
        ens = new MockENSv2();
        reg = new MaruMaruRegistrar(IRegistry(address(ens)), IPermissionedResolver(address(ens)), issuer, IReclaimVerifier(address(0)), MaruMaruRegistrar.WorldIdConfig({router: IWorldID(address(0)), groupId: 1, externalNullifier: 42}), MaruMaruRegistrar.PolicyConfig({incomeMin: 10000, savingsMin: 50000}), hex"00");
        handler = new MaruHandler(reg, issuer);
        targetContract(address(handler));
    }

    /// I1 (one-live-per-human, teardown-aware): the contract's humanUsed(nf) must AGREE with
    /// the shadow model's liveness for every nullifier — including after unregister, where the
    /// human must go NOT-live. (The old version asserted every minted nullifier stays live,
    /// which is only true without teardown — an over-fit that V4 removes.)
    function invariant_human_liveness_matches_model() public view {
        uint256 n = handler.nullifierCount();
        for (uint256 i = 0; i < n; i++) {
            uint256 nf = handler.nullifierAt(i);
            assertEq(reg.humanUsed(nf), handler.humanIsLive(nf), "humanUsed diverged from model (teardown liveness)");
        }
    }

    /// I2 (stacking counter integrity, teardown-aware): activeLenderCount for every nullifier
    /// matches the independently-tracked model across grant / revoke / UNREGISTER — so neither
    /// a teardown leak (V1) nor a re-grant-after-remint miscount can make it drift.
    function invariant_active_lender_count_matches_model() public view {
        uint256 n = handler.nullifierCount();
        for (uint256 i = 0; i < n; i++) {
            uint256 nf = handler.nullifierAt(i);
            assertEq(reg.activeLenderCount(nf), handler.expectedActive(nf), "activeLenderCount drift");
        }
    }

    /// I3 (counter is never negative/absurd): a standing count can never exceed the number of
    /// distinct lender addresses the handler uses (256), catching any double-count/underflow wrap.
    function invariant_count_bounded() public view {
        uint256 n = handler.nullifierCount();
        for (uint256 i = 0; i < n; i++) {
            assertLe(reg.activeLenderCount(handler.nullifierAt(i)), 256, "activeLenderCount exceeds distinct-lender universe");
        }
    }
}
