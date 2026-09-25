// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {MaruMaruRegistrar} from "../src/MaruMaruRegistrar.sol";
import {MockENSv2} from "./mocks/MockENSv2.sol";
import {IRegistry, IPermissionedResolver} from "../src/interfaces/IENSv2.sol";
import {IReclaimVerifier} from "../src/interfaces/IReclaimVerifier.sol";
import {IWorldID} from "../src/interfaces/IWorldID.sol";

contract MaruMaruRegistrarFuzz is Test {
    MockENSv2 ens;
    MaruMaruRegistrar reg;
    address issuer = address(0xABCD);

    function setUp() public {
        ens = new MockENSv2();
        reg = new MaruMaruRegistrar(IRegistry(address(ens)), IPermissionedResolver(address(ens)), issuer, IReclaimVerifier(address(0)), MaruMaruRegistrar.WorldIdConfig({router: IWorldID(address(0)), groupId: 1, externalNullifier: 42}), MaruMaruRegistrar.PolicyConfig({incomeMin: 10000, savingsMin: 50000}), hex"00");
    }

    /// Property: any caller that is not the issuer can never mint.
    function testFuzz_nonIssuer_cannot_mint(address caller, uint256 nf) public {
        vm.assume(caller != issuer);
        vm.prank(caller);
        vm.expectRevert(MaruMaruRegistrar.NotIssuer.selector);
        reg.mintPassport("x", address(0xB0B), nf, false);
    }

    /// Property: a nonzero nullifier can be used for at most one passport.
    function testFuzz_nullifier_single_use(uint256 nf) public {
        vm.assume(nf != 0);
        vm.startPrank(issuer);
        reg.mintPassport("a", address(0xB0B), nf, false);
        vm.expectRevert(MaruMaruRegistrar.HumanAlreadyUsed.selector);
        reg.mintPassport("b", address(0xB0B), nf, false);
        vm.stopPrank();
    }

    /// Property: a lender granted until a past timestamp is never authorized.
    function testFuzz_pastGrant_never_authorizes(uint64 until) public {
        vm.assume(until <= block.timestamp);
        vm.startPrank(issuer);
        reg.mintPassport("a", address(0xB0B), 7, false);
        reg.grantLender("a", address(0x1EED), until);
        vm.stopPrank();
        assertFalse(reg.isLenderAuthorized("a", address(0x1EED)));
    }
}
