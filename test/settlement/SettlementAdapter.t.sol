// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {SettlementAdapter} from "../../contracts/source/settlement/SettlementAdapter.sol";
import {MockERC20} from "../mocks/MockERC20.sol";

contract SettlementAdapterTest {
    SettlementAdapter internal adapter;
    MockERC20 internal token;
    address internal creditor = address(0xB0B);

    function setUp() public {
        adapter = new SettlementAdapter();
        token = new MockERC20();
        token.mint(address(this), 1_000_000);
        token.approve(address(adapter), type(uint256).max);
    }

    function testSettlementTransfersExactAmountFromDebtorToCreditor() public {
        uint256 debtorBefore = token.balanceOf(address(this));
        uint256 creditorBefore = token.balanceOf(creditor);

        adapter.executeSettlement(
            keccak256("settlement"), keccak256("residual"), creditor, keccak256("USD"), address(token), 340_000
        );

        require(token.balanceOf(address(this)) == debtorBefore - 340_000, "debtor balance mismatch");
        require(token.balanceOf(creditor) == creditorBefore + 340_000, "creditor balance mismatch");
    }

    function testFailedTransferCannotEmitSuccessfulEconomicEffect() public {
        MockERC20 emptyToken = new MockERC20();
        emptyToken.approve(address(adapter), type(uint256).max);
        (bool ok,) = address(adapter)
            .call(
                abi.encodeCall(
                    adapter.executeSettlement,
                    (
                        keccak256("settlement"),
                        keccak256("residual"),
                        creditor,
                        keccak256("USD"),
                        address(emptyToken),
                        340_000
                    )
                )
            );
        require(!ok, "unfunded settlement succeeded");
        require(emptyToken.balanceOf(creditor) == 0, "failed settlement moved value");
    }
}
