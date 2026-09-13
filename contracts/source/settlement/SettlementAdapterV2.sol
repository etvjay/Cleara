// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/// @notice Testnet settlement adapter with a source-side, one-time obligation lock.
/// @dev The CC3 authority signs a bounded authorization. A source relay submits that
///      signature, and the debtor executes only the stored tuple. CC3 state is still
///      not readable from Sepolia; the signature is the explicit manual-relay boundary.
contract SettlementAdapterV2 is EIP712 {
    using SafeERC20 for IERC20;

    enum Status {
        NONE,
        AUTHORIZED,
        CONSUMED,
        CANCELLED
    }

    struct SettlementAuthorization {
        bytes32 obligationId;
        bytes32 settlementId;
        bytes32 residualId;
        address debtor;
        address creditor;
        bytes32 assetClassId;
        address token;
        uint256 amount;
        uint64 expiresAt;
        Status status;
    }

    bytes32 public constant SETTLEMENT_AUTHORIZATION_TYPEHASH = keccak256(
        "SettlementAuthorization(bytes32 obligationId,bytes32 settlementId,bytes32 residualId,address debtor,address creditor,bytes32 assetClassId,address token,uint256 amount,uint64 expiresAt)"
    );

    address public immutable authorizationAdmin;
    address public immutable authorizationSigner;
    address public immutable supportedToken;
    bytes32 public immutable supportedTokenCodeHash;

    mapping(bytes32 => SettlementAuthorization) private _authorizations;
    mapping(bytes32 => bytes32) public obligationBySettlementId;
    mapping(bytes32 => bytes32) public obligationByResidualId;

    error InvalidAuthorization();
    error UnauthorizedAuthorizationAdmin(address caller);
    error InvalidAuthorizationSignature();
    error AuthorizationAlreadyExists(bytes32 obligationId);
    error SettlementAlreadyBound(bytes32 settlementId, bytes32 obligationId);
    error ResidualAlreadyBound(bytes32 residualId, bytes32 obligationId);
    error UnknownAuthorization(bytes32 obligationId);
    error InvalidAuthorizationState(bytes32 obligationId, Status status);
    error UnauthorizedDebtor(address caller, address debtor);
    error AuthorizationExpired(bytes32 obligationId, uint64 expiresAt);
    error UnsupportedToken(address token);
    error InvalidTokenTransfer();

    event SettlementAuthorized(
        bytes32 indexed obligationId,
        bytes32 indexed settlementId,
        bytes32 indexed residualId,
        address debtor,
        address creditor,
        bytes32 assetClassId,
        address token,
        uint256 amount,
        uint64 expiresAt,
        address signer
    );
    event SettlementExecuted(
        bytes32 indexed obligationId,
        bytes32 indexed settlementId,
        bytes32 indexed residualId,
        address debtor,
        address creditor,
        bytes32 assetClassId,
        address token,
        uint256 amount,
        uint64 expiresAt
    );
    event SettlementAuthorizationCancelled(bytes32 indexed obligationId);

    constructor(address authorizationAdmin_, address authorizationSigner_, address supportedToken_)
        EIP712("Cleara Settlement Adapter", "2")
    {
        if (
            authorizationAdmin_ == address(0) || authorizationSigner_ == address(0)
                || authorizationAdmin_ == authorizationSigner_ || supportedToken_ == address(0)
                || supportedToken_.code.length == 0
        ) revert InvalidAuthorization();
        authorizationAdmin = authorizationAdmin_;
        authorizationSigner = authorizationSigner_;
        supportedToken = supportedToken_;
        supportedTokenCodeHash = supportedToken_.codehash;
    }

    function authorizationDigest(
        bytes32 obligationId,
        bytes32 settlementId,
        bytes32 residualId,
        address debtor,
        address creditor,
        bytes32 assetClassId,
        address token,
        uint256 amount,
        uint64 expiresAt
    ) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    SETTLEMENT_AUTHORIZATION_TYPEHASH,
                    obligationId,
                    settlementId,
                    residualId,
                    debtor,
                    creditor,
                    assetClassId,
                    token,
                    amount,
                    expiresAt
                )
            )
        );
    }

    function authorizeSettlement(
        bytes32 obligationId,
        bytes32 settlementId,
        bytes32 residualId,
        address debtor,
        address creditor,
        bytes32 assetClassId,
        address token,
        uint256 amount,
        uint64 expiresAt,
        bytes calldata signature
    ) external returns (bytes32) {
        if (
            obligationId == bytes32(0) || settlementId == bytes32(0) || residualId == bytes32(0)
                || debtor == address(0) || creditor == address(0) || debtor == creditor
                || assetClassId == bytes32(0) || token != supportedToken || token.codehash != supportedTokenCodeHash
                || amount == 0 || expiresAt <= block.timestamp
        ) revert InvalidAuthorization();
        if (ECDSA.recover(authorizationDigest(obligationId, settlementId, residualId, debtor, creditor, assetClassId, token, amount, expiresAt), signature) != authorizationSigner) {
            revert InvalidAuthorizationSignature();
        }
        if (_authorizations[obligationId].status != Status.NONE) {
            revert AuthorizationAlreadyExists(obligationId);
        }
        if (obligationBySettlementId[settlementId] != bytes32(0)) {
            revert SettlementAlreadyBound(settlementId, obligationBySettlementId[settlementId]);
        }
        if (obligationByResidualId[residualId] != bytes32(0)) {
            revert ResidualAlreadyBound(residualId, obligationByResidualId[residualId]);
        }

        _authorizations[obligationId] = SettlementAuthorization({
            obligationId: obligationId,
            settlementId: settlementId,
            residualId: residualId,
            debtor: debtor,
            creditor: creditor,
            assetClassId: assetClassId,
            token: token,
            amount: amount,
            expiresAt: expiresAt,
            status: Status.AUTHORIZED
        });
        obligationBySettlementId[settlementId] = obligationId;
        obligationByResidualId[residualId] = obligationId;
        emit SettlementAuthorized(
            obligationId,
            settlementId,
            residualId,
            debtor,
            creditor,
            assetClassId,
            token,
            amount,
            expiresAt,
            authorizationSigner
        );
        return obligationId;
    }

    function executeSettlement(bytes32 obligationId) external {
        SettlementAuthorization storage authorization = _authorizations[obligationId];
        if (authorization.status == Status.NONE) revert UnknownAuthorization(obligationId);
        if (authorization.status != Status.AUTHORIZED) {
            revert InvalidAuthorizationState(obligationId, authorization.status);
        }
        if (block.timestamp >= authorization.expiresAt) {
            revert AuthorizationExpired(obligationId, authorization.expiresAt);
        }
        if (msg.sender != authorization.debtor) {
            revert UnauthorizedDebtor(msg.sender, authorization.debtor);
        }
        if (authorization.token != supportedToken || authorization.token.codehash != supportedTokenCodeHash) {
            revert UnsupportedToken(authorization.token);
        }

        // Consume before the external token call. A reentrant token cannot reuse
        // the same obligation, and a failed token call reverts this state change.
        authorization.status = Status.CONSUMED;
        uint256 debtorBalanceBefore = IERC20(authorization.token).balanceOf(authorization.debtor);
        uint256 creditorBalanceBefore = IERC20(authorization.token).balanceOf(authorization.creditor);
        IERC20(authorization.token).safeTransferFrom(
            authorization.debtor, authorization.creditor, authorization.amount
        );
        uint256 debtorBalanceAfter = IERC20(authorization.token).balanceOf(authorization.debtor);
        uint256 creditorBalanceAfter = IERC20(authorization.token).balanceOf(authorization.creditor);
        if (
            debtorBalanceBefore < debtorBalanceAfter
                || debtorBalanceBefore - debtorBalanceAfter != authorization.amount
                || creditorBalanceAfter < creditorBalanceBefore
                || creditorBalanceAfter - creditorBalanceBefore != authorization.amount
        ) revert InvalidTokenTransfer();
        emit SettlementExecuted(
            authorization.obligationId,
            authorization.settlementId,
            authorization.residualId,
            authorization.debtor,
            authorization.creditor,
            authorization.assetClassId,
            authorization.token,
            authorization.amount,
            authorization.expiresAt
        );
    }

    function cancelSettlement(bytes32 obligationId) external {
        if (msg.sender != authorizationAdmin) revert UnauthorizedAuthorizationAdmin(msg.sender);
        SettlementAuthorization storage authorization = _authorizations[obligationId];
        if (authorization.status == Status.NONE) revert UnknownAuthorization(obligationId);
        if (authorization.status != Status.AUTHORIZED) {
            revert InvalidAuthorizationState(obligationId, authorization.status);
        }
        authorization.status = Status.CANCELLED;
        emit SettlementAuthorizationCancelled(obligationId);
    }

    function getAuthorization(bytes32 obligationId)
        external
        view
        returns (SettlementAuthorization memory authorization)
    {
        authorization = _authorizations[obligationId];
        if (authorization.status == Status.NONE) revert UnknownAuthorization(obligationId);
    }

    function canExecute(bytes32 obligationId) external view returns (bool) {
        SettlementAuthorization memory authorization = _authorizations[obligationId];
        return authorization.status == Status.AUTHORIZED && block.timestamp < authorization.expiresAt
            && authorization.token == supportedToken && authorization.token.codehash == supportedTokenCodeHash;
    }
}
