// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ClaimRegistry} from "./ClaimRegistry.sol";

contract EncumbranceRegistry is AccessControl {
    bytes32 public constant ENCUMBRANCE_MANAGER_ROLE = keccak256("ENCUMBRANCE_MANAGER_ROLE");
    bytes32 public constant FACILITY_ROLE = keccak256("FACILITY_ROLE");

    enum EncumbranceStatus {
        NONE,
        PROPOSED,
        ACTIVE,
        CONSUMED,
        RELEASED,
        EXPIRED,
        CANCELLED
    }

    struct Encumbrance {
        bytes32 encumbranceId;
        bytes32 claimId;
        bytes32 facilityId;
        address beneficiary;
        uint256 amount;
        uint64 createdAt;
        uint64 expiresAt;
        uint256 nonce;
        EncumbranceStatus status;
    }

    ClaimRegistry public immutable claimRegistry;

    mapping(bytes32 => Encumbrance) private _encumbrances;
    mapping(bytes32 => uint256) public nextNonceByClaim;

    error InvalidEncumbrance();
    error EncumbranceAlreadyExists(bytes32 encumbranceId);
    error UnknownEncumbrance(bytes32 encumbranceId);
    error InvalidEncumbranceState(bytes32 encumbranceId, EncumbranceStatus state);
    error EncumbranceNotExpired(bytes32 encumbranceId, uint64 expiresAt);

    event EncumbranceCreated(
        bytes32 indexed encumbranceId,
        bytes32 indexed claimId,
        bytes32 indexed facilityId,
        address beneficiary,
        uint256 amount,
        uint64 expiresAt,
        uint256 nonce
    );

    event EncumbranceStatusChanged(
        bytes32 indexed encumbranceId, EncumbranceStatus previousStatus, EncumbranceStatus newStatus
    );

    constructor(address admin, ClaimRegistry claimRegistry_) {
        if (address(claimRegistry_) == address(0)) revert InvalidEncumbrance();
        claimRegistry = claimRegistry_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ENCUMBRANCE_MANAGER_ROLE, admin);
        _grantRole(FACILITY_ROLE, admin);
    }

    function computeEncumbranceId(bytes32 claimId, bytes32 facilityId, uint256 nonce) public pure returns (bytes32) {
        return keccak256(abi.encode("CLEARA_ENCUMBRANCE_V1", claimId, facilityId, nonce));
    }

    function createEncumbrance(
        bytes32 claimId,
        bytes32 facilityId,
        address beneficiary,
        uint256 amount,
        uint64 expiresAt
    ) external onlyRole(ENCUMBRANCE_MANAGER_ROLE) returns (bytes32 encumbranceId) {
        if (
            claimId == bytes32(0) || facilityId == bytes32(0) || beneficiary == address(0) || amount == 0
                || expiresAt <= block.timestamp
        ) revert InvalidEncumbrance();

        uint256 nonce = nextNonceByClaim[claimId];
        encumbranceId = computeEncumbranceId(claimId, facilityId, nonce);
        if (_encumbrances[encumbranceId].status != EncumbranceStatus.NONE) {
            revert EncumbranceAlreadyExists(encumbranceId);
        }

        claimRegistry.reserveEncumbrance(claimId, amount);
        nextNonceByClaim[claimId] = nonce + 1;

        _encumbrances[encumbranceId] = Encumbrance({
            encumbranceId: encumbranceId,
            claimId: claimId,
            facilityId: facilityId,
            beneficiary: beneficiary,
            amount: amount,
            createdAt: uint64(block.timestamp),
            expiresAt: expiresAt,
            nonce: nonce,
            status: EncumbranceStatus.ACTIVE
        });

        emit EncumbranceCreated(encumbranceId, claimId, facilityId, beneficiary, amount, expiresAt, nonce);
        emit EncumbranceStatusChanged(encumbranceId, EncumbranceStatus.PROPOSED, EncumbranceStatus.ACTIVE);
    }

    function consumeEncumbrance(bytes32 encumbranceId) external onlyRole(FACILITY_ROLE) {
        Encumbrance storage encumbrance = _requireActive(encumbranceId);
        _transition(encumbrance, EncumbranceStatus.CONSUMED);
    }

    function releaseConsumedEncumbrance(bytes32 encumbranceId) external onlyRole(FACILITY_ROLE) {
        Encumbrance storage encumbrance = _encumbrances[encumbranceId];
        if (encumbrance.status == EncumbranceStatus.NONE) revert UnknownEncumbrance(encumbranceId);
        if (encumbrance.status != EncumbranceStatus.CONSUMED) {
            revert InvalidEncumbranceState(encumbranceId, encumbrance.status);
        }
        claimRegistry.releaseEncumbrance(encumbrance.claimId, encumbrance.amount);
        _transition(encumbrance, EncumbranceStatus.RELEASED);
    }

    function releaseEncumbrance(bytes32 encumbranceId) external onlyRole(ENCUMBRANCE_MANAGER_ROLE) {
        Encumbrance storage encumbrance = _requireActive(encumbranceId);
        claimRegistry.releaseEncumbrance(encumbrance.claimId, encumbrance.amount);
        _transition(encumbrance, EncumbranceStatus.RELEASED);
    }

    function cancelEncumbrance(bytes32 encumbranceId) external onlyRole(ENCUMBRANCE_MANAGER_ROLE) {
        Encumbrance storage encumbrance = _requireActive(encumbranceId);
        claimRegistry.releaseEncumbrance(encumbrance.claimId, encumbrance.amount);
        _transition(encumbrance, EncumbranceStatus.CANCELLED);
    }

    function expireEncumbrance(bytes32 encumbranceId) external {
        Encumbrance storage encumbrance = _requireActive(encumbranceId);
        if (block.timestamp < encumbrance.expiresAt) {
            revert EncumbranceNotExpired(encumbranceId, encumbrance.expiresAt);
        }
        claimRegistry.releaseEncumbrance(encumbrance.claimId, encumbrance.amount);
        _transition(encumbrance, EncumbranceStatus.EXPIRED);
    }

    function getEncumbrance(bytes32 encumbranceId) external view returns (Encumbrance memory encumbrance) {
        encumbrance = _encumbrances[encumbranceId];
        if (encumbrance.status == EncumbranceStatus.NONE) revert UnknownEncumbrance(encumbranceId);
    }

    function _requireActive(bytes32 encumbranceId) internal view returns (Encumbrance storage encumbrance) {
        encumbrance = _encumbrances[encumbranceId];
        if (encumbrance.status == EncumbranceStatus.NONE) revert UnknownEncumbrance(encumbranceId);
        if (encumbrance.status != EncumbranceStatus.ACTIVE) {
            revert InvalidEncumbranceState(encumbranceId, encumbrance.status);
        }
    }

    function _transition(Encumbrance storage encumbrance, EncumbranceStatus next) internal {
        EncumbranceStatus previous = encumbrance.status;
        encumbrance.status = next;
        emit EncumbranceStatusChanged(encumbrance.encumbranceId, previous, next);
    }
}
