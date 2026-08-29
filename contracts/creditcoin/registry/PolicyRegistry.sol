// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract PolicyRegistry is AccessControl {
    bytes32 public constant POLICY_ADMIN_ROLE = keccak256("POLICY_ADMIN_ROLE");

    struct PolicyRecord {
        bytes32 policyId;
        bytes32 policyHash;
        uint32 version;
        bool active;
    }

    mapping(bytes32 => PolicyRecord) private _policies;

    error InvalidPolicy();
    error NonMonotonicPolicyVersion(bytes32 policyId, uint32 currentVersion, uint32 proposedVersion);
    error UnknownPolicy(bytes32 policyId);

    event PolicyConfigured(bytes32 indexed policyId, bytes32 indexed policyHash, uint32 version, bool active);

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(POLICY_ADMIN_ROLE, admin);
    }

    function configurePolicy(PolicyRecord calldata config) external onlyRole(POLICY_ADMIN_ROLE) {
        if (config.policyId == bytes32(0) || config.policyHash == bytes32(0)) revert InvalidPolicy();
        uint32 current = _policies[config.policyId].version;
        if (current != 0 && config.version <= current) revert NonMonotonicPolicyVersion(config.policyId, current, config.version);
        _policies[config.policyId] = config;
        emit PolicyConfigured(config.policyId, config.policyHash, config.version, config.active);
    }

    function getPolicy(bytes32 policyId) external view returns (PolicyRecord memory config) {
        config = _policies[policyId];
        if (config.policyId == bytes32(0)) revert UnknownPolicy(policyId);
    }
}
