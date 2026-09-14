// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {EvmV1Decoder} from "@gluwa/usc-contracts/contracts/write-ability/common/EvmV1Decoder.sol";
import {INativeQueryVerifier} from "../../contracts/creditcoin/interfaces/INativeQueryVerifier.sol";
import {SettlementASCV2} from "../../contracts/creditcoin/gateway/SettlementASCV2.sol";
import {SettlementAdapterV2} from "../../contracts/source/settlement/SettlementAdapterV2.sol";
import {EvidenceRegistry} from "../../contracts/creditcoin/registry/EvidenceRegistry.sol";
import {AssetRegistry} from "../../contracts/creditcoin/registry/AssetRegistry.sol";
import {ObligationLedger} from "../../contracts/creditcoin/obligations/ObligationLedger.sol";
import {ResidualLedger} from "../../contracts/creditcoin/settlement/ResidualLedger.sol";
import {SettlementReconciler} from "../../contracts/creditcoin/settlement/SettlementReconciler.sol";
import {MockERC20} from "../mocks/MockERC20.sol";
import {ResidualSettlementRoutingTest} from "./ResidualSettlementRouting.t.sol";

contract MockNativeQueryVerifier is INativeQueryVerifier {
    uint64 public constant TX_INDEX = 7;

    function verifyAndEmit(uint64, uint64, bytes calldata, MerkleProof calldata, ContinuityProof calldata)
        external
        pure
        returns (bool)
    {
        return true;
    }

    function calculateTxIndex(MerkleProof calldata) external pure returns (uint64) {
        return TX_INDEX;
    }
}

