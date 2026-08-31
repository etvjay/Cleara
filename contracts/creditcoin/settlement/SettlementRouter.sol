// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ResidualLedger} from "./ResidualLedger.sol";
import {DomainRegistry} from "../registry/DomainRegistry.sol";
import {AssetRegistry} from "../registry/AssetRegistry.sol";

contract SettlementRouter is AccessControl {
    bytes32 public constant ROUTER_OPERATOR_ROLE = keccak256("ROUTER_OPERATOR_ROLE");
    bytes32 public constant ADAPTER_ADMIN_ROLE = keccak256("ADAPTER_ADMIN_ROLE");

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

    struct AdapterConfig {
        bytes32 adapterId;
        bytes32 domainId;
        address adapter;
        bool active;
    }

    ResidualLedger public immutable residualLedger;
    DomainRegistry public immutable domainRegistry;
    AssetRegistry public immutable assetRegistry;

    mapping(bytes32 => SettlementInstruction) private _instructions;
    mapping(bytes32 => AdapterConfig) private _adapters;
    mapping(bytes32 => bytes32) public settlementByResidual;
    mapping(bytes32 => uint256) public nextNonceByResidual;

    error InvalidSettlementInstruction();
    error UnknownSettlementInstruction(bytes32 settlementId);
    error ResidualAlreadyRouted(bytes32 residualId, bytes32 settlementId);
    error UnknownSettlementAdapter(bytes32 adapterId);
    error InactiveSettlementDomain(bytes32 domainId);
    error UnsupportedSettlementRepresentation(bytes32 representationId);

    event SettlementAdapterConfigured(bytes32 indexed adapterId, bytes32 indexed domainId, address indexed adapter, bool active);
    event SettlementRouted(
        bytes32 indexed settlementId,
        bytes32 indexed residualId,
        bytes32 indexed adapterId,
        bytes32 settlementDomainId,
        bytes32 settlementRepresentationId,
        bytes32 routeDataHash,
        uint256 settlementNonce
    );

    constructor(
        address admin,
        ResidualLedger residualLedger_,
        DomainRegistry domainRegistry_,
        AssetRegistry assetRegistry_
    ) {
        if (
            admin == address(0) || address(residualLedger_) == address(0) || address(domainRegistry_) == address(0)
                || address(assetRegistry_) == address(0)
        ) revert InvalidSettlementInstruction();
        residualLedger = residualLedger_;
        domainRegistry = domainRegistry_;
        assetRegistry = assetRegistry_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ROUTER_OPERATOR_ROLE, admin);
        _grantRole(ADAPTER_ADMIN_ROLE, admin);
    }

    function computeAdapterId(bytes32 domainId, address adapter) public pure returns (bytes32) {
        return keccak256(abi.encode("CLEARA_SETTLEMENT_ADAPTER_V1", domainId, adapter));
    }

    function configureAdapter(bytes32 domainId, address adapter, bool active)
        external
        onlyRole(ADAPTER_ADMIN_ROLE)
        returns (bytes32 adapterId)
    {
        if (domainId == bytes32(0) || adapter == address(0)) revert InvalidSettlementInstruction();
        DomainRegistry.DomainConfig memory domain = domainRegistry.getDomain(domainId);
        if (!domain.active || !domain.readable || !domain.settlement || !domain.evidence) {
            revert InactiveSettlementDomain(domainId);
        }
        adapterId = computeAdapterId(domainId, adapter);
        _adapters[adapterId] = AdapterConfig(adapterId, domainId, adapter, active);
        emit SettlementAdapterConfigured(adapterId, domainId, adapter, active);
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

        AdapterConfig memory adapter = _adapters[adapterId];
        if (!adapter.active || adapter.adapter == address(0) || adapter.domainId != settlementDomainId) {
            revert UnknownSettlementAdapter(adapterId);
        }

        DomainRegistry.DomainConfig memory domain = domainRegistry.getDomain(settlementDomainId);
        if (!domain.active || !domain.readable || !domain.settlement || !domain.evidence) {
            revert InactiveSettlementDomain(settlementDomainId);
        }

        AssetRegistry.Representation memory representation = assetRegistry.getRepresentation(settlementRepresentationId);
        if (
            !representation.active || representation.domainId != settlementDomainId
                || representation.assetClassId != residual.assetClassId
        ) revert UnsupportedSettlementRepresentation(settlementRepresentationId);

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

    function getAdapter(bytes32 adapterId) external view returns (AdapterConfig memory adapter) {
        adapter = _adapters[adapterId];
        if (adapter.adapter == address(0)) revert UnknownSettlementAdapter(adapterId);
    }
}
