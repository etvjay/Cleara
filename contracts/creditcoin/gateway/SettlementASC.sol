// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {EvmV1Decoder} from "@gluwa/usc-contracts/contracts/write-ability/common/EvmV1Decoder.sol";
import {INativeQueryVerifier} from "../interfaces/INativeQueryVerifier.sol";
import {DomainRegistry} from "../registry/DomainRegistry.sol";
import {AssetRegistry} from "../registry/AssetRegistry.sol";
import {EvidenceRegistry} from "../registry/EvidenceRegistry.sol";
import {SettlementRouter} from "../settlement/SettlementRouter.sol";
import {SettlementReconciler} from "../settlement/SettlementReconciler.sol";

contract SettlementASC {
    bytes32 public constant SETTLEMENT_EXECUTED_SIG =
        keccak256("SettlementExecuted(bytes32,bytes32,address,address,bytes32,address,uint256)");
    bytes32 public constant ERC20_TRANSFER_SIG = keccak256("Transfer(address,address,uint256)");

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
        bytes32 settlementId;
        bytes32 residualId;
        address debtor;
        address creditor;
        bytes32 assetClassId;
        address token;
        uint256 amount;
    }

    INativeQueryVerifier public immutable verifier;
    DomainRegistry public immutable domainRegistry;
    AssetRegistry public immutable assetRegistry;
    EvidenceRegistry public immutable evidenceRegistry;
    SettlementRouter public immutable settlementRouter;
    SettlementReconciler public immutable settlementReconciler;
    uint64 public immutable sourceChainKey;
    bytes32 public immutable sourceDomainId;
    address public immutable sourceAdapter;

    mapping(bytes32 => bool) public processedQuery;

    error UnsupportedSource();
    error InactiveSettlementDomain();
    error VerifyFailed();
    error SourceTxFailed();
    error WrongSourceContract();
    error MissingSettlementExecuted();
    error AmbiguousSettlementExecuted();
    error MissingTokenTransfer();
    error AmbiguousTokenTransfer();
    error InvalidTopics();
    error AlreadyProcessed();
    error InvalidSettlementFact();
    error UnsupportedRepresentation();
    error WrongSettlementAdapter();

    event SettlementAccepted(bytes32 indexed settlementId, bytes32 indexed evidenceId, bytes32 indexed queryId);

    constructor(
        address verifier_,
        address domainRegistry_,
        address assetRegistry_,
        address evidenceRegistry_,
        address settlementRouter_,
        address settlementReconciler_,
        uint64 sourceChainKey_,
        bytes32 sourceDomainId_,
        address sourceAdapter_
    ) {
        if (
            verifier_ == address(0) || domainRegistry_ == address(0) || assetRegistry_ == address(0)
                || evidenceRegistry_ == address(0) || settlementRouter_ == address(0)
                || settlementReconciler_ == address(0) || sourceDomainId_ == bytes32(0) || sourceAdapter_ == address(0)
        ) revert UnsupportedSource();
        verifier = INativeQueryVerifier(verifier_);
        domainRegistry = DomainRegistry(domainRegistry_);
        assetRegistry = AssetRegistry(assetRegistry_);
        evidenceRegistry = EvidenceRegistry(evidenceRegistry_);
        settlementRouter = SettlementRouter(settlementRouter_);
        settlementReconciler = SettlementReconciler(settlementReconciler_);
        sourceChainKey = sourceChainKey_;
        sourceDomainId = sourceDomainId_;
        sourceAdapter = sourceAdapter_;
    }

    function acceptAttestedSettlement(Proof calldata proof)
        external
        returns (bytes32 settlementId, bytes32 evidenceId)
    {
        _validateDomain(proof.chainKey);
        INativeQueryVerifier.MerkleProof memory merkleProof =
            INativeQueryVerifier.MerkleProof({root: proof.merkleRoot, siblings: proof.siblings});
        uint64 txIndex = verifier.calculateTxIndex(merkleProof);
        bytes32 queryId = keccak256(abi.encode(proof.chainKey, proof.blockHeight, txIndex));
        if (processedQuery[queryId]) revert AlreadyProcessed();

        _verify(proof, merkleProof);
        Fact memory fact = _decode(proof.encodedTransaction);
        _validateFact(fact);

        processedQuery[queryId] = true;
        bytes32 payloadHash = keccak256(abi.encode(fact));
        evidenceId = evidenceRegistry.registerEvidence(
            sourceDomainId,
            proof.chainKey,
            proof.blockHeight,
            txIndex,
            0,
            keccak256(proof.encodedTransaction),
            payloadHash
        );
        settlementReconciler.reconcile(
            fact.settlementId, evidenceId, fact.debtor, fact.creditor, fact.assetClassId, fact.amount
        );
        settlementId = fact.settlementId;
        emit SettlementAccepted(settlementId, evidenceId, queryId);
    }

    function _validateDomain(uint64 chainKey) internal view {
        if (chainKey != sourceChainKey) revert UnsupportedSource();
        DomainRegistry.DomainConfig memory domain = domainRegistry.getDomain(sourceDomainId);
        if (
            !domain.active || !domain.readable || !domain.settlement || !domain.evidence
                || domain.chainKey != sourceChainKey
        ) revert InactiveSettlementDomain();
    }

    function _validateFact(Fact memory fact) internal view {
        SettlementRouter.SettlementInstruction memory instruction = settlementRouter.getInstruction(fact.settlementId);
        if (
            instruction.status != SettlementRouter.RouteStatus.ROUTED || instruction.residualId != fact.residualId
                || instruction.settlementDomainId != sourceDomainId
        ) revert InvalidSettlementFact();

        SettlementRouter.AdapterConfig memory adapter = settlementRouter.getAdapter(instruction.adapterId);
        if (!adapter.active || adapter.domainId != sourceDomainId || adapter.adapter != sourceAdapter) {
            revert WrongSettlementAdapter();
        }

        AssetRegistry.Representation memory representation =
            assetRegistry.getRepresentation(instruction.settlementRepresentationId);
        if (
            !representation.active || representation.domainId != sourceDomainId
                || representation.assetClassId != fact.assetClassId || representation.token != fact.token
        ) revert UnsupportedRepresentation();

        bytes32 expectedRouteDataHash = keccak256(
            abi.encode("CLEARA_ROUTE_V1", fact.debtor, fact.creditor, fact.assetClassId, fact.token, fact.amount)
        );
        if (instruction.routeDataHash != expectedRouteDataHash) revert InvalidSettlementFact();
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

    function _decode(bytes calldata encodedTransaction) internal view returns (Fact memory fact) {
        uint8 txType = EvmV1Decoder.getTransactionType(encodedTransaction);
        require(EvmV1Decoder.isValidTransactionType(txType), "invalid tx type");
        EvmV1Decoder.ReceiptFields memory receipt = EvmV1Decoder.decodeReceiptFields(encodedTransaction);
        if (receipt.receiptStatus != 1) revert SourceTxFailed();

        EvmV1Decoder.LogEntry[] memory settlementLogs =
            EvmV1Decoder.getLogsByEventSignature(receipt, SETTLEMENT_EXECUTED_SIG);
        if (settlementLogs.length == 0) revert MissingSettlementExecuted();
        if (settlementLogs.length != 1) revert AmbiguousSettlementExecuted();
        EvmV1Decoder.LogEntry memory settlementLog = settlementLogs[0];
        if (settlementLog.address_ != sourceAdapter) revert WrongSourceContract();
        if (settlementLog.topics.length != 4) revert InvalidTopics();

        fact.settlementId = settlementLog.topics[1];
        fact.residualId = settlementLog.topics[2];
        fact.debtor = address(uint160(uint256(settlementLog.topics[3])));
        (fact.creditor, fact.assetClassId, fact.token, fact.amount) =
            abi.decode(settlementLog.data, (address, bytes32, address, uint256));

        EvmV1Decoder.LogEntry[] memory transferLogs = EvmV1Decoder.getLogsByEventSignature(receipt, ERC20_TRANSFER_SIG);
        uint256 matchingTransfers;
        for (uint256 i = 0; i < transferLogs.length; i++) {
            EvmV1Decoder.LogEntry memory transferLog = transferLogs[i];
            if (transferLog.address_ != fact.token || transferLog.topics.length != 3) continue;

            address payer = address(uint160(uint256(transferLog.topics[1])));
            address recipient = address(uint160(uint256(transferLog.topics[2])));
            uint256 amount = abi.decode(transferLog.data, (uint256));
            if (payer == fact.debtor && recipient == fact.creditor && amount == fact.amount) {
                matchingTransfers++;
            }
        }

        if (matchingTransfers == 0) revert MissingTokenTransfer();
        if (matchingTransfers != 1) revert AmbiguousTokenTransfer();
    }
}
