// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {FacilityManager} from "./FacilityManager.sol";
import {AllocationManager} from "./AllocationManager.sol";
import {CommitmentRegistry} from "./CommitmentRegistry.sol";

contract CapitalizationManager is AccessControl {
    bytes32 public constant CAPITALIZATION_OPERATOR_ROLE = keccak256("CAPITALIZATION_OPERATOR_ROLE");
    uint256 public constant MAX_COMMITMENTS = 10;

    struct CapitalizationSeal {
        bytes32 facilityId;
        bytes32 capitalizationRoot;
        uint256 totalCommitted;
        uint64 capitalRequiredUntil;
        uint64 sealedAt;
        uint32 commitmentCount;
    }

    FacilityManager public immutable facilityManager;
    AllocationManager public immutable allocationManager;
    CommitmentRegistry public immutable commitmentRegistry;

    mapping(bytes32 => CapitalizationSeal) private _seals;

    error InvalidCapitalization();
    error CapitalizationAlreadySealed(bytes32 facilityId);
    error CommitmentSetNotStrictlyOrdered(bytes32 previous, bytes32 current);
    error CommitmentNotEligible(bytes32 commitmentId);
    error AllocationNotEligible(bytes32 allocationId);

    event CapitalizationCommitted(
        bytes32 indexed facilityId,
        bytes32 indexed capitalizationRoot,
        uint256 totalCommitted,
        uint64 capitalRequiredUntil,
        uint32 commitmentCount
    );

    constructor(
        address admin,
        FacilityManager facilityManager_,
        AllocationManager allocationManager_,
        CommitmentRegistry commitmentRegistry_
    ) {
        if (
            address(facilityManager_) == address(0) || address(allocationManager_) == address(0)
                || address(commitmentRegistry_) == address(0)
        ) revert InvalidCapitalization();

        facilityManager = facilityManager_;
        allocationManager = allocationManager_;
        commitmentRegistry = commitmentRegistry_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(CAPITALIZATION_OPERATOR_ROLE, admin);
    }

    function computeCapitalizationRoot(bytes32 facilityId, uint64 capitalRequiredUntil, bytes32[] memory commitmentIds)
        public
        view
        returns (bytes32)
    {
        FacilityManager.Facility memory facility = facilityManager.getFacility(facilityId);
        return keccak256(
            abi.encode(
                "CLEARA_CAPITALIZATION_V1",
                facilityId,
                facility.assetClassId,
                facility.policyBundleHash,
                capitalRequiredUntil,
                commitmentIds
            )
        );
    }

    function sealCapitalization(bytes32 facilityId, uint64 capitalRequiredUntil, bytes32[] calldata commitmentIds)
        external
        onlyRole(CAPITALIZATION_OPERATOR_ROLE)
        returns (bytes32 capitalizationRoot)
    {
        if (_seals[facilityId].capitalizationRoot != bytes32(0)) revert CapitalizationAlreadySealed(facilityId);
        if (
            commitmentIds.length == 0 || commitmentIds.length > MAX_COMMITMENTS
                || capitalRequiredUntil <= block.timestamp
        ) revert InvalidCapitalization();

        FacilityManager.Facility memory facility = facilityManager.getFacility(facilityId);
        if (facility.status != FacilityManager.FacilityStatus.CAPITALIZING) revert InvalidCapitalization();
        if (
            facility.committedAmount != facility.targetAmount || facility.allocatedAmount != facility.targetAmount
                || facility.encumberedAmount < facility.targetAmount
        ) revert InvalidCapitalization();

        uint256 totalCommitted;
        bytes32 previous;

        for (uint256 i; i < commitmentIds.length; ++i) {
            bytes32 commitmentId = commitmentIds[i];
            if (commitmentId == bytes32(0)) revert InvalidCapitalization();
            if (i != 0 && commitmentId <= previous) {
                revert CommitmentSetNotStrictlyOrdered(previous, commitmentId);
            }
            previous = commitmentId;

            CommitmentRegistry.Commitment memory commitment = commitmentRegistry.getCommitment(commitmentId);
            if (
                commitment.status != CommitmentRegistry.CommitmentStatus.ACTIVE || commitment.facilityId != facilityId
                    || commitment.assetClassId != facility.assetClassId || commitment.expiresAt < capitalRequiredUntil
            ) revert CommitmentNotEligible(commitmentId);

            AllocationManager.Allocation memory allocation = allocationManager.getAllocation(commitment.allocationId);
            if (
                allocation.status != AllocationManager.AllocationStatus.COMMITTED || allocation.facilityId != facilityId
                    || allocation.provider != commitment.provider || allocation.amount != commitment.amount
            ) revert AllocationNotEligible(commitment.allocationId);

            totalCommitted += commitment.amount;
            if (totalCommitted > facility.targetAmount) revert InvalidCapitalization();
        }

        if (totalCommitted != facility.targetAmount) revert InvalidCapitalization();

        capitalizationRoot = computeCapitalizationRoot(facilityId, capitalRequiredUntil, commitmentIds);
        CapitalizationSeal memory seal = CapitalizationSeal({
            facilityId: facilityId,
            capitalizationRoot: capitalizationRoot,
            totalCommitted: totalCommitted,
            capitalRequiredUntil: capitalRequiredUntil,
            sealedAt: uint64(block.timestamp),
            commitmentCount: uint32(commitmentIds.length)
        });
        _seals[facilityId] = seal;

        facilityManager.finalizeCapitalization(
            facilityId, capitalizationRoot, capitalRequiredUntil, uint32(commitmentIds.length)
        );

        emit CapitalizationCommitted(
            facilityId, capitalizationRoot, totalCommitted, capitalRequiredUntil, uint32(commitmentIds.length)
        );
    }

    function getSeal(bytes32 facilityId) external view returns (CapitalizationSeal memory seal) {
        seal = _seals[facilityId];
        if (seal.capitalizationRoot == bytes32(0)) revert InvalidCapitalization();
    }
}
