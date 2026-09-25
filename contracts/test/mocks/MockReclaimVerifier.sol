// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IReclaimVerifier, ReclaimProof} from "../../src/interfaces/IReclaimVerifier.sol";

/// Test double for Reclaim's on-chain verifier. Togglable so tests can exercise BOTH
/// the accept path and the reject path (the real verifier reverts on a bad attestation).
/// Returns a settable `attestedValue` to simulate the number extracted from the SIGNED
/// claim — the point being the value comes from the verified path, not a caller arg.
contract MockReclaimVerifier is IReclaimVerifier {
    bool public accept = true;
    uint256 public attestedValue = 12000;          // default (used when no per-key value set)
    mapping(string => uint256) internal _byKey;     // per-key attested value (income/savings)
    mapping(string => bool) internal _hasKey;

    function setAccept(bool a) external { accept = a; }
    function setAttestedValue(uint256 v) external { attestedValue = v; }
    /// Set a distinct attested value for a specific key, so tests can prove the contract
    /// derives income and savings marks INDEPENDENTLY (not from one shared number).
    function setValueForKey(string calldata key, uint256 v) external { _byKey[key] = v; _hasKey[key] = true; }

    function verifyAndExtract(ReclaimProof calldata proof, string calldata key)
        external view returns (bool ok, uint256 value)
    {
        // Model the real contract: a valid proof must carry at least one attestor signature.
        if (proof.signedClaim.signatures.length == 0) return (false, 0);
        value = _hasKey[key] ? _byKey[key] : attestedValue;
        return (accept, value);
    }
}
