// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {EvmV1Decoder} from "@gluwa/usc-contracts/contracts/write-ability/common/EvmV1Decoder.sol";
import {INativeQueryVerifier} from "../../contracts/creditcoin/interfaces/INativeQueryVerifier.sol";
import {AllocationManager} from "../../contracts/creditcoin/financing/AllocationManager.sol";
import {CommitmentRegistry} from "../../contracts/creditcoin/financing/CommitmentRegistry.sol";
import {CommitmentLifecycleASC} from "../../contracts/creditcoin/gateway/CommitmentLifecycleASC.sol";
import {ClaimRegistry} from "../../contracts/creditcoin/kernel/ClaimRegistry.sol";
import {EncumbranceRegistry} from "../../contracts/creditcoin/kernel/EncumbranceRegistry.sol";
import {DomainRegistry} from "../../contracts/creditcoin/registry/DomainRegistry.sol";
import {EvidenceRegistry} from "../../contracts/creditcoin/registry/EvidenceRegistry.sol";
import {FacilityManager} from "../../contracts/creditcoin/financing/FacilityManager.sol";
import {CapitalCommitmentVault} from "../../contracts/source/commitments/CapitalCommitmentVault.sol";
import {MockERC20} from "../mocks/MockERC20.sol";
import {MockNativeQueryVerifier} from "../mocks/MockNativeQueryVerifier.sol";

interface Vm {
    function warp(uint256 newTimestamp) external;
}

