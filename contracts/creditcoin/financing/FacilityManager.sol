// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {EncumbranceRegistry} from "../kernel/EncumbranceRegistry.sol";

contract FacilityManager is AccessControl {
    bytes32 public constant FACILITY_MANAGER_ROLE = keccak256("FACILITY_MANAGER_ROLE");
    uint8 public constant TERMINAL_CONSUMED = 1;
    uint8 public constant TERMINAL_EXPIRED = 2;

    enum FacilityStatus {
        NONE,
        PROPOSED,
        VERIFIED,
        OPEN,
        ALLOCATING,
        CAPITALIZING,
        CAPITALIZED,
        ACTIVE,
        REPAYING,
        CLOSED,
        EXPIRED,
        CANCELLED,
        DISPUTED,
        DEFAULTED
    }

    struct Facility {
        bytes32 facilityId;
        address sponsor;
        bytes32 assetClassId;
        uint256 targetAmount;
        uint256 encumberedAmount;
        uint256 allocatedAmount;
        uint256 committedAmount;
        uint256 consumedAmount;
        uint256 expiredAmount;
        uint64 opensAt;
        uint64 closesAt;
        bytes32 policyBundleHash;
        uint256 nonce;
        bytes32 capitalizationRoot;
        uint64 capitalRequiredUntil;
        uint64 capitalizedAt;
        uint32 capitalizationCommitmentCount;
        FacilityStatus status;
    }

    EncumbranceRegistry public immutable encumbranceRegistry;
    address public capitalizationManager;

    mapping(bytes32 => Facility) private _facilities;
    mapping(address => uint256) public nextNonceBySponsor;
    mapping(bytes32 => bool) public encumbranceBound;

    error InvalidFacility();
    error FacilityAlreadyExists(bytes32 facilityId);
    error UnknownFacility(bytes32 facilityId);
    error InvalidFacilityState(bytes32 facilityId, FacilityStatus status);
    error EncumbranceAlreadyBound(bytes32 encumbranceId);
    error WrongFacility(bytes32 expected, bytes32 actual);
    error FacilityCapacityExceeded(uint256 requestedTotal, uint256 encumberedAmount, uint256 targetAmount);
    error CapitalizationManagerAlreadySet(address currentManager);
    error UnauthorizedCapitalizationManager(address caller);

    event FacilityCreated(
        bytes32 indexed facilityId,
        address indexed sponsor,
        bytes32 indexed assetClassId,
        uint256 targetAmount,
        uint64 opensAt,
        uint64 closesAt,
        bytes32 policyBundleHash,
        uint256 nonce
    );
    event FacilityStatusChanged(bytes32 indexed facilityId, FacilityStatus previousStatus, FacilityStatus newStatus);
    event EncumbranceBound(bytes32 indexed facilityId, bytes32 indexed encumbranceId, uint256 amount);
    event AllocatedAmountChanged(bytes32 indexed facilityId, uint256 previousAmount, uint256 newAmount);
    event CommittedAmountChanged(bytes32 indexed facilityId, uint256 previousAmount, uint256 newAmount);
    event TerminalCommittedAmountChanged(
        bytes32 indexed facilityId, uint8 indexed terminalKind, uint256 previousAmount, uint256 newAmount
    );
    event CapitalizationManagerBound(address indexed capitalizationManager);
    event CapitalizationSealed(
        bytes32 indexed facilityId,
        bytes32 indexed capitalizationRoot,
        uint64 capitalRequiredUntil,
        uint32 commitmentCount,
        uint256 committedAmount
    );

    constructor(address admin, EncumbranceRegistry encumbranceRegistry_) {
        if (address(encumbranceRegistry_) == address(0)) revert InvalidFacility();
        encumbranceRegistry = encumbranceRegistry_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(FACILITY_MANAGER_ROLE, admin);
    }

    function bindCapitalizationManager(address manager) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (manager == address(0)) revert InvalidFacility();
        if (capitalizationManager != address(0)) revert CapitalizationManagerAlreadySet(capitalizationManager);
        capitalizationManager = manager;
        emit CapitalizationManagerBound(manager);
    }

    function computeFacilityId(address sponsor, uint256 facilityNonce, bytes32 policyBundleHash)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode("CLEARA_FACILITY_V1", sponsor, facilityNonce, policyBundleHash));
    }

    function createFacility(
        bytes32 assetClassId,
        uint256 targetAmount,
        uint64 opensAt,
        uint64 closesAt,
        bytes32 policyBundleHash
    ) external onlyRole(FACILITY_MANAGER_ROLE) returns (bytes32 facilityId) {
        if (
            assetClassId == bytes32(0) || targetAmount == 0 || policyBundleHash == bytes32(0) || closesAt <= opensAt
                || closesAt <= block.timestamp
        ) revert InvalidFacility();

        uint256 nonce = nextNonceBySponsor[msg.sender];
        facilityId = computeFacilityId(msg.sender, nonce, policyBundleHash);
        if (_facilities[facilityId].status != FacilityStatus.NONE) revert FacilityAlreadyExists(facilityId);
        nextNonceBySponsor[msg.sender] = nonce + 1;

        _facilities[facilityId] = Facility({
            facilityId: facilityId,
            sponsor: msg.sender,
            assetClassId: assetClassId,
            targetAmount: targetAmount,
            encumberedAmount: 0,
            allocatedAmount: 0,
            committedAmount: 0,
            consumedAmount: 0,
            expiredAmount: 0,
            opensAt: opensAt,
            closesAt: closesAt,
            policyBundleHash: policyBundleHash,
            nonce: nonce,
            capitalizationRoot: bytes32(0),
            capitalRequiredUntil: 0,
            capitalizedAt: 0,
            capitalizationCommitmentCount: 0,
            status: FacilityStatus.PROPOSED
        });

        emit FacilityCreated(
            facilityId, msg.sender, assetClassId, targetAmount, opensAt, closesAt, policyBundleHash, nonce
        );
    }

    function verifyFacility(bytes32 facilityId) external onlyRole(FACILITY_MANAGER_ROLE) {
        Facility storage facility = _requireState(facilityId, FacilityStatus.PROPOSED);
        _transition(facility, FacilityStatus.VERIFIED);
    }

    function openFacility(bytes32 facilityId) external onlyRole(FACILITY_MANAGER_ROLE) {
        Facility storage facility = _requireState(facilityId, FacilityStatus.VERIFIED);
        _transition(facility, FacilityStatus.OPEN);
    }

    function beginAllocating(bytes32 facilityId) external onlyRole(FACILITY_MANAGER_ROLE) {
        Facility storage facility = _requireState(facilityId, FacilityStatus.OPEN);
        _transition(facility, FacilityStatus.ALLOCATING);
    }

    function beginCapitalizing(bytes32 facilityId) external onlyRole(FACILITY_MANAGER_ROLE) {
        Facility storage facility = _requireState(facilityId, FacilityStatus.ALLOCATING);
        if (facility.allocatedAmount != facility.targetAmount || facility.encumberedAmount < facility.targetAmount) {
            revert InvalidFacility();
        }
        _transition(facility, FacilityStatus.CAPITALIZING);
    }

    function finalizeCapitalization(
        bytes32 facilityId,
        bytes32 capitalizationRoot,
        uint64 capitalRequiredUntil,
        uint32 commitmentCount
    ) external {
        if (msg.sender != capitalizationManager) {
            revert UnauthorizedCapitalizationManager(msg.sender);
        }
        Facility storage facility = _requireState(facilityId, FacilityStatus.CAPITALIZING);
        if (
            capitalizationRoot == bytes32(0) || commitmentCount == 0 || capitalRequiredUntil <= block.timestamp
                || facility.committedAmount != facility.targetAmount
                || facility.committedAmount > facility.allocatedAmount
                || facility.committedAmount > facility.encumberedAmount
        ) revert InvalidFacility();

        facility.capitalizationRoot = capitalizationRoot;
        facility.capitalRequiredUntil = capitalRequiredUntil;
        facility.capitalizedAt = uint64(block.timestamp);
        facility.capitalizationCommitmentCount = commitmentCount;

        emit CapitalizationSealed(
            facilityId, capitalizationRoot, capitalRequiredUntil, commitmentCount, facility.committedAmount
        );
        _transition(facility, FacilityStatus.CAPITALIZED);
    }

    function bindEncumbrance(bytes32 facilityId, bytes32 encumbranceId) external onlyRole(FACILITY_MANAGER_ROLE) {
        Facility storage facility = _facilities[facilityId];
        if (facility.status == FacilityStatus.NONE) revert UnknownFacility(facilityId);
        if (facility.status != FacilityStatus.OPEN && facility.status != FacilityStatus.ALLOCATING) {
            revert InvalidFacilityState(facilityId, facility.status);
        }
        if (encumbranceBound[encumbranceId]) revert EncumbranceAlreadyBound(encumbranceId);

        EncumbranceRegistry.Encumbrance memory encumbrance = encumbranceRegistry.getEncumbrance(encumbranceId);
        if (encumbrance.facilityId != facilityId) revert WrongFacility(facilityId, encumbrance.facilityId);
        if (encumbrance.status != EncumbranceRegistry.EncumbranceStatus.ACTIVE) revert InvalidFacility();

        uint256 nextEncumbered = facility.encumberedAmount + encumbrance.amount;
        if (nextEncumbered > facility.targetAmount) {
            revert FacilityCapacityExceeded(nextEncumbered, facility.encumberedAmount, facility.targetAmount);
        }

        encumbranceRegistry.consumeEncumbrance(encumbranceId);
        encumbranceBound[encumbranceId] = true;
        facility.encumberedAmount = nextEncumbered;
        emit EncumbranceBound(facilityId, encumbranceId, encumbrance.amount);
    }

    function increaseAllocatedAmount(bytes32 facilityId, uint256 amount) external onlyRole(FACILITY_MANAGER_ROLE) {
        Facility storage facility = _requireState(facilityId, FacilityStatus.ALLOCATING);
        if (amount == 0) revert InvalidFacility();

        uint256 nextAllocated = facility.allocatedAmount + amount;
        if (nextAllocated > facility.encumberedAmount || nextAllocated > facility.targetAmount) {
            revert FacilityCapacityExceeded(nextAllocated, facility.encumberedAmount, facility.targetAmount);
        }

        uint256 previous = facility.allocatedAmount;
        facility.allocatedAmount = nextAllocated;
        emit AllocatedAmountChanged(facilityId, previous, nextAllocated);
    }

    function decreaseAllocatedAmount(bytes32 facilityId, uint256 amount) external onlyRole(FACILITY_MANAGER_ROLE) {
        Facility storage facility = _requireState(facilityId, FacilityStatus.ALLOCATING);
        if (amount == 0 || amount > facility.allocatedAmount) revert InvalidFacility();
        uint256 previous = facility.allocatedAmount;
        facility.allocatedAmount = previous - amount;
        emit AllocatedAmountChanged(facilityId, previous, facility.allocatedAmount);
    }

    function increaseCommittedAmount(bytes32 facilityId, uint256 amount) external onlyRole(FACILITY_MANAGER_ROLE) {
        Facility storage facility = _facilities[facilityId];
        if (facility.status == FacilityStatus.NONE) revert UnknownFacility(facilityId);
        if (facility.status != FacilityStatus.ALLOCATING && facility.status != FacilityStatus.CAPITALIZING) {
            revert InvalidFacilityState(facilityId, facility.status);
        }
        if (amount == 0) revert InvalidFacility();

        uint256 nextCommitted = facility.committedAmount + amount;
        if (
            nextCommitted > facility.allocatedAmount || nextCommitted > facility.encumberedAmount
                || nextCommitted > facility.targetAmount
        ) {
            revert FacilityCapacityExceeded(nextCommitted, facility.encumberedAmount, facility.targetAmount);
        }

        uint256 previous = facility.committedAmount;
        facility.committedAmount = nextCommitted;
        emit CommittedAmountChanged(facilityId, previous, nextCommitted);
    }

    function recordConsumedAmount(bytes32 facilityId, uint256 amount) external onlyRole(FACILITY_MANAGER_ROLE) {
        _recordTerminalAmount(facilityId, amount, true);
    }

    function recordExpiredAmount(bytes32 facilityId, uint256 amount) external onlyRole(FACILITY_MANAGER_ROLE) {
        _recordTerminalAmount(facilityId, amount, false);
    }

    function activeCommittedAmount(bytes32 facilityId) external view returns (uint256) {
        Facility memory facility = _facilities[facilityId];
        if (facility.status == FacilityStatus.NONE) revert UnknownFacility(facilityId);
        return facility.committedAmount - facility.consumedAmount - facility.expiredAmount;
    }

    function getFacility(bytes32 facilityId) external view returns (Facility memory facility) {
        facility = _facilities[facilityId];
        if (facility.status == FacilityStatus.NONE) revert UnknownFacility(facilityId);
    }

    function _requireState(bytes32 facilityId, FacilityStatus expected)
        internal
        view
        returns (Facility storage facility)
    {
        facility = _facilities[facilityId];
        if (facility.status == FacilityStatus.NONE) revert UnknownFacility(facilityId);
        if (facility.status != expected) revert InvalidFacilityState(facilityId, facility.status);
    }

    function _transition(Facility storage facility, FacilityStatus next) internal {
        FacilityStatus previous = facility.status;
        facility.status = next;
        emit FacilityStatusChanged(facility.facilityId, previous, next);
    }

    function _recordTerminalAmount(bytes32 facilityId, uint256 amount, bool consumed) internal {
        Facility storage facility = _facilities[facilityId];
        if (facility.status == FacilityStatus.NONE) revert UnknownFacility(facilityId);
        if (amount == 0 || facility.consumedAmount + facility.expiredAmount + amount > facility.committedAmount) {
            revert InvalidFacility();
        }

        if (consumed) {
            uint256 previousConsumed = facility.consumedAmount;
            facility.consumedAmount = previousConsumed + amount;
            emit TerminalCommittedAmountChanged(
                facilityId, TERMINAL_CONSUMED, previousConsumed, facility.consumedAmount
            );
        } else {
            uint256 previousExpired = facility.expiredAmount;
            facility.expiredAmount = previousExpired + amount;
            emit TerminalCommittedAmountChanged(facilityId, TERMINAL_EXPIRED, previousExpired, facility.expiredAmount);
        }
    }
}
