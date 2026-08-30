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
import {ResidualLedger} from "../../contracts/creditcoin/settlement/ResidualLedger.sol";
import {SettlementRouter} from "../../contracts/creditcoin/settlement/SettlementRouter.sol";

contract ResidualSettlementRoutingTest {
    ClaimRegistry internal claims;
    EncumbranceRegistry internal encumbrances;
    FacilityManager internal facilities;
    AllocationManager internal allocations;
    CommitmentRegistry internal commitments;
    CapitalizationManager internal capitalization;
    ObligationLedger internal obligations;
    ClearingPolicyRegistry internal policies;
    ClearingEngine internal clearing;
    ResidualLedger internal residuals;
    SettlementRouter internal router;

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
        residuals = new ResidualLedger(address(this), clearing);
        router = new SettlementRouter(address(this), residuals);

        claims.grantRole(claims.ENCUMBRANCE_ROLE(), address(encumbrances));
        encumbrances.grantRole(encumbrances.FACILITY_ROLE(), address(facilities));
        facilities.grantRole(facilities.FACILITY_MANAGER_ROLE(), address(allocations));
        allocations.grantRole(allocations.COMMITMENT_GATEWAY_ROLE(), address(this));
        commitments.grantRole(commitments.COMMITMENT_GATEWAY_ROLE(), address(this));
        facilities.bindCapitalizationManager(address(capitalization));
        obligations.bindClearingEngine(address(clearing));
        residuals.bindSettlementRouter(address(router));

        assetClassId = keccak256("USD");
        facilityId = _makeCapitalizedFacility(1_000_000);
        clearingPolicyId = policies.configurePolicy(
            assetClassId, keccak256("bilateral-compatible"), ClearingPolicyRegistry.SetoffMode.BILATERAL
        );
    }

    function testFinalized400By60DerivesExactly340Residual() public {
        (bytes32 epochId, bytes32 drawdown,) = _finalizedEpoch(400_000, 60_000);
        bytes32 residualId = residuals.createBilateralResidual(epochId);
        ResidualLedger.Residual memory residual = residuals.getResidual(residualId);

        require(residual.epochId == epochId, "wrong epoch");
        require(residual.sourceObligationId == drawdown, "wrong source obligation");
        require(residual.debtor == a && residual.creditor == b, "wrong direction");
        require(residual.assetClassId == assetClassId, "wrong asset");
        require(residual.amount == 340_000, "wrong residual amount");
        require(residual.status == ResidualLedger.ResidualStatus.CREATED, "wrong residual status");
    }

    function testCannotResidualizeBeforeEpochFinalization() public {
        bytes32 ab = _finalized(a, b, 400_000, keccak256("ab"));
        bytes32 ba = _finalized(b, a, 60_000, keccak256("ba"));
        obligations.authorizeClearing(ab, clearingPolicyId);
        obligations.authorizeClearing(ba, clearingPolicyId);
        bytes32 epochId = clearing.openEpoch(clearingPolicyId, assetClassId);
        clearing.sealBilateral(epochId, ab, ba);
        clearing.computeBilateral(epochId);

        (bool ok,) = address(residuals).call(abi.encodeCall(residuals.createBilateralResidual, (epochId)));
        require(!ok, "computed epoch created residual");
        require(!residuals.epochResidualized(epochId), "failed residualization mutated epoch flag");
    }

    function testEpochCanResidualizeOnlyOnce() public {
        (bytes32 epochId,,) = _finalizedEpoch(400_000, 60_000);
        bytes32 first = residuals.createBilateralResidual(epochId);
        (bool ok,) = address(residuals).call(abi.encodeCall(residuals.createBilateralResidual, (epochId)));
        require(!ok, "duplicate residual created");
        require(residuals.getResidual(first).amount == 340_000, "first residual mutated");
    }

    function testRoutingRecordsInstructionButDoesNotSettle() public {
        (bytes32 epochId,,) = _finalizedEpoch(400_000, 60_000);
        bytes32 residualId = residuals.createBilateralResidual(epochId);
        bytes32 adapterId = keccak256("manual-testnet-adapter");
        bytes32 settlementDomainId = keccak256("sepolia-domain");
        bytes32 representationId = keccak256("sepolia-usdc-representation");
        bytes32 routeDataHash = keccak256("recipient-and-amount");

        bytes32 settlementId =
            router.routeResidual(residualId, adapterId, settlementDomainId, representationId, routeDataHash);
        SettlementRouter.SettlementInstruction memory instruction = router.getInstruction(settlementId);
        ResidualLedger.Residual memory residual = residuals.getResidual(residualId);

        require(instruction.residualId == residualId, "wrong residual link");
        require(instruction.adapterId == adapterId, "wrong adapter");
        require(instruction.settlementDomainId == settlementDomainId, "wrong settlement domain");
        require(instruction.settlementRepresentationId == representationId, "wrong representation");
        require(instruction.status == SettlementRouter.RouteStatus.ROUTED, "instruction not routed");
        require(residual.status == ResidualLedger.ResidualStatus.ROUTED, "residual not routed");
        require(
            obligations.getObligation(instruction.residualId == residualId ? _sourceObligation(residualId) : bytes32(0))
            .settledAmount == 0,
            "routing settled value"
        );
    }

    function testResidualCannotBeRoutedTwice() public {
        (bytes32 epochId,,) = _finalizedEpoch(400_000, 60_000);
        bytes32 residualId = residuals.createBilateralResidual(epochId);
        router.routeResidual(
            residualId,
            keccak256("adapter-a"),
            keccak256("domain-a"),
            keccak256("representation-a"),
            keccak256("route-a")
        );

        (bool ok,) = address(router)
            .call(
                abi.encodeCall(
                    router.routeResidual,
                    (
                        residualId,
                        keccak256("adapter-b"),
                        keccak256("domain-b"),
                        keccak256("representation-b"),
                        keccak256("route-b")
                    )
                )
            );
        require(!ok, "routed residual rerouted");
    }

    function _sourceObligation(bytes32 residualId) internal view returns (bytes32) {
        return residuals.getResidual(residualId).sourceObligationId;
    }

    function _finalizedEpoch(uint256 abAmount, uint256 baAmount)
        internal
        returns (bytes32 epochId, bytes32 ab, bytes32 ba)
    {
        ab = _finalized(a, b, abAmount, keccak256("ab"));
        ba = _finalized(b, a, baAmount, keccak256("ba"));
        obligations.authorizeClearing(ab, clearingPolicyId);
        obligations.authorizeClearing(ba, clearingPolicyId);
        epochId = clearing.openEpoch(clearingPolicyId, assetClassId);
        clearing.sealBilateral(epochId, ab, ba);
        clearing.computeBilateral(epochId);
        clearing.finalizeBilateral(epochId);
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
