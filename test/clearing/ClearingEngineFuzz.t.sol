// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ClaimRegistry} from "../../contracts/creditcoin/kernel/ClaimRegistry.sol";
import {EncumbranceRegistry} from "../../contracts/creditcoin/kernel/EncumbranceRegistry.sol";
import {FacilityManager} from "../../contracts/creditcoin/financing/FacilityManager.sol";
import {AllocationManager} from "../../contracts/creditcoin/financing/AllocationManager.sol";
import {CommitmentRegistry} from "../../contracts/creditcoin/financing/CommitmentRegistry.sol";
import {CapitalizationManager} from "../../contracts/creditcoin/financing/CapitalizationManager.sol";
import {ObligationLedger} from "../../contracts/creditcoin/obligations/ObligationLedger.sol";
import {ClearingPolicyRegistry} from "../../contracts/creditcoin/clearing/ClearingPolicyRegistry.sol";
import {ClearingEngine} from "../../contracts/creditcoin/clearing/ClearingEngine.sol";

contract ClearingEngineFuzzTest {
    ClaimRegistry internal claims;
    EncumbranceRegistry internal encumbrances;
    FacilityManager internal facilities;
    AllocationManager internal allocations;
    CommitmentRegistry internal commitments;
    CapitalizationManager internal capitalization;
    ObligationLedger internal obligations;
    ClearingPolicyRegistry internal policies;
    ClearingEngine internal clearing;

    bytes32 internal assetClassId;
    bytes32 internal facilityId;
    bytes32 internal clearingPolicyId;
    address internal a = address(0xA11CE);
    address internal b = address(0xB0B);
    address internal c = address(0xCAFE);

    function setUp() public {
        claims = new ClaimRegistry(address(this));
        encumbrances = new EncumbranceRegistry(address(this), claims);
        facilities = new FacilityManager(address(this), encumbrances);
        allocations = new AllocationManager(address(this), facilities);
        commitments = new CommitmentRegistry(address(this));
        capitalization = new CapitalizationManager(address(this), facilities, allocations, commitments);
        obligations = new ObligationLedger(address(this), facilities);
        policies = new ClearingPolicyRegistry(address(this));
        clearing = new ClearingEngine(address(this), obligations, policies);

        claims.grantRole(claims.ENCUMBRANCE_ROLE(), address(encumbrances));
        encumbrances.grantRole(encumbrances.FACILITY_ROLE(), address(facilities));
        facilities.grantRole(facilities.FACILITY_MANAGER_ROLE(), address(allocations));
        allocations.grantRole(allocations.COMMITMENT_GATEWAY_ROLE(), address(this));
        commitments.grantRole(commitments.COMMITMENT_GATEWAY_ROLE(), address(this));
        facilities.bindCapitalizationManager(address(capitalization));
        obligations.bindClearingEngine(address(clearing));

        assetClassId = keccak256("USD");
        facilityId = _makeCapitalizedFacility(1_000_000);
        clearingPolicyId = policies.configurePolicy(
            assetClassId, keccak256("bilateral-compatibility"), ClearingPolicyRegistry.SetoffMode.BILATERAL
        );
    }

    function testFuzzBilateralConservation(uint128 seedX, uint128 seedY) public {
        uint256 x = uint256(seedX) + 1;
        uint256 y = uint256(seedY) + 1;
        bytes32 ab = _finalized(a, b, x, keccak256(abi.encode("ab", x, y)));
        bytes32 ba = _finalized(b, a, y, keccak256(abi.encode("ba", x, y)));
        obligations.authorizeClearing(ab, clearingPolicyId);
        obligations.authorizeClearing(ba, clearingPolicyId);

        bytes32 epochId = clearing.openEpoch(clearingPolicyId, assetClassId);
        clearing.sealBilateral(epochId, ab, ba);
        clearing.computeBilateral(epochId);
        ClearingEngine.ClearingEpoch memory computed = clearing.getEpoch(epochId);

        uint256 expectedClear = x < y ? x : y;
        uint256 expectedGross = x + y;
        uint256 expectedAfter = expectedGross - (2 * expectedClear);
        require(computed.grossBefore == expectedGross, "gross-before conservation failed");
        require(computed.clearingAmount == expectedClear, "min setoff failed");
        require(computed.grossAfter == expectedAfter, "gross-after conservation failed");
        require(computed.movementReduced == 2 * expectedClear, "movement reduction failed");
        require(computed.grossBefore == computed.grossAfter + computed.movementReduced, "gross identity failed");

        clearing.finalizeBilateral(epochId);
        require(obligations.remainingAmount(ab) == x - expectedClear, "A residual mismatch");
        require(obligations.remainingAmount(ba) == y - expectedClear, "B residual mismatch");
        require(obligations.getObligation(ab).clearedAmount == expectedClear, "A clear mismatch");
        require(obligations.getObligation(ba).clearedAmount == expectedClear, "B clear mismatch");
    }

    function testFuzzReciprocityWithoutAuthorizationNeverMutates(uint128 seedX, uint128 seedY) public {
        uint256 x = uint256(seedX) + 1;
        uint256 y = uint256(seedY) + 1;
        bytes32 ab = _finalized(a, b, x, keccak256(abi.encode("ab", x, y)));
        bytes32 ba = _finalized(b, a, y, keccak256(abi.encode("ba", x, y)));
        bytes32 epochId = clearing.openEpoch(clearingPolicyId, assetClassId);

        (bool ok,) = address(clearing).call(abi.encodeCall(clearing.sealBilateral, (epochId, ab, ba)));
        require(!ok, "unauthorized reciprocity entered epoch");
        require(clearing.getEpoch(epochId).status == ClearingEngine.EpochStatus.OPEN, "failed seal changed epoch");
        require(obligations.remainingAmount(ab) == x, "failed seal changed A");
        require(obligations.remainingAmount(ba) == y, "failed seal changed B");
        require(
            obligations.getObligation(ab).status == ObligationLedger.ObligationStatus.FINALIZED,
            "failed seal changed A status"
        );
        require(
            obligations.getObligation(ba).status == ObligationLedger.ObligationStatus.FINALIZED,
            "failed seal changed B status"
        );
    }

    function testFuzzNonReciprocalNeverClears(uint128 seedX, uint128 seedY) public {
        uint256 x = uint256(seedX) + 1;
        uint256 y = uint256(seedY) + 1;
        bytes32 ab = _finalized(a, b, x, keccak256(abi.encode("ab", x, y)));
        bytes32 ac = _finalized(a, c, y, keccak256(abi.encode("ac", x, y)));
        obligations.authorizeClearing(ab, clearingPolicyId);
        obligations.authorizeClearing(ac, clearingPolicyId);
        bytes32 epochId = clearing.openEpoch(clearingPolicyId, assetClassId);

        (bool ok,) = address(clearing).call(abi.encodeCall(clearing.sealBilateral, (epochId, ab, ac)));
        require(!ok, "non-reciprocal obligations entered clearing");
        require(clearing.getEpoch(epochId).status == ClearingEngine.EpochStatus.OPEN, "failed pair changed epoch");
        require(obligations.remainingAmount(ab) == x, "failed pair changed AB");
        require(obligations.remainingAmount(ac) == y, "failed pair changed AC");
    }

    function _finalized(address debtor, address creditor, uint256 amount, bytes32 termsHash)
        internal
        returns (bytes32 obligationId)
    {
        obligationId = obligations.createObligation(
            facilityId,
            debtor,
            creditor,
            assetClassId,
            amount,
            uint64(block.timestamp + 30 days),
            keccak256("obligation-policy"),
            termsHash,
            ObligationLedger.ObligationKind.FEE
        );
        obligations.finalizeObligation(obligationId);
    }

    function _makeCapitalizedFacility(uint256 amount) internal returns (bytes32 id) {
        bytes32 claimId = claims.registerVerifiedClaim(
            keccak256("domain"),
            address(0xCA11),
            1,
            address(this),
            address(0xD00D),
            assetClassId,
            amount,
            uint64(block.timestamp + 180 days),
            keccak256("source"),
            keccak256("evidence")
        );
        claims.setFinanceableCapacity(claimId, amount, keccak256("finance-policy"), keccak256("decision"));

        id = facilities.createFacility(
            assetClassId,
            amount,
            uint64(block.timestamp),
            uint64(block.timestamp + 30 days),
            keccak256("facility-policy")
        );
        facilities.verifyFacility(id);
        facilities.openFacility(id);
        bytes32 encumbranceId =
            encumbrances.createEncumbrance(claimId, id, address(this), amount, uint64(block.timestamp + 120 days));
        facilities.bindEncumbrance(id, encumbranceId);
        facilities.beginAllocating(id);

        bytes32 allocationId =
            allocations.proposeAllocation(id, address(this), amount, uint64(block.timestamp + 90 days));
        allocations.activateAllocation(allocationId);
        bytes32 commitmentId = commitments.registerActiveCommitment(
            keccak256("source-commitment"),
            keccak256("domain"),
            address(0xBEEF),
            id,
            allocationId,
            address(this),
            assetClassId,
            address(0xCAFE),
            amount,
            uint64(block.timestamp + 120 days),
            keccak256("commitment-evidence")
        );
        allocations.recognizeCommitment(allocationId, address(this), amount);
        facilities.beginCapitalizing(id);
        bytes32[] memory commitmentIds = new bytes32[](1);
        commitmentIds[0] = commitmentId;
        capitalization.sealCapitalization(id, uint64(block.timestamp + 60 days), commitmentIds);
    }
}
