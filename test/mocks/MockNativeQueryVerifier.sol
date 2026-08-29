// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {INativeQueryVerifier} from "../../contracts/creditcoin/interfaces/INativeQueryVerifier.sol";

contract MockNativeQueryVerifier is INativeQueryVerifier {
    bool public verifyResult;
    uint64 public txIndex;

    function setVerifyResult(bool value) external {
        verifyResult = value;
    }

    function setTxIndex(uint64 value) external {
        txIndex = value;
    }

    function verifyAndEmit(
        uint64,
        uint64,
        bytes calldata,
        MerkleProof calldata,
        ContinuityProof calldata
    ) external view returns (bool) {
        return verifyResult;
    }

    function calculateTxIndex(MerkleProof calldata) external view returns (uint64) {
        return txIndex;
    }
}
