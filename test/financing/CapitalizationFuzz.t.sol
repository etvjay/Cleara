// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ClaimRegistry} from "../../contracts/creditcoin/kernel/ClaimRegistry.sol";
import {EncumbranceRegistry} from "../../contracts/creditcoin/kernel/EncumbranceRegistry.sol";
import {FacilityManager} from "../../contracts/creditcoin/financing/FacilityManager.sol";
import {AllocationManager} from "../../contracts/creditcoin/financing/AllocationManager.sol";
import {CommitmentRegistry} from "../../contracts/creditcoin/financing/CommitmentRegistry.sol";
import {CapitalizationManager} from "../../contracts/creditcoin/financing/CapitalizationManager.sol";

contract CapitalizationFuzzTest {
    uint256 internal constant TARGET = 1_000_000;

    ClaimRegistry internal claims;
    EncumbranceRegistry internal encumbrances;
    FacilityManager internal facilities;
    AllocationManager internal allocations;
    CommitmentRegistry internal commitments;
    CapitalizationManager internal capitalization;

    bytes32 internal assetClassId;
    bytes32 internal facilityId;

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
        bytes32 claimId = claims.registerVerifiedClaim(
            keccak256("domain"),
            address(0xCA11),
            77,
            address(this),
            address(0xD00D),
            assetClassId,
            TARGET,
            uint64(block.timestamp + 365 days),
            keccak256("source"),
            keccak256("evidence")
        );
        claims.setFinanceableCapacity(claimId, TARGET, keccak256("finance-policy"), keccak256("decision"));

        facilityId = facilities.createFacility(
            assetClassId,
            TARGET,
            uint64(block.timestamp),
            uint64(block.timestamp + 30 days),
            keccak256("facility-policy")
        );
        facilities.verifyFacility(facilityId);
        facilities.openFacility(facilityId);
        bytes32 encumbranceId = encumbrances.createEncumbrance(
            claimId, facilityId, address(this), TARGET, uint64(block.timestamp + 120 days)
        );
        facilities.bindEncumbrance(facilityId, encumbranceId);
        facilities.beginAllocating(facilityId);
    }

    function testFuzzExactThreeProviderSplitAlwaysSeals(uint256 seedA, uint256 seedB) public {
        (uint256 amountA, uint256 amountB, uint256 amountC) = _split(seedA, seedB);
        (, bytes32 commitmentA) = _makeCommitted(providerA, amountA, 1, uint64(block.timestamp + 90 days));
        (, bytes32 commitmentB) = _makeCommitted(providerB, amountB, 2, uint64(block.timestamp + 90 days));
        (, bytes32 commitmentC) = _makeCommitted(providerC, amountC, 3, uint64(block.timestamp + 90 days));

        facilities.beginCapitalizing(facilityId);
        bytes32[] memory ids = _sorted3(commitmentA, commitmentB, commitmentC);
        uint64 requiredUntil = uint64(block.timestamp + 60 days);
        bytes32 expected = capitalization.computeCapitalizationRoot(facilityId, requiredUntil, ids);
        bytes32 root = capitalization.sealCapitalization(facilityId, requiredUntil, ids);

        FacilityManager.Facility memory facility = facilities.getFacility(facilityId);
        require(root == expected, "root nondeterministic");
        require(facility.status == FacilityManager.FacilityStatus.CAPITALIZED, "not capitalized");
        require(facility.committedAmount == TARGET, "commit total drifted");
        require(facility.allocatedAmount == TARGET, "allocation total drifted");
        require(facility.capitalizationCommitmentCount == 3, "membership count drifted");
    }

    function testFuzzShortHorizonMemberCannotMutateSeal(uint256 seedA, uint256 seedB, uint32 shortfallSeed) public {
        (uint256 amountA, uint256 amountB, uint256 amountC) = _split(seedA, seedB);
        uint64 requiredUntil = uint64(block.timestamp + 60 days);
        uint64 shortfall = uint64((uint256(shortfallSeed) % 30 days) + 1);

        (, bytes32 commitmentA) = _makeCommitted(providerA, amountA, 1, requiredUntil - shortfall);
        (, bytes32 commitmentB) = _makeCommitted(providerB, amountB, 2, uint64(block.timestamp + 90 days));
        (, bytes32 commitmentC) = _makeCommitted(providerC, amountC, 3, uint64(block.timestamp + 90 days));

        facilities.beginCapitalizing(facilityId);
        bytes32[] memory ids = _sorted3(commitmentA, commitmentB, commitmentC);
        (bool ok,) = address(capitalization)
            .call(abi.encodeCall(capitalization.sealCapitalization, (facilityId, requiredUntil, ids)));

        require(!ok, "short horizon member accepted");
        FacilityManager.Facility memory facility = facilities.getFacility(facilityId);
        require(facility.status == FacilityManager.FacilityStatus.CAPITALIZING, "failed seal changed status");
        require(facility.capitalizationRoot == bytes32(0), "failed seal wrote root");
    }

    function testFuzzDuplicateMembershipNeverSeals(uint256 seedA, uint256 seedB) public {
        (uint256 amountA, uint256 amountB, uint256 amountC) = _split(seedA, seedB);
        (, bytes32 commitmentA) = _makeCommitted(providerA, amountA, 1, uint64(block.timestamp + 90 days));
        _makeCommitted(providerB, amountB, 2, uint64(block.timestamp + 90 days));
        _makeCommitted(providerC, amountC, 3, uint64(block.timestamp + 90 days));

        facilities.beginCapitalizing(facilityId);
        bytes32[] memory ids = new bytes32[](3);
        ids[0] = commitmentA;
        ids[1] = commitmentA;
        ids[2] = commitmentA;

        (bool ok,) = address(capitalization).call(
            abi.encodeCall(capitalization.sealCapitalization, (facilityId, uint64(block.timestamp + 60 days), ids))
        );
        require(!ok, "duplicate membership accepted");
        require(facilities.getFacility(facilityId).capitalizationRoot == bytes32(0), "duplicate wrote root");
    }

    function _split(uint256 seedA, uint256 seedB)
        internal
        pure
        returns (uint256 amountA, uint256 amountB, uint256 amountC)
    {
        amountA = (seedA % (TARGET - 2)) + 1;
        uint256 remaining = TARGET - amountA;
        amountB = (seedB % (remaining - 1)) + 1;
        amountC = remaining - amountB;
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
