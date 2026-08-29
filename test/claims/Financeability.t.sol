// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ClaimRegistry} from "../../contracts/creditcoin/kernel/ClaimRegistry.sol";

contract FinanceabilityTest {
    ClaimRegistry internal registry;
    bytes32 internal claimId;

    function setUp() public {
        registry = new ClaimRegistry(address(this));
        claimId = registry.registerVerifiedClaim(
            keccak256("sepolia"),
            address(0xCA11),
            1,
            address(0xA11CE),
            address(0xB0B),
            keccak256("USD"),
            100,
            uint64(block.timestamp + 30 days),
            keccak256("source-doc"),
            keccak256("attested")
        );
    }

    function testVerifiedClaimStartsWithZeroFinanceableCapacity() public view {
        ClaimRegistry.Claim memory claim = registry.getClaim(claimId);
        require(claim.state == ClaimRegistry.ClaimState.VERIFIED, "state");
        require(claim.financeableCapacity == 0, "capacity");
        require(claim.activeEncumbrance == 0, "encumbrance");
        require(registry.availableCapacity(claimId) == 0, "available");
    }

    function testFinanceabilityActivatesClaimAndCannotExceedFaceValue() public {
        registry.setFinanceableCapacity(claimId, 80, keccak256("policy"), keccak256("decision"));
        ClaimRegistry.Claim memory claim = registry.getClaim(claimId);
        require(claim.state == ClaimRegistry.ClaimState.ACTIVE, "not active");
        require(claim.financeableCapacity == 80, "capacity");
        require(registry.availableCapacity(claimId) == 80, "available");

        (bool ok,) = address(registry).call(
            abi.encodeCall(
                registry.setFinanceableCapacity,
                (claimId, uint256(101), keccak256("policy2"), keccak256("decision2"))
            )
        );
        require(!ok, "capacity above face accepted");
    }

    function testCapacityCannotFallBelowActiveEncumbrance() public {
        registry.setFinanceableCapacity(claimId, 80, keccak256("policy"), keccak256("decision"));
        registry.grantRole(registry.ENCUMBRANCE_ROLE(), address(this));
        registry.reserveEncumbrance(claimId, 50);

        (bool ok,) = address(registry).call(
            abi.encodeCall(
                registry.setFinanceableCapacity,
                (claimId, uint256(49), keccak256("policy2"), keccak256("decision2"))
            )
        );
        require(!ok, "capacity below encumbrance accepted");
        require(registry.availableCapacity(claimId) == 30, "available changed");
    }
}
