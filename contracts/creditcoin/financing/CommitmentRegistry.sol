// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract CommitmentRegistry is AccessControl {
    bytes32 public constant COMMITMENT_GATEWAY_ROLE = keccak256("COMMITMENT_GATEWAY_ROLE");
    bytes32 public constant COMMITMENT_LIFECYCLE_ROLE = keccak256("COMMITMENT_LIFECYCLE_ROLE");

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
        bytes32 lifecycleEvidenceId;
        address lifecycleActor;
        uint64 lifecycleAt;
    }

    mapping(bytes32 => Commitment) private _commitments;

    error InvalidCommitment();
    error CommitmentAlreadyExists(bytes32 commitmentId);
    error UnknownCommitment(bytes32 commitmentId);
    error InvalidCommitmentState(bytes32 commitmentId, CommitmentStatus status);
    error InvalidLifecycleFact();

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
    event CommitmentConsumed(
        bytes32 indexed commitmentId, bytes32 indexed evidenceId, address indexed recipient, uint256 amount
    );
    event CommitmentExpired(bytes32 indexed commitmentId, bytes32 indexed evidenceId, address indexed provider, uint256 amount);

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
            status: CommitmentStatus.ACTIVE,
            lifecycleEvidenceId: bytes32(0),
            lifecycleActor: address(0),
            lifecycleAt: 0
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

    function markConsumed(bytes32 commitmentId, bytes32 evidenceId, address recipient, uint256 amount)
        external
        onlyRole(COMMITMENT_LIFECYCLE_ROLE)
    {
        Commitment storage commitment = _requireActive(commitmentId);
        if (evidenceId == bytes32(0) || recipient == address(0) || amount != commitment.amount) {
            revert InvalidLifecycleFact();
        }

        commitment.status = CommitmentStatus.CONSUMED;
        commitment.lifecycleEvidenceId = evidenceId;
        commitment.lifecycleActor = recipient;
        commitment.lifecycleAt = uint64(block.timestamp);
        emit CommitmentConsumed(commitmentId, evidenceId, recipient, amount);
    }

    function markExpired(bytes32 commitmentId, bytes32 evidenceId, uint256 amount)
        external
        onlyRole(COMMITMENT_LIFECYCLE_ROLE)
    {
        Commitment storage commitment = _requireActive(commitmentId);
        if (evidenceId == bytes32(0) || amount != commitment.amount) revert InvalidLifecycleFact();

        commitment.status = CommitmentStatus.EXPIRED;
        commitment.lifecycleEvidenceId = evidenceId;
        commitment.lifecycleActor = commitment.provider;
        commitment.lifecycleAt = uint64(block.timestamp);
        emit CommitmentExpired(commitmentId, evidenceId, commitment.provider, amount);
    }

    function _requireActive(bytes32 commitmentId) internal view returns (Commitment storage commitment) {
        commitment = _commitments[commitmentId];
        if (commitment.status == CommitmentStatus.NONE) revert UnknownCommitment(commitmentId);
        if (commitment.status != CommitmentStatus.ACTIVE) {
            revert InvalidCommitmentState(commitmentId, commitment.status);
        }
    }
}
