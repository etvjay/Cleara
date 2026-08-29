// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ClaimRegistry} from "../../contracts/creditcoin/kernel/ClaimRegistry.sol";
import {EncumbranceRegistry} from "../../contracts/creditcoin/kernel/EncumbranceRegistry.sol";
import {FacilityManager} from "../../contracts/creditcoin/financing/FacilityManager.sol";
import {AllocationManager} from "../../contracts/creditcoin/financing/AllocationManager.sol";

contract FacilityAllocationFuzzTest {
    ClaimRegistry internal claims;
    EncumbranceRegistry internal encumbrances;
    FacilityManager internal facilities;
    AllocationManager internal allocations;
    bytes32 internal claimId;
    bytes32 internal facilityId;

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
            1_000_000,
            uint64(block.timestamp + 30 days),
            keccak256("source"),
            keccak256("evidence")
        );
        claims.setFinanceableCapacity(claimId, 1_000_000, keccak256("finance-policy"), keccak256("decision"));

        facilityId = facilities.createFacility(
            keccak256("USD"),
            1_000_000,
            uint64(block.timestamp),
            uint64(block.timestamp + 14 days),
            keccak256("facility-policy")
        );
        facilities.verifyFacility(facilityId);
        facilities.openFacility(facilityId);

        bytes32 encumbranceId = encumbrances.createEncumbrance(
            claimId, facilityId, address(0xF1), 1_000_000, uint64(block.timestamp + 7 days)
        );
        facilities.bindEncumbrance(facilityId, encumbranceId);
        facilities.beginAllocating(facilityId);
    }

    function testFuzzActiveAllocationNeverExceedsEncumbered(uint256 rawAmount) public {
        uint256 amount = 1 + (rawAmount % 1_000_000);
        bytes32 allocationId = allocations.proposeAllocation(
            facilityId, address(0xBEEF), amount, uint64(block.timestamp + 3 days)
        );
        allocations.activateAllocation(allocationId);

        FacilityManager.Facility memory facility = facilities.getFacility(facilityId);
        require(facility.allocatedAmount == amount, "wrong allocated amount");
        require(facility.allocatedAmount <= facility.encumberedAmount, "allocated > encumbered");
        require(facility.allocatedAmount <= facility.targetAmount, "allocated > target");
    }

    function testFuzzFailedOverAllocationDoesNotMutate(uint256 rawFirst, uint256 rawExcess) public {
        uint256 first = 1 + (rawFirst % 999_999);
        uint256 remaining = 1_000_000 - first;
        uint256 excess = 1 + (rawExcess % 1_000_000);
        uint256 second = remaining + excess;

        bytes32 firstId = allocations.proposeAllocation(
            facilityId, address(0xA1), first, uint64(block.timestamp + 3 days)
        );
        allocations.activateAllocation(firstId);

        bytes32 secondId = allocations.proposeAllocation(
            facilityId, address(0xA2), second, uint64(block.timestamp + 3 days)
        );
        (bool ok,) = address(allocations).call(abi.encodeCall(allocations.activateAllocation, (secondId)));
        require(!ok, "over-allocation accepted");

        FacilityManager.Facility memory facility = facilities.getFacility(facilityId);
        AllocationManager.Allocation memory secondAllocation = allocations.getAllocation(secondId);
        require(facility.allocatedAmount == first, "failed activation mutated total");
        require(secondAllocation.status == AllocationManager.AllocationStatus.PROPOSED, "status mutated on revert");
    }

    function testFuzzCancelRestoresAllocationExactly(uint256 rawAmount) public {
        uint256 amount = 1 + (rawAmount % 1_000_000);
        bytes32 allocationId = allocations.proposeAllocation(
            facilityId, address(0xC0FFEE), amount, uint64(block.timestamp + 3 days)
        );
        allocations.activateAllocation(allocationId);
        allocations.cancelAllocation(allocationId);

        FacilityManager.Facility memory facility = facilities.getFacility(facilityId);
        require(facility.allocatedAmount == 0, "cancel failed to restore");
        require(facility.encumberedAmount == 1_000_000, "cancel changed encumbrance");
        require(claims.getClaim(claimId).activeEncumbrance == 1_000_000, "cancel freed claim capacity");
    }
}
