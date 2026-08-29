// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract ClearingPolicyRegistry is AccessControl {
    bytes32 public constant POLICY_MANAGER_ROLE = keccak256("POLICY_MANAGER_ROLE");

    enum SetoffMode {
        NONE,
        BILATERAL,
        MULTILATERAL
    }

    struct ClearingPolicy {
        bytes32 policyId;
        bytes32 assetClassId;
        bytes32 compatibilityHash;
        SetoffMode mode;
        bool active;
    }

    mapping(bytes32 => ClearingPolicy) private _policies;

    error InvalidPolicy();
    error UnknownPolicy(bytes32 policyId);
    error PolicyAlreadyExists(bytes32 policyId);

    event ClearingPolicyConfigured(
        bytes32 indexed policyId,
        bytes32 indexed assetClassId,
        bytes32 indexed compatibilityHash,
        SetoffMode mode,
        bool active
    );

    constructor(address admin) {
        if (admin == address(0)) revert InvalidPolicy();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(POLICY_MANAGER_ROLE, admin);
    }

    function computePolicyId(bytes32 assetClassId, bytes32 compatibilityHash, SetoffMode mode)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode("CLEARA_CLEARING_POLICY_V1", assetClassId, compatibilityHash, mode));
    }

    function configurePolicy(bytes32 assetClassId, bytes32 compatibilityHash, SetoffMode mode)
        external
        onlyRole(POLICY_MANAGER_ROLE)
        returns (bytes32 policyId)
    {
        if (
            assetClassId == bytes32(0) || compatibilityHash == bytes32(0) || mode == SetoffMode.NONE
                || mode == SetoffMode.MULTILATERAL
        ) revert InvalidPolicy();

        policyId = computePolicyId(assetClassId, compatibilityHash, mode);
        if (_policies[policyId].policyId != bytes32(0)) revert PolicyAlreadyExists(policyId);
        _policies[policyId] = ClearingPolicy({
            policyId: policyId,
            assetClassId: assetClassId,
            compatibilityHash: compatibilityHash,
            mode: mode,
            active: true
        });
        emit ClearingPolicyConfigured(policyId, assetClassId, compatibilityHash, mode, true);
    }

    function setActive(bytes32 policyId, bool active) external onlyRole(POLICY_MANAGER_ROLE) {
        ClearingPolicy storage policy = _policies[policyId];
        if (policy.policyId == bytes32(0)) revert UnknownPolicy(policyId);
        policy.active = active;
        emit ClearingPolicyConfigured(
            policy.policyId, policy.assetClassId, policy.compatibilityHash, policy.mode, active
        );
    }

    function getPolicy(bytes32 policyId) external view returns (ClearingPolicy memory policy) {
        policy = _policies[policyId];
        if (policy.policyId == bytes32(0)) revert UnknownPolicy(policyId);
    }
}
