// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {FacilityManager} from "./FacilityManager.sol";

contract AllocationManager is AccessControl {
    bytes32 public constant ALLOCATION_MANAGER_ROLE = keccak256("ALLOCATION_MANAGER_ROLE");

    enum AllocationStatus {
        NONE,
        PROPOSED,
        ACTIVE,
        COMMITTED,
        CONSUMED,
        EXPIRED,
        CANCELLED
    }

    struct Allocation {
        bytes32 allocationId;
        bytes32 facilityId;
        address provider;
        uint256 amount;
        uint64 createdAt;
        uint64 expiresAt;
        uint256 nonce;
        AllocationStatus status;
    }

    FacilityManager public immutable facilityManager;
    mapping(bytes32 => Allocation) private _allocations;
    mapping(address => mapping(bytes32 => uint256)) public nextNonceByProviderAndFacility;

    error InvalidAllocation();
    error AllocationAlreadyExists(bytes32 allocationId);
    error UnknownAllocation(bytes32 allocationId);
    error InvalidAllocationState(bytes32 allocationId, AllocationStatus status);
    error AllocationNotExpired(bytes32 allocationId, uint64 expiresAt);

    event AllocationProposed(
        bytes32 indexed allocationId,
        bytes32 indexed facilityId,
        address indexed provider,
        uint256 amount,
        uint64 expiresAt,
        uint256 nonce
    );
    event AllocationStatusChanged(
        bytes32 indexed allocationId, AllocationStatus previousStatus, AllocationStatus newStatus
    );

    constructor(address admin, FacilityManager facilityManager_) {
        if (address(facilityManager_) == address(0)) revert InvalidAllocation();
        facilityManager = facilityManager_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ALLOCATION_MANAGER_ROLE, admin);
    }

    function computeAllocationId(bytes32 facilityId, address provider, uint256 allocationNonce)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode("CLEARA_ALLOCATION_V1", facilityId, provider, allocationNonce));
    }

    function proposeAllocation(bytes32 facilityId, address provider, uint256 amount, uint64 expiresAt)
        external
        onlyRole(ALLOCATION_MANAGER_ROLE)
        returns (bytes32 allocationId)
    {
        if (facilityId == bytes32(0) || provider == address(0) || amount == 0 || expiresAt <= block.timestamp) {
            revert InvalidAllocation();
        }

        FacilityManager.Facility memory facility = facilityManager.getFacility(facilityId);
        if (facility.status != FacilityManager.FacilityStatus.ALLOCATING) revert InvalidAllocation();

        uint256 nonce = nextNonceByProviderAndFacility[provider][facilityId];
        allocationId = computeAllocationId(facilityId, provider, nonce);
        if (_allocations[allocationId].status != AllocationStatus.NONE) revert AllocationAlreadyExists(allocationId);
        nextNonceByProviderAndFacility[provider][facilityId] = nonce + 1;

        _allocations[allocationId] = Allocation({
            allocationId: allocationId,
            facilityId: facilityId,
            provider: provider,
            amount: amount,
            createdAt: uint64(block.timestamp),
            expiresAt: expiresAt,
            nonce: nonce,
            status: AllocationStatus.PROPOSED
        });

        emit AllocationProposed(allocationId, facilityId, provider, amount, expiresAt, nonce);
    }

    function activateAllocation(bytes32 allocationId) external onlyRole(ALLOCATION_MANAGER_ROLE) {
        Allocation storage allocation = _requireState(allocationId, AllocationStatus.PROPOSED);
        if (block.timestamp >= allocation.expiresAt) revert InvalidAllocation();

        facilityManager.increaseAllocatedAmount(allocation.facilityId, allocation.amount);
        _transition(allocation, AllocationStatus.ACTIVE);
    }

    function cancelAllocation(bytes32 allocationId) external onlyRole(ALLOCATION_MANAGER_ROLE) {
        Allocation storage allocation = _allocations[allocationId];
        if (allocation.status == AllocationStatus.NONE) revert UnknownAllocation(allocationId);

        if (allocation.status == AllocationStatus.PROPOSED) {
            _transition(allocation, AllocationStatus.CANCELLED);
            return;
        }

        if (allocation.status == AllocationStatus.ACTIVE) {
            facilityManager.decreaseAllocatedAmount(allocation.facilityId, allocation.amount);
            _transition(allocation, AllocationStatus.CANCELLED);
            return;
        }

        revert InvalidAllocationState(allocationId, allocation.status);
    }

    function expireAllocation(bytes32 allocationId) external {
        Allocation storage allocation = _allocations[allocationId];
        if (allocation.status == AllocationStatus.NONE) revert UnknownAllocation(allocationId);
        if (block.timestamp < allocation.expiresAt) revert AllocationNotExpired(allocationId, allocation.expiresAt);

        if (allocation.status == AllocationStatus.PROPOSED) {
            _transition(allocation, AllocationStatus.EXPIRED);
            return;
        }

        if (allocation.status == AllocationStatus.ACTIVE) {
            facilityManager.decreaseAllocatedAmount(allocation.facilityId, allocation.amount);
            _transition(allocation, AllocationStatus.EXPIRED);
            return;
        }

        revert InvalidAllocationState(allocationId, allocation.status);
    }

    function getAllocation(bytes32 allocationId) external view returns (Allocation memory allocation) {
        allocation = _allocations[allocationId];
        if (allocation.status == AllocationStatus.NONE) revert UnknownAllocation(allocationId);
    }

    function _requireState(bytes32 allocationId, AllocationStatus expected)
        internal
        view
        returns (Allocation storage allocation)
    {
        allocation = _allocations[allocationId];
        if (allocation.status == AllocationStatus.NONE) revert UnknownAllocation(allocationId);
        if (allocation.status != expected) revert InvalidAllocationState(allocationId, allocation.status);
    }

    function _transition(Allocation storage allocation, AllocationStatus next) internal {
        AllocationStatus previous = allocation.status;
        allocation.status = next;
        emit AllocationStatusChanged(allocation.allocationId, previous, next);
    }
}
