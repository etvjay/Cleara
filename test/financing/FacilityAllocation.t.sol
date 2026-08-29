// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ClaimRegistry} from "../../contracts/creditcoin/kernel/ClaimRegistry.sol";
import {EncumbranceRegistry} from "../../contracts/creditcoin/kernel/EncumbranceRegistry.sol";
import {FacilityManager} from "../../contracts/creditcoin/financing/FacilityManager.sol";
import {AllocationManager} from "../../contracts/creditcoin/financing/AllocationManager.sol";

contract FacilityAllocationTest {
    ClaimRegistry internal claims;
    EncumbranceRegistry internal encumbrances;
    FacilityManager internal facilities;
    AllocationManager internal allocations;

    bytes32 internal claimId;
    bytes32 internal facilityId;
    bytes32 internal encumbranceId;

    function setUp() public {
        claims = new ClaimRegistry(address(this));
        encumbrances = new EncumbranceRegistry(address(this), claims);
        facilities = new FacilityManager(address(this), encumbrances);
        allocations = new AllocationManager(address(this), facilities);

        claims.grantRole(claims.ENCUMBRANCE_ROLE(), address(encumbrances));
        encumbrances.grantRole(encumbrances.FACILITY_ROLE(), address(facilities));
        facilities.grantRole(facilities.FACILITY_MANAGER_ROLE(), address(allocations));

        claimId = claims.registerVerifiedClaim(
            keccak256("domain"),
            address(0xCA11),
            1,
            address(0xA11CE),
            address(0xB0B),
            keccak256("USD"),
            100,
            uint64(block.timestamp + 30 days),
            keccak256("source"),
            keccak256("evidence")
        );
        claims.setFinanceableCapacity(claimId, 80, keccak256("finance-policy"), keccak256("decision"));

        facilityId = facilities.createFacility(
            keccak256("USD"),
            80,
            uint64(block.timestamp),
            uint64(block.timestamp + 14 days),
            keccak256("facility-policy")
        );
        facilities.verifyFacility(facilityId);
        facilities.openFacility(facilityId);

        encumbranceId =
            encumbrances.createEncumbrance(claimId, facilityId, address(0xF1), 60, uint64(block.timestamp + 7 days));
        facilities.bindEncumbrance(facilityId, encumbranceId);
        facilities.beginAllocating(facilityId);
    }

    function testFacilityConsumesEncumbranceWithoutFreeingClaimCapacity() public view {
        EncumbranceRegistry.Encumbrance memory encumbrance = encumbrances.getEncumbrance(encumbranceId);
        FacilityManager.Facility memory facility = facilities.getFacility(facilityId);
        ClaimRegistry.Claim memory claim = claims.getClaim(claimId);

        require(encumbrance.status == EncumbranceRegistry.EncumbranceStatus.CONSUMED, "encumbrance not consumed");
        require(facility.encumberedAmount == 60, "wrong facility encumbrance");
        require(claim.activeEncumbrance == 60, "claim capacity released on consume");
        require(claims.availableCapacity(claimId) == 20, "wrong available capacity");
    }

    function testAllocationIsNotCapitalCommitment() public {
        bytes32 allocationId =
            allocations.proposeAllocation(facilityId, address(0xBEEF), 40, uint64(block.timestamp + 3 days));
        allocations.activateAllocation(allocationId);

        AllocationManager.Allocation memory allocation = allocations.getAllocation(allocationId);
        FacilityManager.Facility memory facility = facilities.getFacility(facilityId);

        require(allocation.status == AllocationManager.AllocationStatus.ACTIVE, "allocation not active");
        require(facility.allocatedAmount == 40, "facility allocation missing");
        require(facility.status == FacilityManager.FacilityStatus.ALLOCATING, "allocation changed facility state");
        require(allocation.status != AllocationManager.AllocationStatus.COMMITTED, "allocation silently committed");
    }

    function testAllocationCannotExceedBoundEncumbrance() public {
        bytes32 allocationA =
            allocations.proposeAllocation(facilityId, address(0xA1), 50, uint64(block.timestamp + 3 days));
        allocations.activateAllocation(allocationA);

        bytes32 allocationB =
            allocations.proposeAllocation(facilityId, address(0xA2), 20, uint64(block.timestamp + 3 days));
        (bool ok,) = address(allocations).call(abi.encodeCall(allocations.activateAllocation, (allocationB)));
        require(!ok, "over-allocation accepted");

        FacilityManager.Facility memory facility = facilities.getFacility(facilityId);
        AllocationManager.Allocation memory second = allocations.getAllocation(allocationB);
        require(facility.allocatedAmount == 50, "failed activation mutated total");
        require(second.status == AllocationManager.AllocationStatus.PROPOSED, "failed activation changed allocation");
    }

    function testCancelActiveAllocationRestoresFacilityAvailabilityExactlyOnce() public {
        bytes32 allocationId =
            allocations.proposeAllocation(facilityId, address(0xBEEF), 40, uint64(block.timestamp + 3 days));
        allocations.activateAllocation(allocationId);
        allocations.cancelAllocation(allocationId);

        FacilityManager.Facility memory facility = facilities.getFacility(facilityId);
        require(facility.allocatedAmount == 0, "allocation not restored");

        (bool ok,) = address(allocations).call(abi.encodeCall(allocations.cancelAllocation, (allocationId)));
        require(!ok, "double cancel accepted");
        require(facilities.getFacility(facilityId).allocatedAmount == 0, "double restore");
    }

    function testCannotBindEncumbranceForDifferentFacility() public {
        bytes32 otherFacility = facilities.createFacility(
            keccak256("USD"), 20, uint64(block.timestamp), uint64(block.timestamp + 14 days), keccak256("other-policy")
        );
        facilities.verifyFacility(otherFacility);
        facilities.openFacility(otherFacility);

        bytes32 otherEncumbrance =
            encumbrances.createEncumbrance(claimId, otherFacility, address(0xF2), 10, uint64(block.timestamp + 7 days));

        (bool ok,) =
            address(facilities).call(abi.encodeCall(facilities.bindEncumbrance, (facilityId, otherEncumbrance)));
        require(!ok, "cross-facility encumbrance accepted");
        require(
            encumbrances.getEncumbrance(otherEncumbrance).status == EncumbranceRegistry.EncumbranceStatus.ACTIVE,
            "failed bind consumed encumbrance"
        );
    }
}
