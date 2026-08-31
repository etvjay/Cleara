// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ClearingEngine} from "../clearing/ClearingEngine.sol";
import {ObligationLedger} from "../obligations/ObligationLedger.sol";

contract ResidualLedger is AccessControl {
    bytes32 public constant RESIDUAL_OPERATOR_ROLE = keccak256("RESIDUAL_OPERATOR_ROLE");

    enum ResidualStatus {
        NONE,
        CREATED,
        ROUTED,
        SETTLEMENT_PENDING,
        SETTLED,
        FAILED,
        CANCELLED
    }

    struct Residual {
        bytes32 residualId;
        bytes32 epochId;
        bytes32 sourceObligationId;
        bytes32 assetClassId;
        address debtor;
        address creditor;
        uint256 amount;
        uint256 residualIndex;
        ResidualStatus status;
    }

    ClearingEngine public immutable clearingEngine;
    ObligationLedger public immutable obligationLedger;
    address public settlementRouter;
    address public settlementReconciler;

    mapping(bytes32 => Residual) private _residuals;
    mapping(bytes32 => bool) public epochResidualized;

    error InvalidResidual();
    error UnknownResidual(bytes32 residualId);
    error EpochAlreadyResidualized(bytes32 epochId);
    error EpochNotFinalized(bytes32 epochId, ClearingEngine.EpochStatus status);
    error BilateralResidualAmbiguous(uint256 remainingA, uint256 remainingB);
    error SettlementRouterAlreadySet(address currentRouter);
    error UnauthorizedSettlementRouter(address caller);
    error SettlementReconcilerAlreadySet(address currentReconciler);
    error UnauthorizedSettlementReconciler(address caller);
    error InvalidResidualState(bytes32 residualId, ResidualStatus status);

    event ResidualCreated(
        bytes32 indexed residualId,
        bytes32 indexed epochId,
        bytes32 indexed sourceObligationId,
        address debtor,
        address creditor,
        bytes32 assetClassId,
        uint256 amount,
        uint256 residualIndex
    );
    event SettlementRouterBound(address indexed settlementRouter);
    event SettlementReconcilerBound(address indexed settlementReconciler);
    event ResidualRouted(bytes32 indexed residualId);
    event ResidualSettlementPending(bytes32 indexed residualId, bytes32 indexed settlementId);
    event ResidualSettled(bytes32 indexed residualId, bytes32 indexed settlementId);

    constructor(address admin, ClearingEngine clearingEngine_) {
        if (admin == address(0) || address(clearingEngine_) == address(0)) revert InvalidResidual();
        clearingEngine = clearingEngine_;
        obligationLedger = clearingEngine_.obligationLedger();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(RESIDUAL_OPERATOR_ROLE, admin);
    }

    function bindSettlementRouter(address router) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (router == address(0)) revert InvalidResidual();
        if (settlementRouter != address(0)) revert SettlementRouterAlreadySet(settlementRouter);
        settlementRouter = router;
        emit SettlementRouterBound(router);
    }

    function bindSettlementReconciler(address reconciler) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (reconciler == address(0)) revert InvalidResidual();
        if (settlementReconciler != address(0)) revert SettlementReconcilerAlreadySet(settlementReconciler);
        settlementReconciler = reconciler;
        emit SettlementReconcilerBound(reconciler);
    }

    function computeResidualId(bytes32 epochId, address debtor, address creditor, uint256 residualIndex)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode("CLEARA_RESIDUAL_V1", epochId, debtor, creditor, residualIndex));
    }

    function createBilateralResidual(bytes32 epochId)
        external
        onlyRole(RESIDUAL_OPERATOR_ROLE)
        returns (bytes32 residualId)
    {
        if (epochResidualized[epochId]) revert EpochAlreadyResidualized(epochId);

        ClearingEngine.ClearingEpoch memory epoch = clearingEngine.getEpoch(epochId);
        if (epoch.status != ClearingEngine.EpochStatus.FINALIZED) {
            revert EpochNotFinalized(epochId, epoch.status);
        }

        ObligationLedger.Obligation memory a = obligationLedger.getObligation(epoch.obligationA);
        ObligationLedger.Obligation memory b = obligationLedger.getObligation(epoch.obligationB);
        uint256 remainingA = a.originalAmount - a.clearedAmount - a.settledAmount;
        uint256 remainingB = b.originalAmount - b.clearedAmount - b.settledAmount;

        if ((remainingA == 0 && remainingB == 0) || (remainingA != 0 && remainingB != 0)) {
            revert BilateralResidualAmbiguous(remainingA, remainingB);
        }

        ObligationLedger.Obligation memory source = remainingA != 0 ? a : b;
        uint256 amount = remainingA != 0 ? remainingA : remainingB;
        if (source.assetClassId != epoch.assetClassId || amount != epoch.grossAfter) revert InvalidResidual();

        uint256 residualIndex = 0;
        residualId = computeResidualId(epochId, source.debtor, source.creditor, residualIndex);
        if (_residuals[residualId].status != ResidualStatus.NONE) revert InvalidResidual();

        epochResidualized[epochId] = true;
        _residuals[residualId] = Residual({
            residualId: residualId,
            epochId: epochId,
            sourceObligationId: source.obligationId,
            assetClassId: source.assetClassId,
            debtor: source.debtor,
            creditor: source.creditor,
            amount: amount,
            residualIndex: residualIndex,
            status: ResidualStatus.CREATED
        });

        emit ResidualCreated(
            residualId,
            epochId,
            source.obligationId,
            source.debtor,
            source.creditor,
            source.assetClassId,
            amount,
            residualIndex
        );
    }

    function markRouted(bytes32 residualId) external {
        if (msg.sender != settlementRouter) revert UnauthorizedSettlementRouter(msg.sender);
        Residual storage residual = _requireState(residualId, ResidualStatus.CREATED);
        residual.status = ResidualStatus.ROUTED;
        emit ResidualRouted(residualId);
    }

    function markSettlementPending(bytes32 residualId, bytes32 settlementId) external {
        _onlySettlementReconciler();
        if (settlementId == bytes32(0)) revert InvalidResidual();
        Residual storage residual = _requireState(residualId, ResidualStatus.ROUTED);
        residual.status = ResidualStatus.SETTLEMENT_PENDING;
        emit ResidualSettlementPending(residualId, settlementId);
    }

    function markSettled(bytes32 residualId, bytes32 settlementId) external {
        _onlySettlementReconciler();
        if (settlementId == bytes32(0)) revert InvalidResidual();
        Residual storage residual = _requireState(residualId, ResidualStatus.SETTLEMENT_PENDING);
        residual.status = ResidualStatus.SETTLED;
        emit ResidualSettled(residualId, settlementId);
    }

    function getResidual(bytes32 residualId) public view returns (Residual memory residual) {
        residual = _residuals[residualId];
        if (residual.status == ResidualStatus.NONE) revert UnknownResidual(residualId);
    }

    function _onlySettlementReconciler() internal view {
        if (msg.sender != settlementReconciler) revert UnauthorizedSettlementReconciler(msg.sender);
    }

    function _requireState(bytes32 residualId, ResidualStatus expected)
        internal
        view
        returns (Residual storage residual)
    {
        residual = _residuals[residualId];
        if (residual.status == ResidualStatus.NONE) revert UnknownResidual(residualId);
        if (residual.status != expected) revert InvalidResidualState(residualId, residual.status);
    }
}
