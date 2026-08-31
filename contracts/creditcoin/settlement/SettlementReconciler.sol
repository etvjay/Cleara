// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ResidualLedger} from "./ResidualLedger.sol";
import {SettlementRouter} from "./SettlementRouter.sol";
import {ObligationLedger} from "../obligations/ObligationLedger.sol";
import {EvidenceRegistry} from "../registry/EvidenceRegistry.sol";

contract SettlementReconciler is AccessControl {
    ResidualLedger public immutable residualLedger;
    SettlementRouter public immutable settlementRouter;
    ObligationLedger public immutable obligationLedger;
    EvidenceRegistry public immutable evidenceRegistry;
    address public settlementASC;

    mapping(bytes32 => bool) public reconciledSettlement;

    error InvalidSettlement();
    error SettlementASCAlreadySet(address currentASC);
    error UnauthorizedSettlementASC(address caller);
    error SettlementAlreadyReconciled(bytes32 settlementId);

    event SettlementASCBound(address indexed settlementASC);
    event SettlementReconciled(
        bytes32 indexed settlementId,
        bytes32 indexed residualId,
        bytes32 indexed evidenceId,
        bytes32 sourceObligationId,
        uint256 amount
    );

    constructor(
        address admin,
        ResidualLedger residualLedger_,
        SettlementRouter settlementRouter_,
        EvidenceRegistry evidenceRegistry_
    ) {
        if (
            admin == address(0) || address(residualLedger_) == address(0) || address(settlementRouter_) == address(0)
                || address(evidenceRegistry_) == address(0)
        ) revert InvalidSettlement();
        residualLedger = residualLedger_;
        settlementRouter = settlementRouter_;
        obligationLedger = residualLedger_.obligationLedger();
        evidenceRegistry = evidenceRegistry_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function bindSettlementASC(address asc) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (asc == address(0)) revert InvalidSettlement();
        if (settlementASC != address(0)) revert SettlementASCAlreadySet(settlementASC);
        settlementASC = asc;
        emit SettlementASCBound(asc);
    }

    function reconcile(
        bytes32 settlementId,
        bytes32 evidenceId,
        address debtor,
        address creditor,
        bytes32 assetClassId,
        uint256 amount
    ) external {
        if (msg.sender != settlementASC) revert UnauthorizedSettlementASC(msg.sender);
        if (
            settlementId == bytes32(0) || evidenceId == bytes32(0) || debtor == address(0) || creditor == address(0)
                || assetClassId == bytes32(0) || amount == 0
        ) revert InvalidSettlement();
        if (reconciledSettlement[settlementId]) revert SettlementAlreadyReconciled(settlementId);

        SettlementRouter.SettlementInstruction memory instruction = settlementRouter.getInstruction(settlementId);
        if (instruction.status != SettlementRouter.RouteStatus.ROUTED) revert InvalidSettlement();

        ResidualLedger.Residual memory residual = residualLedger.getResidual(instruction.residualId);
        if (
            residual.status != ResidualLedger.ResidualStatus.ROUTED || residual.debtor != debtor
                || residual.creditor != creditor || residual.assetClassId != assetClassId || residual.amount != amount
        ) revert InvalidSettlement();

        ObligationLedger.Obligation memory obligation = obligationLedger.getObligation(residual.sourceObligationId);
        uint256 remaining = obligation.originalAmount - obligation.clearedAmount - obligation.settledAmount;
        if (
            obligation.status != ObligationLedger.ObligationStatus.CLEARED || obligation.debtor != debtor
                || obligation.creditor != creditor || obligation.assetClassId != assetClassId || remaining != amount
        ) revert InvalidSettlement();

        reconciledSettlement[settlementId] = true;
        evidenceRegistry.consumeEvidence(evidenceId);
        residualLedger.markSettlementPending(residual.residualId, settlementId);
        obligationLedger.markSettlementPending(residual.sourceObligationId, settlementId);
        obligationLedger.applySettlement(residual.sourceObligationId, settlementId, amount);
        residualLedger.markSettled(residual.residualId, settlementId);

        emit SettlementReconciled(settlementId, residual.residualId, evidenceId, residual.sourceObligationId, amount);
    }
}
