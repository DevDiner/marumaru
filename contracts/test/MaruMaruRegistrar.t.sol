// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {MaruMaruRegistrar} from "../src/MaruMaruRegistrar.sol";
import {MockENSv2} from "./mocks/MockENSv2.sol";
import {MockReclaimVerifier} from "./mocks/MockReclaimVerifier.sol";
import {MockWorldID} from "./mocks/MockWorldID.sol";
import {IRegistry, IPermissionedResolver, RegistryRolesLib} from "../src/interfaces/IENSv2.sol";
import {IReclaimVerifier, ReclaimProof, ReclaimClaimInfo, ReclaimSignedClaim} from "../src/interfaces/IReclaimVerifier.sol";
import {IWorldID} from "../src/interfaces/IWorldID.sol";
import {CredentialKind, PassportView} from "../src/interfaces/IMaruTypes.sol";

contract MaruMaruRegistrarTest is Test {
    MockENSv2 ens;
    MockReclaimVerifier verifier;
    MockWorldID world;
    MaruMaruRegistrar reg;
    address issuer = address(0xABCD);
    address borrower = address(0xB0B);
    address lender = address(0x1EED);
    // DNS-encoded parent "marumaru.eth": \x08marumaru\x03eth\x00
    bytes PARENT = hex"086d6172756d6172750365746800";
    uint256 constant ROLE_SET_RESOLVER = RegistryRolesLib.ROLE_SET_RESOLVER;
    uint256 constant ROLE_CAN_TRANSFER_ADMIN = RegistryRolesLib.ROLE_CAN_TRANSFER_ADMIN;

    function _world() internal view returns (MaruMaruRegistrar.WorldIdConfig memory) {
        return MaruMaruRegistrar.WorldIdConfig({ router: IWorldID(address(world)), groupId: 1, externalNullifier: 42 });
    }

    function _policy() internal pure returns (MaruMaruRegistrar.PolicyConfig memory) {
        return MaruMaruRegistrar.PolicyConfig({ incomeMin: 10000, savingsMin: 50000 });
    }

    function setUp() public {
        ens = new MockENSv2();
        verifier = new MockReclaimVerifier();
        world = new MockWorldID();
        reg = new MaruMaruRegistrar(IRegistry(address(ens)), IPermissionedResolver(address(ens)), issuer, IReclaimVerifier(address(verifier)), _world(), _policy(), PARENT);
        // Authorize the registrar to write each maru.* key on ANY subname — authorizeKey grants
        // ROLE_SET_TEXT on resource(0, partHash(key)), exactly what deploy_ensv2.mjs does via
        // authorizeTextRoles(emptyName, key, registrar, true). Mirror MARU_KEYS EXACTLY — all 6 keys.
        // maru.income_band is written INSIDE mintWithProofs (without its grant every mint test would
        // revert "no ROLE_SET_TEXT for (node,key)"); maru.dsr is written by writeMark(Dsr). Under-
        // authorizing here would hide a real deploy-wiring bug — the mock enforces the real (node,part)
        // scoping, so a mark only reads back if the write was authorized AND the namehash agrees.
        ens.authorizeKey("maru.income", address(reg));
        ens.authorizeKey("maru.savings", address(reg));
        ens.authorizeKey("maru.human", address(reg));
        ens.authorizeKey("maru.dsr", address(reg));
        ens.authorizeKey("maru.income_band", address(reg));
        ens.authorizeKey("maru.assurance", address(reg));   // World tier mark (orb|passport|selfie)
    }

    // helper: an empty v3 proof array
    function _wp() internal pure returns (uint256[8] memory p) { }

    function _readMark(string memory label, string memory key) internal view returns (string memory) {
        return ens.readTextByLabel(label, PARENT, key);
    }

    // Build a Reclaim proof bundle with `sigs` attestor signatures (0 = malformed/invalid),
    // signed for the borrower by default.
    function _proof(uint256 sigs) internal view returns (ReclaimProof memory p) {
        return _proofFor(sigs, borrower);
    }

    // Build a proof signed for a specific owner (to test caller-binding, C1).
    function _proofFor(uint256 sigs, address owner) internal pure returns (ReclaimProof memory p) {
        p.claimInfo = ReclaimClaimInfo({ provider: "stub-bank", parameters: "{\"income\":\"12000\"}", context: "sess-1" });
        bytes[] memory s = new bytes[](sigs);
        for (uint256 i = 0; i < sigs; i++) s[i] = hex"01";
        p.signedClaim = ReclaimSignedClaim({ identifier: keccak256("claim"), owner: owner, timestampS: 1, signatures: s });
    }

    // helper: build a label of exactly n bytes (all 'a')
    function _label(uint256 n) internal pure returns (string memory) {
        bytes memory b = new bytes(n);
        for (uint256 i = 0; i < n; i++) b[i] = "a";
        return string(b);
    }

    // V3: labels must be 1..63 bytes (single DNS length byte). Empty and >63 must revert,
    // BEFORE any mark can be written to a wrong/truncated node. Both mint paths.
    function test_mintPassport_rejects_empty_label() public {
        vm.prank(issuer);
        vm.expectRevert(MaruMaruRegistrar.InvalidLabel.selector);
        reg.mintPassport("", borrower, 111, false);
    }

    function test_mintPassport_rejects_label_over_63_bytes() public {
        vm.prank(issuer);
        vm.expectRevert(MaruMaruRegistrar.InvalidLabel.selector);
        reg.mintPassport(_label(64), borrower, 111, false);   // 64 → uint8 wrap risk
    }

    function test_mintPassport_accepts_max_63_byte_label() public {
        vm.prank(issuer);
        reg.mintPassport(_label(63), borrower, 111, false);   // exactly the DNS limit → ok
        assertTrue(reg.exists(_label(63)));
    }

    function test_mintWithProofs_rejects_oversized_label() public {
        world.setAccept(true);
        vm.prank(borrower);
        vm.expectRevert(MaruMaruRegistrar.InvalidLabel.selector);
        reg.mintWithProofs(_label(256), 111, 555, _wp(), _proof(1), _proof(1)); // 256 → uint8(256)=0
    }

    function test_mint_soulbound_by_default() public {
        vm.prank(issuer);
        reg.mintPassport("aiko", borrower, 111, false);
        PassportView memory v = reg.passportOf("aiko");
        assertEq(v.owner, borrower);
        assertTrue(v.soulbound);
    }

    function test_mint_transferable_optIn() public {
        vm.prank(issuer);
        reg.mintPassport("aiko", borrower, 111, true);
        assertFalse(reg.passportOf("aiko").soulbound);
    }

    // R1 (critical): the owner must NOT hold ROLE_SET_RESOLVER — otherwise they could repoint
    // their subname to a lying resolver and forge every mark. Soulbound mint grants 0 roles.
    function test_owner_cannot_set_resolver_soulbound() public {
        vm.prank(issuer);
        reg.mintPassport("aiko", borrower, 111, false);
        uint256 tokenId = ens.tokenOf("aiko");
        assertFalse(ens.hasRoles(tokenId, ROLE_SET_RESOLVER, borrower), "owner must NOT be able to change resolver");
        assertFalse(ens.hasRoles(tokenId, ROLE_CAN_TRANSFER_ADMIN, borrower), "soulbound: no transfer admin");
    }

    // R1: even a transferable passport only gets the transfer-admin role back — still NOT resolver.
    function test_owner_cannot_set_resolver_transferable() public {
        vm.prank(issuer);
        reg.mintPassport("aiko", borrower, 111, true);
        uint256 tokenId = ens.tokenOf("aiko");
        assertFalse(ens.hasRoles(tokenId, ROLE_SET_RESOLVER, borrower), "owner must NOT be able to change resolver");
        assertTrue(ens.hasRoles(tokenId, ROLE_CAN_TRANSFER_ADMIN, borrower), "transferable: transfer admin granted");
    }

    // R1: the self-minted (permissionless) passport also withholds resolver control.
    function test_selfminted_owner_cannot_set_resolver() public {
        world.setAccept(true);
        vm.prank(borrower);
        reg.mintWithProofs("aiko", 111, 555, _wp(), _proof(1), _proof(1));
        uint256 tokenId = ens.tokenOf("aiko");
        assertFalse(ens.hasRoles(tokenId, ROLE_SET_RESOLVER, borrower), "self-minted owner must NOT control resolver");
    }

    // R3: the passport owner can unregister their own passport (no issuer in the self-mint path).
    function test_owner_can_unregister_own_passport() public {
        world.setAccept(true);
        vm.prank(borrower);
        reg.mintWithProofs("aiko", 111, 555, _wp(), _proof(1), _proof(1));
        vm.prank(borrower);                              // owner, not issuer
        reg.unregisterPassport("aiko");
        assertFalse(reg.exists("aiko"));
        assertFalse(reg.humanUsed(reg.humanKeyOf(555)));                 // human freed to re-mint
    }

    function test_stranger_cannot_unregister() public {
        vm.prank(issuer);
        reg.mintPassport("aiko", borrower, 111, false);
        vm.prank(address(0xDEAD));
        vm.expectRevert(MaruMaruRegistrar.NotOwnerOrIssuer.selector);
        reg.unregisterPassport("aiko");
    }

    // V1: unregister must UNWIND the same-person-across-lenders counter, or a human stays counted against a
    // lender whose passport no longer exists (leak → the stacking signal becomes corruptible).
    function test_unregister_unwinds_stacking_count() public {
        vm.startPrank(issuer);
        reg.mintPassport("aiko", borrower, 7, false);
        reg.grantLender("aiko", address(0xA), uint64(block.timestamp + 14 days));
        reg.grantLender("aiko", address(0xB), uint64(block.timestamp + 14 days));
        assertEq(reg.activeLenderCount(reg.humanKeyOf(7)), 2);            // two standing grants
        reg.unregisterPassport("aiko");
        vm.stopPrank();
        assertEq(reg.activeLenderCount(reg.humanKeyOf(7)), 0);            // MUST be zeroed — no leak
    }

    // V1: after unregister + re-mint, a fresh grant to the SAME lender must count again
    // (the stuck _humanKeyLender flag must have been cleared, or re-grants go invisible).
    function test_remint_after_unregister_recounts_same_lender() public {
        vm.startPrank(issuer);
        reg.mintPassport("aiko", borrower, 7, false);
        reg.grantLender("aiko", address(0xA), uint64(block.timestamp + 14 days));
        reg.unregisterPassport("aiko");
        assertEq(reg.activeLenderCount(reg.humanKeyOf(7)), 0);
        reg.mintPassport("aiko2", borrower, 7, false);    // same human, new passport
        reg.grantLender("aiko2", address(0xA), uint64(block.timestamp + 14 days));
        assertEq(reg.activeLenderCount(reg.humanKeyOf(7)), 1);            // re-grant is visible again, not stuck
        vm.stopPrank();
    }

    // V2: repeated grant/revoke/re-grant of the SAME lender must not grow the teardown list
    // unbounded (a DoS that would brick unregister/remint). After many cycles, unregister still
    // completes cheaply and the count zeroes correctly.
    function test_grant_revoke_cycles_do_not_bloat_teardown() public {
        vm.startPrank(issuer);
        reg.mintPassport("aiko", borrower, 7, false);
        for (uint256 i = 0; i < 20; i++) {
            reg.grantLender("aiko", address(0xA), uint64(block.timestamp + 14 days));
            reg.revokeLender("aiko", address(0xA));
        }
        reg.grantLender("aiko", address(0xA), uint64(block.timestamp + 14 days)); // end granted
        assertEq(reg.activeLenderCount(reg.humanKeyOf(7)), 1);
        reg.unregisterPassport("aiko");                   // must not run out of gas
        assertEq(reg.activeLenderCount(reg.humanKeyOf(7)), 0);            // and must still zero out
        vm.stopPrank();
    }

    // V1: the same leak must not survive the expiry-driven remint path either.
    function test_remint_after_expiry_unwinds_prior_stacking() public {
        vm.startPrank(issuer);
        reg.mintPassport("aiko", borrower, 7, false);
        reg.grantLender("aiko", address(0xA), uint64(block.timestamp + 14 days));
        assertEq(reg.activeLenderCount(reg.humanKeyOf(7)), 1);
        vm.warp(block.timestamp + 31 days);               // let the passport lapse
        reg.mintPassport("aiko-2026", borrower, 7, false); // remint frees the slot + tears down prior
        vm.stopPrank();
        assertEq(reg.activeLenderCount(reg.humanKeyOf(7)), 0);            // prior passport's grant was unwound
    }

    function test_one_passport_per_human() public {
        vm.startPrank(issuer);
        reg.mintPassport("aiko", borrower, 111, false);
        vm.expectRevert(MaruMaruRegistrar.HumanAlreadyUsed.selector);
        reg.mintPassport("aiko2", address(0xC0C), 111, false); // same nullifier
        vm.stopPrank();
    }

    // H1 fix: a human whose passport LAPSED (expired) can mint a fresh one.
    function test_human_can_remint_after_expiry() public {
        vm.startPrank(issuer);
        reg.mintPassport("aiko", borrower, 111, false);          // 30-day passport
        vm.warp(block.timestamp + 31 days);                       // let it lapse
        reg.mintPassport("aiko-2026", borrower, 111, false);     // SAME human, new name → allowed now
        vm.stopPrank();
        assertTrue(reg.exists("aiko-2026"));
        assertTrue(reg.humanUsed(reg.humanKeyOf(111)));                           // now bound to the fresh live passport
    }

    // ...but a human with a LIVE passport still can't mint a second (one live per human).
    function test_human_blocked_while_passport_live() public {
        vm.startPrank(issuer);
        reg.mintPassport("aiko", borrower, 111, false);
        vm.expectRevert(MaruMaruRegistrar.HumanAlreadyUsed.selector);
        reg.mintPassport("aiko2", borrower, 111, false);          // still live → blocked
        vm.stopPrank();
    }

    // unregister frees the human immediately (before natural expiry).
    function test_unregister_frees_human() public {
        vm.startPrank(issuer);
        reg.mintPassport("aiko", borrower, 111, false);
        reg.unregisterPassport("aiko");
        assertFalse(reg.humanUsed(reg.humanKeyOf(111)));
        reg.mintPassport("aiko-new", borrower, 111, false);       // allowed after unregister
        vm.stopPrank();
        assertTrue(reg.exists("aiko-new"));
    }

    // M3: issuer key can be rotated; old key loses power, new key gains it.
    function test_issuer_can_be_rotated() public {
        address newIssuer = address(0xF00D);
        vm.prank(issuer);
        reg.transferIssuer(newIssuer);
        assertEq(reg.issuer(), newIssuer);
        vm.prank(issuer);                                         // old key now powerless
        vm.expectRevert(MaruMaruRegistrar.NotIssuer.selector);
        reg.mintPassport("x", borrower, 1, false);
        vm.prank(newIssuer);                                      // new key works
        reg.mintPassport("x", borrower, 1, false);
        assertTrue(reg.exists("x"));
    }

    function test_cannot_mint_same_label_twice() public {
        vm.startPrank(issuer);
        reg.mintPassport("aiko", borrower, 111, false);
        vm.expectRevert(MaruMaruRegistrar.PassportExists.selector);
        reg.mintPassport("aiko", borrower, 222, false);
        vm.stopPrank();
    }

    function test_only_issuer_can_mint() public {
        vm.expectRevert(MaruMaruRegistrar.NotIssuer.selector);
        reg.mintPassport("aiko", borrower, 1, false);
    }

    function test_writeMark_stores_readable_value() public {
        vm.startPrank(issuer);
        reg.mintPassport("aiko", borrower, 1, false);
        reg.writeMark("aiko", CredentialKind.Income, "pass", uint64(block.timestamp + 30 days));
        reg.writeMark("aiko", CredentialKind.Savings, "fail", uint64(block.timestamp + 30 days));
        vm.stopPrank();
        assertEq(_readMark("aiko", "maru.income"), "pass");
        assertEq(_readMark("aiko", "maru.savings"), "fail");
    }

    // The World assurance tier is written under maru.assurance (CredentialKind.Assurance, index 5) and
    // must read back by namehash — this is the on-chain half of the tiered-verification flag a lender prices.
    function test_assurance_mark_stores_readable_tier() public {
        vm.startPrank(issuer);
        reg.mintPassport("aiko", borrower, 1, false);
        reg.writeMark("aiko", CredentialKind.Assurance, "selfie", uint64(block.timestamp + 30 days));
        vm.stopPrank();
        assertEq(_readMark("aiko", "maru.assurance"), "selfie");
    }

    // ENSv2 alignment: the resolver's setText takes a bytes32 NODE = EIP-137 namehash of the FULL name.
    // Pin the canonical namehash of aiko.marumaru.eth (independently computed via ethers' namehash) so a
    // regression in the registrar's _namehash (or the mock's, which must match it) is caught immediately.
    // If this value ever drifts, marks would be written under a node no standard resolver read can find.
    function test_node_is_canonical_eip137_namehash() public {
        vm.startPrank(issuer);
        reg.mintPassport("aiko", borrower, 1, false);
        reg.writeMark("aiko", CredentialKind.Human, "verified", uint64(block.timestamp + 30 days));
        vm.stopPrank();
        // canonical namehash("aiko.marumaru.eth") — matches ethers.utils.namehash exactly.
        bytes32 node = 0x7c70461ac5f453cc85c9e2040129a27c2dd458fea490c6340c230a18f3b8810b;
        assertEq(ens.text(node, "maru.human"), "verified", "mark not stored under the canonical namehash node");
    }

    // ENSv2 EAC scoping: an issuer authorized for the five maru.* keys CANNOT write a different key
    // (proves setText is gated per-(node/any-name, key) via ROLE_SET_TEXT, not a blanket write). setUp
    // authorizes only the maru.* keys, so writing an un-authorized resolver key must revert.
    function test_setText_reverts_for_unauthorized_key() public {
        vm.startPrank(issuer);
        reg.mintPassport("aiko", borrower, 1, false);
        vm.stopPrank();
        bytes32 node = 0x7c70461ac5f453cc85c9e2040129a27c2dd458fea490c6340c230a18f3b8810b;
        // The registrar only ever writes maru.* keys; a direct attempt to set an un-granted key
        // (e.g. "avatar") on the resolver — even by the issuer — is refused by the mock's EAC.
        vm.prank(issuer);
        vm.expectRevert(bytes("no ROLE_SET_TEXT for (node,key)"));
        ens.setText(node, "avatar", "ipfs://evil");
    }

    function test_writeMark_requires_passport() public {
        vm.prank(issuer);
        vm.expectRevert(MaruMaruRegistrar.NoPassport.selector);
        reg.writeMark("ghost", CredentialKind.Income, "pass", uint64(block.timestamp + 1 days));
    }

    // The 4th credential kind (Dsr) writes to its own maru.dsr text record — the horizontal
    // expansion: a new fact is just one more scoped key on the same name.
    function test_writeMark_dsr_stores_under_its_own_key() public {
        vm.startPrank(issuer);
        reg.mintPassport("aiko", borrower, 1, false);
        reg.writeMark("aiko", CredentialKind.Dsr, "pass", uint64(block.timestamp + 30 days));
        vm.stopPrank();
        assertEq(_readMark("aiko", "maru.dsr"), "pass");
        assertEq(_readMark("aiko", "maru.income"), ""); // independent key, not clobbered
    }

    // --- on-chain Reclaim attestation verification (the trustless path) ---
    function test_writeMarkWithProof_verifies_onchain_then_writes() public {
        vm.startPrank(issuer);
        reg.mintPassport("aiko", borrower, 1, false);
        verifier.setAttestedValue(12000);   // attestor signed income = 12000
        reg.writeMarkWithProof("aiko", CredentialKind.Income, "income", 10000, uint64(block.timestamp + 30 days), _proof(1));
        vm.stopPrank();
        assertEq(_readMark("aiko", "maru.income"), "pass"); // 12000 >= 10000, derived on-chain
    }

    // THE KEY PROPERTY: the mark is DERIVED from the attested value, not chosen by the caller.
    // Attested value is below threshold → contract writes "fail" no matter what the caller wants.
    function test_writeMarkWithProof_mark_is_derived_not_caller_chosen() public {
        vm.startPrank(issuer);
        reg.mintPassport("aiko", borrower, 1, false);
        verifier.setAttestedValue(8000);    // attestor signed income = 8000 (below policy)
        reg.writeMarkWithProof("aiko", CredentialKind.Income, "income", 10000, uint64(block.timestamp + 30 days), _proof(1));
        vm.stopPrank();
        assertEq(_readMark("aiko", "maru.income"), "fail"); // 8000 < 10000 → the caller CANNOT force "pass"
    }

    function test_writeMarkWithProof_rejects_invalid_attestation() public {
        vm.startPrank(issuer);
        reg.mintPassport("aiko", borrower, 1, false);
        verifier.setAccept(false); // attestor says NO
        vm.expectRevert(MaruMaruRegistrar.ProofRejected.selector);
        reg.writeMarkWithProof("aiko", CredentialKind.Income, "income", 10000, uint64(block.timestamp + 30 days), _proof(1));
        vm.stopPrank();
    }

    function test_writeMarkWithProof_rejects_unsigned_proof() public {
        vm.startPrank(issuer);
        reg.mintPassport("aiko", borrower, 1, false);
        vm.expectRevert(MaruMaruRegistrar.ProofRejected.selector);
        reg.writeMarkWithProof("aiko", CredentialKind.Income, "income", 10000, uint64(block.timestamp + 30 days), _proof(0)); // 0 sigs
        vm.stopPrank();
    }

    function test_writeMarkWithProof_reverts_when_no_verifier_wired() public {
        // a registrar deployed in off-chain-verified mode (verifier == address(0))
        MaruMaruRegistrar off = new MaruMaruRegistrar(IRegistry(address(ens)), IPermissionedResolver(address(ens)), issuer, IReclaimVerifier(address(0)), _world(), _policy(), PARENT);
        ens.authorizeKey("maru.income", address(off));
        vm.startPrank(issuer);
        off.mintPassport("bo", borrower, 2, false);
        vm.expectRevert(MaruMaruRegistrar.NoVerifier.selector);
        off.writeMarkWithProof("bo", CredentialKind.Income, "income", 10000, uint64(block.timestamp + 30 days), _proof(1));
        vm.stopPrank();
    }

    // writeMarkWithProof(IncomeBand) is the UPDATE path for the band: it must write the RANGE label
    // (identical bucketing to mintWithProofs), NOT "pass"/"fail", and must IGNORE the `threshold` arg
    // (the band is measured against the immutable floor, not the caller's threshold). This is the
    // branch that makes the update path consistent with the create path for the same key.
    function test_writeMarkWithProof_income_band_writes_range_not_passfail() public {
        vm.startPrank(issuer);
        reg.mintPassport("aiko", borrower, 1, false);
        verifier.setAttestedValue(18000);   // 1.8x floor(10000) → "1.5-2x"
        // threshold passed as a deliberately-wrong 999999 to PROVE it's ignored for the band.
        reg.writeMarkWithProof("aiko", CredentialKind.IncomeBand, "income", 999999, uint64(block.timestamp + 30 days), _proof(1));
        vm.stopPrank();
        assertEq(_readMark("aiko", "maru.income_band"), "1.5-2x"); // a range, derived vs the FLOOR
    }

    // The non-band kinds are unaffected by the new IncomeBand branch: a threshold mark still resolves
    // via the UNIFORM `attested >= threshold` rule. (Savings, not Dsr, on purpose — writeMarkWithProof
    // extracts ONE value and does NOT invert, so it can't express DSR's two-fact debt÷income ≤ cap; DSR
    // reaches chain via the issuer writeMark path, which takes the already-computed pass/fail string.)
    function test_writeMarkWithProof_savings_still_passfail_after_band_branch() public {
        vm.startPrank(issuer);
        reg.mintPassport("aiko", borrower, 1, false);
        verifier.setAttestedValue(60000);   // >= threshold 50000
        reg.writeMarkWithProof("aiko", CredentialKind.Savings, "savings", 50000, uint64(block.timestamp + 30 days), _proof(1));
        vm.stopPrank();
        assertEq(_readMark("aiko", "maru.savings"), "pass"); // 60000 >= 50000 → pass, unchanged behavior
    }

    // --- PERMISSIONLESS mint: borrower self-serves, contract verifies World+Reclaim on-chain ---
    function test_mintWithProofs_permissionless_no_issuer() public {
        world.setAccept(true);
        verifier.setValueForKey("income", 12000);   // >= policy 10000
        verifier.setValueForKey("savings", 60000);  // >= policy 50000
        // NOTE: called by the BORROWER directly — NOT vm.prank(issuer). No relayer.
        vm.prank(borrower);
        reg.mintWithProofs("aiko", 111 /*root*/, 555 /*nullifier*/, _wp(), _proof(1), _proof(1));
        assertTrue(reg.exists("aiko"));
        assertEq(reg.passportOf("aiko").owner, borrower);
        assertTrue(reg.passportOf("aiko").soulbound);
        assertEq(_readMark("aiko", "maru.income"), "pass");    // 12000 >= 10000, derived on-chain
        assertEq(_readMark("aiko", "maru.savings"), "pass");   // 60000 >= 50000, derived independently
        assertEq(_readMark("aiko", "maru.human"), "verified");
        assertEq(_readMark("aiko", "maru.income_band"), "1-1.5x"); // 12000 = 1.2x floor → coarse band, on-chain
        // This path verifies against the World Router at group 1 (Orb) → the assurance flag MUST read
        // "orb", matching the issuer path, so a lender sees the tier on an on-chain-minted passport too.
        assertEq(_readMark("aiko", "maru.assurance"), "orb");
    }

    // The COARSE income band is published on-chain BY mintWithProofs, derived from the SAME attested
    // income vs the IMMUTABLE floor (policyIncomeMin = 10000). Its buckets MUST match the off-chain
    // issuer bandLabel([1,1.5,2]): "<1x" | "1-1.5x" | "1.5-2x" | "2x+". This walks every boundary from
    // BOTH sides — the whole point is proving the PURE-INTEGER edge math (income*2 < floor*3 for the
    // fractional 1.5x edge) lands on the exact same buckets as the off-chain floating-point ratios,
    // with no division and no off-by-one at 1x / 1.5x / 2x.
    function test_mintWithProofs_publishes_income_band_at_every_boundary() public {
        world.setAccept(true);
        verifier.setValueForKey("savings", 60000);   // constant, >= policy (the band is income-only)

        uint256[6] memory incomes  = [uint256(9999), 10000, 14999, 15000, 19999, 20000];
        string[6] memory expected  = ["<1x", "1-1.5x", "1-1.5x", "1.5-2x", "1.5-2x", "2x+"];
        for (uint256 i = 0; i < incomes.length; i++) {
            verifier.setValueForKey("income", incomes[i]);
            string memory label = string(abi.encodePacked("b", vm.toString(i)));
            vm.prank(borrower);
            reg.mintWithProofs(label, 111, 2001 + i /*distinct nullifier per human*/, _wp(), _proof(1), _proof(1));
            assertEq(_readMark(label, "maru.income_band"), expected[i]);
        }
    }

    // The band is published even when the income mark itself FAILS: a below-floor earner (income <
    // policyIncomeMin) still gets a "<1x" band, so the mark set is always complete and consistent.
    function test_mintWithProofs_income_band_present_even_when_income_fails() public {
        world.setAccept(true);
        verifier.setValueForKey("income", 8000);     // < floor 10000  → income mark "fail"
        verifier.setValueForKey("savings", 60000);
        vm.prank(borrower);
        reg.mintWithProofs("bo", 111, 2100, _wp(), _proof(1), _proof(1));
        assertEq(_readMark("bo", "maru.income"), "fail");
        assertEq(_readMark("bo", "maru.income_band"), "<1x");   // still published, derived from same income
    }

    // Guard: a deployment with policyIncomeMin == 0 (no floor) must NOT revert or misclassify —
    // "income as a multiple of the floor" is undefined, so _incomeBandLabel returns the lowest band.
    function test_mintWithProofs_income_band_zero_floor_guard() public {
        MaruMaruRegistrar zero = new MaruMaruRegistrar(
            IRegistry(address(ens)), IPermissionedResolver(address(ens)), issuer,
            IReclaimVerifier(address(verifier)), _world(),
            MaruMaruRegistrar.PolicyConfig({ incomeMin: 0, savingsMin: 0 }), PARENT
        );
        ens.authorizeKey("maru.income", address(zero));
        ens.authorizeKey("maru.savings", address(zero));
        ens.authorizeKey("maru.human", address(zero));
        ens.authorizeKey("maru.income_band", address(zero));
        ens.authorizeKey("maru.assurance", address(zero));

        world.setAccept(true);
        verifier.setValueForKey("income", 50000);
        verifier.setValueForKey("savings", 50000);
        vm.prank(borrower);
        zero.mintWithProofs("z", 111, 2200, _wp(), _proof(1), _proof(1));
        assertEq(_readMark("z", "maru.income_band"), "<1x");    // floor==0 → lowest band, no div-by-zero
    }

    function test_mintWithProofs_reverts_on_invalid_world_proof() public {
        world.setAccept(false);   // router reverts on a bad proof
        vm.prank(borrower);
        vm.expectRevert(MockWorldID.WorldIDProofInvalid.selector);
        reg.mintWithProofs("aiko", 111, 555, _wp(), _proof(1), _proof(1));
    }

    // C2: marks are derived against the IMMUTABLE protocol policy, independently per field.
    function test_mintWithProofs_marks_derived_from_policy_not_caller() public {
        world.setAccept(true);
        verifier.setValueForKey("income", 8000);    // below policy 10000  -> fail
        verifier.setValueForKey("savings", 60000);  // above policy 50000  -> pass
        vm.prank(borrower);
        reg.mintWithProofs("aiko", 111, 555, _wp(), _proof(1), _proof(1));
        assertEq(_readMark("aiko", "maru.income"), "fail");    // caller cannot force "pass" — no threshold arg exists
        assertEq(_readMark("aiko", "maru.savings"), "pass");   // proves income/savings are independent
    }

    // C1: a bank proof signed for someone ELSE cannot be attached to my passport.
    function test_mintWithProofs_reverts_on_borrowed_income_proof() public {
        world.setAccept(true);
        verifier.setValueForKey("income", 99999);
        vm.prank(borrower);
        vm.expectRevert(MaruMaruRegistrar.ProofNotBound.selector);
        // income proof signed for a DIFFERENT owner (0xBEEF), not the caller
        reg.mintWithProofs("aiko", 111, 555, _wp(), _proofFor(1, address(0xBEEF)), _proof(1));
    }

    function test_mintWithProofs_reverts_on_borrowed_savings_proof() public {
        world.setAccept(true);
        vm.prank(borrower);
        vm.expectRevert(MaruMaruRegistrar.ProofNotBound.selector);
        reg.mintWithProofs("aiko", 111, 555, _wp(), _proof(1), _proofFor(1, address(0xBEEF)));
    }

    // C3: the self-minter cannot choose expiry — it's clamped to the protocol freshness window.
    function test_mintWithProofs_expiry_is_clamped_to_default_ttl() public {
        world.setAccept(true);
        vm.prank(borrower);
        reg.mintWithProofs("aiko", 111, 555, _wp(), _proof(1), _proof(1));
        assertEq(reg.passportOf("aiko").expiry, uint64(block.timestamp) + reg.DEFAULT_TTL());
    }

    function test_mintWithProofs_one_live_per_human() public {
        world.setAccept(true);
        vm.prank(borrower);
        reg.mintWithProofs("aiko", 111, 555, _wp(), _proof(1), _proof(1));
        vm.prank(borrower);
        vm.expectRevert(MaruMaruRegistrar.HumanAlreadyUsed.selector);  // same nullifier, still live
        reg.mintWithProofs("aiko2", 111, 555, _wp(), _proof(1), _proof(1));
    }

    // The self-minted borrower (no issuer) can grant/revoke lenders on their OWN passport.
    function test_owner_can_grant_lender_on_self_minted_passport() public {
        world.setAccept(true);
        vm.prank(borrower);
        reg.mintWithProofs("aiko", 111, 555, _wp(), _proof(1), _proof(1));
        vm.prank(borrower);                                    // owner, not issuer
        reg.grantLender("aiko", lender, uint64(block.timestamp + 7 days));
        assertTrue(reg.isLenderAuthorized("aiko", lender));
    }

    // A stranger (neither owner nor issuer) cannot grant on someone's passport.
    function test_stranger_cannot_grant_lender() public {
        vm.prank(issuer);
        reg.mintPassport("aiko", borrower, 111, false);
        vm.prank(address(0xDEAD));
        vm.expectRevert(MaruMaruRegistrar.NotOwnerOrIssuer.selector);
        reg.grantLender("aiko", lender, uint64(block.timestamp + 7 days));
    }

    // Hardening: a zero-address lender must be rejected — otherwise it silently inflates the
    // per-human same-person-across-lenders count (a single-lender borrower could look like a stacker).
    function test_grant_zero_address_lender_reverts() public {
        vm.startPrank(issuer);
        reg.mintPassport("aiko", borrower, 7, false);
        vm.expectRevert(MaruMaruRegistrar.ZeroAddress.selector);
        reg.grantLender("aiko", address(0), uint64(block.timestamp + 7 days));
        assertEq(reg.humanActiveLenders("aiko"), 0);       // count untouched
        vm.stopPrank();
    }

    // Hardening: writeMark validates the label (clean InvalidLabel), consistent with the mint paths.
    function test_writeMark_rejects_invalid_label() public {
        vm.startPrank(issuer);
        vm.expectRevert(MaruMaruRegistrar.InvalidLabel.selector);
        reg.writeMark(_label(64), CredentialKind.Income, "pass", uint64(block.timestamp + 30 days));
        vm.stopPrank();
    }

    function test_lender_grant_and_revoke() public {
        vm.startPrank(issuer);
        reg.mintPassport("aiko", borrower, 1, false);
        reg.grantLender("aiko", lender, uint64(block.timestamp + 14 days));
        assertTrue(reg.isLenderAuthorized("aiko", lender));
        reg.revokeLender("aiko", lender);
        assertFalse(reg.isLenderAuthorized("aiko", lender));
        vm.stopPrank();
    }

    function test_lender_authorization_expires() public {
        vm.startPrank(issuer);
        reg.mintPassport("aiko", borrower, 1, false);
        reg.grantLender("aiko", lender, uint64(block.timestamp + 1 days));
        vm.stopPrank();
        assertTrue(reg.isLenderAuthorized("aiko", lender));
        vm.warp(block.timestamp + 2 days);
        assertFalse(reg.isLenderAuthorized("aiko", lender));
    }

    function test_stacking_visible_across_lenders_same_human() public {
        // Same human (nullifier 7) mints two passports? No — one per human. So stacking is
        // detected via ONE passport granted to multiple lenders: count rises past 1.
        vm.startPrank(issuer);
        reg.mintPassport("aiko", borrower, 7, false);
        reg.grantLender("aiko", address(0xA), uint64(block.timestamp + 14 days));
        assertEq(reg.humanActiveLenders("aiko"), 1);
        reg.grantLender("aiko", address(0xB), uint64(block.timestamp + 14 days));
        assertEq(reg.humanActiveLenders("aiko"), 2); // stacking signal: same human, 2 lenders
        vm.stopPrank();
    }

    function test_revoke_decrements_stacking_count() public {
        vm.startPrank(issuer);
        reg.mintPassport("aiko", borrower, 7, false);
        reg.grantLender("aiko", address(0xA), uint64(block.timestamp + 14 days));
        reg.grantLender("aiko", address(0xB), uint64(block.timestamp + 14 days));
        reg.revokeLender("aiko", address(0xA));
        assertEq(reg.humanActiveLenders("aiko"), 1);
        vm.stopPrank();
    }

    function test_granting_same_lender_twice_counts_once() public {
        vm.startPrank(issuer);
        reg.mintPassport("aiko", borrower, 7, false);
        reg.grantLender("aiko", address(0xA), uint64(block.timestamp + 14 days));
        reg.grantLender("aiko", address(0xA), uint64(block.timestamp + 30 days)); // re-grant, extend
        assertEq(reg.humanActiveLenders("aiko"), 1);
        vm.stopPrank();
    }

    function test_refresh_extends_expiry() public {
        vm.startPrank(issuer);
        reg.mintPassport("aiko", borrower, 1, false);
        uint64 before_ = reg.passportOf("aiko").expiry;
        reg.refresh("aiko", before_ + 30 days);
        vm.stopPrank();
        assertGt(reg.passportOf("aiko").expiry, before_);
    }

    function test_expired_passport_has_no_owner() public {
        vm.prank(issuer);
        reg.mintPassport("aiko", borrower, 1, false);
        uint256 tokenId = ens.tokenOf("aiko");
        vm.warp(block.timestamp + 31 days); // past DEFAULT_TTL
        assertEq(ens.ownerOf(tokenId), address(0));
    }
}
