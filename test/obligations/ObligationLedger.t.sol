// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ClaimRegistry} from "../../contracts/creditcoin/kernel/ClaimRegistry.sol";
import {EncumbranceRegistry} from "../../contracts/creditcoin/kernel/EncumbranceRegistry.sol";
import {FacilityManager} from "../../contracts/creditcoin/financing/FacilityManager.sol";
import {AllocationManager} from "../../contracts/creditcoin/financing/AllocationManager.sol";
import {CommitmentRegistry} from "../../contracts/creditcoin/financing/CommitmentRegistry.sol";
import {CapitalizationManager} from "../../contracts/creditcoin/financing/CapitalizationManager.sol";
import {ObligationLedger} from "../../contracts/creditcoin/obligations/ObligationLedger.sol";

contract ObligationLedgerTest {
    ClaimRegistry internal claims;
    EncumbranceRegistry internal encumbrances;
    FacilityManager internal facilities;
    AllocationManager internal allocations;
    CommitmentRegistry internal commitments;
    CapitalizationManager internal capitalization;
    ObligationLedger internal obligations;

    bytes32 internal assetClassId;
    bytes32 internal capitalizedFacilityId;
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
        capitalizedFacilityId = _makeCapitalizedFacility(1_000_000, 1);
        uncapitalizedFacilityId = _makeAllocatingFacility(500_000, 2);
    }

    function testCapitalizedFacilityCanCreateAndFinalizeObligation() public {
        bytes32 obligationId = obligations.createObligation(
            capitalizedFacilityId,
            debtor,
            creditor,
            assetClassId,
            400_000,
            uint64(block.timestamp + 30 days),
            keccak256("repayment-policy"),
            keccak256("repayment-terms"),
            ObligationLedger.ObligationKind.PRINCIPAL_REPAYMENT
        );

        ObligationLedger.Obligation memory created = obligations.getObligation(obligationId);
        require(created.status == ObligationLedger.ObligationStatus.CREATED, "obligation not CREATED");
        require(created.originalAmount == 400_000, "amount mismatch");
        require(created.clearedAmount == 0 && created.settledAmount == 0, "new obligation pre-consumed");
        require(obligations.remainingAmount(obligationId) == 400_000, "remaining mismatch");

        obligations.finalizeObligation(obligationId);
        ObligationLedger.Obligation memory finalized = obligations.getObligation(obligationId);
        require(finalized.status == ObligationLedger.ObligationStatus.FINALIZED, "obligation not FINALIZED");
        require(
            finalized.status != ObligationLedger.ObligationStatus.ELIGIBLE_FOR_CLEARING,
            "M8 silently granted clearing eligibility"
        );
    }

    function testObligationIdentityUsesMonotonicFacilityNonce() public {
        bytes32 first = _create(100_000, keccak256("terms-1"));
        bytes32 second = _create(100_000, keccak256("terms-2"));
        require(first != second, "obligation ids collided");

        ObligationLedger.Obligation memory a = obligations.getObligation(first);
        ObligationLedger.Obligation memory b = obligations.getObligation(second);
        require(a.nonce == 0 && b.nonce == 1, "facility obligation nonce drifted");
        require(
            first == obligations.computeObligationId(capitalizedFacilityId, debtor, creditor, assetClassId, 0),
            "first canonical id mismatch"
        );
        require(
            second == obligations.computeObligationId(capitalizedFacilityId, debtor, creditor, assetClassId, 1),
            "second canonical id mismatch"
        );
    }

    function testCannotCreateObligationBeforeCapitalizationSeal() public {
        (bool ok,) = address(obligations)
            .call(
                abi.encodeCall(
                    obligations.createObligation,
                    (
                        uncapitalizedFacilityId,
                        debtor,
                        creditor,
                        assetClassId,
                        100_000,
                        uint64(block.timestamp + 30 days),
                        keccak256("policy"),
                        keccak256("terms"),
                        ObligationLedger.ObligationKind.DRAWDOWN
                    )
                )
            );
        require(!ok, "uncapitalized facility created obligation");
        require(obligations.nextNonceByFacility(uncapitalizedFacilityId) == 0, "failed issue consumed nonce");
    }

    function testCannotCreateObligationForWrongAssetClass() public {
        (bool ok,) = address(obligations)
            .call(
                abi.encodeCall(
                    obligations.createObligation,
                    (
                        capitalizedFacilityId,
                        debtor,
                        creditor,
                        keccak256("EUR"),
                        100_000,
                        uint64(block.timestamp + 30 days),
                        keccak256("policy"),
                        keccak256("terms"),
                        ObligationLedger.ObligationKind.DRAWDOWN
                    )
                )
            );
        require(!ok, "wrong-asset obligation accepted");
        require(obligations.nextNonceByFacility(capitalizedFacilityId) == 0, "failed issue consumed nonce");
    }

    function testFinalizedObligationCanBeDisputedButNotFinalizedTwice() public {
        bytes32 obligationId = _create(100_000, keccak256("disputable-terms"));
        obligations.finalizeObligation(obligationId);

        (bool secondFinalize,) =
            address(obligations).call(abi.encodeCall(obligations.finalizeObligation, (obligationId)));
        require(!secondFinalize, "double finalization accepted");

        obligations.disputeFinalizedObligation(obligationId);
        require(
            obligations.getObligation(obligationId).status == ObligationLedger.ObligationStatus.DISPUTED,
            "dispute state missing"
        );
    }

    function testRejectsSelfObligationAndUnspecifiedKind() public {
        (bool selfOk,) = address(obligations)
            .call(
                abi.encodeCall(
                    obligations.createObligation,
                    (
                        capitalizedFacilityId,
                        debtor,
                        debtor,
                        assetClassId,
                        100_000,
                        uint64(block.timestamp + 30 days),
                        keccak256("policy"),
                        keccak256("terms"),
                        ObligationLedger.ObligationKind.DRAWDOWN
                    )
                )
            );
        require(!selfOk, "self-obligation accepted");

        (bool kindOk,) = address(obligations)
            .call(
                abi.encodeCall(
                    obligations.createObligation,
                    (
                        capitalizedFacilityId,
                        debtor,
                        creditor,
                        assetClassId,
                        100_000,
                        uint64(block.timestamp + 30 days),
                        keccak256("policy"),
                        keccak256("terms"),
                        ObligationLedger.ObligationKind.UNSPECIFIED
                    )
                )
            );
        require(!kindOk, "unspecified obligation kind accepted");
    }

    function _create(uint256 amount, bytes32 termsHash) internal returns (bytes32) {
        return obligations.createObligation(
            capitalizedFacilityId,
            debtor,
            creditor,
            assetClassId,
            amount,
            uint64(block.timestamp + 30 days),
            keccak256("policy"),
            termsHash,
            ObligationLedger.ObligationKind.PRINCIPAL_REPAYMENT
        );
    }

    function _makeCapitalizedFacility(uint256 amount, uint256 salt) internal returns (bytes32 facilityId) {
        facilityId = _makeAllocatingFacility(amount, salt);
        bytes32 allocationId =
            allocations.proposeAllocation(facilityId, provider, amount, uint64(block.timestamp + 90 days));
        allocations.activateAllocation(allocationId);

        bytes32 commitmentId = commitments.registerActiveCommitment(
            keccak256(abi.encode("source", salt)),
            keccak256("domain"),
            address(0xBEEF),
            facilityId,
            allocationId,
            provider,
            assetClassId,
            address(0xCAFE),
            amount,
            uint64(block.timestamp + 120 days),
            keccak256(abi.encode("evidence", salt))
        );
        allocations.recognizeCommitment(allocationId, provider, amount);
        facilities.beginCapitalizing(facilityId);

        bytes32[] memory commitmentIds = new bytes32[](1);
        commitmentIds[0] = commitmentId;
        capitalization.sealCapitalization(facilityId, uint64(block.timestamp + 60 days), commitmentIds);
    }

    function _makeAllocatingFacility(uint256 amount, uint256 salt) internal returns (bytes32 facilityId) {
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

        facilityId = facilities.createFacility(
            assetClassId,
            amount,
            uint64(block.timestamp),
            uint64(block.timestamp + 30 days),
            keccak256(abi.encode("facility-policy", salt))
        );
        facilities.verifyFacility(facilityId);
        facilities.openFacility(facilityId);

        bytes32 encumbranceId = encumbrances.createEncumbrance(
            claimId, facilityId, address(this), amount, uint64(block.timestamp + 120 days)
        );
        facilities.bindEncumbrance(facilityId, encumbranceId);
        facilities.beginAllocating(facilityId);
    }
}
