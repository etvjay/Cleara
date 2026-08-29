// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ClaimRegistry} from "../../contracts/creditcoin/kernel/ClaimRegistry.sol";
import {EncumbranceRegistry} from "../../contracts/creditcoin/kernel/EncumbranceRegistry.sol";

contract EncumbranceRegistryTest {
    ClaimRegistry internal claims;
    EncumbranceRegistry internal encumbrances;
    bytes32 internal claimId;
    bytes32 internal facilityA = keccak256("facility-a");
    bytes32 internal facilityB = keccak256("facility-b");

    function setUp() public {
        claims = new ClaimRegistry(address(this));
        encumbrances = new EncumbranceRegistry(address(this), claims);
        claims.grantRole(claims.ENCUMBRANCE_ROLE(), address(encumbrances));

        claimId = claims.registerVerifiedClaim(
            keccak256("sepolia"),
            address(0xCA11),
            9,
            address(0xA11CE),
            address(0xB0B),
            keccak256("USD"),
            100,
            uint64(block.timestamp + 30 days),
            keccak256("source-doc"),
            keccak256("attested")
        );
        claims.setFinanceableCapacity(claimId, 80, keccak256("policy"), keccak256("decision"));
    }

    function testOverEncumbranceVector() public {
        bytes32 a =
            encumbrances.createEncumbrance(claimId, facilityA, address(0xF1), 50, uint64(block.timestamp + 7 days));
        EncumbranceRegistry.Encumbrance memory record = encumbrances.getEncumbrance(a);
        require(record.status == EncumbranceRegistry.EncumbranceStatus.ACTIVE, "A not active");
        require(claims.availableCapacity(claimId) == 30, "wrong remaining");

        (bool ok,) = address(encumbrances)
            .call(
                abi.encodeCall(
                    encumbrances.createEncumbrance,
                    (claimId, facilityB, address(0xF2), uint256(40), uint64(block.timestamp + 7 days))
                )
            );
        require(!ok, "over-encumbrance accepted");
        require(claims.availableCapacity(claimId) == 30, "capacity mutated on revert");
    }

    function testReleaseRestoresCapacityExactlyOnce() public {
        bytes32 id =
            encumbrances.createEncumbrance(claimId, facilityA, address(0xF1), 50, uint64(block.timestamp + 7 days));
        encumbrances.releaseEncumbrance(id);
        require(claims.availableCapacity(claimId) == 80, "not restored");

        (bool ok,) = address(encumbrances).call(abi.encodeCall(encumbrances.releaseEncumbrance, (id)));
        require(!ok, "double release accepted");
        require(claims.availableCapacity(claimId) == 80, "double restore");
    }

    function testNonceMakesSameFacilityReservationsDistinct() public {
        bytes32 first =
            encumbrances.createEncumbrance(claimId, facilityA, address(0xF1), 10, uint64(block.timestamp + 7 days));
        encumbrances.releaseEncumbrance(first);
        bytes32 second =
            encumbrances.createEncumbrance(claimId, facilityA, address(0xF1), 10, uint64(block.timestamp + 7 days));
        require(first != second, "identity reused");
    }

    function testCannotExpireBeforeDeadline() public {
        bytes32 id =
            encumbrances.createEncumbrance(claimId, facilityA, address(0xF1), 10, uint64(block.timestamp + 7 days));
        (bool ok,) = address(encumbrances).call(abi.encodeCall(encumbrances.expireEncumbrance, (id)));
        require(!ok, "premature expiry accepted");
        require(claims.availableCapacity(claimId) == 70, "capacity changed");
    }
}
