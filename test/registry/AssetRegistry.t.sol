// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {AssetRegistry} from "../../contracts/creditcoin/registry/AssetRegistry.sol";

contract AssetRegistryTest {
    AssetRegistry internal registry;

    function setUp() public {
        registry = new AssetRegistry(address(this));
    }

    function testAssetClassAndRepresentationHaveDistinctIdentity() public {
        bytes32 denomination = bytes32("USD");
        bytes32 namespace = keccak256("CLEARA_USD_POLICY_V1");
        bytes32 assetClassId = registry.computeAssetClassId(denomination, 6, namespace);
        registry.configureAssetClass(AssetRegistry.AssetClass(assetClassId, denomination, 6, namespace, true));

        bytes32 domainA = keccak256("ethereum");
        bytes32 domainB = keccak256("creditcoin");
        address token = address(0x1234);
        bytes32 repA = registry.computeRepresentationId(assetClassId, domainA, token);
        bytes32 repB = registry.computeRepresentationId(assetClassId, domainB, token);
        require(repA != repB, "domain must affect representation identity");

        registry.configureRepresentation(AssetRegistry.Representation(repA, assetClassId, domainA, token, 6, true));
        AssetRegistry.Representation memory got = registry.getRepresentation(repA);
        require(got.assetClassId == assetClassId, "asset class");
        require(got.domainId == domainA, "domain");
    }
}
