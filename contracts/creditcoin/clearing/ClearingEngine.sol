// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ObligationLedger} from "../obligations/ObligationLedger.sol";
import {ClearingPolicyRegistry} from "./ClearingPolicyRegistry.sol";

contract ClearingEngine is AccessControl {
    bytes32 public constant CLEARING_OPERATOR_ROLE = keccak256("CLEARING_OPERATOR_ROLE");

    enum EpochStatus {
        NONE,
        OPEN,
        SEALED,
        COMPUTED,
        FINALIZED,
        SETTLING,
        SETTLED,
        FAILED,
        CANCELLED
    }

    struct ClearingEpoch {
        bytes32 epochId;
        bytes32 policyId;
        bytes32 assetClassId;
        bytes32 obligationA;
        bytes32 obligationB;
        bytes32 inputRoot;
        uint256 grossBefore;
        uint256 clearingAmount;
        uint256 grossAfter;
        uint256 movementReduced;
        uint256 nonce;
        EpochStatus status;
    }

    ObligationLedger public immutable obligationLedger;
    ClearingPolicyRegistry public immutable policyRegistry;

    mapping(bytes32 => ClearingEpoch) private _epochs;
    mapping(bytes32 => uint256) public nextNonceByPolicy;

    error InvalidEpoch();
    error UnknownEpoch(bytes32 epochId);
    error InvalidEpochState(bytes32 epochId, EpochStatus status);
    error IncompatibleObligations();
    error InvalidPolicy(bytes32 policyId);

    event ClearingEpochOpened(
        bytes32 indexed epochId, bytes32 indexed policyId, bytes32 indexed assetClassId, uint256 nonce
    );
    event ClearingEpochSealed(
        bytes32 indexed epochId, bytes32 indexed inputRoot, bytes32 obligationA, bytes32 obligationB
    );
    event ClearingEpochComputed(
        bytes32 indexed epochId,
        uint256 grossBefore,
        uint256 clearingAmount,
        uint256 grossAfter,
        uint256 movementReduced
    );
    event ClearingEpochFinalized(bytes32 indexed epochId);

    constructor(address admin, ObligationLedger obligationLedger_, ClearingPolicyRegistry policyRegistry_) {
        if (admin == address(0) || address(obligationLedger_) == address(0) || address(policyRegistry_) == address(0)) {
            revert InvalidEpoch();
        }
        obligationLedger = obligationLedger_;
        policyRegistry = policyRegistry_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(CLEARING_OPERATOR_ROLE, admin);
    }

    function computeEpochId(bytes32 policyId, bytes32 assetClassId, uint256 epochNonce) public pure returns (bytes32) {
        return keccak256(abi.encode("CLEARA_CLEARING_EPOCH_V1", policyId, assetClassId, epochNonce));
    }

    function openEpoch(bytes32 policyId, bytes32 assetClassId)
        external
        onlyRole(CLEARING_OPERATOR_ROLE)
        returns (bytes32 epochId)
    {
        ClearingPolicyRegistry.ClearingPolicy memory policy = policyRegistry.getPolicy(policyId);
        if (
            !policy.active || policy.assetClassId != assetClassId
                || policy.mode != ClearingPolicyRegistry.SetoffMode.BILATERAL
        ) revert InvalidPolicy(policyId);

        uint256 nonce = nextNonceByPolicy[policyId];
        epochId = computeEpochId(policyId, assetClassId, nonce);
        nextNonceByPolicy[policyId] = nonce + 1;
        _epochs[epochId] = ClearingEpoch({
            epochId: epochId,
            policyId: policyId,
            assetClassId: assetClassId,
            obligationA: bytes32(0),
            obligationB: bytes32(0),
            inputRoot: bytes32(0),
            grossBefore: 0,
            clearingAmount: 0,
            grossAfter: 0,
            movementReduced: 0,
            nonce: nonce,
            status: EpochStatus.OPEN
        });
        emit ClearingEpochOpened(epochId, policyId, assetClassId, nonce);
    }

    function sealBilateral(bytes32 epochId, bytes32 obligationX, bytes32 obligationY)
        external
        onlyRole(CLEARING_OPERATOR_ROLE)
    {
        ClearingEpoch storage epoch = _requireState(epochId, EpochStatus.OPEN);
        if (obligationX == bytes32(0) || obligationY == bytes32(0) || obligationX == obligationY) {
            revert InvalidEpoch();
        }

        ObligationLedger.Obligation memory x = obligationLedger.getObligation(obligationX);
        ObligationLedger.Obligation memory y = obligationLedger.getObligation(obligationY);
        if (
            x.status != ObligationLedger.ObligationStatus.ELIGIBLE_FOR_CLEARING
                || y.status != ObligationLedger.ObligationStatus.ELIGIBLE_FOR_CLEARING
                || x.clearingPolicyId != epoch.policyId || y.clearingPolicyId != epoch.policyId
                || x.assetClassId != epoch.assetClassId || y.assetClassId != epoch.assetClassId
                || x.debtor != y.creditor || x.creditor != y.debtor
        ) revert IncompatibleObligations();

        (bytes32 a, bytes32 b) = obligationX < obligationY ? (obligationX, obligationY) : (obligationY, obligationX);
        epoch.obligationA = a;
        epoch.obligationB = b;
        epoch.inputRoot = keccak256(abi.encode("CLEARA_CLEARING_INPUT_V1", epochId, a, b));
        epoch.status = EpochStatus.SEALED;

        obligationLedger.enterClearingEpoch(a, epochId);
        obligationLedger.enterClearingEpoch(b, epochId);
        emit ClearingEpochSealed(epochId, epoch.inputRoot, a, b);
    }

    function computeBilateral(bytes32 epochId) external onlyRole(CLEARING_OPERATOR_ROLE) {
        ClearingEpoch storage epoch = _requireState(epochId, EpochStatus.SEALED);
        uint256 remainingA = obligationLedger.remainingAmount(epoch.obligationA);
        uint256 remainingB = obligationLedger.remainingAmount(epoch.obligationB);
        uint256 clearAmount = remainingA < remainingB ? remainingA : remainingB;
        if (clearAmount == 0) revert InvalidEpoch();

        epoch.grossBefore = remainingA + remainingB;
        epoch.clearingAmount = clearAmount;
        epoch.grossAfter = epoch.grossBefore - (2 * clearAmount);
        epoch.movementReduced = 2 * clearAmount;
        epoch.status = EpochStatus.COMPUTED;
        emit ClearingEpochComputed(
            epochId, epoch.grossBefore, epoch.clearingAmount, epoch.grossAfter, epoch.movementReduced
        );
    }

    function finalizeBilateral(bytes32 epochId) external onlyRole(CLEARING_OPERATOR_ROLE) {
        ClearingEpoch storage epoch = _requireState(epochId, EpochStatus.COMPUTED);
        obligationLedger.applyClearing(epoch.obligationA, epochId, epoch.clearingAmount);
        obligationLedger.applyClearing(epoch.obligationB, epochId, epoch.clearingAmount);
        epoch.status = EpochStatus.FINALIZED;
        emit ClearingEpochFinalized(epochId);
    }

    function getEpoch(bytes32 epochId) external view returns (ClearingEpoch memory epoch) {
        epoch = _epochs[epochId];
        if (epoch.status == EpochStatus.NONE) revert UnknownEpoch(epochId);
    }

    function _requireState(bytes32 epochId, EpochStatus expected) internal view returns (ClearingEpoch storage epoch) {
        epoch = _epochs[epochId];
        if (epoch.status == EpochStatus.NONE) revert UnknownEpoch(epochId);
        if (epoch.status != expected) revert InvalidEpochState(epochId, epoch.status);
    }
}
