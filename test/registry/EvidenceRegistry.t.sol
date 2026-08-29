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
        bytes32 txHash = keccak256("tx");
        bytes32 evidenceId = registry.registerEvidence(domainId, 1, 100, txHash, 2, keccak256("payload"));

        EvidenceRegistry.EvidenceRecord memory record = registry.getEvidence(evidenceId);
        require(record.gateway == address(this), "gateway");
        require(!record.consumed, "premature consumption");

        (bool duplicateOk,) = address(registry)
            .call(
                abi.encodeCall(
                    registry.registerEvidence,
                    (domainId, uint64(1), uint256(100), txHash, uint32(2), keccak256("payload"))
                )
            );
        require(!duplicateOk, "duplicate evidence accepted");

        registry.consumeEvidence(evidenceId);
        require(registry.getEvidence(evidenceId).consumed, "not consumed");

        (bool replayOk,) = address(registry).call(abi.encodeCall(registry.consumeEvidence, (evidenceId)));
        require(!replayOk, "evidence consumed twice");
    }
}
