// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ResidualSettlementRoutingTest} from "./ResidualSettlementRouting.t.sol";
import {ResidualLedger} from "../../contracts/creditcoin/settlement/ResidualLedger.sol";
import {SettlementReconciler} from "../../contracts/creditcoin/settlement/SettlementReconciler.sol";
import {EvidenceRegistry} from "../../contracts/creditcoin/registry/EvidenceRegistry.sol";
import {ObligationLedger} from "../../contracts/creditcoin/obligations/ObligationLedger.sol";

contract UnauthorizedSettlementCaller {
    function reconcile(
        SettlementReconciler reconciler,
        bytes32 settlementId,
        bytes32 evidenceId,
        address debtor,
        address creditor,
        bytes32 assetClassId,
        uint256 amount
    ) external {
        reconciler.reconcile(settlementId, evidenceId, debtor, creditor, assetClassId, amount);
    }
}

contract SettlementReconciliationTest is ResidualSettlementRoutingTest {
    EvidenceRegistry internal evidence;
    SettlementReconciler internal reconciler;

    function setUp() public override {
        super.setUp();
        evidence = new EvidenceRegistry(address(this));
        reconciler = new SettlementReconciler(address(this), residuals, router, evidence);

        residuals.bindSettlementReconciler(address(reconciler));
        obligations.bindSettlementReconciler(address(reconciler));
        reconciler.bindSettlementASC(address(this));
        evidence.grantRole(evidence.CONSUMER_ROLE(), address(reconciler));
    }

    function testExactAttestedResidualSettlesObligationAndConsumesEvidence() public {
        (bytes32 settlementId, bytes32 residualId, bytes32 sourceObligationId, bytes32 evidenceId) = _routed340();
        ResidualLedger.Residual memory beforeResidual = residuals.getResidual(residualId);

        reconciler.reconcile(
            settlementId,
            evidenceId,
            beforeResidual.debtor,
            beforeResidual.creditor,
            beforeResidual.assetClassId,
            beforeResidual.amount
        );

        ResidualLedger.Residual memory afterResidual = residuals.getResidual(residualId);
        ObligationLedger.Obligation memory afterObligation = obligations.getObligation(sourceObligationId);
        EvidenceRegistry.EvidenceRecord memory record = evidence.getEvidence(evidenceId);

        require(afterResidual.status == ResidualLedger.ResidualStatus.SETTLED, "residual not settled");
        require(afterObligation.status == ObligationLedger.ObligationStatus.SETTLED, "obligation not settled");
        require(afterObligation.settledAmount == 340_000, "wrong settled amount");
        require(obligations.remainingAmount(sourceObligationId) == 0, "obligation still has remainder");
        require(record.consumed, "evidence not consumed");
        require(reconciler.reconciledSettlement(settlementId), "settlement not replay-locked");
    }

    function testPartialSettlementFactCannotMutateState() public {
        (bytes32 settlementId, bytes32 residualId, bytes32 sourceObligationId, bytes32 evidenceId) = _routed340();
        ResidualLedger.Residual memory residual = residuals.getResidual(residualId);

        (bool ok,) = address(reconciler)
            .call(
                abi.encodeCall(
                    reconciler.reconcile,
                    (
                        settlementId,
                        evidenceId,
                        residual.debtor,
                        residual.creditor,
                        residual.assetClassId,
                        residual.amount - 1
                    )
                )
            );

        require(!ok, "partial settlement accepted");
        require(residuals.getResidual(residualId).status == ResidualLedger.ResidualStatus.ROUTED, "residual mutated");
        ObligationLedger.Obligation memory obligation = obligations.getObligation(sourceObligationId);
        require(obligation.status == ObligationLedger.ObligationStatus.CLEARED, "obligation state mutated");
        require(obligation.settledAmount == 0, "partial amount recorded");
        require(!evidence.getEvidence(evidenceId).consumed, "failed settlement consumed evidence");
        require(!reconciler.reconciledSettlement(settlementId), "failed settlement replay-locked");
    }

    function testWrongCreditorCannotMutateState() public {
        (bytes32 settlementId, bytes32 residualId, bytes32 sourceObligationId, bytes32 evidenceId) = _routed340();
        ResidualLedger.Residual memory residual = residuals.getResidual(residualId);

        (bool ok,) = address(reconciler)
            .call(
                abi.encodeCall(
                    reconciler.reconcile,
                    (settlementId, evidenceId, residual.debtor, address(0xBAD), residual.assetClassId, residual.amount)
                )
            );

        require(!ok, "wrong creditor accepted");
        require(residuals.getResidual(residualId).status == ResidualLedger.ResidualStatus.ROUTED, "residual mutated");
        require(obligations.getObligation(sourceObligationId).settledAmount == 0, "wrong-creditor fact settled value");
        require(!evidence.getEvidence(evidenceId).consumed, "failed settlement consumed evidence");
    }

    function testUnauthorizedCallerCannotReconcile() public {
        (bytes32 settlementId, bytes32 residualId, bytes32 sourceObligationId, bytes32 evidenceId) = _routed340();
        ResidualLedger.Residual memory residual = residuals.getResidual(residualId);
        UnauthorizedSettlementCaller caller = new UnauthorizedSettlementCaller();

        (bool ok,) = address(caller)
            .call(
                abi.encodeCall(
                    caller.reconcile,
                    (
                        reconciler,
                        settlementId,
                        evidenceId,
                        residual.debtor,
                        residual.creditor,
                        residual.assetClassId,
                        residual.amount
                    )
                )
            );

        require(!ok, "unauthorized caller reconciled");
        require(residuals.getResidual(residualId).status == ResidualLedger.ResidualStatus.ROUTED, "residual mutated");
        require(obligations.getObligation(sourceObligationId).settledAmount == 0, "unauthorized caller settled value");
    }

    function testSettlementCannotReconcileTwice() public {
        (bytes32 settlementId, bytes32 residualId,, bytes32 evidenceId) = _routed340();
        ResidualLedger.Residual memory residual = residuals.getResidual(residualId);

        reconciler.reconcile(
            settlementId, evidenceId, residual.debtor, residual.creditor, residual.assetClassId, residual.amount
        );

        (bool ok,) = address(reconciler)
            .call(
                abi.encodeCall(
                    reconciler.reconcile,
                    (
                        settlementId,
                        evidenceId,
                        residual.debtor,
                        residual.creditor,
                        residual.assetClassId,
                        residual.amount
                    )
                )
            );
        require(!ok, "settlement reconciled twice");
        require(
            residuals.getResidual(residualId).status == ResidualLedger.ResidualStatus.SETTLED, "settled state drifted"
        );
    }

    function _routed340()
        internal
        returns (bytes32 settlementId, bytes32 residualId, bytes32 sourceObligationId, bytes32 evidenceId)
    {
        (bytes32 epochId,,) = _finalizedEpoch(400_000, 60_000);
        residualId = residuals.createBilateralResidual(epochId);
        ResidualLedger.Residual memory residual = residuals.getResidual(residualId);
        sourceObligationId = residual.sourceObligationId;
        bytes32 routeDataHash = keccak256(
            abi.encode(
                "CLEARA_ROUTE_V1",
                residual.debtor,
                residual.creditor,
                residual.assetClassId,
                settlementToken,
                residual.amount
            )
        );
        settlementId = router.routeResidual(
            residualId, settlementAdapterId, settlementDomainId, settlementRepresentationId, routeDataHash
        );
        evidenceId = evidence.registerEvidence(
            settlementDomainId,
            1,
            12_345,
            7,
            0,
            keccak256("encoded-settlement-transaction"),
            keccak256(abi.encode(settlementId, residualId, residual.amount))
        );
    }
}
