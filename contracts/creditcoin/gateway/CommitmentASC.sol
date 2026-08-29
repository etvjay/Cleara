// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {EvmV1Decoder} from "@gluwa/usc-contracts/contracts/write-ability/common/EvmV1Decoder.sol";
import {INativeQueryVerifier} from "../interfaces/INativeQueryVerifier.sol";
import {DomainRegistry} from "../registry/DomainRegistry.sol";
import {AssetRegistry} from "../registry/AssetRegistry.sol";
import {EvidenceRegistry} from "../registry/EvidenceRegistry.sol";
import {AllocationManager} from "../financing/AllocationManager.sol";
import {FacilityManager} from "../financing/FacilityManager.sol";
import {CommitmentRegistry} from "../financing/CommitmentRegistry.sol";

contract CommitmentASC {
    bytes32 public constant CAPITAL_COMMITTED_SIG = keccak256(
        "CapitalCommitted(bytes32,bytes32,bytes32,address,bytes32,address,uint256,uint64)"
    );

    struct Proof {
        uint64 chainKey;
        uint64 blockHeight;
        bytes encodedTransaction;
        bytes32 merkleRoot;
        INativeQueryVerifier.MerkleProofEntry[] siblings;
        bytes32 lowerEndpointDigest;
        bytes32[] continuityRoots;
    }

    struct Fact {
        bytes32 sourceCommitmentId;
        bytes32 facilityId;
        bytes32 allocationId;
        address provider;
        bytes32 assetClassId;
        address token;
        uint256 amount;
        uint64 expiresAt;
    }

    INativeQueryVerifier public immutable verifier;
    DomainRegistry public immutable domainRegistry;
    AssetRegistry public immutable assetRegistry;
    EvidenceRegistry public immutable evidenceRegistry;
    AllocationManager public immutable allocationManager;
    FacilityManager public immutable facilityManager;
    CommitmentRegistry public immutable commitmentRegistry;
    uint64 public immutable sourceChainKey;
    bytes32 public immutable sourceDomainId;
    address public immutable sourceVault;

    mapping(bytes32 => bool) public processedQuery;

    error UnsupportedSource();
    error InactiveSourceDomain();
    error VerifyFailed();
    error SourceTxFailed();
    error WrongSourceContract();
    error MissingCapitalCommitted();
    error AmbiguousCapitalCommitted();
    error InvalidTopics();
    error AlreadyProcessed();
    error InvalidCommitmentFact();
    error UnsupportedRepresentation();

    event CommitmentAccepted(bytes32 indexed commitmentId, bytes32 indexed evidenceId, bytes32 indexed queryId);

    constructor(
        address verifier_, address domainRegistry_, address assetRegistry_, address evidenceRegistry_,
        address allocationManager_, address facilityManager_, address commitmentRegistry_, uint64 sourceChainKey_,
        bytes32 sourceDomainId_, address sourceVault_
    ) {
        if (
            verifier_ == address(0) || domainRegistry_ == address(0) || assetRegistry_ == address(0)
                || evidenceRegistry_ == address(0) || allocationManager_ == address(0) || facilityManager_ == address(0)
                || commitmentRegistry_ == address(0) || sourceDomainId_ == bytes32(0) || sourceVault_ == address(0)
        ) revert UnsupportedSource();
        verifier = INativeQueryVerifier(verifier_);
        domainRegistry = DomainRegistry(domainRegistry_);
        assetRegistry = AssetRegistry(assetRegistry_);
        evidenceRegistry = EvidenceRegistry(evidenceRegistry_);
        allocationManager = AllocationManager(allocationManager_);
        facilityManager = FacilityManager(facilityManager_);
        commitmentRegistry = CommitmentRegistry(commitmentRegistry_);
        sourceChainKey = sourceChainKey_;
        sourceDomainId = sourceDomainId_;
        sourceVault = sourceVault_;
    }

    function acceptAttestedCommitment(Proof calldata proof) external returns (bytes32 commitmentId, bytes32 evidenceId) {
        _validateDomain(proof.chainKey);
        INativeQueryVerifier.MerkleProof memory merkleProof = INativeQueryVerifier.MerkleProof({root: proof.merkleRoot, siblings: proof.siblings});
        uint64 txIndex = verifier.calculateTxIndex(merkleProof);
        bytes32 queryId = keccak256(abi.encode(proof.chainKey, proof.blockHeight, txIndex));
        if (processedQuery[queryId]) revert AlreadyProcessed();
        _verify(proof, merkleProof);
        Fact memory fact = _decode(proof.encodedTransaction);
        _validateFact(fact);

        processedQuery[queryId] = true;
        bytes32 payloadHash = keccak256(abi.encode(fact));
        evidenceId = evidenceRegistry.registerEvidence(
            sourceDomainId, proof.chainKey, proof.blockHeight, txIndex, 0,
            keccak256(proof.encodedTransaction), payloadHash
        );
        commitmentId = commitmentRegistry.registerActiveCommitment(
            fact.sourceCommitmentId, sourceDomainId, sourceVault, fact.facilityId, fact.allocationId,
            fact.provider, fact.assetClassId, fact.token, fact.amount, fact.expiresAt, evidenceId
        );
        allocationManager.recognizeCommitment(fact.allocationId, fact.provider, fact.amount);
        emit CommitmentAccepted(commitmentId, evidenceId, queryId);
    }

    function _validateDomain(uint64 chainKey) internal view {
        if (chainKey != sourceChainKey) revert UnsupportedSource();
        DomainRegistry.DomainConfig memory domain = domainRegistry.getDomain(sourceDomainId);
        if (!domain.active || !domain.readable || !domain.commitment || !domain.evidence || domain.chainKey != sourceChainKey) {
            revert InactiveSourceDomain();
        }
    }

    function _validateFact(Fact memory fact) internal view {
        AllocationManager.Allocation memory allocation = allocationManager.getAllocation(fact.allocationId);
        FacilityManager.Facility memory facility = facilityManager.getFacility(fact.facilityId);
        if (
            allocation.status != AllocationManager.AllocationStatus.ACTIVE || allocation.facilityId != fact.facilityId
                || allocation.provider != fact.provider || allocation.amount != fact.amount
                || facility.assetClassId != fact.assetClassId || fact.expiresAt <= block.timestamp
        ) revert InvalidCommitmentFact();

        bytes32 representationId = assetRegistry.computeRepresentationId(fact.assetClassId, sourceDomainId, fact.token);
        AssetRegistry.Representation memory representation = assetRegistry.getRepresentation(representationId);
        if (!representation.active || representation.domainId != sourceDomainId || representation.token != fact.token) {
            revert UnsupportedRepresentation();
        }
    }

    function _verify(Proof calldata proof, INativeQueryVerifier.MerkleProof memory merkleProof) internal {
        INativeQueryVerifier.ContinuityProof memory continuityProof = INativeQueryVerifier.ContinuityProof({
            lowerEndpointDigest: proof.lowerEndpointDigest, roots: proof.continuityRoots
        });
        bool ok = verifier.verifyAndEmit(proof.chainKey, proof.blockHeight, proof.encodedTransaction, merkleProof, continuityProof);
        if (!ok) revert VerifyFailed();
    }

    function _decode(bytes calldata encodedTransaction) internal view returns (Fact memory fact) {
        uint8 txType = EvmV1Decoder.getTransactionType(encodedTransaction);
        require(EvmV1Decoder.isValidTransactionType(txType), "invalid tx type");
        EvmV1Decoder.ReceiptFields memory receipt = EvmV1Decoder.decodeReceiptFields(encodedTransaction);
        if (receipt.receiptStatus != 1) revert SourceTxFailed();
        EvmV1Decoder.LogEntry[] memory logs = EvmV1Decoder.getLogsByEventSignature(receipt, CAPITAL_COMMITTED_SIG);
        if (logs.length == 0) revert MissingCapitalCommitted();
        if (logs.length != 1) revert AmbiguousCapitalCommitted();
        EvmV1Decoder.LogEntry memory log = logs[0];
        if (log.address_ != sourceVault) revert WrongSourceContract();
        if (log.topics.length != 4) revert InvalidTopics();
        fact.sourceCommitmentId = log.topics[1];
        fact.facilityId = log.topics[2];
        fact.allocationId = log.topics[3];
        (fact.provider, fact.assetClassId, fact.token, fact.amount, fact.expiresAt) =
            abi.decode(log.data, (address, bytes32, address, uint256, uint64));
    }
}
