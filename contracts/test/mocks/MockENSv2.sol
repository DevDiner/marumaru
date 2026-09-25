// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IRegistry, IPermissionedResolver, RegistryRolesLib, ResolverRolesLib, ROOT_RESOURCE} from "../../src/interfaces/IENSv2.sol";

/// @dev Faithful ENSv2 mock. Models the real constraints that, if omitted,
/// would let tests pass falsely (the MoshiMoshi lesson):
///  (a) post-register grantRoles STRIPS admin-tier bits (>=1<<128);
///  (b) expired names return address(0) from ownerOf/getResolver;
///  (c) resolver setText reverts without ROLE_SET_TEXT (root) or a per-key grant;
///  (d) hasRoles treats ROOT_RESOURCE as global.
contract MockENSv2 is IRegistry, IPermissionedResolver {
    uint256 constant REGULAR_MASK = (1 << 128) - 1; // bits < 128

    mapping(uint256 => address) internal _owner;      // tokenId => owner
    mapping(uint256 => uint64)  internal _expiry;     // tokenId => expiry
    mapping(string  => uint256) internal _tokenOf;    // label => tokenId
    mapping(string  => address) internal _resolverOf; // label => resolver
    mapping(uint256 => mapping(address => uint256)) internal _roles; // resource => account => bitmap
    // resolver text store keyed by (node, key). node = EIP-137 namehash from setText (matches the
    // registrar's _node()). We store under the namehash so read/write agree exactly as on real ENSv2.
    mapping(bytes32 => mapping(string => string)) internal _text;
    // ROLE_SET_TEXT grants keyed by the REAL resource id = resource(node, partHash(key)); node==0 means
    // "any name". Mirrors PermissionedResolver: setText passes if the caller holds ROLE_SET_TEXT on
    // resource(node, part) OR resource(0, part). (Replaces the old ad-hoc per-key _setterAllowed.)
    uint256 internal _nextId = 1;

    // ---- IRegistry ----
    function register(string calldata label, address owner, IRegistry, address resolver, uint256 roleBitmap, uint64 expiry)
        external returns (uint256 tokenId)
    {
        require(_tokenOf[label] == 0 || _expiry[_tokenOf[label]] <= block.timestamp, "taken");
        tokenId = _nextId++;
        _tokenOf[label] = tokenId;
        _owner[tokenId] = owner;
        _expiry[tokenId] = expiry;
        _resolverOf[label] = resolver;
        // At register, BOTH admin+regular roles may be granted (models real behavior).
        if (owner != address(0)) _roles[tokenId][owner] |= roleBitmap;
    }

    function renew(uint256 anyId, uint64 newExpiry) external {
        require(newExpiry >= _expiry[anyId], "CannotReduceExpiry");
        _expiry[anyId] = newExpiry;
    }

    function getExpiry(uint256 anyId) external view returns (uint64) { return _expiry[anyId]; }

    function ownerOf(uint256 tokenId) external view returns (address) {
        if (_expiry[tokenId] <= block.timestamp) return address(0);
        return _owner[tokenId];
    }

    function getResolver(string calldata label) external view returns (address) {
        uint256 id = _tokenOf[label];
        if (id == 0 || _expiry[id] <= block.timestamp) return address(0);
        return _resolverOf[label];
    }

    // EAC: post-register grantRoles STRIPS admin bits (the key real-world constraint).
    function grantRoles(uint256 resource, uint256 roleBitmap, address account) external returns (bool) {
        _roles[resource][account] |= (roleBitmap & REGULAR_MASK);
        return true;
    }

    function revokeRoles(uint256 resource, uint256 roleBitmap, address account) external returns (bool) {
        _roles[resource][account] &= ~roleBitmap; // revoke may clear admin bits too
        return true;
    }

    function hasRoles(uint256 resource, uint256 roleBitmap, address account) external view returns (bool) {
        uint256 eff = _roles[resource][account] | _roles[ROOT_RESOURCE][account]; // ROOT global
        return (eff & roleBitmap) == roleBitmap;
    }

    // ---- IPermissionedResolver ----
    // setText now takes a bytes32 NODE (namehash), as on the real resolver. Authorization mirrors
    // PermissionedResolver.onlyPartRoles: pass if the caller holds ROLE_SET_TEXT on resource(node, part)
    // OR resource(0, part) (part-only = any name). ROOT grant also passes (root-admin convenience).
    function setText(bytes32 node, string calldata key, string calldata value) external {
        bytes32 part = ResolverRolesLib.partHash(key);
        bool ok = _hasSetText(ResolverRolesLib.resource(node, part), msg.sender)
            || _hasSetText(ResolverRolesLib.resource(bytes32(0), part), msg.sender)
            || (_roles[ROOT_RESOURCE][msg.sender] & ResolverRolesLib.ROLE_SET_TEXT) != 0;
        require(ok, "no ROLE_SET_TEXT for (node,key)");
        _text[node][key] = value;
    }

    function _hasSetText(uint256 resource, address who) internal view returns (bool) {
        return (_roles[resource][who] & ResolverRolesLib.ROLE_SET_TEXT) != 0;
    }

    /// Real per-key text authorization. `toName` is the DNS-encoded name (0x00 = empty → node 0 → ANY
    /// name); grant=true sets ROLE_SET_TEXT on resource(namehash(toName), partHash(key)). We do NOT
    /// enforce the caller's ROLE_SET_TEXT_ADMIN here (the deployer holds it by construction in tests);
    /// the point the suite must prove is the (node, part) SCOPING, which this models faithfully.
    function authorizeTextRoles(bytes calldata toName, string calldata key, address account, bool grant)
        external returns (bool)
    {
        bytes32 node = _namehash(toName);
        uint256 resource = ResolverRolesLib.resource(node, ResolverRolesLib.partHash(key));
        if (grant) _roles[resource][account] |= ResolverRolesLib.ROLE_SET_TEXT;
        else _roles[resource][account] &= ~ResolverRolesLib.ROLE_SET_TEXT;
        return true;
    }

    function grantRootRoles(uint256 roleBitmap, address account) external returns (bool) {
        _roles[ROOT_RESOURCE][account] |= roleBitmap;
        return true;
    }

    function text(bytes32 node, string calldata key) external view returns (string memory) {
        return _text[node][key];
    }

    // ---- test helpers ----
    /// Authorize `account` to write `key` on ANY name (resource(0, partHash(key))) — the same grant
    /// the deploy script makes with authorizeTextRoles(dnsEncode(""), key, registrar, true). Kept as a
    /// one-liner so setUp reads cleanly; it now grants the REAL resource id, not an ad-hoc flag.
    function authorizeKey(string calldata key, address account) external {
        uint256 resource = ResolverRolesLib.resource(bytes32(0), ResolverRolesLib.partHash(key));
        _roles[resource][account] |= ResolverRolesLib.ROLE_SET_TEXT;
    }
    function tokenOf(string calldata label) external view returns (uint256) { return _tokenOf[label]; }
    function rolesOf(uint256 resource, address a) external view returns (uint256) { return _roles[resource][a]; }
    /// Read a mark by full DNS-encoded name — namehash it the SAME way the registrar does.
    function readText(bytes calldata name, string calldata key) external view returns (string memory) {
        return _text[_namehash(name)][key];
    }
    /// Mirrors MaruMaruRegistrar._node(label): DNS-encode label.parent, then EIP-137 namehash.
    function readTextByLabel(string calldata label, bytes calldata parentDnsSuffix, string calldata key)
        external view returns (string memory)
    {
        bytes memory l = bytes(label);
        bytes memory name = abi.encodePacked(uint8(l.length), l, parentDnsSuffix);
        return _text[_namehash(name)][key];
    }

    /// EIP-137 namehash of a DNS-wire name — IDENTICAL algorithm to MaruMaruRegistrar._namehash, so the
    /// mock's stored node always matches the registrar's setText node. (If these ever diverge, every
    /// mark read would silently miss — which is exactly the real DNS-node-vs-namehash bug we're guarding.)
    function _namehash(bytes memory dnsName) internal pure returns (bytes32 node) {
        uint256 n = dnsName.length;
        uint256[] memory offs = new uint256[](n);
        uint256[] memory lens = new uint256[](n);
        uint256 count;
        uint256 i;
        while (i < n) {
            uint256 len = uint8(dnsName[i]);
            if (len == 0) break;
            offs[count] = i + 1;
            lens[count] = len;
            count++;
            i += 1 + len;
        }
        node = bytes32(0);
        for (uint256 j = count; j > 0; j--) {
            uint256 off = offs[j - 1];
            uint256 len = lens[j - 1];
            bytes32 labelHash;
            assembly { labelHash := keccak256(add(add(dnsName, 0x20), off), len) }
            node = keccak256(abi.encodePacked(node, labelHash));
        }
    }
}
