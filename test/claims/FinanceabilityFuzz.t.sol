// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ClaimRegistry} from "../../contracts/creditcoin/kernel/ClaimRegistry.sol";
import {EncumbranceRegistry} from "../../contracts/creditcoin/kernel/EncumbranceRegistry.sol";

contract FinanceabilityFuzzTest {
    ClaimRegistry internal claims;
    EncumbranceRegistry internal encumbrances;
    bytes32 internal claimId;

    function setUp() public {
        claims = new ClaimRegistry(address(this));
        encumbrances = new EncumbranceRegistry(address(this), claims);
        claims.grantRole(claims.ENCUMBRANCE_ROLE(), address(encumbrances));

        claimId = claims.registerVerifiedClaim(
            keccak256("domain"),
            address(0xCA11),
            1,
            address(0xA11CE),
            address(0xB0B),
            keccak256("USD"),
            1_000_000,
            uint64(block.timestamp + 30 days),
            keccak256("source"),
            keccak256("evidence")
        );
    }

    function testFuzzCapacityNeverExceedsFaceValue(uint256 rawCapacity) public {
        uint256 capacity = rawCapacity % 1_000_001;
        claims.setFinanceableCapacity(claimId, capacity, keccak256("policy"), keccak256(abi.encode(rawCapacity)));
        ClaimRegistry.Claim memory claim = claims.getClaim(claimId);
        require(claim.financeableCapacity <= claim.faceValue, "capacity > face");
        require(claim.activeEncumbrance <= claim.financeableCapacity, "encumbrance > capacity");
    }

    function testFuzzAcceptedReservationsConserveCapacity(uint256 rawCapacity, uint256 rawAmount) public {
        uint256 capacity = 1 + (rawCapacity % 1_000_000);
        uint256 amount = 1 + (rawAmount % capacity);
        claims.setFinanceableCapacity(claimId, capacity, keccak256("policy"), keccak256(abi.encode(rawCapacity)));

        encumbrances.createEncumbrance(
            claimId, keccak256("facility"), address(0xF1), amount, uint64(block.timestamp + 1 days)
        );

        ClaimRegistry.Claim memory claim = claims.getClaim(claimId);
        require(claim.activeEncumbrance == amount, "wrong active");
        require(claim.activeEncumbrance <= claim.financeableCapacity, "over-encumbered");
        require(
            claims.availableCapacity(claimId) + claim.activeEncumbrance == claim.financeableCapacity, "not conserved"
        );
    }

    function testFuzzOverReservationAlwaysReverts(uint256 rawCapacity, uint256 rawFirst, uint256 rawExcess) public {
        uint256 capacity = 2 + (rawCapacity % 999_999);
        uint256 first = 1 + (rawFirst % (capacity - 1));
        uint256 remaining = capacity - first;
        uint256 excess = 1 + (rawExcess % 1_000_000);
        uint256 second = remaining + excess;

        claims.setFinanceableCapacity(claimId, capacity, keccak256("policy"), keccak256(abi.encode(rawCapacity)));
        encumbrances.createEncumbrance(
            claimId, keccak256("facility-a"), address(0xF1), first, uint64(block.timestamp + 1 days)
        );

        (bool ok,) = address(encumbrances)
            .call(
                abi.encodeCall(
                    encumbrances.createEncumbrance,
                    (claimId, keccak256("facility-b"), address(0xF2), second, uint64(block.timestamp + 1 days))
                )
            );
        require(!ok, "over-reservation accepted");

        ClaimRegistry.Claim memory claim = claims.getClaim(claimId);
        require(claim.activeEncumbrance == first, "failed call mutated active");
        require(claims.availableCapacity(claimId) == remaining, "failed call mutated available");
    }
}
