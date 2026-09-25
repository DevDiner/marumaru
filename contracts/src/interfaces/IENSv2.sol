// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;


interface IRegistry {
    // Register/reserve a subname; owner==address(0) reserves. Returns tokenId.
    function register(
        string calldata label,
        address owner,
        IRegistry registry,
        address resolver,
        uint256 roleBitmap,
        uint64 expiry
    ) external returns (uint256 tokenId);

    function renew(uint256 anyId, uint64 newExpiry) external;
    function getExpiry(uint256 anyId) external view returns (uint64);
    function ownerOf(uint256 tokenId) external view returns (address);
    function getResolver(string calldata label) external view returns (address);

    // Enhanced Access Control (EAC)
    function grantRoles(uint256 resource, uint256 roleBitmap, address account) external returns (bool);
    function revokeRoles(uint256 resource, uint256 roleBitmap, address account) external returns (bool);
    function hasRoles(uint256 resource, uint256 roleBitmap, address account) external view returns (bool);
}

interface IPermissionedResolver {
    // Write a text record. `node` = EIP-137 namehash of the full name (see EnsNode._namehash).
    function setText(bytes32 node, string calldata key, string calldata value) external;
    // Per-key text authorization. `toName` = DNS-encoded name (0x00 = the empty name → node 0 → ANY
    // name). grant=true authorizes ROLE_SET_TEXT on resource(namehash(toName), partHash(key)).
    function authorizeTextRoles(bytes calldata toName, string calldata key, address account, bool grant)
        external returns (bool);
    function grantRootRoles(uint256 roleBitmap, address account) external returns (bool);
    // Read profile (ENSIP-5 compatible).
    function text(bytes32 node, string calldata key) external view returns (string memory);
}

library RegistryRolesLib {
    uint256 internal constant ROLE_REGISTRAR          = 1 << 0;
    uint256 internal constant ROLE_RENEW              = 1 << 16;
    uint256 internal constant ROLE_SET_SUBREGISTRY    = 1 << 20;
    uint256 internal constant ROLE_SET_RESOLVER       = 1 << 24;
    uint256 internal constant ROLE_CAN_TRANSFER_ADMIN = (1 << 28) << 128;
}

library ResolverRolesLib {
    uint256 internal constant ROLE_SET_TEXT       = 1 << 4;
    uint256 internal constant ROLE_SET_TEXT_ADMIN = (1 << 4) << 128;

    /// resource(node, part): 0 when both are zero (ROOT), else keccak256(abi.encode(node, part)).
    function resource(bytes32 node, bytes32 part) internal pure returns (uint256) {
        if (node == bytes32(0) && part == bytes32(0)) return 0;
        return uint256(keccak256(abi.encode(node, part)));
    }
    /// partHash(key) for a text key = keccak256(bytes(key)) 
    function partHash(string memory key) internal pure returns (bytes32) {
        return keccak256(bytes(key));
    }
}

uint256 constant ROOT_RESOURCE = 0;