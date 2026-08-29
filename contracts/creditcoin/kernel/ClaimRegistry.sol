// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract ClaimRegistry is AccessControl {
    bytes32 public constant CLAIM_GATEWAY_ROLE = keccak256("CLAIM_GATEWAY_ROLE");
    bytes32 public constant FINANCEABILITY_ROLE = keccak256("FINANCEABILITY_ROLE");
    bytes32 public constant ENCUMBRANCE_ROLE = keccak256("ENCUMBRANCE_ROLE");

    enum ClaimState {
        NONE,
        REGISTERED,
        VERIFIED,
        ACTIVE,
        DISPUTED,
        SETTLED,
        CANCELLED
    }

    struct Claim {
        bytes32 claimId;
        bytes32 domainId;
        address sourceContract;
        uint256 sourceNonce;
        address claimant;
        address obligor;
        bytes32 assetClassId;
        uint256 faceValue;
        uint256 financeableCapacity;
        uint256 activeEncumbrance;
        uint64 maturity;
        bytes32 sourceEvidenceHash;
        bytes32 attestationEvidenceId;
        bytes32 financeabilityPolicyId;
        uint64 version;
        ClaimState state;
    }

    mapping(bytes32 => Claim) private _claims;

    error InvalidClaim();
    error ClaimAlreadyExists(bytes32 claimId);
    error UnknownClaim(bytes32 claimId);
    error InvalidClaimState(bytes32 claimId, ClaimState state);
    error InvalidFinanceableCapacity(uint256 requested, uint256 faceValue, uint256 activeEncumbrance);
    error InvalidFinanceabilityDecision();
    error InsufficientAvailableCapacity(bytes32 claimId, uint256 requested, uint256 available);
    error EncumbranceUnderflow(bytes32 claimId, uint256 requested, uint256 activeEncumbrance);

    event ClaimVerified(
        bytes32 indexed claimId,
        bytes32 indexed domainId,
        address indexed sourceContract,
        uint256 sourceNonce,
        address claimant,
        address obligor,
        bytes32 assetClassId,
        uint256 faceValue,
        uint64 maturity,
        bytes32 attestationEvidenceId
    );

    event FinanceableCapacitySet(
        bytes32 indexed claimId,
        uint256 previousCapacity,
        uint256 newCapacity,
        bytes32 indexed policyId,
        bytes32 decisionHash
    );

    event ClaimStatusChanged(bytes32 indexed claimId, ClaimState previousState, ClaimState newState);

    event ActiveEncumbranceChanged(
        bytes32 indexed claimId, uint256 previousActiveEncumbrance, uint256 newActiveEncumbrance
    );

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(CLAIM_GATEWAY_ROLE, admin);
        _grantRole(FINANCEABILITY_ROLE, admin);
    }

    function computeClaimId(
        bytes32 domainId,
        address sourceContract,
        address claimant,
        address obligor,
        bytes32 assetClassId,
        uint256 sourceNonce
    ) public pure returns (bytes32) {
        return keccak256(
            abi.encode("CLEARA_CLAIM_V1", domainId, sourceContract, claimant, obligor, assetClassId, sourceNonce)
        );
    }

    function registerVerifiedClaim(
        bytes32 domainId,
        address sourceContract,
        uint256 sourceNonce,
        address claimant,
        address obligor,
        bytes32 assetClassId,
        uint256 faceValue,
        uint64 maturity,
        bytes32 sourceEvidenceHash,
        bytes32 attestationEvidenceId
    ) external onlyRole(CLAIM_GATEWAY_ROLE) returns (bytes32 claimId) {
        if (
            domainId == bytes32(0) || sourceContract == address(0) || claimant == address(0) || obligor == address(0)
                || assetClassId == bytes32(0) || faceValue == 0 || attestationEvidenceId == bytes32(0)
        ) revert InvalidClaim();

        claimId = computeClaimId(domainId, sourceContract, claimant, obligor, assetClassId, sourceNonce);
        if (_claims[claimId].state != ClaimState.NONE) revert ClaimAlreadyExists(claimId);

        _claims[claimId] = Claim({
            claimId: claimId,
            domainId: domainId,
            sourceContract: sourceContract,
            sourceNonce: sourceNonce,
            claimant: claimant,
            obligor: obligor,
            assetClassId: assetClassId,
            faceValue: faceValue,
            financeableCapacity: 0,
            activeEncumbrance: 0,
            maturity: maturity,
            sourceEvidenceHash: sourceEvidenceHash,
            attestationEvidenceId: attestationEvidenceId,
            financeabilityPolicyId: bytes32(0),
            version: 1,
            state: ClaimState.VERIFIED
        });

        emit ClaimVerified(
            claimId,
            domainId,
            sourceContract,
            sourceNonce,
            claimant,
            obligor,
            assetClassId,
            faceValue,
            maturity,
            attestationEvidenceId
        );
    }

    function setFinanceableCapacity(bytes32 claimId, uint256 newCapacity, bytes32 policyId, bytes32 decisionHash)
        external
        onlyRole(FINANCEABILITY_ROLE)
    {
        Claim storage claim = _requireClaim(claimId);
        if (claim.state != ClaimState.VERIFIED && claim.state != ClaimState.ACTIVE) {
            revert InvalidClaimState(claimId, claim.state);
        }
        if (policyId == bytes32(0) || decisionHash == bytes32(0)) revert InvalidFinanceabilityDecision();
        if (newCapacity > claim.faceValue || newCapacity < claim.activeEncumbrance) {
            revert InvalidFinanceableCapacity(newCapacity, claim.faceValue, claim.activeEncumbrance);
        }

        uint256 previousCapacity = claim.financeableCapacity;
        claim.financeableCapacity = newCapacity;
        claim.financeabilityPolicyId = policyId;
        unchecked {
            ++claim.version;
        }

        if (claim.state == ClaimState.VERIFIED) {
            claim.state = ClaimState.ACTIVE;
            emit ClaimStatusChanged(claimId, ClaimState.VERIFIED, ClaimState.ACTIVE);
        }

        emit FinanceableCapacitySet(claimId, previousCapacity, newCapacity, policyId, decisionHash);
    }

    function reserveEncumbrance(bytes32 claimId, uint256 amount) external onlyRole(ENCUMBRANCE_ROLE) {
        Claim storage claim = _requireClaim(claimId);
        if (claim.state != ClaimState.ACTIVE) revert InvalidClaimState(claimId, claim.state);
        if (amount == 0) revert InsufficientAvailableCapacity(claimId, amount, availableCapacity(claimId));

        uint256 available = claim.financeableCapacity - claim.activeEncumbrance;
        if (amount > available) revert InsufficientAvailableCapacity(claimId, amount, available);

        uint256 previous = claim.activeEncumbrance;
        claim.activeEncumbrance = previous + amount;
        unchecked {
            ++claim.version;
        }
        emit ActiveEncumbranceChanged(claimId, previous, claim.activeEncumbrance);
    }

    function releaseEncumbrance(bytes32 claimId, uint256 amount) external onlyRole(ENCUMBRANCE_ROLE) {
        Claim storage claim = _requireClaim(claimId);
        if (amount == 0 || amount > claim.activeEncumbrance) {
            revert EncumbranceUnderflow(claimId, amount, claim.activeEncumbrance);
        }

        uint256 previous = claim.activeEncumbrance;
        claim.activeEncumbrance = previous - amount;
        unchecked {
            ++claim.version;
        }
        emit ActiveEncumbranceChanged(claimId, previous, claim.activeEncumbrance);
    }

    function availableCapacity(bytes32 claimId) public view returns (uint256) {
        Claim storage claim = _requireClaim(claimId);
        return claim.financeableCapacity - claim.activeEncumbrance;
    }

    function getClaim(bytes32 claimId) external view returns (Claim memory claim) {
        Claim storage stored = _requireClaim(claimId);
        claim = stored;
    }

    function _requireClaim(bytes32 claimId) internal view returns (Claim storage claim) {
        claim = _claims[claimId];
        if (claim.state == ClaimState.NONE) revert UnknownClaim(claimId);
    }
}
