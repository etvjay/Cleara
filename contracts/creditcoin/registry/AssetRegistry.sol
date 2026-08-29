// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract AssetRegistry is AccessControl {
    bytes32 public constant ASSET_ADMIN_ROLE = keccak256("ASSET_ADMIN_ROLE");

    struct AssetClass {
        bytes32 assetClassId;
        bytes32 denomination;
        uint8 accountingDecimals;
        bytes32 policyNamespace;
        bool active;
    }

    struct Representation {
        bytes32 representationId;
        bytes32 assetClassId;
        bytes32 domainId;
        address token;
        uint8 decimals;
        bool active;
    }

    mapping(bytes32 => AssetClass) private _assetClasses;
    mapping(bytes32 => Representation) private _representations;

    error InvalidAssetClass();
    error InvalidRepresentation();
    error UnknownAssetClass(bytes32 assetClassId);
    error UnknownRepresentation(bytes32 representationId);

    event AssetClassConfigured(bytes32 indexed assetClassId, bytes32 indexed denomination, uint8 accountingDecimals, bool active);
    event RepresentationConfigured(bytes32 indexed representationId, bytes32 indexed assetClassId, bytes32 indexed domainId, address token, uint8 decimals, bool active);

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ASSET_ADMIN_ROLE, admin);
    }

    function computeAssetClassId(bytes32 denomination, uint8 accountingDecimals, bytes32 policyNamespace) public pure returns (bytes32) {
        return keccak256(abi.encode("CLEARA_ASSET_CLASS_V1", denomination, accountingDecimals, policyNamespace));
    }

    function computeRepresentationId(bytes32 assetClassId, bytes32 domainId, address token) public pure returns (bytes32) {
        return keccak256(abi.encode("CLEARA_ASSET_REPRESENTATION_V1", assetClassId, domainId, token));
    }

    function configureAssetClass(AssetClass calldata config) external onlyRole(ASSET_ADMIN_ROLE) {
        if (config.assetClassId == bytes32(0)) revert InvalidAssetClass();
        _assetClasses[config.assetClassId] = config;
        emit AssetClassConfigured(config.assetClassId, config.denomination, config.accountingDecimals, config.active);
    }

    function configureRepresentation(Representation calldata config) external onlyRole(ASSET_ADMIN_ROLE) {
        if (config.representationId == bytes32(0) || _assetClasses[config.assetClassId].assetClassId == bytes32(0)) {
            revert InvalidRepresentation();
        }
        _representations[config.representationId] = config;
        emit RepresentationConfigured(config.representationId, config.assetClassId, config.domainId, config.token, config.decimals, config.active);
    }

    function getAssetClass(bytes32 assetClassId) external view returns (AssetClass memory config) {
        config = _assetClasses[assetClassId];
        if (config.assetClassId == bytes32(0)) revert UnknownAssetClass(assetClassId);
    }

    function getRepresentation(bytes32 representationId) external view returns (Representation memory config) {
        config = _representations[representationId];
        if (config.representationId == bytes32(0)) revert UnknownRepresentation(representationId);
    }
}
