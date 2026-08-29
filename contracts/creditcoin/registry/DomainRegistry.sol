// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract DomainRegistry is AccessControl {
    bytes32 public constant DOMAIN_ADMIN_ROLE = keccak256("DOMAIN_ADMIN_ROLE");

    struct DomainConfig {
        bytes32 domainId;
        uint64 chainKey;
        uint256 evmChainId;
        bool readable;
        bool writable;
        bool settlement;
        bool claim;
        bool commitment;
        bool evidence;
        uint32 version;
        bool active;
    }

    mapping(bytes32 => DomainConfig) private _domains;
    mapping(uint64 => bytes32) public domainByChainKey;

    error InvalidDomainId();
    error ChainKeyAlreadyBound(uint64 chainKey, bytes32 existingDomainId);
    error UnknownDomain(bytes32 domainId);

    event DomainConfigured(bytes32 indexed domainId, uint64 indexed chainKey, uint256 indexed evmChainId, uint32 version, bool active);

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(DOMAIN_ADMIN_ROLE, admin);
    }

    function computeDomainId(bytes32 creditcoinEnvironmentId, uint256 externalChainId) public pure returns (bytes32) {
        return keccak256(abi.encode("CLEARA_DOMAIN_V1", creditcoinEnvironmentId, externalChainId));
    }

    function configureDomain(DomainConfig calldata config) external onlyRole(DOMAIN_ADMIN_ROLE) {
        if (config.domainId == bytes32(0)) revert InvalidDomainId();
        bytes32 bound = domainByChainKey[config.chainKey];
        if (bound != bytes32(0) && bound != config.domainId) {
            revert ChainKeyAlreadyBound(config.chainKey, bound);
        }
        _domains[config.domainId] = config;
        domainByChainKey[config.chainKey] = config.domainId;
        emit DomainConfigured(config.domainId, config.chainKey, config.evmChainId, config.version, config.active);
    }

    function getDomain(bytes32 domainId) external view returns (DomainConfig memory config) {
        config = _domains[domainId];
        if (config.domainId == bytes32(0)) revert UnknownDomain(domainId);
    }

    function isActive(bytes32 domainId) external view returns (bool) {
        return _domains[domainId].active;
    }
}
