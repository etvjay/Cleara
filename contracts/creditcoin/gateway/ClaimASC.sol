// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {EvmV1Decoder} from "@gluwa/usc-contracts/contracts/write-ability/common/EvmV1Decoder.sol";
import {INativeQueryVerifier} from "../interfaces/INativeQueryVerifier.sol";
import {EvidenceRegistry} from "../registry/EvidenceRegistry.sol";
import {ClaimRegistry} from "../kernel/ClaimRegistry.sol";

contract ClaimASC {
    bytes32 public constant CLAIM_CREATED_SIG =
        keccak256("ClaimCreated(uint256,address,address,bytes32,uint256,uint64,bytes32)");

    struct Proof {
        uint64 chainKey;
        uint64 blockHeight;
        bytes encodedTransaction;
        bytes32 merkleRoot;
        INativeQueryVerifier.MerkleProofEntry[] siblings;
        bytes32 lowerEndpointDigest;
        bytes32[] continuityRoots;
    }

    struct VerifiedClaimFact {
        uint256 sourceNonce;
        address claimant;
        address obligor;
        bytes32 assetClassId;
        uint256 faceValue;
        uint64 maturity;
        bytes32 sourceEvidenceHash;
    }

    INativeQueryVerifier public immutable verifier;
    EvidenceRegistry public immutable evidenceRegistry;
    ClaimRegistry public immutable claimRegistry;
    uint64 public immutable sourceChainKey;
    bytes32 public immutable sourceDomainId;
    address public immutable sourceClaimContract;

    mapping(bytes32 => bool) public processedQuery;

    error UnsupportedSource();
    error VerifyFailed();
    error SourceTxFailed();
    error WrongSourceContract();
    error MissingClaimCreated();
    error AmbiguousClaimCreated();
    error InvalidTopics();
    error AlreadyProcessed();

    event ClaimAccepted(bytes32 indexed claimId, bytes32 indexed evidenceId, bytes32 indexed queryId);

    constructor(
        address verifier_,
        address evidenceRegistry_,
        address claimRegistry_,
        uint64 sourceChainKey_,
        bytes32 sourceDomainId_,
        address sourceClaimContract_
    ) {
        if (
            verifier_ == address(0) || evidenceRegistry_ == address(0) || claimRegistry_ == address(0)
                || sourceDomainId_ == bytes32(0) || sourceClaimContract_ == address(0)
        ) revert UnsupportedSource();
        verifier = INativeQueryVerifier(verifier_);
        evidenceRegistry = EvidenceRegistry(evidenceRegistry_);
        claimRegistry = ClaimRegistry(claimRegistry_);
        sourceChainKey = sourceChainKey_;
        sourceDomainId = sourceDomainId_;
        sourceClaimContract = sourceClaimContract_;
    }

    function acceptAttestedClaim(Proof calldata proof) external returns (bytes32 claimId, bytes32 evidenceId) {
        if (proof.chainKey != sourceChainKey) revert UnsupportedSource();

        INativeQueryVerifier.MerkleProof memory merkleProof =
            INativeQueryVerifier.MerkleProof({root: proof.merkleRoot, siblings: proof.siblings});
        uint64 txIndex = verifier.calculateTxIndex(merkleProof);
        bytes32 queryId = keccak256(abi.encode(proof.chainKey, proof.blockHeight, txIndex));
        if (processedQuery[queryId]) revert AlreadyProcessed();

        _verify(proof, merkleProof);
        VerifiedClaimFact memory fact = _decode(proof.encodedTransaction);

        bytes32 payloadHash = keccak256(
            abi.encode(
                fact.sourceNonce,
                fact.claimant,
                fact.obligor,
                fact.assetClassId,
                fact.faceValue,
                fact.maturity,
                fact.sourceEvidenceHash
            )
        );

        processedQuery[queryId] = true;
        evidenceId = evidenceRegistry.registerEvidence(
            sourceDomainId,
            proof.chainKey,
            proof.blockHeight,
            txIndex,
            0,
            keccak256(proof.encodedTransaction),
            payloadHash
        );
        claimId = claimRegistry.registerVerifiedClaim(
            sourceDomainId,
            sourceClaimContract,
            fact.sourceNonce,
            fact.claimant,
            fact.obligor,
            fact.assetClassId,
            fact.faceValue,
            fact.maturity,
            fact.sourceEvidenceHash,
            evidenceId
        );

        emit ClaimAccepted(claimId, evidenceId, queryId);
    }

    function _verify(Proof calldata proof, INativeQueryVerifier.MerkleProof memory merkleProof) internal {
        INativeQueryVerifier.ContinuityProof memory continuityProof = INativeQueryVerifier.ContinuityProof({
            lowerEndpointDigest: proof.lowerEndpointDigest, roots: proof.continuityRoots
        });
        bool ok = verifier.verifyAndEmit(
            proof.chainKey, proof.blockHeight, proof.encodedTransaction, merkleProof, continuityProof
        );
        if (!ok) revert VerifyFailed();
    }

    function _decode(bytes calldata encodedTransaction) internal view returns (VerifiedClaimFact memory fact) {
        uint8 txType = EvmV1Decoder.getTransactionType(encodedTransaction);
        require(EvmV1Decoder.isValidTransactionType(txType), "invalid tx type");
        EvmV1Decoder.ReceiptFields memory receipt = EvmV1Decoder.decodeReceiptFields(encodedTransaction);
        if (receipt.receiptStatus != 1) revert SourceTxFailed();

        EvmV1Decoder.LogEntry[] memory logs = EvmV1Decoder.getLogsByEventSignature(receipt, CLAIM_CREATED_SIG);
        if (logs.length == 0) revert MissingClaimCreated();
        if (logs.length != 1) revert AmbiguousClaimCreated();

        EvmV1Decoder.LogEntry memory log = logs[0];
        if (log.address_ != sourceClaimContract) revert WrongSourceContract();
        if (log.topics.length != 4) revert InvalidTopics();

        fact.sourceNonce = uint256(log.topics[1]);
        fact.claimant = address(uint160(uint256(log.topics[2])));
        fact.obligor = address(uint160(uint256(log.topics[3])));
        (fact.assetClassId, fact.faceValue, fact.maturity, fact.sourceEvidenceHash) =
            abi.decode(log.data, (bytes32, uint256, uint64, bytes32));
    }
}
