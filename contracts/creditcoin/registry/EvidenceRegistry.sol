// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract EvidenceRegistry is AccessControl {
    bytes32 public constant GATEWAY_ROLE = keccak256("GATEWAY_ROLE");
    bytes32 public constant CONSUMER_ROLE = keccak256("CONSUMER_ROLE");

    struct EvidenceRecord {
        bytes32 evidenceId;
        bytes32 domainId;
        uint64 chainKey;
        uint256 blockHeight;
        bytes32 txHash;
        uint32 eventIndex;
        bytes32 payloadHash;
        address gateway;
        uint64 recordedAt;
        bool consumed;
    }

    mapping(bytes32 => EvidenceRecord) private _records;

    error EvidenceAlreadyRegistered(bytes32 evidenceId);
    error UnknownEvidence(bytes32 evidenceId);
    error EvidenceAlreadyConsumed(bytes32 evidenceId);

    event EvidenceRegistered(bytes32 indexed evidenceId, bytes32 indexed domainId, bytes32 indexed txHash, uint64 chainKey, uint256 blockHeight, uint32 eventIndex, bytes32 payloadHash, address gateway);
    event EvidenceConsumed(bytes32 indexed evidenceId, address indexed consumer);

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(GATEWAY_ROLE, admin);
        _grantRole(CONSUMER_ROLE, admin);
    }

    function computeEvidenceId(bytes32 domainId, uint64 chainKey, uint256 blockHeight, bytes32 txHash, uint32 eventIndex) public pure returns (bytes32) {
        return keccak256(abi.encode("CLEARA_EVIDENCE_V1", domainId, chainKey, blockHeight, txHash, eventIndex));
    }

    function registerEvidence(bytes32 domainId, uint64 chainKey, uint256 blockHeight, bytes32 txHash, uint32 eventIndex, bytes32 payloadHash) external onlyRole(GATEWAY_ROLE) returns (bytes32 evidenceId) {
        evidenceId = computeEvidenceId(domainId, chainKey, blockHeight, txHash, eventIndex);
        if (_records[evidenceId].evidenceId != bytes32(0)) revert EvidenceAlreadyRegistered(evidenceId);
        _records[evidenceId] = EvidenceRecord({
            evidenceId: evidenceId,
            domainId: domainId,
            chainKey: chainKey,
            blockHeight: blockHeight,
            txHash: txHash,
            eventIndex: eventIndex,
            payloadHash: payloadHash,
            gateway: msg.sender,
            recordedAt: uint64(block.timestamp),
            consumed: false
        });
        emit EvidenceRegistered(evidenceId, domainId, txHash, chainKey, blockHeight, eventIndex, payloadHash, msg.sender);
    }

    function consumeEvidence(bytes32 evidenceId) external onlyRole(CONSUMER_ROLE) {
        EvidenceRecord storage record = _records[evidenceId];
        if (record.evidenceId == bytes32(0)) revert UnknownEvidence(evidenceId);
        if (record.consumed) revert EvidenceAlreadyConsumed(evidenceId);
        record.consumed = true;
        emit EvidenceConsumed(evidenceId, msg.sender);
    }

    function getEvidence(bytes32 evidenceId) external view returns (EvidenceRecord memory record) {
        record = _records[evidenceId];
        if (record.evidenceId == bytes32(0)) revert UnknownEvidence(evidenceId);
    }
}