contract SettlementASCV2Test is ResidualSettlementRoutingTest {
    struct ReceiptInput {
        bytes32 obligationId;
        bytes32 settlementId;
        bytes32 residualId;
        address debtor;
        address creditor;
        bytes32 assetClassId;
        address token;
        uint256 amount;
        uint64 expiresAt;
    }

    struct ReceiptOptions {
        bool nonCanonicalSettlementData;
        bool extraLog;
        bool wrongCaller;
        bool wrongTarget;
        bool wrongCalldata;
    }

    EvidenceRegistry internal evidence;
    SettlementReconciler internal reconciler;
    SettlementAdapterV2 internal sourceAdapter;
    SettlementASCV2 internal asc;
    MockNativeQueryVerifier internal verifier;
    MockERC20 internal sourceToken;

    function setUp() public override {
        super.setUp();
        sourceToken = new MockERC20();
        settlementToken = address(sourceToken);
        settlementRepresentationId = assets.computeRepresentationId(assetClassId, settlementDomainId, settlementToken);
        assets.configureRepresentation(
            AssetRegistry.Representation({
                representationId: settlementRepresentationId,
                assetClassId: assetClassId,
                domainId: settlementDomainId,
                token: settlementToken,
                decimals: 18,
                active: true
            })
        );
        sourceAdapter = new SettlementAdapterV2(address(this), address(0xDADA), settlementToken);
        settlementAdapterId = router.configureAdapter(settlementDomainId, address(sourceAdapter), true);

        evidence = new EvidenceRegistry(address(this));
        reconciler = new SettlementReconciler(address(this), residuals, router, evidence);
        residuals.bindSettlementReconciler(address(reconciler));
        obligations.bindSettlementReconciler(address(reconciler));

        verifier = new MockNativeQueryVerifier();
        asc = new SettlementASCV2(
            address(verifier),
            address(domains),
            address(assets),
            address(evidence),
            address(router),
            address(reconciler),
            1,
            settlementDomainId,
            address(sourceAdapter)
        );
        reconciler.bindSettlementASC(address(asc));
        evidence.grantRole(evidence.GATEWAY_ROLE(), address(asc));
        evidence.grantRole(evidence.CONSUMER_ROLE(), address(reconciler));
    }

    function testAttestedReceiptBindsOneShotEventToCanonicalObligation() public {
        (bytes32 settlementId, bytes32 residualId, bytes32 obligationId,) = _routed340();
        ResidualLedger.Residual memory residual = residuals.getResidual(residualId);
        ObligationLedger.Obligation memory obligation = obligations.getObligation(obligationId);
        bytes memory encodedTransaction = _encodedTransaction(
            ReceiptInput({
                obligationId: obligationId,
                settlementId: settlementId,
                residualId: residualId,
                debtor: residual.debtor,
                creditor: residual.creditor,
                assetClassId: residual.assetClassId,
                token: settlementToken,
                amount: residual.amount,
                expiresAt: obligation.maturity
            }),
            ReceiptOptions({
                nonCanonicalSettlementData: false,
                extraLog: false,
                wrongCaller: false,
                wrongTarget: false,
                wrongCalldata: false
            })
        );

        SettlementASCV2.Proof memory proof = SettlementASCV2.Proof({
            chainKey: 1,
            blockHeight: 123,
            encodedTransaction: encodedTransaction,
            merkleRoot: bytes32(uint256(1)),
            siblings: new INativeQueryVerifier.MerkleProofEntry[](0),
            lowerEndpointDigest: bytes32(uint256(2)),
            continuityRoots: new bytes32[](0)
        });
        (bytes32 acceptedSettlementId, bytes32 evidenceId) = asc.acceptAttestedSettlement(proof);

        require(acceptedSettlementId == settlementId, "wrong accepted settlement");
        require(
            residuals.getResidual(residualId).status == ResidualLedger.ResidualStatus.SETTLED, "residual not settled"
        );
        ObligationLedger.Obligation memory settled = obligations.getObligation(obligationId);
        require(settled.status == ObligationLedger.ObligationStatus.SETTLED, "obligation not settled");
        require(settled.settledAmount == residual.amount, "wrong settled amount");
        EvidenceRegistry.EvidenceRecord memory record = evidence.getEvidence(evidenceId);
        require(record.consumed, "evidence not consumed");
        require(record.eventIndex == 1, "wrong evidence event index");
    }

    function testReceiptWithWrongCanonicalObligationCannotMutateState() public {
        (bytes32 settlementId, bytes32 residualId,,) = _routed340();
        ResidualLedger.Residual memory residual = residuals.getResidual(residualId);
        ObligationLedger.Obligation memory obligation = obligations.getObligation(residual.sourceObligationId);
        bytes memory encodedTransaction = _encodedTransaction(
            ReceiptInput({
                obligationId: keccak256("wrong-obligation"),
                settlementId: settlementId,
                residualId: residualId,
                debtor: residual.debtor,
                creditor: residual.creditor,
                assetClassId: residual.assetClassId,
                token: settlementToken,
                amount: residual.amount,
                expiresAt: obligation.maturity
            }),
            ReceiptOptions({
                nonCanonicalSettlementData: false,
                extraLog: false,
                wrongCaller: false,
                wrongTarget: false,
                wrongCalldata: false
            })
        );
        SettlementASCV2.Proof memory proof = _proof(encodedTransaction);

        (bool ok,) = address(asc).call(abi.encodeCall(asc.acceptAttestedSettlement, (proof)));
        require(!ok, "wrong obligation accepted");
        require(residuals.getResidual(residualId).status == ResidualLedger.ResidualStatus.ROUTED, "residual mutated");
        require(obligations.getObligation(residual.sourceObligationId).settledAmount == 0, "obligation mutated");
    }

    function testReceiptWithNonCanonicalSettlementDataIsRejected() public {
        (bytes32 settlementId, bytes32 residualId, bytes32 obligationId,) = _routed340();
        ResidualLedger.Residual memory residual = residuals.getResidual(residualId);
        ObligationLedger.Obligation memory obligation = obligations.getObligation(obligationId);
        bytes memory encodedTransaction = _encodedTransaction(
            ReceiptInput({
                obligationId: obligationId,
                settlementId: settlementId,
                residualId: residualId,
                debtor: residual.debtor,
                creditor: residual.creditor,
                assetClassId: residual.assetClassId,
                token: settlementToken,
                amount: residual.amount,
                expiresAt: obligation.maturity
            }),
            ReceiptOptions({
                nonCanonicalSettlementData: true,
                extraLog: false,
                wrongCaller: false,
                wrongTarget: false,
                wrongCalldata: false
            })
        );
        SettlementASCV2.Proof memory proof = _proof(encodedTransaction);

        (bool ok,) = address(asc).call(abi.encodeCall(asc.acceptAttestedSettlement, (proof)));
        require(!ok, "noncanonical data accepted");
        require(
            residuals.getResidual(residualId).status == ResidualLedger.ResidualStatus.ROUTED,
            "noncanonical mutated residual"
        );
    }

    function testReceiptShapeAndSourceCallMustBeExact() public {
        (bytes32 settlementId, bytes32 residualId, bytes32 obligationId,) = _routed340();
        ResidualLedger.Residual memory residual = residuals.getResidual(residualId);
        ObligationLedger.Obligation memory obligation = obligations.getObligation(obligationId);
        ReceiptInput memory input = ReceiptInput({
            obligationId: obligationId,
            settlementId: settlementId,
            residualId: residualId,
            debtor: residual.debtor,
            creditor: residual.creditor,
            assetClassId: residual.assetClassId,
            token: settlementToken,
            amount: residual.amount,
            expiresAt: obligation.maturity
        });

        _assertRejected(
            _encodedTransaction(
                input,
                ReceiptOptions({
                    nonCanonicalSettlementData: false,
                    extraLog: true,
                    wrongCaller: false,
                    wrongTarget: false,
                    wrongCalldata: false
                })
            ),
            residualId,
            obligationId
        );
        _assertRejected(
            _encodedTransaction(
                input,
                ReceiptOptions({
                    nonCanonicalSettlementData: false,
                    extraLog: false,
                    wrongCaller: true,
                    wrongTarget: false,
                    wrongCalldata: false
                })
            ),
            residualId,
            obligationId
        );
        _assertRejected(
            _encodedTransaction(
                input,
                ReceiptOptions({
                    nonCanonicalSettlementData: false,
                    extraLog: false,
                    wrongCaller: false,
                    wrongTarget: true,
                    wrongCalldata: false
                })
            ),
            residualId,
            obligationId
        );
        _assertRejected(
            _encodedTransaction(
                input,
                ReceiptOptions({
                    nonCanonicalSettlementData: false,
                    extraLog: false,
                    wrongCaller: false,
                    wrongTarget: false,
                    wrongCalldata: true
                })
            ),
            residualId,
            obligationId
        );
    }

    function _assertRejected(bytes memory encodedTransaction, bytes32 residualId, bytes32 obligationId) internal {
        (bool ok,) = address(asc).call(abi.encodeCall(asc.acceptAttestedSettlement, (_proof(encodedTransaction))));
        require(!ok, "malformed source receipt accepted");
        require(
            residuals.getResidual(residualId).status == ResidualLedger.ResidualStatus.ROUTED,
            "failed receipt mutated residual"
        );
        require(obligations.getObligation(obligationId).settledAmount == 0, "failed receipt mutated obligation");
    }

    function _routed340() internal returns (bytes32 settlementId, bytes32 residualId, bytes32 obligationId, bytes32) {
        (bytes32 epochId,,) = _finalizedEpoch(400_000, 60_000);
        residualId = residuals.createBilateralResidual(epochId);
        ResidualLedger.Residual memory residual = residuals.getResidual(residualId);
        obligationId = residual.sourceObligationId;
        bytes32 routeDataHash = keccak256(
            abi.encode(
                "CLEARA_ROUTE_V1",
                residual.debtor,
                residual.creditor,
                residual.assetClassId,
                settlementToken,
                residual.amount
            )
        );
        settlementId = router.routeResidual(
            residualId, settlementAdapterId, settlementDomainId, settlementRepresentationId, routeDataHash
        );
        return (settlementId, residualId, obligationId, bytes32(0));
    }

    function _proof(bytes memory encodedTransaction) internal pure returns (SettlementASCV2.Proof memory proof) {
        proof = SettlementASCV2.Proof({
            chainKey: 1,
            blockHeight: 123,
            encodedTransaction: encodedTransaction,
            merkleRoot: bytes32(uint256(1)),
            siblings: new INativeQueryVerifier.MerkleProofEntry[](0),
            lowerEndpointDigest: bytes32(uint256(2)),
            continuityRoots: new bytes32[](0)
        });
    }

    function _encodedTransaction(ReceiptInput memory input, ReceiptOptions memory options)
        internal
        view
        returns (bytes memory encodedTransaction)
    {
        bytes32[] memory settlementTopics = new bytes32[](4);
        settlementTopics[0] =
            keccak256("SettlementExecuted(bytes32,bytes32,bytes32,address,address,bytes32,address,uint256,uint64)");
        settlementTopics[1] = input.obligationId;
        settlementTopics[2] = input.settlementId;
        settlementTopics[3] = input.residualId;

        bytes32[] memory transferTopics = new bytes32[](3);
        transferTopics[0] = keccak256("Transfer(address,address,uint256)");
        transferTopics[1] = bytes32(uint256(uint160(input.debtor)));
        transferTopics[2] = bytes32(uint256(uint160(input.creditor)));

        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](options.extraLog ? 3 : 2);
        bytes memory settlementData =
            abi.encode(input.debtor, input.creditor, input.assetClassId, input.token, input.amount, input.expiresAt);
        if (options.nonCanonicalSettlementData) settlementData = bytes.concat(settlementData, bytes1(0x01));
        logs[0] =
            EvmV1Decoder.LogEntryTuple({address_: input.token, topics: transferTopics, data: abi.encode(input.amount)});
        logs[1] = EvmV1Decoder.LogEntryTuple({
            address_: address(sourceAdapter), topics: settlementTopics, data: settlementData
        });
        if (options.extraLog) {
            logs[2] = EvmV1Decoder.LogEntryTuple({
                address_: input.token, topics: transferTopics, data: abi.encode(input.amount - 1)
            });
        }

        bytes[] memory chunks = new bytes[](3);
        bytes memory sourceCall = abi.encodeWithSelector(
            bytes4(keccak256("executeSettlement(bytes32)")),
            options.wrongCalldata ? keccak256("wrong-obligation-call") : input.obligationId
        );
        chunks[0] = abi.encode(
            uint64(0),
            uint64(500_000),
            options.wrongCaller ? address(0xFEED) : input.debtor,
            false,
            options.wrongTarget ? address(0xF00D) : address(sourceAdapter),
            uint256(0),
            sourceCall
        );
        chunks[1] = abi.encode(uint128(1), uint256(0), bytes32(0), bytes32(0));
        chunks[2] = abi.encode(uint8(1), uint64(100_000), logs, bytes(""));
        encodedTransaction = abi.encode(uint8(0), chunks);
    }
}
