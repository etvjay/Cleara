// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ClaimSource} from "../../contracts/source/claims/ClaimSource.sol";

contract ClaimSourceTest {
    ClaimSource internal source;

    function setUp() public {
        source = new ClaimSource();
    }

    function testCreateClaimPersistsStableSourceNonce() public {
        uint256 nonce = source.createClaim(address(0xB0B), keccak256("USD"), 1_000_000, uint64(block.timestamp + 30 days), keccak256("evidence"));
        ClaimSource.SourceClaim memory claim = source.getClaim(nonce);
        require(nonce == 1, "nonce");
        require(claim.claimant == address(this), "claimant");
        require(claim.faceValue == 1_000_000, "face value");
        require(claim.state == ClaimSource.SourceClaimState.CREATED, "state");
    }

    function testClaimantCanCancelButCannotCancelTwice() public {
        uint256 nonce = source.createClaim(address(0xB0B), keccak256("USD"), 1, uint64(block.timestamp + 1 days), bytes32(0));
        source.cancelClaim(nonce);
        require(source.getClaim(nonce).state == ClaimSource.SourceClaimState.CANCELLED, "not cancelled");
        (bool ok,) = address(source).call(abi.encodeCall(source.cancelClaim, (nonce)));
        require(!ok, "double cancel");
    }
}
