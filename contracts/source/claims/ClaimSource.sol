// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

contract ClaimSource {
    enum SourceClaimState {
        NONE,
        CREATED,
        CANCELLED
    }

    struct SourceClaim {
        uint256 sourceNonce;
        address claimant;
        address obligor;
        bytes32 assetClassId;
        uint256 faceValue;
        uint64 maturity;
        bytes32 evidenceHash;
        SourceClaimState state;
    }

    uint256 public nextSourceNonce;
    mapping(uint256 => SourceClaim) private _claims;

    error ZeroAddress();
    error InvalidFaceValue();
    error InvalidMaturity();
    error UnknownClaim(uint256 sourceNonce);
    error NotClaimant();
    error InvalidState();

    event ClaimCreated(
        uint256 indexed sourceNonce,
        address indexed claimant,
        address indexed obligor,
        bytes32 assetClassId,
        uint256 faceValue,
        uint64 maturity,
        bytes32 evidenceHash
    );
    event ClaimCancelled(uint256 indexed sourceNonce, address indexed claimant);

    function createClaim(
        address obligor,
        bytes32 assetClassId,
        uint256 faceValue,
        uint64 maturity,
        bytes32 evidenceHash
    ) external returns (uint256 sourceNonce) {
        if (obligor == address(0)) revert ZeroAddress();
        if (faceValue == 0) revert InvalidFaceValue();
        if (maturity <= block.timestamp) revert InvalidMaturity();

        sourceNonce = ++nextSourceNonce;
        _claims[sourceNonce] = SourceClaim({
            sourceNonce: sourceNonce,
            claimant: msg.sender,
            obligor: obligor,
            assetClassId: assetClassId,
            faceValue: faceValue,
            maturity: maturity,
            evidenceHash: evidenceHash,
            state: SourceClaimState.CREATED
        });

        emit ClaimCreated(sourceNonce, msg.sender, obligor, assetClassId, faceValue, maturity, evidenceHash);
    }

    function cancelClaim(uint256 sourceNonce) external {
        SourceClaim storage claim = _claims[sourceNonce];
        if (claim.state == SourceClaimState.NONE) revert UnknownClaim(sourceNonce);
        if (claim.claimant != msg.sender) revert NotClaimant();
        if (claim.state != SourceClaimState.CREATED) revert InvalidState();
        claim.state = SourceClaimState.CANCELLED;
        emit ClaimCancelled(sourceNonce, msg.sender);
    }

    function getClaim(uint256 sourceNonce) external view returns (SourceClaim memory claim) {
        claim = _claims[sourceNonce];
        if (claim.state == SourceClaimState.NONE) revert UnknownClaim(sourceNonce);
    }
}
