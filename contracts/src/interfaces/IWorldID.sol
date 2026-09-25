// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Minimal surface of World ID's ON-CHAIN verifier (the v3 WorldIDRouter), injected
/// behind this interface like IENSv2/IReclaimVerifier (mock in tests, real Sepolia address
/// at deploy). This is what lets a passport be minted permissionlessly: the borrower submits
/// their own World ID proof and the contract verifies it on-chain (no trusted backend.)

interface IWorldID {
    function verifyProof(
        uint256 root,
        uint256 groupId,          // must be 1 (Orb) for Proof of Human
        uint256 signalHash,
        uint256 nullifierHash,
        uint256 externalNullifierHash,
        uint256[8] calldata proof
    ) external view;
}