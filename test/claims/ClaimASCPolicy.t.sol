// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ClaimASC} from "../../contracts/creditcoin/gateway/ClaimASC.sol";
import {ClaimRegistry} from "../../contracts/creditcoin/kernel/ClaimRegistry.sol";
import {AssetRegistry} from "../../contracts/creditcoin/registry/AssetRegistry.sol";
import {DomainRegistry} from "../../contracts/creditcoin/registry/DomainRegistry.sol";
import {EvidenceRegistry} from "../../contracts/creditcoin/registry/EvidenceRegistry.sol";
import {INativeQueryVerifier} from "../../contracts/creditcoin/interfaces/INativeQueryVerifier.sol";
import {MockNativeQueryVerifier} from "../mocks/MockNativeQueryVerifier.sol";

contract ClaimASCPolicyTest {
    MockNativeQueryVerifier internal verifier;
    DomainRegistry internal domainRegistry;
    AssetRegistry internal assetRegistry;
    EvidenceRegistry internal evidenceRegistry;
    ClaimRegistry internal claimRegistry;
    ClaimASC internal gateway;

    bytes32 internal constant DOMAIN_ID = keccak256("SEPOLIA_DOMAIN");
    uint64 internal constant CHAIN_KEY = 1;
    address internal constant SOURCE = address(0xCA11);

    function setUp() public {
        verifier = new MockNativeQueryVerifier();
        domainRegistry = new DomainRegistry(address(this));
        assetRegistry = new AssetRegistry(address(this));
        evidenceRegistry = new EvidenceRegistry(address(this));
        claimRegistry = new ClaimRegistry(address(this));

        _configureDomain(true);
        gateway = new ClaimASC(
            address(verifier),
            address(domainRegistry),
            address(assetRegistry),
            address(evidenceRegistry),
            address(claimRegistry),
            CHAIN_KEY,
            DOMAIN_ID,
            SOURCE
        );
    }

    function testRejectsWrongChainBeforeNativeVerification() public {
        ClaimASC.Proof memory proof = _emptyProof(3);
        (bool ok,) = address(gateway).call(abi.encodeCall(gateway.acceptAttestedClaim, (proof)));
        require(!ok, "wrong chain accepted");
    }

    function testRejectsDomainDisabledAfterGatewayDeployment() public {
        _configureDomain(false);
        ClaimASC.Proof memory proof = _emptyProof(CHAIN_KEY);
        (bool ok,) = address(gateway).call(abi.encodeCall(gateway.acceptAttestedClaim, (proof)));
        require(!ok, "disabled domain accepted");
    }

    function testActiveDomainReachesNativeVerifierAndFailsClosed() public {
        verifier.setVerifyResult(false);
        ClaimASC.Proof memory proof = _emptyProof(CHAIN_KEY);
        (bool ok,) = address(gateway).call(abi.encodeCall(gateway.acceptAttestedClaim, (proof)));
        require(!ok, "failed native verification accepted");
    }

    function _configureDomain(bool active) internal {
        domainRegistry.configureDomain(
            DomainRegistry.DomainConfig({
                domainId: DOMAIN_ID,
                chainKey: CHAIN_KEY,
                evmChainId: 11155111,
                readable: true,
                writable: false,
                settlement: true,
                claim: true,
                commitment: true,
                evidence: true,
                version: active ? 1 : 2,
                active: active
            })
        );
    }

    function _emptyProof(uint64 chainKey) internal pure returns (ClaimASC.Proof memory proof) {
        INativeQueryVerifier.MerkleProofEntry[] memory siblings = new INativeQueryVerifier.MerkleProofEntry[](0);
        bytes32[] memory continuityRoots = new bytes32[](0);
        proof = ClaimASC.Proof({
            chainKey: chainKey,
            blockHeight: 1,
            encodedTransaction: hex"01",
            merkleRoot: bytes32(0),
            siblings: siblings,
            lowerEndpointDigest: bytes32(0),
            continuityRoots: continuityRoots
        });
    }
}
