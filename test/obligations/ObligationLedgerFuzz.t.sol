// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ClaimRegistry} from "../../contracts/creditcoin/kernel/ClaimRegistry.sol";
import {EncumbranceRegistry} from "../../contracts/creditcoin/kernel/EncumbranceRegistry.sol";
import {FacilityManager} from "../../contracts/creditcoin/financing/FacilityManager.sol";
import {AllocationManager} from "../../contracts/creditcoin/financing/AllocationManager.sol";
import {CommitmentRegistry} from "../../contracts/creditcoin/financing/CommitmentRegistry.sol";
import {CapitalizationManager} from "../../contracts/creditcoin/financing/CapitalizationManager.sol";
import {ObligationLedger} from "../../contracts/creditcoin/obligations/ObligationLedger.sol";

contract ObligationLedgerFuzzTest {
    ClaimRegistry internal claims;
    EncumbranceRegistry internal encumbrances;
    FacilityManager internal facilities;
    AllocationManager internal allocations;
    CommitmentRegistry internal commitments;
    CapitalizationManager internal capitalization;
    ObligationLedger internal obligations;

    bytes32 internal assetClassId;
    bytes32 internal facilityId;
    bytes32 internal uncapitalizedFacilityId;

    address internal debtor = address(0xD3B7);
    address internal creditor = address(0xC8ED17);
    address internal provider = address(0xA11CE);

    function setUp() public {
        claims = new ClaimRegistry(address(this));
        encumbrances = new EncumbranceRegistry(address(this), claims);
        facilities = new FacilityManager(address(this), encumbrances);
        allocations = new AllocationManager(address(this), facilities);
        commitments = new CommitmentRegistry(address(this));
        capitalization = new CapitalizationManager(address(this), facilities, allocations, commitments);
        obligations = new ObligationLedger(address(this), facilities);

        claims.grantRole(claims.ENCUMBRANCE_ROLE(), address(encumbrances));
        encumbrances.grantRole(encumbrances.FACILITY_ROLE(), address(facilities));
        facilities.grantRole(facilities.FACILITY_MANAGER_ROLE(), address(allocations));
        allocations.grantRole(allocations.COMMITMENT_GATEWAY_ROLE(), address(this));
        commitments.grantRole(commitments.COMMITMENT_GATEWAY_ROLE(), address(this));
        facilities.bindCapitalizationManager(address(capitalization));

        assetClassId = keccak256("USD");
        facilityId = _makeCapitalizedFacility(1_000_000, 1);
        uncapitalizedFacilityId = _makeAllocatingFacility(500_000, 2);
    }

    function testFuzzValidIssuancePreservesTerms(uint256 amountSeed, uint32 maturitySeed, uint8 kindSeed) public {
        uint256 amount = (amountSeed % type(uint128).max) + 1;
        uint64 maturity = uint64(block.timestamp + 1 + (uint256(maturitySeed) % 365 days));
        ObligationLedger.ObligationKind kind = _validKind(kindSeed);
        bytes32 policyId = keccak256(abi.encode("policy", amountSeed, maturitySeed, kindSeed));
        bytes32 termsHash = keccak256(abi.encode("terms", amountSeed, maturitySeed, kindSeed));

        bytes32 obligationId = obligations.createObligation(
            facilityId, debtor, creditor, assetClassId, amount, maturity, policyId, termsHash, kind
        );
        ObligationLedger.Obligation memory obligation = obligations.getObligation(obligationId);

        require(obligation.facilityId == facilityId, "facility drifted");
        require(obligation.debtor == debtor && obligation.creditor == creditor, "party drifted");
        require(obligation.assetClassId == assetClassId, "asset drifted");
        require(obligation.originalAmount == amount, "amount drifted");
        require(obligation.maturity == maturity, "maturity drifted");
        require(obligation.policyId == policyId, "policy drifted");
        require(obligation.termsHash == termsHash, "terms drifted");
        require(obligation.kind == kind, "kind drifted");
        require(obligation.status == ObligationLedger.ObligationStatus.CREATED, "wrong initial state");
        require(obligations.remainingAmount(obligationId) == amount, "remaining amount drifted");
    }

    function testFuzzInvalidIssuanceNeverConsumesNonce(uint256 amountSeed, uint8 vectorSeed) public {
        uint256 amount = (amountSeed % type(uint128).max) + 1;
        uint256 beforeNonce = obligations.nextNonceByFacility(facilityId);
        uint256 beforeUncapitalizedNonce = obligations.nextNonceByFacility(uncapitalizedFacilityId);
        uint8 vector = vectorSeed % 3;
        bool ok;

        if (vector == 0) {
            (ok,) = address(obligations).call(
                abi.encodeCall(
                    obligations.createObligation,
                    (
                        facilityId,
                        debtor,
                        debtor,
                        assetClassId,
                        amount,
                        uint64(block.timestamp + 30 days),
                        keccak256("policy"),
                        keccak256("terms"),
                        ObligationLedger.ObligationKind.DRAWDOWN
                    )
                )
            );
        } else if (vector == 1) {
            (ok,) = address(obligations).call(
                abi.encodeCall(
                    obligations.createObligation,
                    (
                        facilityId,
                        debtor,
                        creditor,
                        keccak256("wrong-asset"),
                        amount,
                        uint64(block.timestamp + 30 days),
                        keccak256("policy"),
                        keccak256("terms"),
                        ObligationLedger.ObligationKind.DRAWDOWN
                    )
                )
            );
        } else {
            (ok,) = address(obligations).call(
                abi.encodeCall(
                    obligations.createObligation,
                    (
                        uncapitalizedFacilityId,
                        debtor,
                        creditor,
                        assetClassId,
                        amount,
                        uint64(block.timestamp + 30 days),
                        keccak256("policy"),
                        keccak256("terms"),
                        ObligationLedger.ObligationKind.DRAWDOWN
                    )
                )
            );
        }

        require(!ok, "invalid issuance accepted");
        require(obligations.nextNonceByFacility(facilityId) == beforeNonce, "valid facility nonce mutated");
        require(
            obligations.nextNonceByFacility(uncapitalizedFacilityId) == beforeUncapitalizedNonce,
            "uncapitalized facility nonce mutated"
        );
    }

    function testFuzzFinalizationPreservesEconomicTerms(uint256 amountSeed, uint32 maturitySeed) public {
        uint256 amount = (amountSeed % type(uint128).max) + 1;
        uint64 maturity = uint64(block.timestamp + 1 + (uint256(maturitySeed) % 365 days));
        bytes32 policyId = keccak256(abi.encode("policy", amountSeed));
        bytes32 termsHash = keccak256(abi.encode("terms", maturitySeed));

        bytes32 obligationId = obligations.createObligation(
            facilityId,
            debtor,
            creditor,
            assetClassId,
            amount,
            maturity,
            policyId,
            termsHash,
            ObligationLedger.ObligationKind.PRINCIPAL_REPAYMENT
        );
        ObligationLedger.Obligation memory beforeFinal = obligations.getObligation(obligationId);
        obligations.finalizeObligation(obligationId);
        ObligationLedger.Obligation memory afterFinal = obligations.getObligation(obligationId);

        require(afterFinal.status == ObligationLedger.ObligationStatus.FINALIZED, "not finalized");
        require(afterFinal.facilityId == beforeFinal.facilityId, "facility mutated");
        require(afterFinal.debtor == beforeFinal.debtor, "debtor mutated");
        require(afterFinal.creditor == beforeFinal.creditor, "creditor mutated");
        require(afterFinal.assetClassId == beforeFinal.assetClassId, "asset mutated");
        require(afterFinal.originalAmount == beforeFinal.originalAmount, "amount mutated");
        require(afterFinal.maturity == beforeFinal.maturity, "maturity mutated");
        require(afterFinal.policyId == beforeFinal.policyId, "policy mutated");
        require(afterFinal.termsHash == beforeFinal.termsHash, "terms mutated");
        require(afterFinal.clearedAmount == 0 && afterFinal.settledAmount == 0, "finalization consumed value");
    }

    function _validKind(uint8 seed) internal pure returns (ObligationLedger.ObligationKind) {
        uint8 raw = (seed % 7) + 1;
        return ObligationLedger.ObligationKind(raw);
    }

    function _makeCapitalizedFacility(uint256 amount, uint256 salt) internal returns (bytes32 capitalizedFacilityId) {
        capitalizedFacilityId = _makeAllocatingFacility(amount, salt);
        bytes32 allocationId =
            allocations.proposeAllocation(capitalizedFacilityId, provider, amount, uint64(block.timestamp + 90 days));
        allocations.activateAllocation(allocationId);

        bytes32 commitmentId = commitments.registerActiveCommitment(
            keccak256(abi.encode("source", salt)),
            keccak256("domain"),
            address(0xBEEF),
            capitalizedFacilityId,
            allocationId,
            provider,
            assetClassId,
            address(0xCAFE),
            amount,
            uint64(block.timestamp + 120 days),
            keccak256(abi.encode("evidence", salt))
        );
        allocations.recognizeCommitment(allocationId, provider, amount);
        facilities.beginCapitalizing(capitalizedFacilityId);

        bytes32[] memory commitmentIds = new bytes32[](1);
        commitmentIds[0] = commitmentId;
        capitalization.sealCapitalization(
            capitalizedFacilityId, uint64(block.timestamp + 60 days), commitmentIds
        );
    }

    function _makeAllocatingFacility(uint256 amount, uint256 salt) internal returns (bytes32 allocatingFacilityId) {
        bytes32 claimId = claims.registerVerifiedClaim(
            keccak256("domain"),
            address(0xCA11),
            salt,
            address(this),
            address(uint160(0xD000 + salt)),
            assetClassId,
            amount,
            uint64(block.timestamp + 180 days),
            keccak256(abi.encode("source", salt)),
            keccak256(abi.encode("claim-evidence", salt))
        );
        claims.setFinanceableCapacity(
            claimId, amount, keccak256(abi.encode("finance-policy", salt)), keccak256(abi.encode("decision", salt))
        );

        allocatingFacilityId = facilities.createFacility(
            assetClassId,
            amount,
            uint64(block.timestamp),
            uint64(block.timestamp + 30 days),
            keccak256(abi.encode("facility-policy", salt))
        );
        facilities.verifyFacility(allocatingFacilityId);
        facilities.openFacility(allocatingFacilityId);

        bytes32 encumbranceId = encumbrances.createEncumbrance(
            claimId, allocatingFacilityId, address(this), amount, uint64(block.timestamp + 120 days)
        );
        facilities.bindEncumbrance(allocatingFacilityId, encumbranceId);
        facilities.beginAllocating(allocatingFacilityId);
    }
}
