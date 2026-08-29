// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {PolicyRegistry} from "../../contracts/creditcoin/registry/PolicyRegistry.sol";

contract PolicyRegistryTest {
    PolicyRegistry internal registry;

    function setUp() public {
        registry = new PolicyRegistry(address(this));
    }

    function testPolicyVersionsAreMonotonic() public {
        bytes32 id = keccak256("SET_OFF_POLICY");
        registry.configurePolicy(PolicyRegistry.PolicyRecord(id, keccak256("v1"), 1, true));
        registry.configurePolicy(PolicyRegistry.PolicyRecord(id, keccak256("v2"), 2, true));
        require(registry.getPolicy(id).version == 2, "version");

        (bool ok,) = address(registry)
            .call(
                abi.encodeCall(registry.configurePolicy, (PolicyRegistry.PolicyRecord(id, keccak256("stale"), 1, true)))
            );
        require(!ok, "stale policy version accepted");
    }
}
