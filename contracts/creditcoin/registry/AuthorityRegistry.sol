// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract AuthorityRegistry is AccessControl {
    bytes32 public constant AUTHORITY_ADMIN_ROLE = keccak256("AUTHORITY_ADMIN_ROLE");

    mapping(bytes32 => address) public authorityOf;

    error InvalidAuthorityKey();
    error InvalidAuthorityAddress();

    event AuthorityConfigured(
        bytes32 indexed authorityKey, address indexed previousAuthority, address indexed newAuthority
    );

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(AUTHORITY_ADMIN_ROLE, admin);
    }

    function configureAuthority(bytes32 authorityKey, address authority) external onlyRole(AUTHORITY_ADMIN_ROLE) {
        if (authorityKey == bytes32(0)) revert InvalidAuthorityKey();
        if (authority == address(0)) revert InvalidAuthorityAddress();
        address previous = authorityOf[authorityKey];
        authorityOf[authorityKey] = authority;
        emit AuthorityConfigured(authorityKey, previous, authority);
    }
}
