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

contract ClearingEngineTest {
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
            assetClassId,
            keccak256("same-asset-same-priority-same-jurisdiction-bilateral-setoff"),
            ClearingPolicyRegistry.SetoffMode.BILATERAL
        );
    }

    function testBilateral100By70Clears140GrossAndLeaves30() public {
        bytes32 ab = _finalized(a, b, 100, keccak256("ab"));
        bytes32 ba = _finalized(b, a, 70, keccak256("ba"));
        obligations.authorizeClearing(ab, clearingPolicyId);
        obligations.authorizeClearing(ba, clearingPolicyId);

        bytes32 epochId = clearing.openEpoch(clearingPolicyId, assetClassId);
        clearing.sealBilateral(epochId, ab, ba);
        clearing.computeBilateral(epochId);

        ClearingEngine.ClearingEpoch memory computed = clearing.getEpoch(epochId);
        require(computed.status == ClearingEngine.EpochStatus.COMPUTED, "epoch not computed");
        require(computed.grossBefore == 170, "gross-before mismatch");
        require(computed.clearingAmount == 70, "setoff mismatch");
        require(computed.grossAfter == 30, "gross-after mismatch");
        require(computed.movementReduced == 140, "movement reduction mismatch");

        clearing.finalizeBilateral(epochId);
        require(clearing.getEpoch(epochId).status == ClearingEngine.EpochStatus.FINALIZED, "epoch not finalized");
        require(obligations.remainingAmount(ab) == 30, "A->B residual mismatch");
        require(obligations.remainingAmount(ba) == 0, "B->A should be extinguished");
        require(obligations.getObligation(ab).clearedAmount == 70, "A clear amount mismatch");
        require(obligations.getObligation(ba).clearedAmount == 70, "B clear amount mismatch");
        require(
            obligations.getObligation(ab).status == ObligationLedger.ObligationStatus.CLEARED,
            "A status not CLEARED"
        );
        require(
            obligations.getObligation(ba).status == ObligationLedger.ObligationStatus.CLEARED,
            "B status not CLEARED"
        );
    }

    function testReciprocityWithoutExplicitAuthorizationCannotEnterEpoch() public {
        bytes32 ab = _finalized(a, b, 100, keccak256("ab"));
        bytes32 ba = _finalized(b, a, 70, keccak256("ba"));
        bytes32 epochId = clearing.openEpoch(clearingPolicyId, assetClassId);

        (bool ok,) = address(clearing).call(abi.encodeCall(clearing.sealBilateral, (epochId, ab, ba)));
        require(!ok, "mere reciprocity granted setoff authority");
        require(clearing.getEpoch(epochId).status == ClearingEngine.EpochStatus.OPEN, "failed seal mutated epoch");
        require(obligations.remainingAmount(ab) == 100, "failed seal mutated A");
        require(obligations.remainingAmount(ba) == 70, "failed seal mutated B");
    }

    function testSamePolicyStillRequiresExactReciprocalCounterparties() public {
        bytes32 ab = _finalized(a, b, 100, keccak256("ab"));
        bytes32 ac = _finalized(a, address(0xCAFE), 70, keccak256("ac"));
        obligations.authorizeClearing(ab, clearingPolicyId);
        obligations.authorizeClearing(ac, clearingPolicyId);
        bytes32 epochId = clearing.openEpoch(clearingPolicyId, assetClassId);

        (bool ok,) = address(clearing).call(abi.encodeCall(clearing.sealBilateral, (epochId, ab, ac)));
        require(!ok, "non-reciprocal obligations cleared");
    }

    function testMultilateralPolicyCannotBeConfiguredInM9() public {
        (bool ok,) = address(policies).call(
            abi.encodeCall(
                policies.configurePolicy,
                (assetClassId, keccak256("multilateral"), ClearingPolicyRegistry.SetoffMode.MULTILATERAL)
            )
        );
        require(!ok, "M9 silently enabled multilateral netting");
    }

    function testClearingEngineBindingIsOneTime() public {
        (bool ok,) = address(obligations).call(abi.encodeCall(obligations.bindClearingEngine, (address(0x1234))));
        require(!ok, "clearing engine authority rebound");
        require(obligations.clearingEngine() == address(clearing), "clearing engine changed");
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

        bytes32 allocationId = allocations.proposeAllocation(id, address(this), amount, uint64(block.timestamp + 90 days));
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
