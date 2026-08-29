// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract CapitalCommitmentVault is AccessControl {
    using SafeERC20 for IERC20;

    bytes32 public constant CONSUMER_ROLE = keccak256("CONSUMER_ROLE");

    enum CommitmentStatus {
        NONE,
        COMMITTED,
        CONSUMED,
        RELEASED,
        EXPIRED
    }

    struct SourceCommitment {
        bytes32 sourceCommitmentId;
        bytes32 facilityId;
        bytes32 allocationId;
        address provider;
        bytes32 assetClassId;
        address token;
        uint256 amount;
        uint64 createdAt;
        uint64 expiresAt;
        uint256 nonce;
        CommitmentStatus status;
    }

    mapping(bytes32 => SourceCommitment) private _commitments;
    mapping(address => mapping(bytes32 => uint256)) public nextNonceByProviderAndFacility;

    error InvalidCommitment();
    error CommitmentAlreadyExists(bytes32 sourceCommitmentId);
    error UnknownCommitment(bytes32 sourceCommitmentId);
    error InvalidCommitmentState(bytes32 sourceCommitmentId, CommitmentStatus status);
    error CommitmentNotExpired(bytes32 sourceCommitmentId, uint64 expiresAt);

    event CapitalCommitted(
        bytes32 indexed sourceCommitmentId,
        bytes32 indexed facilityId,
        bytes32 indexed allocationId,
        address provider,
        bytes32 assetClassId,
        address token,
        uint256 amount,
        uint64 expiresAt
    );
    event CapitalConsumed(bytes32 indexed sourceCommitmentId, address indexed recipient, uint256 amount);
    event CapitalExpired(bytes32 indexed sourceCommitmentId, address indexed provider, uint256 amount);

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function computeSourceCommitmentId(
        bytes32 facilityId,
        bytes32 allocationId,
        address provider,
        uint256 nonce
    ) public pure returns (bytes32) {
        return keccak256(abi.encode("CLEARA_SOURCE_COMMITMENT_V1", facilityId, allocationId, provider, nonce));
    }

    function commit(
        bytes32 facilityId,
        bytes32 allocationId,
        bytes32 assetClassId,
        address token,
        uint256 amount,
        uint64 expiresAt
    ) external returns (bytes32 sourceCommitmentId) {
        if (
            facilityId == bytes32(0) || allocationId == bytes32(0) || assetClassId == bytes32(0)
                || token == address(0) || amount == 0 || expiresAt <= block.timestamp
        ) revert InvalidCommitment();

        uint256 nonce = nextNonceByProviderAndFacility[msg.sender][facilityId];
        sourceCommitmentId = computeSourceCommitmentId(facilityId, allocationId, msg.sender, nonce);
        if (_commitments[sourceCommitmentId].status != CommitmentStatus.NONE) {
            revert CommitmentAlreadyExists(sourceCommitmentId);
        }

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        nextNonceByProviderAndFacility[msg.sender][facilityId] = nonce + 1;

        _commitments[sourceCommitmentId] = SourceCommitment({
            sourceCommitmentId: sourceCommitmentId,
            facilityId: facilityId,
            allocationId: allocationId,
            provider: msg.sender,
            assetClassId: assetClassId,
            token: token,
            amount: amount,
            createdAt: uint64(block.timestamp),
            expiresAt: expiresAt,
            nonce: nonce,
            status: CommitmentStatus.COMMITTED
        });

        emit CapitalCommitted(
            sourceCommitmentId,
            facilityId,
            allocationId,
            msg.sender,
            assetClassId,
            token,
            amount,
            expiresAt
        );
    }

    function consume(bytes32 sourceCommitmentId, address recipient) external onlyRole(CONSUMER_ROLE) {
        if (recipient == address(0)) revert InvalidCommitment();
        SourceCommitment storage commitment = _requireCommitted(sourceCommitmentId);
        commitment.status = CommitmentStatus.CONSUMED;
        IERC20(commitment.token).safeTransfer(recipient, commitment.amount);
        emit CapitalConsumed(sourceCommitmentId, recipient, commitment.amount);
    }

    function expire(bytes32 sourceCommitmentId) external {
        SourceCommitment storage commitment = _requireCommitted(sourceCommitmentId);
        if (block.timestamp < commitment.expiresAt) {
            revert CommitmentNotExpired(sourceCommitmentId, commitment.expiresAt);
        }
        commitment.status = CommitmentStatus.EXPIRED;
        IERC20(commitment.token).safeTransfer(commitment.provider, commitment.amount);
        emit CapitalExpired(sourceCommitmentId, commitment.provider, commitment.amount);
    }

    function getCommitment(bytes32 sourceCommitmentId) external view returns (SourceCommitment memory commitment) {
        commitment = _commitments[sourceCommitmentId];
        if (commitment.status == CommitmentStatus.NONE) revert UnknownCommitment(sourceCommitmentId);
    }

    function _requireCommitted(bytes32 sourceCommitmentId)
        internal
        view
        returns (SourceCommitment storage commitment)
    {
        commitment = _commitments[sourceCommitmentId];
        if (commitment.status == CommitmentStatus.NONE) revert UnknownCommitment(sourceCommitmentId);
        if (commitment.status != CommitmentStatus.COMMITTED) {
            revert InvalidCommitmentState(sourceCommitmentId, commitment.status);
        }
    }
}
