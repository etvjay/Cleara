// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ClaimRegistry} from "../../contracts/creditcoin/kernel/ClaimRegistry.sol";

contract ClaimRegistryTest {
    ClaimRegistry internal registry;

    function setUp() public {
        registry = new ClaimRegistry(address(this));
    }

    function testVerifiedClaimIdentityIsStableAndCannotDuplicate() public {
        bytes32 domain = keccak256("sepolia");
        address source = address(0xCA11);
        address claimant = address(0xA11CE);
        address obligor = address(0xB0B);
        bytes32 asset = keccak256("USD");
        bytes32 evidenceId = keccak256("attested");

        bytes32 claimId = registry.registerVerifiedClaim(
            domain, source, 7, claimant, obligor, asset, 100, uint64(block.timestamp + 1 days), keccak256("doc"), evidenceId
        );
        ClaimRegistry.Claim memory claim = registry.getClaim(claimId);
        require(claim.state == ClaimRegistry.ClaimState.VERIFIED, "not verified");
        require(claim.faceValue == 100, "face value");

        bytes32 expected = registry.computeClaimId(domain, source, claimant, obligor, asset, 7);
        require(expected == claimId, "identity mismatch");

        (bool ok,) = address(registry).call(
            abi.encodeCall(
                registry.registerVerifiedClaim,
                (domain, source, uint256(7), claimant, obligor, asset, uint256(100), uint64(block.timestamp + 1 days), keccak256("doc"), evidenceId)
            )
        );
        require(!ok, "duplicate claim accepted");
    }
}
