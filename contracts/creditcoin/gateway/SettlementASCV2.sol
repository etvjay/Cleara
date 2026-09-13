// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {EvmV1Decoder} from "@gluwa/usc-contracts/contracts/write-ability/common/EvmV1Decoder.sol";
import {INativeQueryVerifier} from "../interfaces/INativeQueryVerifier.sol";
import {DomainRegistry} from "../registry/DomainRegistry.sol";
import {AssetRegistry} from "../registry/AssetRegistry.sol";
import {EvidenceRegistry} from "../registry/EvidenceRegistry.sol";
import {ObligationLedger} from "../obligations/ObligationLedger.sol";
import {ResidualLedger} from "../settlement/ResidualLedger.sol";
import {SettlementRouter} from "../settlement/SettlementRouter.sol";
import {SettlementReconciler} from "../settlement/SettlementReconciler.sol";

/// @notice V2 settlement attestation consumer for SettlementAdapterV2.
/// @dev The source adapter enforces the economic one-shot. This contract verifies
///      the source receipt and binds its obligation identity to CC3 state before
///      SettlementReconciler performs the canonical state transition.
contract SettlementASCV2 {
    bytes32 public constant SETTLEMENT_EXECUTED_SIG =
        keccak256("SettlementExecuted(bytes32,bytes32,bytes32,address,address,bytes32,address,uint256,uint64)");
    bytes32 public constant ERC20_TRANSFER_SIG = keccak256("Transfer(address,address,uint256)");
    bytes4 public constant EXECUTE_SETTLEMENT_SELECTOR = bytes4(keccak256("executeSettlement(bytes32)"));

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
        bytes32 obligationId;
        bytes32 settlementId;
        bytes32 residualId;
        address debtor;
        address creditor;
        bytes32 assetClassId;
        address token;
        uint256 amount;
        uint64 expiresAt;
        uint32 eventIndex;
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
    error InvalidEventData();
    error NonCanonicalEventData();
    error AlreadyProcessed();
    error InvalidSettlementFact();
    error UnsupportedRepresentation();
    error WrongSettlementAdapter();
    error UnexpectedReceiptLogCount();
    error InvalidSourceTransaction();

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
        bytes32 txBytesHash = keccak256(proof.encodedTransaction);
        bytes32 queryId = keccak256(abi.encode(proof.chainKey, proof.blockHeight, txIndex, txBytesHash));
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
            fact.eventIndex,
            txBytesHash,
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

        ResidualLedger.Residual memory residual = settlementReconciler.residualLedger().getResidual(fact.residualId);
        if (
            residual.sourceObligationId != fact.obligationId || residual.debtor != fact.debtor
                || residual.creditor != fact.creditor || residual.assetClassId != fact.assetClassId
                || residual.amount != fact.amount
        ) revert InvalidSettlementFact();

        ObligationLedger.Obligation memory obligation =
            settlementReconciler.obligationLedger().getObligation(fact.obligationId);
        if (obligation.maturity != fact.expiresAt) revert InvalidSettlementFact();

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
        if (receipt.receiptLogs.length != 2) revert UnexpectedReceiptLogCount();

        // SettlementAdapterV2 emits the token Transfer before its settlement event.
        EvmV1Decoder.LogEntry memory settlementLog = receipt.receiptLogs[1];
        fact.eventIndex = 1;
        if (settlementLog.address_ != sourceAdapter) revert WrongSourceContract();
        if (settlementLog.topics.length != 4 || settlementLog.topics[0] != SETTLEMENT_EXECUTED_SIG) {
            revert InvalidTopics();
        }
        fact.obligationId = settlementLog.topics[1];
        fact.settlementId = settlementLog.topics[2];
        fact.residualId = settlementLog.topics[3];
        if (fact.obligationId == bytes32(0) || fact.settlementId == bytes32(0) || fact.residualId == bytes32(0)) {
            revert InvalidSettlementFact();
        }
        if (settlementLog.data.length != 192) revert InvalidEventData();
        (fact.debtor, fact.creditor, fact.assetClassId, fact.token, fact.amount, fact.expiresAt) =
            abi.decode(settlementLog.data, (address, address, bytes32, address, uint256, uint64));
        if (
            keccak256(abi.encode(fact.debtor, fact.creditor, fact.assetClassId, fact.token, fact.amount, fact.expiresAt))
                != keccak256(settlementLog.data)
        ) revert NonCanonicalEventData();

        EvmV1Decoder.CommonTxFields memory commonTx = EvmV1Decoder.decodeCommonTxFields(encodedTransaction);
        bytes memory expectedCall = abi.encodeWithSelector(EXECUTE_SETTLEMENT_SELECTOR, fact.obligationId);
        if (
            commonTx.from != fact.debtor || commonTx.toIsNull || commonTx.to != sourceAdapter || commonTx.value != 0
                || commonTx.data.length != expectedCall.length || keccak256(commonTx.data) != keccak256(expectedCall)
        ) revert InvalidSourceTransaction();

        EvmV1Decoder.LogEntry memory transferLog = receipt.receiptLogs[0];
        if (transferLog.address_ != fact.token) revert MissingTokenTransfer();
        if (transferLog.topics.length != 3 || transferLog.topics[0] != ERC20_TRANSFER_SIG) revert InvalidTopics();
        if (transferLog.data.length != 32) revert InvalidEventData();
        address payer = _topicAddress(transferLog.topics[1]);
        address recipient = _topicAddress(transferLog.topics[2]);
        uint256 transferAmount = abi.decode(transferLog.data, (uint256));
        if (keccak256(abi.encode(transferAmount)) != keccak256(transferLog.data)) revert NonCanonicalEventData();
        if (payer != fact.debtor || recipient != fact.creditor || transferAmount != fact.amount) {
            revert InvalidSettlementFact();
        }
    }

    function _topicAddress(bytes32 topic) internal pure returns (address value) {
        if (uint256(topic) >> 160 != 0) revert InvalidTopics();
        value = address(uint160(uint256(topic)));
        if (value == address(0)) revert InvalidSettlementFact();
    }
}
