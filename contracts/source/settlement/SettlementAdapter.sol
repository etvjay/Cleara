// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract SettlementAdapter {
    using SafeERC20 for IERC20;

    error InvalidSettlement();

    event SettlementExecuted(
        bytes32 indexed settlementId,
        bytes32 indexed residualId,
        address indexed debtor,
        address creditor,
        bytes32 assetClassId,
        address token,
        uint256 amount
    );

    function executeSettlement(
        bytes32 settlementId,
        bytes32 residualId,
        address creditor,
        bytes32 assetClassId,
        address token,
        uint256 amount
    ) external {
        if (
            settlementId == bytes32(0) || residualId == bytes32(0) || creditor == address(0) || creditor == msg.sender
                || assetClassId == bytes32(0) || token == address(0) || amount == 0
        ) revert InvalidSettlement();

        IERC20(token).safeTransferFrom(msg.sender, creditor, amount);
        emit SettlementExecuted(settlementId, residualId, msg.sender, creditor, assetClassId, token, amount);
    }
}
