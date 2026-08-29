// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract CommitmentRegistry is AccessControl {
    bytes32 public constant COMMITMENT_GATEWAY_ROLE = keccak256("COMMITMENT_GATEWAY_ROLE");

    enum CommitmentStatus {
        NONE,
        OBSERVED,
        VERIFIED,
        ACTIVE,
        CONSUMED,
        RELEASED,
        EXPIRED,
        INVALIDATED
    }

    struct Commitment {
        bytes32 commitmentId;
        bytes32 sourceCommitmentId;
        bytes32 domainId;
        address sourceVault;
        bytes32 facilityId;
        bytes32 allocationId;
        address provider;
        bytes32 assetClassId;
        address token;
        uint256 amount;
        uint64 expiresAt;
        bytes32 evidenceId;
        CommitmentStatus status;
    }

    mapping(bytes32 => Commitment) private _commitments;

    error InvalidCommitment();
    error CommitmentAlreadyExists(bytes32 commitmentId);
    error UnknownCommitment(bytes32 commitmentId);

    event CommitmentRegistered(
        bytes32 indexed commitmentId,
        bytes32 indexed facilityId,
        bytes32 indexed allocationId,
        bytes32 sourceCommitmentId,
        address provider,
        bytes32 assetClassId,
        address token,
        uint256 amount,
        uint64 expiresAt,
        bytes32 evidenceId
    );

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function computeCommitmentId(bytes32 domainId, address sourceVault, bytes32 sourceCommitmentId)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode("CLEARA_COMMITMENT_V1", domainId, sourceVault, sourceCommitmentId));
    }

    function registerActiveCommitment(
        bytes32 sourceCommitmentId,
        bytes32 domainId,
        address sourceVault,
        bytes32 facilityId,
        bytes32 allocationId,
        address provider,
        bytes32 assetClassId,
        address token,
        uint256 amount,
        uint64 expiresAt,
        bytes32 evidenceId
    ) external onlyRole(COMMITMENT_GATEWAY_ROLE) returns (bytes32 commitmentId) {
        if (
            sourceCommitmentId == bytes32(0) || domainId == bytes32(0) || sourceVault == address(0)
                || facilityId == bytes32(0) || allocationId == bytes32(0) || provider == address(0)
                || assetClassId == bytes32(0) || token == address(0) || amount == 0 || evidenceId == bytes32(0)
                || expiresAt <= block.timestamp
        ) revert InvalidCommitment();

        commitmentId = computeCommitmentId(domainId, sourceVault, sourceCommitmentId);
        if (_commitments[commitmentId].status != CommitmentStatus.NONE) revert CommitmentAlreadyExists(commitmentId);

        _commitments[commitmentId] = Commitment({
            commitmentId: commitmentId,
            sourceCommitmentId: sourceCommitmentId,
            domainId: domainId,
            sourceVault: sourceVault,
            facilityId: facilityId,
            allocationId: allocationId,
            provider: provider,
            assetClassId: assetClassId,
            token: token,
            amount: amount,
            expiresAt: expiresAt,
            evidenceId: evidenceId,
            status: CommitmentStatus.ACTIVE
        });

        emit CommitmentRegistered(
            commitmentId,
            facilityId,
            allocationId,
            sourceCommitmentId,
            provider,
            assetClassId,
            token,
            amount,
            expiresAt,
            evidenceId
        );
    }

    function getCommitment(bytes32 commitmentId) external view returns (Commitment memory commitment) {
        commitment = _commitments[commitmentId];
        if (commitment.status == CommitmentStatus.NONE) revert UnknownCommitment(commitmentId);
    }
}
