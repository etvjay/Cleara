// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ResidualSettlementRoutingTest} from "./ResidualSettlementRouting.t.sol";
import {ResidualLedger} from "../../contracts/creditcoin/settlement/ResidualLedger.sol";

contract ResidualSettlementRoutingFuzzTest is ResidualSettlementRoutingTest {
    function testFuzzResidualEqualsPostClearingDifference(uint128 rawX, uint128 rawY) public {
        uint256 x = uint256(rawX) + 2;
        uint256 y = (uint256(rawY) % (x - 1)) + 1;

        (bytes32 epochId, bytes32 source,) = _finalizedEpoch(x, y);
        bytes32 residualId = residuals.createBilateralResidual(epochId);
        ResidualLedger.Residual memory residual = residuals.getResidual(residualId);

        require(residual.sourceObligationId == source, "wrong source");
        require(residual.amount == x - y, "residual conservation broken");
        require(clearing.getEpoch(epochId).grossAfter == x - y, "epoch/residual mismatch");
    }

    function testFuzzEqualBilateralAmountsProduceNoResidual(uint128 rawAmount) public {
        uint256 amount = uint256(rawAmount) + 1;
        (bytes32 epochId,,) = _finalizedEpoch(amount, amount);

        (bool ok,) = address(residuals).call(abi.encodeCall(residuals.createBilateralResidual, (epochId)));
        require(!ok, "zero economic residual was materialized");
        require(!residuals.epochResidualized(epochId), "failed zero-residual attempt mutated state");
    }

    function testFuzzRoutingNeverMutatesSettlementAccounting(uint128 rawX, uint128 rawY) public {
        uint256 x = uint256(rawX) + 2;
        uint256 y = (uint256(rawY) % (x - 1)) + 1;

        (bytes32 epochId, bytes32 source,) = _finalizedEpoch(x, y);
        bytes32 residualId = residuals.createBilateralResidual(epochId);
        uint256 settledBefore = obligations.getObligation(source).settledAmount;

        router.routeResidual(
            residualId,
            keccak256(abi.encode("adapter", rawX, rawY)),
            keccak256(abi.encode("domain", rawX)),
            keccak256(abi.encode("representation", rawY)),
            keccak256(abi.encode("route", rawX, rawY))
        );

        require(obligations.getObligation(source).settledAmount == settledBefore, "routing settled value");
        require(settledBefore == 0, "fixture unexpectedly settled");
    }
}
