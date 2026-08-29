// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {DomainRegistry} from "../../contracts/creditcoin/registry/DomainRegistry.sol";

contract DomainRegistryTest {
    DomainRegistry internal registry;

    function setUp() public {
        registry = new DomainRegistry(address(this));
    }

    function testConfigureAndReadDomain() public {
        bytes32 env = keccak256("CC3_TESTNET");
        bytes32 domainId = registry.computeDomainId(env, 11155111);
        registry.configureDomain(DomainRegistry.DomainConfig({
            domainId: domainId,
            chainKey: 1,
            evmChainId: 11155111,
            readable: true,
            writable: false,
            settlement: true,
            claim: true,
            commitment: true,
            evidence: true,
            version: 1,
            active: true
        }));

        DomainRegistry.DomainConfig memory got = registry.getDomain(domainId);
        require(got.chainKey == 1, "chainKey");
        require(got.evmChainId == 11155111, "chainId");
        require(got.readable && got.active, "flags");
        require(registry.domainByChainKey(1) == domainId, "binding");
    }

    function testRejectChainKeyRebind() public {
        DomainRegistry.DomainConfig memory first = DomainRegistry.DomainConfig({
            domainId: keccak256("domain-a"), chainKey: 1, evmChainId: 11155111,
            readable: true, writable: false, settlement: false, claim: true,
            commitment: true, evidence: true, version: 1, active: true
        });
        registry.configureDomain(first);

        DomainRegistry.DomainConfig memory second = first;
        second.domainId = keccak256("domain-b");
        (bool ok,) = address(registry).call(abi.encodeCall(registry.configureDomain, (second)));
        require(!ok, "chainKey rebound");
    }
}
