// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {EvidenceRegistry} from "../../contracts/creditcoin/registry/EvidenceRegistry.sol";

contract EvidenceRegistryTest {
    EvidenceRegistry internal registry;

    function setUp() public {
        registry = new EvidenceRegistry(address(this));
    }

    function testEvidenceIsSingleRegistrationAndSingleConsumption() public {
        bytes32 domainId = keccak256("sepolia");
        bytes32 encodedHash = keccak256("encoded");
        bytes32 payloadHash = keccak256("payload");
        bytes32 evidenceId = registry.registerEvidence(domainId, 1, 100, 7, 2, encodedHash, payloadHash);

        EvidenceRegistry.EvidenceRecord memory record = registry.getEvidence(evidenceId);
        require(record.gateway == address(this), "gateway");
        require(record.txIndex == 7, "txIndex");
        require(record.encodedTransactionHash == encodedHash, "encoded hash");
        require(!record.consumed, "premature consumption");

        (bool duplicateOk,) = address(registry)
            .call(
                abi.encodeCall(
                    registry.registerEvidence,
                    (domainId, uint64(1), uint64(100), uint64(7), uint32(2), encodedHash, payloadHash)
                )
            );
        require(!duplicateOk, "duplicate evidence accepted");

        registry.consumeEvidence(evidenceId);
        require(registry.getEvidence(evidenceId).consumed, "not consumed");

        (bool replayOk,) = address(registry).call(abi.encodeCall(registry.consumeEvidence, (evidenceId)));
        require(!replayOk, "evidence consumed twice");
    }

    function testDifferentTransactionIndexCreatesDifferentEvidenceIdentity() public view {
        bytes32 domainId = keccak256("sepolia");
        bytes32 a = registry.computeEvidenceId(domainId, 1, 100, 7, 2);
        bytes32 b = registry.computeEvidenceId(domainId, 1, 100, 8, 2);
        require(a != b, "tx index must bind identity");
    }
}