contract CommitmentLifecycleTest {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    uint64 internal constant CHAIN_KEY = 1;
    bytes32 internal constant DOMAIN_ID = keccak256("SEPOLIA_DOMAIN");
    bytes32 internal constant ASSET_CLASS_ID = keccak256("USD");
    uint256 internal constant AMOUNT = 100;

    MockNativeQueryVerifier internal verifier;
    DomainRegistry internal domains;
    EvidenceRegistry internal evidence;
    ClaimRegistry internal claims;
    EncumbranceRegistry internal encumbrances;
    FacilityManager internal facilities;
    AllocationManager internal allocations;
    CommitmentRegistry internal commitments;
    CommitmentLifecycleASC internal lifecycle;
    CapitalCommitmentVault internal vault;
    MockERC20 internal token;

    bytes32 internal facilityId;
    bytes32 internal allocationId;
    bytes32 internal sourceCommitmentId;
    bytes32 internal commitmentId;
    uint64 internal sourceExpiresAt;

    function setUp() public {
        verifier = new MockNativeQueryVerifier();
        verifier.setVerifyResult(true);
        verifier.setTxIndex(7);
        domains = new DomainRegistry(address(this));
        evidence = new EvidenceRegistry(address(this));
        claims = new ClaimRegistry(address(this));
        encumbrances = new EncumbranceRegistry(address(this), claims);
        facilities = new FacilityManager(address(this), encumbrances);
        allocations = new AllocationManager(address(this), facilities);
        commitments = new CommitmentRegistry(address(this));
        vault = new CapitalCommitmentVault(address(this));
        token = new MockERC20();

        claims.grantRole(claims.ENCUMBRANCE_ROLE(), address(encumbrances));
        encumbrances.grantRole(encumbrances.FACILITY_ROLE(), address(facilities));
        facilities.grantRole(facilities.FACILITY_MANAGER_ROLE(), address(allocations));
        allocations.grantRole(allocations.COMMITMENT_GATEWAY_ROLE(), address(this));
        commitments.grantRole(commitments.COMMITMENT_GATEWAY_ROLE(), address(this));

        domains.configureDomain(
            DomainRegistry.DomainConfig({
                domainId: DOMAIN_ID,
                chainKey: CHAIN_KEY,
                evmChainId: 11_155_111,
                readable: true,
                writable: false,
                settlement: false,
                claim: false,
                commitment: true,
                evidence: true,
                version: 1,
                active: true
            })
        );

        bytes32 claimId = claims.registerVerifiedClaim(
            DOMAIN_ID,
            address(0xCA11),
            1,
            address(this),
            address(0xB0B),
            ASSET_CLASS_ID,
            AMOUNT,
            uint64(block.timestamp + 30 days),
            keccak256("source"),
            keccak256("evidence")
        );
        claims.setFinanceableCapacity(claimId, AMOUNT, keccak256("policy"), keccak256("decision"));

        facilityId = facilities.createFacility(
            ASSET_CLASS_ID,
            AMOUNT,
            uint64(block.timestamp),
            uint64(block.timestamp + 14 days),
            keccak256("facility-policy")
        );
        facilities.verifyFacility(facilityId);
        facilities.openFacility(facilityId);
        bytes32 encumbranceId = encumbrances.createEncumbrance(
            claimId, facilityId, address(this), AMOUNT, uint64(block.timestamp + 7 days)
        );
        facilities.bindEncumbrance(facilityId, encumbranceId);
        facilities.beginAllocating(facilityId);
        allocationId =
            allocations.proposeAllocation(facilityId, address(this), AMOUNT, uint64(block.timestamp + 3 days));
        allocations.activateAllocation(allocationId);

        token.mint(address(this), AMOUNT);
        token.approve(address(vault), AMOUNT);
        sourceExpiresAt = uint64(block.timestamp + 2 days);
        sourceCommitmentId =
            vault.commit(facilityId, allocationId, ASSET_CLASS_ID, address(token), AMOUNT, sourceExpiresAt);

        commitmentId = commitments.registerActiveCommitment(
            sourceCommitmentId,
            DOMAIN_ID,
            address(vault),
            facilityId,
            allocationId,
            address(this),
            ASSET_CLASS_ID,
            address(token),
            AMOUNT,
            sourceExpiresAt,
            keccak256("commitment-evidence")
        );
        allocations.recognizeCommitment(allocationId, address(this), AMOUNT);

        lifecycle = new CommitmentLifecycleASC(
            address(verifier),
            address(domains),
            address(evidence),
            address(allocations),
            address(commitments),
            CHAIN_KEY,
            DOMAIN_ID,
            address(vault)
        );
        evidence.grantRole(evidence.GATEWAY_ROLE(), address(lifecycle));
        evidence.grantRole(evidence.CONSUMER_ROLE(), address(lifecycle));
        commitments.grantRole(commitments.COMMITMENT_LIFECYCLE_ROLE(), address(lifecycle));
        allocations.grantRole(allocations.COMMITMENT_LIFECYCLE_ROLE(), address(lifecycle));
    }

    function testConsumedLifecycleSynchronizesRegistryAllocationAndFacility() public {
        address recipient = address(0xB0B);
        vault.grantRole(vault.CONSUMER_ROLE(), address(this));
        vault.consume(sourceCommitmentId, recipient);

        CommitmentLifecycleASC.Proof memory proof = _proof(_encodedEvent(true, recipient, AMOUNT, 1, address(vault)));
        (bytes32 acceptedId, bytes32 evidenceId) = lifecycle.acceptAttestedCommitmentLifecycle(proof);

        require(acceptedId == commitmentId, "wrong commitment id");
        require(
            commitments.getCommitment(commitmentId).status == CommitmentRegistry.CommitmentStatus.CONSUMED,
            "registry not consumed"
        );
        require(
            allocations.getAllocation(allocationId).status == AllocationManager.AllocationStatus.CONSUMED,
            "allocation not consumed"
        );
        FacilityManager.Facility memory facility = facilities.getFacility(facilityId);
        require(facility.committedAmount == AMOUNT, "gross committed amount drifted");
        require(facility.consumedAmount == AMOUNT && facility.expiredAmount == 0, "terminal accounting mismatch");
        require(facilities.activeCommittedAmount(facilityId) == 0, "active committed amount not zero");
        require(evidence.getEvidence(evidenceId).consumed, "lifecycle evidence not consumed");
        require(token.balanceOf(recipient) == AMOUNT, "source consume did not transfer exact amount");
    }

    function testExpiredLifecycleSynchronizesAndPreservesGrossSeal() public {
        vm.warp(uint256(sourceExpiresAt) + 1);
        vault.expire(sourceCommitmentId);

        CommitmentLifecycleASC.Proof memory proof =
            _proof(_encodedEvent(false, address(this), AMOUNT, 2, address(vault)));
        lifecycle.acceptAttestedCommitmentLifecycle(proof);

        require(
            commitments.getCommitment(commitmentId).status == CommitmentRegistry.CommitmentStatus.EXPIRED,
            "registry not expired"
        );
        require(
            allocations.getAllocation(allocationId).status == AllocationManager.AllocationStatus.EXPIRED,
            "allocation not expired"
        );
        FacilityManager.Facility memory facility = facilities.getFacility(facilityId);
        require(facility.committedAmount == AMOUNT, "gross capitalization input changed");
        require(facility.consumedAmount == 0 && facility.expiredAmount == AMOUNT, "expiry accounting mismatch");
        require(facilities.activeCommittedAmount(facilityId) == 0, "expired commitment remains active");
        require(token.balanceOf(address(this)) == AMOUNT, "source expiry did not return exact amount");
    }

    function testLifecycleReplayIsRejectedWithoutStateDrift() public {
        address recipient = address(0xB0B);
        vault.grantRole(vault.CONSUMER_ROLE(), address(this));
        vault.consume(sourceCommitmentId, recipient);
        CommitmentLifecycleASC.Proof memory proof = _proof(_encodedEvent(true, recipient, AMOUNT, 1, address(vault)));
        lifecycle.acceptAttestedCommitmentLifecycle(proof);

        (bool ok,) = address(lifecycle).call(abi.encodeCall(lifecycle.acceptAttestedCommitmentLifecycle, (proof)));
        require(!ok, "lifecycle replay accepted");
        require(
            commitments.getCommitment(commitmentId).status == CommitmentRegistry.CommitmentStatus.CONSUMED,
            "replay drifted registry"
        );
        require(
            allocations.getAllocation(allocationId).status == AllocationManager.AllocationStatus.CONSUMED,
            "replay drifted allocation"
        );
    }

    function testWrongChainFailsBeforeVerification() public {
        verifier.setVerifyResult(false);
        CommitmentLifecycleASC.Proof memory proof =
            _proof(_encodedEvent(true, address(0xB0B), AMOUNT, 1, address(vault)));
        proof.chainKey = CHAIN_KEY + 1;
        (bool ok,) = address(lifecycle).call(abi.encodeCall(lifecycle.acceptAttestedCommitmentLifecycle, (proof)));
        require(!ok, "wrong chain accepted");
        require(
            commitments.getCommitment(commitmentId).status == CommitmentRegistry.CommitmentStatus.ACTIVE,
            "wrong chain mutated registry"
        );
    }

    function testReceiptFailureCannotMutateState() public {
        CommitmentLifecycleASC.Proof memory proof =
            _proof(_encodedEvent(true, address(0xB0B), AMOUNT, 0, address(vault)));
        (bool ok,) = address(lifecycle).call(abi.encodeCall(lifecycle.acceptAttestedCommitmentLifecycle, (proof)));
        require(!ok, "failed source receipt accepted");
        require(
            commitments.getCommitment(commitmentId).status == CommitmentRegistry.CommitmentStatus.ACTIVE,
            "failed receipt mutated registry"
        );
        require(
            allocations.getAllocation(allocationId).status == AllocationManager.AllocationStatus.COMMITTED,
            "failed receipt mutated allocation"
        );
        require(facilities.getFacility(facilityId).consumedAmount == 0, "failed receipt mutated facility");
    }

    function testWrongSourceContractCannotMutateState() public {
        CommitmentLifecycleASC.Proof memory proof =
            _proof(_encodedEvent(true, address(0xB0B), AMOUNT, 1, address(0xCAFE)));
        (bool ok,) = address(lifecycle).call(abi.encodeCall(lifecycle.acceptAttestedCommitmentLifecycle, (proof)));
        require(!ok, "wrong source contract accepted");
        require(
            commitments.getCommitment(commitmentId).status == CommitmentRegistry.CommitmentStatus.ACTIVE,
            "wrong source mutated registry"
        );
    }

    function testAmbiguousLifecycleEventsCannotMutateState() public {
        CommitmentLifecycleASC.Proof memory proof = _proof(_encodedTwoEvents());
        (bool ok,) = address(lifecycle).call(abi.encodeCall(lifecycle.acceptAttestedCommitmentLifecycle, (proof)));
        require(!ok, "ambiguous lifecycle accepted");
        require(
            commitments.getCommitment(commitmentId).status == CommitmentRegistry.CommitmentStatus.ACTIVE,
            "ambiguous event mutated registry"
        );
        require(
            !lifecycle.processedQuery(keccak256(abi.encode(CHAIN_KEY, uint64(100), uint64(7)))),
            "failed proof replay-locked"
        );
    }

    function testExpiredEventMustNameProvider() public {
        CommitmentLifecycleASC.Proof memory proof =
            _proof(_encodedEvent(false, address(0xBAD), AMOUNT, 1, address(vault)));
        (bool ok,) = address(lifecycle).call(abi.encodeCall(lifecycle.acceptAttestedCommitmentLifecycle, (proof)));
        require(!ok, "wrong expiry actor accepted");
        require(
            commitments.getCommitment(commitmentId).status == CommitmentRegistry.CommitmentStatus.ACTIVE,
            "wrong expiry actor mutated registry"
        );
        require(facilities.activeCommittedAmount(facilityId) == AMOUNT, "wrong expiry actor changed accounting");
    }

    function testLifecycleTransitionsRequireDedicatedRoles() public {
        (bool registryOk,) = address(commitments)
            .call(abi.encodeCall(commitments.markExpired, (commitmentId, keccak256("evidence"), AMOUNT)));
        (bool allocationOk,) = address(allocations)
            .call(abi.encodeCall(allocations.markCommitmentExpired, (allocationId, address(this), AMOUNT)));
        require(!registryOk && !allocationOk, "lifecycle authority bypassed");
        require(
            commitments.getCommitment(commitmentId).status == CommitmentRegistry.CommitmentStatus.ACTIVE,
            "unauthorized registry mutation"
        );
        require(
            allocations.getAllocation(allocationId).status == AllocationManager.AllocationStatus.COMMITTED,
            "unauthorized allocation mutation"
        );
    }

    function _proof(bytes memory encodedTransaction) internal pure returns (CommitmentLifecycleASC.Proof memory proof) {
        INativeQueryVerifier.MerkleProofEntry[] memory siblings = new INativeQueryVerifier.MerkleProofEntry[](0);
        bytes32[] memory continuityRoots = new bytes32[](0);
        proof = CommitmentLifecycleASC.Proof({
            chainKey: CHAIN_KEY,
            blockHeight: 100,
            encodedTransaction: encodedTransaction,
            merkleRoot: bytes32(0),
            siblings: siblings,
            lowerEndpointDigest: bytes32(0),
            continuityRoots: continuityRoots
        });
    }

    function _encodedEvent(bool consumed, address actor, uint256 amount, uint8 receiptStatus, address source)
        internal
        view
        returns (bytes memory encoded)
    {
        bytes32[] memory topics = new bytes32[](3);
        topics[0] = consumed ? lifecycle.CAPITAL_CONSUMED_SIG() : lifecycle.CAPITAL_EXPIRED_SIG();
        topics[1] = sourceCommitmentId;
        topics[2] = bytes32(uint256(uint160(actor)));
        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](1);
        logs[0] = EvmV1Decoder.LogEntryTuple({address_: source, topics: topics, data: abi.encode(amount)});
        return _encodedReceipt(logs, receiptStatus);
    }

    function _encodedTwoEvents() internal view returns (bytes memory encoded) {
        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](2);
        bytes32[] memory consumedTopics = new bytes32[](3);
        consumedTopics[0] = lifecycle.CAPITAL_CONSUMED_SIG();
        consumedTopics[1] = sourceCommitmentId;
        consumedTopics[2] = bytes32(uint256(uint160(address(0xB0B))));
        bytes32[] memory expiredTopics = new bytes32[](3);
        expiredTopics[0] = lifecycle.CAPITAL_EXPIRED_SIG();
        expiredTopics[1] = sourceCommitmentId;
        expiredTopics[2] = bytes32(uint256(uint160(address(this))));
        logs[0] =
            EvmV1Decoder.LogEntryTuple({address_: address(vault), topics: consumedTopics, data: abi.encode(AMOUNT)});
        logs[1] =
            EvmV1Decoder.LogEntryTuple({address_: address(vault), topics: expiredTopics, data: abi.encode(AMOUNT)});
        return _encodedReceipt(logs, 1);
    }

    function _encodedReceipt(EvmV1Decoder.LogEntryTuple[] memory logs, uint8 receiptStatus)
        internal
        pure
        returns (bytes memory encoded)
    {
        bytes[] memory chunks = new bytes[](3);
        chunks[0] =
            abi.encode(uint64(0), uint64(21_000), address(0xA11CE), false, address(0xB0B), uint256(0), bytes(""));
        chunks[1] = abi.encode(uint128(1), uint256(0), bytes32(0), bytes32(0));
        chunks[2] = abi.encode(receiptStatus, uint64(21_000), logs, bytes(""));
        encoded = abi.encode(uint8(0), chunks);
    }
}
