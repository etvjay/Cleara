// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ResidualLedger} from "./ResidualLedger.sol";

contract SettlementRouter is AccessControl {
    bytes32 public constant ROUTER_OPERATOR_ROLE = keccak256("ROUTER_OPERATOR_ROLE");

    enum RouteStatus {
        NONE,
        ROUTED,
        CANCELLED
    }

    struct SettlementInstruction {
        bytes32 settlementId;
        bytes32 residualId;
        bytes32 adapterId;
        bytes32 settlementDomainId;
        bytes32 settlementRepresentationId;
        bytes32 routeDataHash;
        uint256 settlementNonce;
        RouteStatus status;
    }

    ResidualLedger public immutable residualLedger;

    mapping(bytes32 => SettlementInstruction) private _instructions;
    mapping(bytes32 => bytes32) public settlementByResidual;
    mapping(bytes32 => uint256) public nextNonceByResidual;

    error InvalidSettlementInstruction();
    error UnknownSettlementInstruction(bytes32 settlementId);
    error ResidualAlreadyRouted(bytes32 residualId, bytes32 settlementId);

    event SettlementRouted(
        bytes32 indexed settlementId,
        bytes32 indexed residualId,
        bytes32 indexed adapterId,
        bytes32 settlementDomainId,
        bytes32 settlementRepresentationId,
        bytes32 routeDataHash,
        uint256 settlementNonce
    );

    constructor(address admin, ResidualLedger residualLedger_) {
        if (admin == address(0) || address(residualLedger_) == address(0)) revert InvalidSettlementInstruction();
        residualLedger = residualLedger_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ROUTER_OPERATOR_ROLE, admin);
    }

    function computeSettlementId(bytes32 residualId, bytes32 adapterId, uint256 settlementNonce)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode("CLEARA_SETTLEMENT_V1", residualId, adapterId, settlementNonce));
    }

    function routeResidual(
        bytes32 residualId,
        bytes32 adapterId,
        bytes32 settlementDomainId,
        bytes32 settlementRepresentationId,
        bytes32 routeDataHash
    ) external onlyRole(ROUTER_OPERATOR_ROLE) returns (bytes32 settlementId) {
        if (
            residualId == bytes32(0) || adapterId == bytes32(0) || settlementDomainId == bytes32(0)
                || settlementRepresentationId == bytes32(0) || routeDataHash == bytes32(0)
        ) revert InvalidSettlementInstruction();

        ResidualLedger.Residual memory residual = residualLedger.getResidual(residualId);
        if (residual.status != ResidualLedger.ResidualStatus.CREATED) revert InvalidSettlementInstruction();
        if (settlementByResidual[residualId] != bytes32(0)) {
            revert ResidualAlreadyRouted(residualId, settlementByResidual[residualId]);
        }

        uint256 nonce = nextNonceByResidual[residualId];
        settlementId = computeSettlementId(residualId, adapterId, nonce);
        nextNonceByResidual[residualId] = nonce + 1;

        _instructions[settlementId] = SettlementInstruction({
            settlementId: settlementId,
            residualId: residualId,
            adapterId: adapterId,
            settlementDomainId: settlementDomainId,
            settlementRepresentationId: settlementRepresentationId,
            routeDataHash: routeDataHash,
            settlementNonce: nonce,
            status: RouteStatus.ROUTED
        });
        settlementByResidual[residualId] = settlementId;

        residualLedger.markRouted(residualId);
        emit SettlementRouted(
            settlementId, residualId, adapterId, settlementDomainId, settlementRepresentationId, routeDataHash, nonce
        );
    }

    function getInstruction(bytes32 settlementId) external view returns (SettlementInstruction memory instruction) {
        instruction = _instructions[settlementId];
        if (instruction.status == RouteStatus.NONE) revert UnknownSettlementInstruction(settlementId);
    }
}
