// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IRegistry, IPermissionedResolver, RegistryRolesLib, ResolverRolesLib, ROOT_RESOURCE} from "./interfaces/IENSv2.sol";
import {CredentialKind, PassportView} from "./interfaces/IMaruTypes.sol";
import {IReclaimVerifier, ReclaimProof} from "./interfaces/IReclaimVerifier.sol";
import {IWorldID} from "./interfaces/IWorldID.sol";

/// @title MaruMaruRegistrar
/// @notice Mints borrower "financial passport" subnames under a parent ENSv2 name.
/// Credential marks (pass/fail) live as per-key-write-scoped, expiring text records.
/// Passports are soulbound by default; one passport per verified human (World ID nullifier).
/// Design intent (roadmap, not yet shipped as records): the registrar as an ENSIP-26
/// agent-namespace so agents can discover the passport autonomously. Today the passport is
/// already resolvable by any ENS-aware agent via standard text() — see app/agent-resolver.mjs.

contract MaruMaruRegistrar {
    IRegistry public immutable registry;         // the MaruMaru UserRegistry (subname registry)
    IPermissionedResolver public immutable resolver;
    address public issuer;                       // backend that verifies World ID + Reclaim then writes marks (rotatable,see transferIssuer)
    IReclaimVerifier public immutable reclaimVerifier; // Reclaim's ON-CHAIN verifier (address(0) = off-chain-verified mode)
    IWorldID public immutable worldId;           // World ID on-chain router (v3 on Sepolia); address(0) = no permissionless path
    uint256 public immutable worldGroupId;       // 1 = Orb (Proof of Human)
    uint256 public immutable worldExternalNullifier; // action hash for our "marumaru-issue" external nullifier
    uint256 public immutable policyIncomeMin;
    uint256 public immutable policySavingsMin;
    bytes public parentDnsSuffix;                // DNS-encoded parent, e.g. \x08marumaru\x03eth\x00 (for full-name setText)

    uint64 public constant DEFAULT_TTL = 30 days;

    // Minimal reentrancy guard (no external lib dependency). Guards the one permissionless
    // entry point (mintWithProofs), which makes external calls to injected contracts.
    uint256 private _lock = 1;
    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    struct Passport {
        uint256 tokenId;
        address owner;
        bool soulbound;
        uint256 humanKey;     // = humanKeyOf(rawNullifier): keccak of the World nullifier, no raw value
        bool exists;
    }

    mapping(bytes32 => Passport) internal _passport;      // keccak256(label) => Passport
    mapping(uint256 => bytes32)  internal _humanPassport; // humanKey => active passport key
    mapping(bytes32 => mapping(address => uint64)) internal _lenderUntil; // label => lender => auth expiry
    mapping(bytes32 => address[]) internal _passportLenders; // passport key => distinct lenders ever granted
    mapping(bytes32 => mapping(address => bool)) internal _passportLenderSeen; // passport key => lender => already in the list

    mapping(uint256 => uint32) public activeLenderCount;                 // humanKey => # standing (granted-not-revoked) lenders
    mapping(uint256 => mapping(address => bool)) internal _humanKeyLender; // humanKey => lender => counted?

    event PassportMinted(string label, address indexed owner, uint256 tokenId, bool soulbound, uint256 humanKey);
    event MarkWritten(string label, CredentialKind kind, string value, uint64 expiry);
    event PassportRefreshed(string label, uint64 newExpiry);
    event LenderGranted(string label, address indexed lender, uint64 until);
    event LenderRevoked(string label, address indexed lender);
    event StackingObserved(uint256 indexed humanKey, address indexed lender, uint32 activeLenders);
    event MarkAttested(string label, CredentialKind kind, string value, bytes32 proofId); // on-chain-verified mark
    event PassportUnregistered(string label);
    event IssuerTransferred(address indexed from, address indexed to);
    event PassportMintedPermissionless(string label, uint256 humanKey); // self-served, on-chain-verified (humanKey = keccak of nullifier)

    error NotIssuer();
    error HumanAlreadyUsed();
    error PassportExists();
    error NoPassport();
    error NoVerifier();     // writeMarkWithProof called but no on-chain verifier was wired
    error ProofRejected();  // Reclaim verifier said the attestation is invalid
    error ZeroAddress();
    error NoWorldRouter();  // mintWithProofs called but no on-chain World ID router wired
    error ProofNotBound();  // a Reclaim proof's signer isn't the caller (borrowed-proof attempt)
    error NotOwnerOrIssuer(); // grant/revoke by someone who is neither the passport owner nor issuer
    error Reentrancy();
    error InvalidLabel();   // label is empty or exceeds the 63-byte DNS single-label limit

    modifier onlyIssuer() {
        if (msg.sender != issuer) revert NotIssuer();
        _;
    }

    struct WorldIdConfig {
        IWorldID router;              // address(0) = no permissionless on-chain path (issuer-only mode)
        uint256 groupId;              // 1 = Orb
        uint256 externalNullifier;    // precomputed action external-nullifier hash
    }

   
    struct PolicyConfig {
        uint256 incomeMin;   // minimum attested income for maru.income = "pass"
        uint256 savingsMin;  // minimum attested savings for maru.savings = "pass"
    }

    constructor(
        IRegistry _registry,
        IPermissionedResolver _resolver,
        address _issuer,
        IReclaimVerifier _reclaimVerifier,
        WorldIdConfig memory _world,      // on-chain World ID router config (router=0 to disable)
        PolicyConfig memory _policy,      // immutable credential thresholds (NOT caller-supplied at mint)
        bytes memory _parentDnsSuffix     // DNS-encoded parent, e.g. \x08marumaru\x03eth\x00
    ) {
        if (_issuer == address(0)) revert ZeroAddress();
        registry = _registry;
        resolver = _resolver;
        issuer = _issuer;
        reclaimVerifier = _reclaimVerifier; // pass address(0) to run in off-chain-verified mode
        worldId = _world.router;
        worldGroupId = _world.groupId;
        worldExternalNullifier = _world.externalNullifier;
        policyIncomeMin = _policy.incomeMin;
        policySavingsMin = _policy.savingsMin;
        parentDnsSuffix = _parentDnsSuffix;
    }

    
    function transferIssuer(address newIssuer) external onlyIssuer {
        if (newIssuer == address(0)) revert ZeroAddress();
        emit IssuerTransferred(issuer, newIssuer);
        issuer = newIssuer;
    }

    function humanKeyOf(uint256 rawNullifier) public pure returns (uint256) {
        if (rawNullifier == 0) return 0;
        return uint256(keccak256(abi.encode(rawNullifier)));
    }

    /// Mint a passport subname. Soulbound unless `transferable`. One LIVE passport per human:
    /// a human whose prior passport has lapsed (expired on-chain) can mint a fresh one.
    /// `humanNullifier` is the RAW World nullifier; it is hashed to a humanKey immediately and the
    /// raw value is never stored or emitted (see humanKeyOf).
    function mintPassport(string calldata label, address owner, uint256 humanNullifier, bool transferable)
        external onlyIssuer returns (uint256 tokenId)
    {
        _requireValidLabel(label);                    // V3: reject empty / >63-byte labels
        bytes32 k = keccak256(bytes(label));
        if (_passport[k].exists) revert PassportExists();
        uint256 humanKey = humanKeyOf(humanNullifier);   // hash at the boundary; raw never persisted
        if (humanKey != 0) {
            // Block only if this human still holds a LIVE passport. If their prior passport
            // lapsed (expiry passed → registry.ownerOf == 0), free the slot and let them re-mint.
            bytes32 prev = _humanPassport[humanKey];
            if (prev != 0) {
                if (_isLive(prev)) revert HumanAlreadyUsed();
                _teardownPassport(prev);           // clear stale record + unwind its stacking grants (V1)
            }
            _humanPassport[humanKey] = k;
        }
        // the owner must not get ROLE_SET_RESOLVER. Soulbound also withholds
        // ROLE_CAN_TRANSFER_ADMIN; transferable opts that (and ONLY that) back in.
        uint256 roleBitmap = transferable ? RegistryRolesLib.ROLE_CAN_TRANSFER_ADMIN : 0;
        uint64 expiry = uint64(block.timestamp) + DEFAULT_TTL; //  refresh() extends
        tokenId = registry.register(label, owner, IRegistry(address(0)), address(resolver), roleBitmap, expiry);
        _passport[k] = Passport(tokenId, owner, !transferable, humanKey, true);
        emit PassportMinted(label, owner, tokenId, !transferable, humanKey);
    }

    /// Voluntarily give up a passport (frees the human to re-mint before natural expiry).
    /// Callable by the passport OWNER (self-minted path has no issuer) or the issuer.
    function unregisterPassport(string calldata label) external {
        bytes32 k = keccak256(bytes(label));
        Passport storage p = _passport[k];
        if (!p.exists) revert NoPassport();
        if (msg.sender != p.owner && msg.sender != issuer) revert NotOwnerOrIssuer();
        _teardownPassport(k);   // unwinds same-person-across-lenders grants + human link (V1) then deletes
        emit PassportUnregistered(label);
    }

    
    function _teardownPassport(bytes32 k) internal {
        Passport storage p = _passport[k];
        uint256 hk = p.humanKey;                       // derived key (never the raw nullifier)
        if (hk != 0) {
            address[] storage ls = _passportLenders[k];
            for (uint256 i = 0; i < ls.length; i++) {
                address lender = ls[i];
                if (_humanKeyLender[hk][lender]) {         // still counted → uncount it
                    _humanKeyLender[hk][lender] = false;
                    if (activeLenderCount[hk] != 0) activeLenderCount[hk] -= 1;
                }
                delete _passportLenderSeen[k][lender];     // reset so a same-label remint starts clean (V2)
            }
            delete _passportLenders[k];
            if (_humanPassport[hk] == k) delete _humanPassport[hk];
        }
        delete _passport[k];
    }

    /// True iff the passport at key `k` exists AND its on-chain name has not expired.
    function _isLive(bytes32 k) internal view returns (bool) {
        Passport storage p = _passport[k];
        if (!p.exists) return false;
        return registry.getExpiry(p.tokenId) > block.timestamp;
    }

    /// Public convenience: has the human with this humanKey got a LIVE passport right now?
    /// Takes the DERIVED humanKey (== humanKeyOf(rawNullifier)), consistent with activeLenderCount's
    /// key space: a caller holding the raw nullifier passes humanKeyOf(raw).
    function humanUsed(uint256 humanKey) external view returns (bool) {
        bytes32 k = _humanPassport[humanKey];
        return k != 0 && _isLive(k);
    }

    /// Write a credential mark (e.g. "pass"/"fail") to the scoped text record for `kind`.
    function writeMark(string calldata label, CredentialKind kind, string calldata value, uint64 expiry)
        external onlyIssuer
    {
        _requireValidLabel(label);                    // consistency w/ mint paths: clean InvalidLabel, not a raw _dnsEncode revert
        bytes32 k = keccak256(bytes(label));
        if (!_passport[k].exists) revert NoPassport();
        // resolver enforces per-key ROLE_SET_TEXT (granted to this registrar once, at deploy).
        resolver.setText(_node(label), _keyOf(kind), value);
        if (expiry > registry.getExpiry(_passport[k].tokenId)) {
            registry.renew(_passport[k].tokenId, expiry);
        }
        emit MarkWritten(label, kind, value, expiry);
    }

      function writeMarkWithProof(
        string calldata label,
        CredentialKind kind,
        string calldata paramKey,
        uint256 threshold,
        uint64 expiry,
        ReclaimProof calldata proof
    ) external onlyIssuer {
        if (address(reclaimVerifier) == address(0)) revert NoVerifier();
        _requireValidLabel(label);                    // consistency w/ mint paths (clean InvalidLabel)
        bytes32 k = keccak256(bytes(label));
        if (!_passport[k].exists) revert NoPassport();
        // On-chain: verify signature AND get the attested number from the SIGNED claim.
        (bool ok, uint256 attested) = reclaimVerifier.verifyAndExtract(proof, paramKey);
        if (!ok) revert ProofRejected();
        // The contract derives the value — not the caller. IncomeBand is a RANGE (from the attested
        // income vs the immutable floor, `threshold` ignored); every other kind is pass/fail vs threshold.
        string memory mark = kind == CredentialKind.IncomeBand
            ? _incomeBandLabel(attested)
            : (attested >= threshold ? "pass" : "fail");
        resolver.setText(_node(label), _keyOf(kind), mark);
        if (expiry > registry.getExpiry(_passport[k].tokenId)) {
            registry.renew(_passport[k].tokenId, expiry);
        }
        emit MarkWritten(label, kind, mark, expiry);
        emit MarkAttested(label, kind, mark, proof.signedClaim.identifier);
    }

   
    /// @param root World ID Merkle root (must be a root the router recognises).
    /// @param nullifierHash the human's RAW Orb nullifier (uint256) — required by verifyProof, then
    ///        immediately hashed to humanKey; the raw value is never stored or emitted.
    /// @param worldProof the v3 Semaphore proof (uint256[8]).
    /// @param incomeProof Reclaim attestation of income, signed for msg.sender.
    /// @param savingsProof Reclaim attestation of savings, signed for msg.sender.
    function mintWithProofs(
        string calldata label,
        uint256 root,
        uint256 nullifierHash,
        uint256[8] calldata worldProof,
        ReclaimProof calldata incomeProof,
        ReclaimProof calldata savingsProof
    ) external nonReentrant returns (uint256 tokenId) {
        if (address(worldId) == address(0)) revert NoWorldRouter();
        if (address(reclaimVerifier) == address(0)) revert NoVerifier();
        _requireValidLabel(label);                    // V3: borrower-supplied label — reject empty / >63 bytes
        bytes32 k = keccak256(bytes(label));
        if (_passport[k].exists) revert PassportExists();

        // 1. Verify Proof of Human ON-CHAIN. The raw nullifierHash is required here, the Semaphore
        //    proof is bound to it, so verifyProof must receive the raw value. signal = the borrower
        //    (msg.sender) binds the proof to this caller so it can't be front-run/replayed by
        //    someone else. v3 router REVERTS on an invalid proof.
        uint256 signalHash = uint256(keccak256(abi.encodePacked(msg.sender))) >> 8;
        worldId.verifyProof(root, worldGroupId, signalHash, nullifierHash, worldExternalNullifier, worldProof);

        // 1b. Immediately derive the humanKey and DROP the raw nullifier: from here on nothing is
        //     stored or emitted except this one-way key (booth: "a nullifier is like a secret key").
        uint256 humanKey = humanKeyOf(nullifierHash);

        // 2. Bind both bank proofs to the caller: the attestor signed the claim for this
        //    address, so a borrowed/mempool-lifted proof for a different owner reverts here.
        if (incomeProof.signedClaim.owner != msg.sender) revert ProofNotBound();
        if (savingsProof.signedClaim.owner != msg.sender) revert ProofNotBound();

        // 3. One LIVE passport per human (the derived humanKey IS the human key).
        bytes32 prev = _humanPassport[humanKey];
        if (prev != 0) {
            if (_isLive(prev)) revert HumanAlreadyUsed();
            _teardownPassport(prev);   // unwind the stale passport's stacking grants too (V1)
        }
        _humanPassport[humanKey] = k;

        // 4. Verify BOTH attestations ON-CHAIN and derive marks from the ATTESTED values vs
        //    the IMMUTABLE protocol policy — not caller arguments.
        (bool okI, uint256 income) = reclaimVerifier.verifyAndExtract(incomeProof, "income");
        if (!okI) revert ProofRejected();
        (bool okS, uint256 savings) = reclaimVerifier.verifyAndExtract(savingsProof, "savings");
        if (!okS) revert ProofRejected();
        string memory incomeMark = income >= policyIncomeMin ? "pass" : "fail";
        string memory savingsMark = savings >= policySavingsMin ? "pass" : "fail";

        // 5. Mint the soulbound passport to the borrower + write human/income/savings marks.
        //    Expiry clamped to the protocol freshness window.
        uint64 expiry = uint64(block.timestamp) + DEFAULT_TTL;
        // 0 roles — owner cannot repoint the resolver (which would let them forge marks).
        tokenId = registry.register(label, msg.sender, IRegistry(address(0)), address(resolver), 0, expiry);
        _passport[k] = Passport(tokenId, msg.sender, true, humanKey, true);
        resolver.setText(_node(label), "maru.human", "verified");
        // Assurance tier. This path verifies against the World Router at worldGroupId == 1 (Orb), so a
        // successful mint is PROVABLY Orb — write "orb" so a lender reading an on-chain-minted passport
        // sees the same assurance flag the issuer path publishes (else it reads as an unknown tier).
        resolver.setText(_node(label), "maru.assurance", "orb");
        resolver.setText(_node(label), "maru.income", incomeMark);
        resolver.setText(_node(label), "maru.savings", savingsMark);
        // Also publish the coarse income band (a range, not pass/fail) — derived from the SAME attested
        // income, so it needs no extra proof. Lets a lender price a rate/LTV tier without exposing the figure.
        // Done in a helper so its `string` local lives in its own stack frame
        _publishIncomeBand(label, income, incomeProof.signedClaim.identifier);
        emit PassportMinted(label, msg.sender, tokenId, true, humanKey);
        emit PassportMintedPermissionless(label, humanKey);
        emit MarkAttested(label, CredentialKind.Income, incomeMark, incomeProof.signedClaim.identifier);
        emit MarkAttested(label, CredentialKind.Savings, savingsMark, savingsProof.signedClaim.identifier);
    }

    /// Extend passport freshness on a new proof.
    function refresh(string calldata label, uint64 newExpiry) external onlyIssuer {
        bytes32 k = keccak256(bytes(label));
        if (!_passport[k].exists) revert NoPassport();
        registry.renew(_passport[k].tokenId, newExpiry);
        emit PassportRefreshed(label, newExpiry);
    }

    /// Grant a lender time-boxed authorization. Callable by the passport owner (the borrower)
    function grantLender(string calldata label, address lender, uint64 until) external {
        if (lender == address(0)) revert ZeroAddress(); // a null lender would inflate the same-person-across-lenders count
        bytes32 k = keccak256(bytes(label));
        Passport storage p = _passport[k];
        if (!p.exists) revert NoPassport();
        if (msg.sender != p.owner && msg.sender != issuer) revert NotOwnerOrIssuer();
        _lenderUntil[k][lender] = until;
        // Count this lender against the human (by derived humanKey), once, across all their passports.
        uint256 hk = p.humanKey;
        if (hk != 0 && !_humanKeyLender[hk][lender]) {
            _humanKeyLender[hk][lender] = true;
            activeLenderCount[hk] += 1;
            // Record for teardown, but once per distinct lender (V2): a grant/revoke/re-grant
            // cycle re-enters this branch, so without this dedup the array would grow unbounded
            // and eventually make _teardownPassport exceed the block gas limit. (bricking)
            // unregister + remint (a DoS that also locks the human out of re-minting).
            if (!_passportLenderSeen[k][lender]) {
                _passportLenderSeen[k][lender] = true;
                _passportLenders[k].push(lender);
            }
            if (activeLenderCount[hk] > 1) emit StackingObserved(hk, lender, activeLenderCount[hk]);
        }
        emit LenderGranted(label, lender, until);
    }

    function revokeLender(string calldata label, address lender) external {
        bytes32 k = keccak256(bytes(label));
        Passport storage p = _passport[k];
        if (!p.exists) revert NoPassport();
        if (msg.sender != p.owner && msg.sender != issuer) revert NotOwnerOrIssuer();
        _lenderUntil[k][lender] = 0;
        uint256 hk = p.humanKey;
        if (hk != 0 && _humanKeyLender[hk][lender]) {
            _humanKeyLender[hk][lender] = false;
            if (activeLenderCount[hk] != 0) activeLenderCount[hk] -= 1; // guard mirrors _teardownPassport (defense-in-depth)
        }
        emit LenderRevoked(label, lender);
    }

    // ---- views ----
    function isLenderAuthorized(string calldata label, address lender) external view returns (bool) {
        return _lenderUntil[keccak256(bytes(label))][lender] > block.timestamp;
    }

    
    function humanActiveLenders(string calldata label) external view returns (uint32) {
        return activeLenderCount[_passport[keccak256(bytes(label))].humanKey];
    }

    function passportOf(string calldata label) external view returns (PassportView memory v) {
        Passport storage p = _passport[keccak256(bytes(label))];
        v = PassportView(p.owner, registry.getExpiry(p.tokenId), p.soulbound, p.humanKey);
    }

    function exists(string calldata label) external view returns (bool) {
        return _passport[keccak256(bytes(label))].exists;
    }

    // ---- internal ----
    function _keyOf(CredentialKind kind) internal pure returns (string memory) {
        if (kind == CredentialKind.Income) return "maru.income";
        if (kind == CredentialKind.Savings) return "maru.savings";
        if (kind == CredentialKind.Dsr) return "maru.dsr";
        if (kind == CredentialKind.IncomeBand) return "maru.income_band";
        if (kind == CredentialKind.Assurance) return "maru.assurance";  // World tier: orb|passport|selfie
        return "maru.human";
    }

    /// The coarse income BAND as a MULTIPLE of the qualifying floor (policyIncomeMin), a range the
    /// borrower discloses for rate/LTV tiering, never the actual figure. Mirrors the off-chain issuer's default
    /// buckets [1, 1.5, 2] → "<1x" | "1-1.5x" | "1.5-2x" | "2x+". pure integer math (the 1.5 edge is
    /// tested as income*2 < floor*3), so no division/rounding; ^0.8 checked arithmetic reverts on the
    /// (unrealistic) overflow of a colossal attested income rather than misbehaving.
    /// NOTE: these edges are the fixed protocol default, a deployment that changes the off-chain
    /// `incomeBandMultiples` must update these to match (they're the two halves of one policy).
    function _incomeBandLabel(uint256 income) internal view returns (string memory) {
        uint256 floor = policyIncomeMin;
        if (floor == 0 || income < floor) return "<1x";        // below the entry line
        if (income * 2 < floor * 3) return "1-1.5x";           // income < 1.5x floor
        if (income < floor * 2) return "1.5-2x";               // income < 2x floor
        return "2x+";
    }

    function _publishIncomeBand(string calldata label, uint256 income, bytes32 proofId) internal {
        string memory m = _incomeBandLabel(income);
        resolver.setText(_node(label), "maru.income_band", m);
        emit MarkAttested(label, CredentialKind.IncomeBand, m, proofId);
    }

    /// A DNS label is length-prefixed by a single byte, so it must be 1..63 bytes (values
    /// 64+ are illegal/compression-reserved). Without this, a >=256-byte label would make
    /// `uint8(l.length)` wrap mod 256 in _dnsEncode (V3): the passport key is keccak256(full
    /// label) but the mark would be written under a different, truncated node then the marks land on
    /// the wrong name or collide with another registration. The borrower picks the label in
    /// the permissionless mint, so this must be enforced on-chain, at every mint entry point.
    function _requireValidLabel(string calldata label) internal pure {
        uint256 n = bytes(label).length;
        if (n == 0 || n > 63) revert InvalidLabel();
    }

    /// DNS-encode the full name `label.<parentDnsSuffix>` for the resolver setter, so
    /// setText targets the correct node (not just the bare label).
    function _dnsEncode(string calldata label) internal view returns (bytes memory) {
        bytes memory l = bytes(label);
        require(l.length > 0 && l.length <= 63, "label len"); // defense-in-depth vs V3 wrap
        return abi.encodePacked(uint8(l.length), l, parentDnsSuffix);
    }

    /// The ENS node (EIP-137 namehash) of `label.<parent>`. 
    function _node(string calldata label) internal view returns (bytes32) {
        return _namehash(_dnsEncode(label));
    }

    /// EIP-137 namehash of a DNS-wire-encoded name (\x04aiko\x08marumaru\x03eth\x00).
    function _namehash(bytes memory dnsName) internal pure returns (bytes32 node) {
        // collect label boundaries
        uint256 n = dnsName.length;
        uint256[] memory offs = new uint256[](n);   // upper bound on label count
        uint256[] memory lens = new uint256[](n);
        uint256 count;
        uint256 i;
        while (i < n) {
            uint256 len = uint8(dnsName[i]);
            if (len == 0) break; // root terminator
            offs[count] = i + 1;
            lens[count] = len;
            count++;
            i += 1 + len;
        }
        // fold from the last label inward: node starts at 0 (root)
        node = bytes32(0);
        for (uint256 j = count; j > 0; j--) {
            uint256 off = offs[j - 1];
            uint256 len = lens[j - 1];
            bytes32 labelHash;
            // labelHash = keccak256(dnsName[off .. off+len])
            assembly {
                labelHash := keccak256(add(add(dnsName, 0x20), off), len)
            }
            node = keccak256(abi.encodePacked(node, labelHash));
        }
    }
}
