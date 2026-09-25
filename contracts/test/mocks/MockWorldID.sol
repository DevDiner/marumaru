// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IWorldID} from "../../src/interfaces/IWorldID.sol";

/// Test double for the World ID v3 on-chain router. The real router REVERTS on an invalid
/// proof (it does not return false), so this mock reverts when `accept` is off — letting
/// tests exercise both the valid-proof mint and the rejected-proof revert.
contract MockWorldID is IWorldID {
    bool public accept = true;
    error WorldIDProofInvalid();

    function setAccept(bool a) external { accept = a; }

    function verifyProof(uint256, uint256, uint256, uint256, uint256, uint256[8] calldata) external view {
        if (!accept) revert WorldIDProofInvalid();
        // valid → return normally (mirrors the real router's success path)
    }
}
