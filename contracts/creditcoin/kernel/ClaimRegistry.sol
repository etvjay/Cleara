// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract ClaimRegistry is AccessControl {
    bytes32 public constant CLAIM_GATEWAY_ROLE = keccak256("CLAIM_GATEWAY_ROLE");

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
        uint64 maturity;
        bytes32 sourceEvidenceHash;
        bytes32 attestationEvidenceId;
        ClaimState state;
    }

    mapping(bytes32 => Claim) private _claims;

    error InvalidClaim();
    error ClaimAlreadyExists(bytes32 claimId);
    error UnknownClaim(bytes32 claimId);

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

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(CLAIM_GATEWAY_ROLE, admin);
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
                || faceValue == 0 || attestationEvidenceId == bytes32(0)
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
            maturity: maturity,
            sourceEvidenceHash: sourceEvidenceHash,
            attestationEvidenceId: attestationEvidenceId,
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

    function getClaim(bytes32 claimId) external view returns (Claim memory claim) {
        claim = _claims[claimId];
        if (claim.state == ClaimState.NONE) revert UnknownClaim(claimId);
    }
}
