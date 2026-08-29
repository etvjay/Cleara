// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ClaimRegistry} from "../../contracts/creditcoin/kernel/ClaimRegistry.sol";
import {EncumbranceRegistry} from "../../contracts/creditcoin/kernel/EncumbranceRegistry.sol";
import {FacilityManager} from "../../contracts/creditcoin/financing/FacilityManager.sol";
import {AllocationManager} from "../../contracts/creditcoin/financing/AllocationManager.sol";
import {CommitmentRegistry} from "../../contracts/creditcoin/financing/CommitmentRegistry.sol";
import {CapitalCommitmentVault} from "../../contracts/source/commitments/CapitalCommitmentVault.sol";
import {MockERC20} from "../mocks/MockERC20.sol";

contract CapitalCommitmentTest {
    ClaimRegistry internal claims;
    EncumbranceRegistry internal encumbrances;
    FacilityManager internal facilities;
    AllocationManager internal allocations;
    CommitmentRegistry internal commitments;
    CapitalCommitmentVault internal vault;
    MockERC20 internal token;

    bytes32 internal claimId;
    bytes32 internal facilityId;
    bytes32 internal allocationId;
    bytes32 internal assetClassId;

    function setUp() public {
        claims = new ClaimRegistry(address(this));
        encumbrances = new EncumbranceRegistry(address(this), claims);
        facilities = new FacilityManager(address(this), encumbrances);
        allocations = new AllocationManager(address(this), facilities);
        commitments = new CommitmentRegistry(address(this));
        vault = new CapitalCommitmentVault(address(this));
        token = new MockERC20();

        claims.grantRole(claims.ENCUMBRANCE_ROLE(), address(encumbrances));
        encumbrances.grantRole(encumbrances.FACILITY_ROLE(), address(facilities));
        facilities.grantRole(facilities.FACILITY_MANAGER_ROLE(), address(allocations));
        allocations.grantRole(allocations.COMMITMENT_GATEWAY_ROLE(), address(this));
        commitments.grantRole(commitments.COMMITMENT_GATEWAY_ROLE(), address(this));

        assetClassId = keccak256("USD");
        claimId = claims.registerVerifiedClaim(
            keccak256("domain"),
            address(0xCA11),
            1,
            address(this),
            address(0xB0B),
            assetClassId,
            100,
            uint64(block.timestamp + 30 days),
            keccak256("source"),
            keccak256("evidence")
        );
        claims.setFinanceableCapacity(claimId, 100, keccak256("finance-policy"), keccak256("decision"));

        facilityId = facilities.createFacility(
            assetClassId,
            100,
            uint64(block.timestamp),
            uint64(block.timestamp + 14 days),
            keccak256("facility-policy")
        );
        facilities.verifyFacility(facilityId);
        facilities.openFacility(facilityId);
        bytes32 encumbranceId =
            encumbrances.createEncumbrance(claimId, facilityId, address(this), 100, uint64(block.timestamp + 7 days));
        facilities.bindEncumbrance(facilityId, encumbranceId);
        facilities.beginAllocating(facilityId);
        allocationId = allocations.proposeAllocation(facilityId, address(this), 100, uint64(block.timestamp + 3 days));
        allocations.activateAllocation(allocationId);

        token.mint(address(this), 100);
        token.approve(address(vault), 100);
    }

    function testSourceCommitmentActuallyLocksTokens() public {
        uint64 expiresAt = uint64(block.timestamp + 2 days);
        bytes32 sourceCommitmentId = vault.commit(facilityId, allocationId, assetClassId, address(token), 100, expiresAt);

        CapitalCommitmentVault.SourceCommitment memory source = vault.getCommitment(sourceCommitmentId);
        require(source.status == CapitalCommitmentVault.CommitmentStatus.COMMITTED, "source not committed");
        require(token.balanceOf(address(this)) == 0, "provider still holds committed capital");
        require(token.balanceOf(address(vault)) == 100, "vault not funded");

        (bool ok,) = address(vault).call(abi.encodeCall(vault.expire, (sourceCommitmentId)));
        require(!ok, "provider escaped before expiry");
        require(token.balanceOf(address(vault)) == 100, "failed expiry moved capital");
    }

    function testVerifiedCommitmentMovesAllocationToCommittedAndFacilityAccounting() public {
        bytes32 evidenceId = keccak256("commitment-evidence");
        bytes32 sourceCommitmentId = keccak256("source-commitment");
        uint64 expiresAt = uint64(block.timestamp + 2 days);

        bytes32 commitmentId = commitments.registerActiveCommitment(
            sourceCommitmentId,
            keccak256("domain"),
            address(vault),
            facilityId,
            allocationId,
            address(this),
            assetClassId,
            address(token),
            100,
            expiresAt,
            evidenceId
        );
        allocations.recognizeCommitment(allocationId, address(this), 100);

        require(
            allocations.getAllocation(allocationId).status == AllocationManager.AllocationStatus.COMMITTED,
            "allocation not committed"
        );
        FacilityManager.Facility memory facility = facilities.getFacility(facilityId);
        require(facility.committedAmount == 100, "committed accounting missing");
        require(commitments.getCommitment(commitmentId).status == CommitmentRegistry.CommitmentStatus.ACTIVE, "registry inactive");
    }

    function testCommitmentCannotMismatchAllocation() public {
        (bool ok,) = address(allocations).call(
            abi.encodeCall(allocations.recognizeCommitment, (allocationId, address(this), 99))
        );
        require(!ok, "mismatched amount accepted");
        require(
            allocations.getAllocation(allocationId).status == AllocationManager.AllocationStatus.ACTIVE,
            "failed recognition mutated allocation"
        );
        require(facilities.getFacility(facilityId).committedAmount == 0, "failed recognition mutated facility");
    }

    function testFacilityCannotCapitalizeWithoutFullCommitment() public {
        allocations.grantRole(allocations.COMMITMENT_GATEWAY_ROLE(), address(this));
        facilities.beginCapitalizing(facilityId);
        (bool ok,) = address(facilities).call(abi.encodeCall(facilities.finalizeCapitalization, (facilityId)));
        require(!ok, "facility capitalized without committed target");
        require(
            facilities.getFacility(facilityId).status == FacilityManager.FacilityStatus.CAPITALIZING,
            "failed capitalization mutated state"
        );
    }
}
