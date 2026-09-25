// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Shared enums/structs for MaruMaru.
/// Dsr = debt-service ratio (monthly debt ÷ income); its mark uses the INVERTED predicate
/// (pass when the ratio is BELOW the cap) its the same mechanism, proving it isn't income-specific.
/// IncomeBand = a COARSE, PUBLIC bucket of income expressed as a multiple of the qualifying floor
/// (e.g. "1-1.5x"), so a lender can price/tier WITHOUT the exact figure (in this sense, controlled disclosure)
/// introducing bands to make it harder to infer the exact income from the credential. The band is a public claim.
/// Bucket edges are multiples of policyIncomeMin (grounded in loan-to-income limits)

enum CredentialKind { Income, Savings, Human, Dsr, IncomeBand } // + maru.income_band

struct PassportView {
    address owner;
    uint64 expiry;          // == credential freshness deadline
    bool soulbound;         // true unless owner opted transferable at mint
    uint256 humanKey;       // keccak of the World ID nullifier bound at mint (0 = none)
}