// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ClaimRegistry} from "../../contracts/creditcoin/kernel/ClaimRegistry.sol";
import {EncumbranceRegistry} from "../../contracts/creditcoin/kernel/EncumbranceRegistry.sol";
import {FacilityManager} from "../../contracts/creditcoin/financing/FacilityManager.sol";
import {AllocationManager} from "../../contracts/creditcoin/financing/AllocationManager.sol";
import {CommitmentRegistry} from "../../contracts/creditcoin/financing/CommitmentRegistry.sol";
import {CapitalizationManager} from "../../contracts/creditcoin/financing/CapitalizationManager.sol";

contract CapitalizationTest {
    ClaimRegistry internal claims;
    EncumbranceRegistry internal encumbrances;
    FacilityManager internal facilities;
    AllocationManager internal allocations;
    CommitmentRegistry internal commitments;
    CapitalizationManager internal capitalization;

    bytes32 internal assetClassId;
    bytes32 internal facilityId;
    bytes32 internal claimId;

    address internal providerA = address(0xA11CE);
    address internal providerB = address(0xB0B);
    address internal providerC = address(0xCAFE);

    function setUp() public {
        claims = new ClaimRegistry(address(this));
        encumbrances = new EncumbranceRegistry(address(this), claims);
        facilities = new FacilityManager(address(this), encumbrances);
        allocations = new AllocationManager(address(this), facilities);
        commitments = new CommitmentRegistry(address(this));
        capitalization = new CapitalizationManager(address(this), facilities, allocations, commitments);

        claims.grantRole(claims.ENCUMBRANCE_ROLE(), address(encumbrances));
        encumbrances.grantRole(encumbrances.FACILITY_ROLE(), address(facilities));
        facilities.grantRole(facilities.FACILITY_MANAGER_ROLE(), address(allocations));
        allocations.grantRole(allocations.COMMITMENT_GATEWAY_ROLE(), address(this));
        commitments.grantRole(commitments.COMMITMENT_GATEWAY_ROLE(), address(this));
        facilities.bindCapitalizationManager(address(capitalization));

        assetClassId = keccak256("USD");
        claimId = claims.registerVerifiedClaim(
            keccak256("domain"),
            address(0xCA11),
            11,
            address(this),
            address(0xD00D),
            assetClassId,
            100,
            uint64(block.timestamp + 90 days),
            keccak256("source"),
            keccak256("evidence")
        );
        claims.setFinanceableCapacity(claimId, 100, keccak256("finance-policy"), keccak256("decision"));

        facilityId = facilities.createFacility(
            assetClassId, 100, uint64(block.timestamp), uint64(block.timestamp + 14 days), keccak256("facility-policy")
        );
        facilities.verifyFacility(facilityId);
        facilities.openFacility(facilityId);
        bytes32 encumbranceId =
            encumbrances.createEncumbrance(claimId, facilityId, address(this), 100, uint64(block.timestamp + 45 days));
        facilities.bindEncumbrance(facilityId, encumbranceId);
        facilities.beginAllocating(facilityId);
    }

    function testThreeProviderCapitalizationSealsImmutableRoot() public {
        (bytes32 aId, bytes32 aCommitment) = _makeCommitted(providerA, 40, 1, uint64(block.timestamp + 60 days));
        (bytes32 bId, bytes32 bCommitment) = _makeCommitted(providerB, 35, 2, uint64(block.timestamp + 60 days));
        (bytes32 cId, bytes32 cCommitment) = _makeCommitted(providerC, 25, 3, uint64(block.timestamp + 60 days));

        require(aId != bId && bId != cId && aId != cId, "allocation ids collided");
        facilities.beginCapitalizing(facilityId);

        bytes32[] memory commitmentIds = _sorted3(aCommitment, bCommitment, cCommitment);
        uint64 requiredUntil = uint64(block.timestamp + 30 days);
        bytes32 root = capitalization.sealCapitalization(facilityId, requiredUntil, commitmentIds);

        FacilityManager.Facility memory facility = facilities.getFacility(facilityId);
        CapitalizationManager.CapitalizationSeal memory seal = capitalization.getSeal(facilityId);

        require(facility.status == FacilityManager.FacilityStatus.CAPITALIZED, "facility not capitalized");
        require(facility.capitalizationRoot == root, "facility root mismatch");
        require(facility.capitalRequiredUntil == requiredUntil, "horizon mismatch");
        require(facility.capitalizationCommitmentCount == 3, "commitment count mismatch");
        require(seal.totalCommitted == 100, "seal total mismatch");
        require(seal.capitalizationRoot == root, "seal root mismatch");

        (bool ok,) = address(capitalization).call(
            abi.encodeCall(capitalization.sealCapitalization, (facilityId, requiredUntil, commitmentIds))
        );
        require(!ok, "capitalization resealed");
    }

    function testRejectsDuplicateCommitmentInSeal() public {
        (, bytes32 aCommitment) = _makeCommitted(providerA, 40, 1, uint64(block.timestamp + 60 days));
        _makeCommitted(providerB, 35, 2, uint64(block.timestamp + 60 days));
        _makeCommitted(providerC, 25, 3, uint64(block.timestamp + 60 days));
        facilities.beginCapitalizing(facilityId);

        bytes32[] memory commitmentIds = new bytes32[](3);
        commitmentIds[0] = aCommitment;
        commitmentIds[1] = aCommitment;
        commitmentIds[2] = aCommitment;

        (bool ok,) = address(capitalization).call(
            abi.encodeCall(
                capitalization.sealCapitalization,
                (facilityId, uint64(block.timestamp + 30 days), commitmentIds)
            )
        );
        require(!ok, "duplicate commitment accepted");
        require(
            facilities.getFacility(facilityId).status == FacilityManager.FacilityStatus.CAPITALIZING,
            "failed seal mutated facility"
        );
    }

    function testRejectsCommitmentShorterThanCapitalHorizon() public {
        (, bytes32 aCommitment) = _makeCommitted(providerA, 40, 1, uint64(block.timestamp + 20 days));
        (, bytes32 bCommitment) = _makeCommitted(providerB, 35, 2, uint64(block.timestamp + 60 days));
        (, bytes32 cCommitment) = _makeCommitted(providerC, 25, 3, uint64(block.timestamp + 60 days));
        facilities.beginCapitalizing(facilityId);

        bytes32[] memory commitmentIds = _sorted3(aCommitment, bCommitment, cCommitment);
        (bool ok,) = address(capitalization).call(
            abi.encodeCall(
                capitalization.sealCapitalization,
                (facilityId, uint64(block.timestamp + 30 days), commitmentIds)
            )
        );
        require(!ok, "short-lived commitment accepted");
    }

    function testBeginCapitalizingRequiresFullAllocation() public {
        _makeCommitted(providerA, 40, 1, uint64(block.timestamp + 60 days));
        (bool ok,) = address(facilities).call(abi.encodeCall(facilities.beginCapitalizing, (facilityId)));
        require(!ok, "partially allocated facility entered capitalization");
        require(
            facilities.getFacility(facilityId).status == FacilityManager.FacilityStatus.ALLOCATING,
            "failed transition mutated state"
        );
    }

    function testCapitalizationManagerBindingIsOneTime() public {
        (bool ok,) = address(facilities).call(abi.encodeCall(facilities.bindCapitalizationManager, (address(0x1234))));
        require(!ok, "capitalization authority rebound");
        require(facilities.capitalizationManager() == address(capitalization), "bound manager changed");
    }

    function _makeCommitted(address provider, uint256 amount, uint256 nonceSalt, uint64 expiresAt)
        internal
        returns (bytes32 allocationId, bytes32 commitmentId)
    {
        allocationId = allocations.proposeAllocation(facilityId, provider, amount, uint64(block.timestamp + 7 days));
        allocations.activateAllocation(allocationId);

        commitmentId = commitments.registerActiveCommitment(
            keccak256(abi.encode("source", nonceSalt)),
            keccak256("domain"),
            address(uint160(0x1000 + nonceSalt)),
            facilityId,
            allocationId,
            provider,
            assetClassId,
            address(uint160(0x2000 + nonceSalt)),
            amount,
            expiresAt,
            keccak256(abi.encode("evidence", nonceSalt))
        );
        allocations.recognizeCommitment(allocationId, provider, amount);
    }

    function _sorted3(bytes32 a, bytes32 b, bytes32 c) internal pure returns (bytes32[] memory values) {
        values = new bytes32[](3);
        values[0] = a;
        values[1] = b;
        values[2] = c;
        if (values[0] > values[1]) (values[0], values[1]) = (values[1], values[0]);
        if (values[1] > values[2]) (values[1], values[2]) = (values[2], values[1]);
        if (values[0] > values[1]) (values[0], values[1]) = (values[1], values[0]);
    }
}
