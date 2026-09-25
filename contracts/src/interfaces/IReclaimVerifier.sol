// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev a simplifed injection surface for Reclaim-style on-chain attestation 

struct ReclaimClaimInfo {
    string provider;   // e.g. the provider recipe id
    string parameters; // JSON of extracted params (contains the attested value)
    string context;    // bound context — carries our sessionId (same-session binding)
}

struct ReclaimSignedClaim {
    bytes32 identifier; // hash of the claim
    address owner;      // who generated the proof
    uint32  timestampS; // when
    bytes[] signatures; // attestor signature(s)
}

struct ReclaimProof {
    ReclaimClaimInfo claimInfo;
    ReclaimSignedClaim signedClaim;
}

interface IReclaimVerifier {
    function verifyAndExtract(ReclaimProof calldata proof, string calldata key)
        external view returns (bool ok, uint256 value);
}