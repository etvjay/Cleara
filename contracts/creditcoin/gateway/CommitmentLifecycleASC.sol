// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {EvmV1Decoder} from "@gluwa/usc-contracts/contracts/write-ability/common/EvmV1Decoder.sol";
import {INativeQueryVerifier} from "../interfaces/INativeQueryVerifier.sol";
import {DomainRegistry} from "../registry/DomainRegistry.sol";
import {EvidenceRegistry} from "../registry/EvidenceRegistry.sol";
import {AllocationManager} from "../financing/AllocationManager.sol";
import {CommitmentRegistry} from "../financing/CommitmentRegistry.sol";

/// @notice Attests terminal source-capital lifecycle events and synchronizes
///         the corresponding Creditcoin commitment and allocation state.
/// @dev The ASC only accepts a source receipt proven by the native verifier.
///      Financial state changes happen only after the exact source event and
///      all Creditcoin identities have been semantically validated.
contract CommitmentLifecycleASC {
    bytes32 public constant CAPITAL_CONSUMED_SIG = keccak256("CapitalConsumed(bytes32,address,uint256)");
    bytes32 public constant CAPITAL_EXPIRED_SIG = keccak256("CapitalExpired(bytes32,address,uint256)");

    uint8 public constant ACTION_CONSUMED = 1;
    uint8 public constant ACTION_EXPIRED = 2;

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
        uint8 action;
        bytes32 sourceCommitmentId;
        address actor;
        uint256 amount;
        uint32 eventIndex;
    }

    INativeQueryVerifier public immutable verifier;
    DomainRegistry public immutable domainRegistry;
    EvidenceRegistry public immutable evidenceRegistry;
    AllocationManager public immutable allocationManager;
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
    error MissingLifecycleEvent();
    error AmbiguousLifecycleEvent();
    error InvalidTopics();
    error InvalidLifecycleData();
    error AlreadyProcessed();
    error InvalidLifecycleFact();
    error LifecycleActorMismatch();
    error UnsupportedLifecycleAction();

    event CommitmentLifecycleAccepted(
        bytes32 indexed commitmentId,
        bytes32 indexed evidenceId,
        bytes32 indexed queryId,
        uint8 action,
        bytes32 sourceCommitmentId,
        address actor,
        uint256 amount
    );

    constructor(
        address verifier_,
        address domainRegistry_,
        address evidenceRegistry_,
        address allocationManager_,
        address commitmentRegistry_,
        uint64 sourceChainKey_,
        bytes32 sourceDomainId_,
        address sourceVault_
    ) {
        if (
            verifier_ == address(0) || domainRegistry_ == address(0) || evidenceRegistry_ == address(0)
                || allocationManager_ == address(0) || commitmentRegistry_ == address(0)
                || sourceDomainId_ == bytes32(0) || sourceVault_ == address(0)
        ) revert UnsupportedSource();

        verifier = INativeQueryVerifier(verifier_);
        domainRegistry = DomainRegistry(domainRegistry_);
        evidenceRegistry = EvidenceRegistry(evidenceRegistry_);
        allocationManager = AllocationManager(allocationManager_);
        commitmentRegistry = CommitmentRegistry(commitmentRegistry_);
        sourceChainKey = sourceChainKey_;
        sourceDomainId = sourceDomainId_;
        sourceVault = sourceVault_;
    }

    function acceptAttestedCommitmentLifecycle(Proof calldata proof)
        external
        returns (bytes32 commitmentId, bytes32 evidenceId)
    {
        _validateDomain(proof.chainKey);

        INativeQueryVerifier.MerkleProof memory merkleProof =
            INativeQueryVerifier.MerkleProof({root: proof.merkleRoot, siblings: proof.siblings});
        uint64 txIndex = verifier.calculateTxIndex(merkleProof);
        bytes32 queryId = keccak256(abi.encode(proof.chainKey, proof.blockHeight, txIndex));
        if (processedQuery[queryId]) revert AlreadyProcessed();

        _verify(proof, merkleProof);
        Fact memory fact = _decode(proof.encodedTransaction);
        commitmentId = _validateFact(fact);

        processedQuery[queryId] = true;
        bytes32 payloadHash = keccak256(abi.encode(fact.action, fact.sourceCommitmentId, fact.actor, fact.amount));
        evidenceId = evidenceRegistry.registerEvidence(
            sourceDomainId,
            proof.chainKey,
            proof.blockHeight,
            txIndex,
            fact.eventIndex,
            keccak256(proof.encodedTransaction),
            payloadHash
        );

        if (fact.action == ACTION_CONSUMED) {
            commitmentRegistry.markConsumed(commitmentId, evidenceId, fact.actor, fact.amount);
            CommitmentRegistry.Commitment memory commitment = commitmentRegistry.getCommitment(commitmentId);
            allocationManager.markCommitmentConsumed(commitment.allocationId, commitment.provider, commitment.amount);
        } else if (fact.action == ACTION_EXPIRED) {
            commitmentRegistry.markExpired(commitmentId, evidenceId, fact.amount);
            CommitmentRegistry.Commitment memory commitment = commitmentRegistry.getCommitment(commitmentId);
            allocationManager.markCommitmentExpired(commitment.allocationId, commitment.provider, commitment.amount);
        } else {
            revert UnsupportedLifecycleAction();
        }

        // Consuming lifecycle evidence in the same transaction makes proof
        // acceptance and downstream synchronization one atomic state change.
        evidenceRegistry.consumeEvidence(evidenceId);

        emit CommitmentLifecycleAccepted(
            commitmentId, evidenceId, queryId, fact.action, fact.sourceCommitmentId, fact.actor, fact.amount
        );
    }

    function _validateDomain(uint64 proofChainKey) internal view {
        if (proofChainKey != sourceChainKey) revert UnsupportedSource();
        DomainRegistry.DomainConfig memory domain = domainRegistry.getDomain(sourceDomainId);
        if (
            !domain.active || !domain.readable || !domain.commitment || !domain.evidence
                || domain.chainKey != sourceChainKey || domain.domainId != sourceDomainId
        ) revert InactiveSourceDomain();
    }

    function _validateFact(Fact memory fact) internal view returns (bytes32 commitmentId) {
        if (
            fact.sourceCommitmentId == bytes32(0) || fact.actor == address(0) || fact.amount == 0
                || (fact.action != ACTION_CONSUMED && fact.action != ACTION_EXPIRED)
        ) revert InvalidLifecycleFact();

        commitmentId = commitmentRegistry.computeCommitmentId(sourceDomainId, sourceVault, fact.sourceCommitmentId);
        CommitmentRegistry.Commitment memory commitment = commitmentRegistry.getCommitment(commitmentId);
        if (
            commitment.status != CommitmentRegistry.CommitmentStatus.ACTIVE
                || commitment.sourceCommitmentId != fact.sourceCommitmentId || commitment.domainId != sourceDomainId
                || commitment.sourceVault != sourceVault || commitment.amount != fact.amount
        ) revert InvalidLifecycleFact();

        if (fact.action == ACTION_EXPIRED && fact.actor != commitment.provider) revert LifecycleActorMismatch();

        AllocationManager.Allocation memory allocation = allocationManager.getAllocation(commitment.allocationId);
        if (
            allocation.status != AllocationManager.AllocationStatus.COMMITTED
                || allocation.facilityId != commitment.facilityId || allocation.provider != commitment.provider
                || allocation.amount != commitment.amount
        ) revert InvalidLifecycleFact();
    }

    function _verify(Proof calldata proof, INativeQueryVerifier.MerkleProof memory merkleProof) internal {
        INativeQueryVerifier.ContinuityProof memory continuityProof = INativeQueryVerifier.ContinuityProof({
            lowerEndpointDigest: proof.lowerEndpointDigest, roots: proof.continuityRoots
        });
        if (!verifier.verifyAndEmit(
            proof.chainKey, proof.blockHeight, proof.encodedTransaction, merkleProof, continuityProof
        )) revert VerifyFailed();
    }

    function _decode(bytes calldata encodedTransaction) internal view returns (Fact memory fact) {
        uint8 txType = EvmV1Decoder.getTransactionType(encodedTransaction);
        require(EvmV1Decoder.isValidTransactionType(txType), "invalid tx type");
        EvmV1Decoder.ReceiptFields memory receipt = EvmV1Decoder.decodeReceiptFields(encodedTransaction);
        if (receipt.receiptStatus != 1) revert SourceTxFailed();

        uint256 matches;
        EvmV1Decoder.LogEntry memory matched;
        for (uint256 i; i < receipt.receiptLogs.length; ++i) {
            EvmV1Decoder.LogEntry memory log = receipt.receiptLogs[i];
            if (log.topics.length == 0) continue;

            uint8 action;
            if (log.topics[0] == CAPITAL_CONSUMED_SIG) {
                action = ACTION_CONSUMED;
            } else if (log.topics[0] == CAPITAL_EXPIRED_SIG) {
                action = ACTION_EXPIRED;
            } else {
                continue;
            }

            matches++;
            if (matches > 1) revert AmbiguousLifecycleEvent();
            fact.action = action;
            fact.eventIndex = uint32(i);
            matched = log;
        }

        if (matches == 0) revert MissingLifecycleEvent();
        if (matched.address_ != sourceVault) revert WrongSourceContract();
        if (matched.topics.length != 3) revert InvalidTopics();
        if (uint96(uint256(matched.topics[2]) >> 160) != 0) revert InvalidTopics();
        if (matched.data.length != 32) revert InvalidLifecycleData();

        fact.sourceCommitmentId = matched.topics[1];
        fact.actor = address(uint160(uint256(matched.topics[2])));
        fact.amount = abi.decode(matched.data, (uint256));
    }
}
