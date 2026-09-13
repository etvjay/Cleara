// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {SettlementAdapterV2} from "../../contracts/source/settlement/SettlementAdapterV2.sol";
import {MockERC20} from "../mocks/MockERC20.sol";

interface Vm {
    function addr(uint256 privateKey) external returns (address);
    function sign(uint256 privateKey, bytes32 digest) external returns (uint8 v, bytes32 r, bytes32 s);
    function warp(uint256 newTimestamp) external;
}

contract SettlementDebtorActor {
    function approve(MockERC20 token, SettlementAdapterV2 adapter, uint256 amount) external {
        token.approve(address(adapter), amount);
    }

    function execute(SettlementAdapterV2 adapter, bytes32 obligationId) external {
        adapter.executeSettlement(obligationId);
    }
}

contract NoOpERC20 {
    function balanceOf(address) external pure returns (uint256) {
        return 0;
    }

    function transferFrom(address, address, uint256) external {}
}

contract SettlementAdapterV2Test {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 internal constant SIGNER_KEY = 0xA11CE;

    SettlementAdapterV2 internal adapter;
    MockERC20 internal token;
    SettlementDebtorActor internal debtor;
    address internal signer;

    address internal creditor = address(0xB0B);
    bytes32 internal obligationId = keccak256("obligation");
    bytes32 internal settlementId = keccak256("settlement");
    bytes32 internal residualId = keccak256("residual");
    bytes32 internal assetClassId = keccak256("USD");
    uint256 internal amount = 340_000;

    function setUp() public {
        token = new MockERC20();
        signer = vm.addr(SIGNER_KEY);
        adapter = new SettlementAdapterV2(address(this), signer, address(token));
        debtor = new SettlementDebtorActor();
        token.mint(address(this), amount);
        token.mint(address(debtor), amount);
        token.approve(address(adapter), amount);
        debtor.approve(token, adapter, amount);
    }

    function testCanonicalAuthorizationExecutesExactlyOncePerObligation() public {
        uint64 expiresAt = uint64(block.timestamp + 1 days);
        _authorize(obligationId, settlementId, residualId, address(this), creditor, assetClassId, address(token), amount, expiresAt);

        uint256 debtorBefore = token.balanceOf(address(this));
        uint256 creditorBefore = token.balanceOf(creditor);
        adapter.executeSettlement(obligationId);

        require(token.balanceOf(address(this)) == debtorBefore - amount, "debtor balance mismatch");
        require(token.balanceOf(creditor) == creditorBefore + amount, "creditor balance mismatch");
        require(adapter.obligationBySettlementId(settlementId) == obligationId, "settlement link missing");
        require(adapter.obligationByResidualId(residualId) == obligationId, "residual link missing");
        require(
            uint8(adapter.getAuthorization(obligationId).status) == uint8(SettlementAdapterV2.Status.CONSUMED),
            "authorization not consumed"
        );

        (bool ok,) = address(adapter).call(abi.encodeCall(adapter.executeSettlement, (obligationId)));
        require(!ok, "duplicate settlement succeeded");
        require(token.balanceOf(creditor) == creditorBefore + amount, "duplicate moved value");
    }

    function testOnlyAuthorizedDebtorCanExecute() public {
        uint64 expiresAt = uint64(block.timestamp + 1 days);
        _authorize(obligationId, settlementId, residualId, address(debtor), creditor, assetClassId, address(token), amount, expiresAt);

        (bool unauthorized,) = address(adapter).call(abi.encodeCall(adapter.executeSettlement, (obligationId)));
        require(!unauthorized, "non-debtor executed settlement");
        debtor.execute(adapter, obligationId);
        require(token.balanceOf(creditor) == amount, "authorized debtor did not settle");
    }

    function testConflictingObligationSettlementAndResidualAreRejected() public {
        uint64 expiresAt = uint64(block.timestamp + 1 days);
        _authorize(obligationId, settlementId, residualId, address(this), creditor, assetClassId, address(token), amount, expiresAt);

        bytes32 secondSettlementId = keccak256("settlement-2");
        bytes32 secondResidualId = keccak256("residual-2");
        bytes memory sameObligationSignature = _signature(
            obligationId, secondSettlementId, secondResidualId, address(this), creditor, assetClassId, address(token), amount, expiresAt, SIGNER_KEY
        );
        (bool sameObligation,) = address(adapter).call(
            abi.encodeCall(
                adapter.authorizeSettlement,
                (obligationId, secondSettlementId, secondResidualId, address(this), creditor, assetClassId, address(token), amount, expiresAt, sameObligationSignature)
            )
        );
        require(!sameObligation, "same obligation reauthorized");

        bytes memory sameSettlementSignature = _signature(
            keccak256("obligation-2"), settlementId, keccak256("residual-3"), address(this), creditor, assetClassId, address(token), amount, expiresAt, SIGNER_KEY
        );
        (bool sameSettlement,) = address(adapter).call(
            abi.encodeCall(
                adapter.authorizeSettlement,
                (keccak256("obligation-2"), settlementId, keccak256("residual-3"), address(this), creditor, assetClassId, address(token), amount, expiresAt, sameSettlementSignature)
            )
        );
        require(!sameSettlement, "same settlement id reused");

        bytes memory sameResidualSignature = _signature(
            keccak256("obligation-3"), keccak256("settlement-3"), residualId, address(this), creditor, assetClassId, address(token), amount, expiresAt, SIGNER_KEY
        );
        (bool sameResidual,) = address(adapter).call(
            abi.encodeCall(
                adapter.authorizeSettlement,
                (keccak256("obligation-3"), keccak256("settlement-3"), residualId, address(this), creditor, assetClassId, address(token), amount, expiresAt, sameResidualSignature)
            )
        );
        require(!sameResidual, "same residual id reused");
    }

    function testInvalidSignerAndMutatedFieldsAreRejected() public {
        uint64 expiresAt = uint64(block.timestamp + 1 days);
        bytes memory wrongSigner = _signature(
            obligationId, settlementId, residualId, address(this), creditor, assetClassId, address(token), amount, expiresAt, 0xBEEF
        );
        (bool wrongSignerOk,) = address(adapter).call(
            abi.encodeCall(
                adapter.authorizeSettlement,
                (obligationId, settlementId, residualId, address(this), creditor, assetClassId, address(token), amount, expiresAt, wrongSigner)
            )
        );
        require(!wrongSignerOk, "wrong signer authorized");

        bytes memory originalAmountSignature = _signature(
            obligationId, settlementId, residualId, address(this), creditor, assetClassId, address(token), amount, expiresAt, SIGNER_KEY
        );
        (bool mutatedAmountOk,) = address(adapter).call(
            abi.encodeCall(
                adapter.authorizeSettlement,
                (obligationId, settlementId, residualId, address(this), creditor, assetClassId, address(token), amount + 1, expiresAt, originalAmountSignature)
            )
        );
        require(!mutatedAmountOk, "mutated economics authorized");
    }

    function testPinnedTokenAndCancelPreventAlternateReuse() public {
        uint64 expiresAt = uint64(block.timestamp + 1 days);
        MockERC20 alternateToken = new MockERC20();
        bytes memory alternateTokenSignature = _signature(
            obligationId, settlementId, residualId, address(this), creditor, assetClassId, address(alternateToken), amount, expiresAt, SIGNER_KEY
        );
        (bool alternateTokenOk,) = address(adapter).call(
            abi.encodeCall(
                adapter.authorizeSettlement,
                (obligationId, settlementId, residualId, address(this), creditor, assetClassId, address(alternateToken), amount, expiresAt, alternateTokenSignature)
            )
        );
        require(!alternateTokenOk, "alternate token authorized");

        _authorize(obligationId, settlementId, residualId, address(this), creditor, assetClassId, address(token), amount, expiresAt);
        adapter.cancelSettlement(obligationId);
        bytes memory cancelledSignature = _signature(
            obligationId, settlementId, residualId, address(this), creditor, assetClassId, address(token), amount, expiresAt, SIGNER_KEY
        );
        (bool cancelledReuseOk,) = address(adapter).call(
            abi.encodeCall(
                adapter.authorizeSettlement,
                (obligationId, settlementId, residualId, address(this), creditor, assetClassId, address(token), amount, expiresAt, cancelledSignature)
            )
        );
        require(!cancelledReuseOk, "cancelled obligation reauthorized");
    }

    function testNoOpTokenCannotClaimSettlement() public {
        NoOpERC20 noOpToken = new NoOpERC20();
        SettlementAdapterV2 noOpAdapter = new SettlementAdapterV2(address(this), signer, address(noOpToken));
        uint64 expiresAt = uint64(block.timestamp + 1 days);
        bytes memory signature = _signatureFor(
            noOpAdapter,
            obligationId,
            settlementId,
            residualId,
            address(this),
            creditor,
            assetClassId,
            address(noOpToken),
            amount,
            expiresAt,
            SIGNER_KEY
        );
        noOpAdapter.authorizeSettlement(
            obligationId,
            settlementId,
            residualId,
            address(this),
            creditor,
            assetClassId,
            address(noOpToken),
            amount,
            expiresAt,
            signature
        );
        (bool ok,) = address(noOpAdapter).call(abi.encodeCall(noOpAdapter.executeSettlement, (obligationId)));
        require(!ok, "no-op token passed economic transfer gate");
        require(
            uint8(noOpAdapter.getAuthorization(obligationId).status) == uint8(SettlementAdapterV2.Status.AUTHORIZED),
            "failed token transfer consumed authorization"
        );
    }

    function testExpiredAuthorizationCannotExecute() public {
        uint64 expiresAt = uint64(block.timestamp + 1);
        _authorize(obligationId, settlementId, residualId, address(this), creditor, assetClassId, address(token), amount, expiresAt);
        vm.warp(uint256(expiresAt));

        (bool ok,) = address(adapter).call(abi.encodeCall(adapter.executeSettlement, (obligationId)));
        require(!ok, "expired settlement executed");
        require(token.balanceOf(creditor) == 0, "expired settlement moved value");
    }

    function _authorize(
        bytes32 authObligationId,
        bytes32 authSettlementId,
        bytes32 authResidualId,
        address debtorAddress,
        address creditorAddress,
        bytes32 authAssetClassId,
        address tokenAddress,
        uint256 authAmount,
        uint64 expiresAt
    ) internal {
        adapter.authorizeSettlement(
            authObligationId,
            authSettlementId,
            authResidualId,
            debtorAddress,
            creditorAddress,
            authAssetClassId,
            tokenAddress,
            authAmount,
            expiresAt,
            _signature(
                authObligationId,
                authSettlementId,
                authResidualId,
                debtorAddress,
                creditorAddress,
                authAssetClassId,
                tokenAddress,
                authAmount,
                expiresAt,
                SIGNER_KEY
            )
        );
    }

    function _signature(
        bytes32 authObligationId,
        bytes32 authSettlementId,
        bytes32 authResidualId,
        address debtorAddress,
        address creditorAddress,
        bytes32 authAssetClassId,
        address tokenAddress,
        uint256 authAmount,
        uint64 expiresAt,
        uint256 privateKey
    ) internal returns (bytes memory) {
        return _signatureFor(
            adapter,
            authObligationId,
            authSettlementId,
            authResidualId,
            debtorAddress,
            creditorAddress,
            authAssetClassId,
            tokenAddress,
            authAmount,
            expiresAt,
            privateKey
        );
    }

    function _signatureFor(
        SettlementAdapterV2 targetAdapter,
        bytes32 authObligationId,
        bytes32 authSettlementId,
        bytes32 authResidualId,
        address debtorAddress,
        address creditorAddress,
        bytes32 authAssetClassId,
        address tokenAddress,
        uint256 authAmount,
        uint64 expiresAt,
        uint256 privateKey
    ) internal returns (bytes memory signature) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            privateKey,
            targetAdapter.authorizationDigest(
                authObligationId,
                authSettlementId,
                authResidualId,
                debtorAddress,
                creditorAddress,
                authAssetClassId,
                tokenAddress,
                authAmount,
                expiresAt
            )
        );
        signature = abi.encodePacked(r, s, v);
    }
}
