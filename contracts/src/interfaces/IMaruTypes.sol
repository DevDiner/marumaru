// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Shared enums/structs for MaruMaru.
/// Dsr = debt-service ratio (monthly debt ÷ income)
/// (pass when the ratio is BELOW the cap), proving it isn't income-specific.
/// IncomeBand = a public bucket of income expressed as a multiple of the qualifying floor
/// (e.g. "1-1.5x"), so a lender can price/tier WITHOUT the exact figure (controlled disclosure) 
/// Assurance = the World ID tier that minted this passport ("orb" | "passport" | "selfie").


enum CredentialKind { Income, Savings, Human, Dsr, IncomeBand, Assurance } 

struct PassportView {
    address owner;
    uint64 expiry;          // == credential freshness deadline
    bool soulbound;         // true unless owner opted transferable at mint
    uint256 humanKey;       // keccak of the World ID nullifier bound at mint (0 = none)
}