// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {FacilityManager} from "../financing/FacilityManager.sol";

contract ObligationLedger is AccessControl {
    bytes32 public constant OBLIGATION_ISSUER_ROLE = keccak256("OBLIGATION_ISSUER_ROLE");
    bytes32 public constant CLEARING_AUTHORIZER_ROLE = keccak256("CLEARING_AUTHORIZER_ROLE");

    enum ObligationStatus {
        NONE,
        CREATED,
        FINALIZED,
        ELIGIBLE_FOR_CLEARING,
        IN_CLEARING_EPOCH,
        CLEARED,
        RESIDUAL,
        SETTLEMENT_PENDING,
        SETTLED,
        DISPUTED,
        CANCELLED,
        DEFAULTED
    }

    enum ObligationKind {
        UNSPECIFIED,
        DRAWDOWN,
        PRINCIPAL_REPAYMENT,
        INTEREST,
        FEE,
        LP_DISTRIBUTION,
        CLAIM_PURCHASE,
        COLLATERAL_PROCEEDS
    }

    struct Obligation {
        bytes32 obligationId;
        bytes32 facilityId;
        address debtor;
        address creditor;
        bytes32 assetClassId;
        uint256 originalAmount;
        uint256 clearedAmount;
        uint256 settledAmount;
        uint64 maturity;
        bytes32 policyId;
        bytes32 termsHash;
        bytes32 clearingPolicyId;
        bytes32 clearingEpochId;
        uint256 nonce;
        ObligationKind kind;
        ObligationStatus status;
    }

    FacilityManager public immutable facilityManager;
    address public clearingEngine;

    mapping(bytes32 => Obligation) private _obligations;
    mapping(bytes32 => uint256) public nextNonceByFacility;

    error InvalidObligation();
    error UnknownObligation(bytes32 obligationId);
    error ObligationAlreadyExists(bytes32 obligationId);
    error InvalidObligationState(bytes32 obligationId, ObligationStatus status);
    error FacilityNotCapitalized(bytes32 facilityId, FacilityManager.FacilityStatus status);
    error WrongAssetClass(bytes32 expected, bytes32 actual);
    error ClearingEngineAlreadySet(address currentEngine);
    error UnauthorizedClearingEngine(address caller);
    error ClearingAmountExceeded(bytes32 obligationId, uint256 requested, uint256 remaining);

    event ObligationCreated(
        bytes32 indexed obligationId,
        bytes32 indexed facilityId,
        address indexed debtor,
        address creditor,
        bytes32 assetClassId,
        uint256 amount,
        uint64 maturity,
        bytes32 policyId,
        bytes32 termsHash,
        uint256 nonce,
        ObligationKind kind
    );
    event ObligationFinalized(bytes32 indexed obligationId);
    event ObligationDisputed(bytes32 indexed obligationId);
    event ClearingEngineBound(address indexed clearingEngine);
    event ClearingAuthorized(bytes32 indexed obligationId, bytes32 indexed clearingPolicyId);
    event ObligationEnteredClearing(bytes32 indexed obligationId, bytes32 indexed clearingEpochId);
    event ClearingApplied(bytes32 indexed obligationId, bytes32 indexed clearingEpochId, uint256 amount);

    constructor(address admin, FacilityManager facilityManager_) {
        if (admin == address(0) || address(facilityManager_) == address(0)) revert InvalidObligation();
        facilityManager = facilityManager_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OBLIGATION_ISSUER_ROLE, admin);
        _grantRole(CLEARING_AUTHORIZER_ROLE, admin);
    }

    function bindClearingEngine(address engine) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (engine == address(0)) revert InvalidObligation();
        if (clearingEngine != address(0)) revert ClearingEngineAlreadySet(clearingEngine);
        clearingEngine = engine;
        emit ClearingEngineBound(engine);
    }

    function computeObligationId(
        bytes32 facilityId,
        address debtor,
        address creditor,
        bytes32 assetClassId,
        uint256 obligationNonce
    ) public pure returns (bytes32) {
        return keccak256(
            abi.encode("CLEARA_OBLIGATION_V1", facilityId, debtor, creditor, assetClassId, obligationNonce)
        );
    }

    function createObligation(
        bytes32 facilityId,
        address debtor,
        address creditor,
        bytes32 assetClassId,
        uint256 amount,
        uint64 maturity,
        bytes32 policyId,
        bytes32 termsHash,
        ObligationKind kind
    ) external onlyRole(OBLIGATION_ISSUER_ROLE) returns (bytes32 obligationId) {
        if (
            facilityId == bytes32(0) || debtor == address(0) || creditor == address(0) || debtor == creditor
                || assetClassId == bytes32(0) || amount == 0 || maturity <= block.timestamp || policyId == bytes32(0)
                || termsHash == bytes32(0) || kind == ObligationKind.UNSPECIFIED
        ) revert InvalidObligation();

        FacilityManager.Facility memory facility = facilityManager.getFacility(facilityId);
        if (facility.status != FacilityManager.FacilityStatus.CAPITALIZED) {
            revert FacilityNotCapitalized(facilityId, facility.status);
        }
        if (facility.capitalizationRoot == bytes32(0) || facility.capitalRequiredUntil <= block.timestamp) {
            revert InvalidObligation();
        }
        if (assetClassId != facility.assetClassId) revert WrongAssetClass(facility.assetClassId, assetClassId);

        uint256 nonce = nextNonceByFacility[facilityId];
        obligationId = computeObligationId(facilityId, debtor, creditor, assetClassId, nonce);
        if (_obligations[obligationId].status != ObligationStatus.NONE) revert ObligationAlreadyExists(obligationId);
        nextNonceByFacility[facilityId] = nonce + 1;

        _obligations[obligationId] = Obligation({
            obligationId: obligationId,
            facilityId: facilityId,
            debtor: debtor,
            creditor: creditor,
            assetClassId: assetClassId,
            originalAmount: amount,
            clearedAmount: 0,
            settledAmount: 0,
            maturity: maturity,
            policyId: policyId,
            termsHash: termsHash,
            clearingPolicyId: bytes32(0),
            clearingEpochId: bytes32(0),
            nonce: nonce,
            kind: kind,
            status: ObligationStatus.CREATED
        });

        emit ObligationCreated(
            obligationId, facilityId, debtor, creditor, assetClassId, amount, maturity, policyId, termsHash, nonce, kind
        );
    }

    function finalizeObligation(bytes32 obligationId) external onlyRole(OBLIGATION_ISSUER_ROLE) {
        Obligation storage obligation = _requireState(obligationId, ObligationStatus.CREATED);
        obligation.status = ObligationStatus.FINALIZED;
        emit ObligationFinalized(obligationId);
    }

    function disputeFinalizedObligation(bytes32 obligationId) external onlyRole(OBLIGATION_ISSUER_ROLE) {
        Obligation storage obligation = _requireState(obligationId, ObligationStatus.FINALIZED);
        obligation.status = ObligationStatus.DISPUTED;
        emit ObligationDisputed(obligationId);
    }

    function authorizeClearing(bytes32 obligationId, bytes32 clearingPolicyId)
        external
        onlyRole(CLEARING_AUTHORIZER_ROLE)
    {
        if (clearingPolicyId == bytes32(0)) revert InvalidObligation();
        Obligation storage obligation = _requireState(obligationId, ObligationStatus.FINALIZED);
        obligation.clearingPolicyId = clearingPolicyId;
        obligation.status = ObligationStatus.ELIGIBLE_FOR_CLEARING;
        emit ClearingAuthorized(obligationId, clearingPolicyId);
    }

    function enterClearingEpoch(bytes32 obligationId, bytes32 clearingEpochId) external {
        _onlyClearingEngine();
        if (clearingEpochId == bytes32(0)) revert InvalidObligation();
        Obligation storage obligation = _requireState(obligationId, ObligationStatus.ELIGIBLE_FOR_CLEARING);
        obligation.clearingEpochId = clearingEpochId;
        obligation.status = ObligationStatus.IN_CLEARING_EPOCH;
        emit ObligationEnteredClearing(obligationId, clearingEpochId);
    }

    function applyClearing(bytes32 obligationId, bytes32 clearingEpochId, uint256 amount) external {
        _onlyClearingEngine();
        if (amount == 0) revert InvalidObligation();
        Obligation storage obligation = _requireState(obligationId, ObligationStatus.IN_CLEARING_EPOCH);
        if (obligation.clearingEpochId != clearingEpochId) revert InvalidObligation();
        uint256 remaining = obligation.originalAmount - obligation.clearedAmount - obligation.settledAmount;
        if (amount > remaining) revert ClearingAmountExceeded(obligationId, amount, remaining);
        obligation.clearedAmount += amount;
        obligation.status = ObligationStatus.CLEARED;
        emit ClearingApplied(obligationId, clearingEpochId, amount);
    }

    function remainingAmount(bytes32 obligationId) external view returns (uint256) {
        Obligation memory obligation = getObligation(obligationId);
        return obligation.originalAmount - obligation.clearedAmount - obligation.settledAmount;
    }

    function getObligation(bytes32 obligationId) public view returns (Obligation memory obligation) {
        obligation = _obligations[obligationId];
        if (obligation.status == ObligationStatus.NONE) revert UnknownObligation(obligationId);
    }

    function _onlyClearingEngine() internal view {
        if (msg.sender != clearingEngine) revert UnauthorizedClearingEngine(msg.sender);
    }

    function _requireState(bytes32 obligationId, ObligationStatus expected)
        internal
        view
        returns (Obligation storage obligation)
    {
        obligation = _obligations[obligationId];
        if (obligation.status == ObligationStatus.NONE) revert UnknownObligation(obligationId);
        if (obligation.status != expected) revert InvalidObligationState(obligationId, obligation.status);
    }
}
