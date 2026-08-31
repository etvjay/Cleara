import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  AbiCoder,
  Contract,
  ContractFactory,
  JsonRpcProvider,
  Wallet,
  encodeBytes32String,
  keccak256,
  parseEther,
  toUtf8Bytes,
} from 'ethers';
import { proofProvider } from '@gluwa/usc-sdk';

const SEPOLIA_CHAIN_ID = 11155111n;
const CC3_CHAIN_ID = 102031n;
const SOURCE_CHAIN_KEY = 1;
const BLOCK_PROVER = '0x0000000000000000000000000000000000000FD2';
const PROVIDER_A = '0x8766760e375bD43f600D23C40aDCeeDD62a60e2b';
const sepoliaRpc = process.env.SEPOLIA_RPC_HTTP ?? 'https://ethereum-sepolia-rpc.publicnode.com';
const cc3Rpc = process.env.CREDITCOIN_RPC_HTTP ?? 'https://rpc.cc3-testnet.creditcoin.network';
const proofBuilderUrl =
  process.env.ATTESTCOIN_PROOF_BUILDER_URL ?? 'https://prover.cc3-testnet.creditcoin.network/';
const sepoliaKey = required('SEPOLIA_DEPLOYER_PRIVATE_KEY');
const cc3Key = required('CC3_DEPLOYER_PRIVATE_KEY');
const evidencePath = process.env.EVIDENCE_PATH ?? 'evidence/runtime/m11-settlement.json';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing required environment variable ${name}`);
  return value;
}

function artifact(path: string): { abi: any[]; bytecode: string } {
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  const object = parsed.bytecode?.object;
  if (!object || object === '0x') throw new Error(`artifact ${path} has no creation bytecode`);
  return { abi: parsed.abi, bytecode: object.startsWith('0x') ? object : `0x${object}` };
}

async function deploy(wallet: Wallet, path: string, args: unknown[] = []): Promise<Contract> {
  const built = artifact(path);
  const contract = await new ContractFactory(built.abi, built.bytecode, wallet).deploy(...args);
  await contract.waitForDeployment();
  return contract;
}

async function buildProof(txHash: string, blockNumber: number): Promise<any> {
  const builder = new proofProvider.service.ProofBuilder(SOURCE_CHAIN_KEY, proofBuilderUrl);
  await builder.waitUntilHeightAttested(SOURCE_CHAIN_KEY, blockNumber, 15_000, 1_800_000);
  const result = await builder.getProof(txHash);
  if (!result.success || !result.data) throw new Error(`proof generation failed: ${result.error ?? 'unknown'}`);
  return result.data;
}

function asProof(proof: any): any {
  return {
    chainKey: Number(proof.chainKey),
    blockHeight: Number(proof.headerNumber),
    encodedTransaction: proof.txBytes,
    merkleRoot: proof.merkleProof.root,
    siblings: proof.merkleProof.siblings.map((entry: any) => ({ hash: entry.hash, isLeft: entry.isLeft })),
    lowerEndpointDigest: proof.continuityProof.lowerEndpointDigest,
    continuityRoots: proof.continuityProof.roots,
  };
}

async function expectRevert(action: () => Promise<unknown>): Promise<string> {
  try {
    await action();
  } catch (error: any) {
    return error?.shortMessage ?? error?.reason ?? error?.message ?? String(error);
  }
  throw new Error('expected revert but call succeeded');
}

function json(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v), 2);
}

async function main(): Promise<void> {
  const checkedAt = new Date().toISOString();
  const sepoliaProvider = new JsonRpcProvider(sepoliaRpc);
  const cc3Provider = new JsonRpcProvider(cc3Rpc);
  if ((await sepoliaProvider.getNetwork()).chainId !== SEPOLIA_CHAIN_ID) throw new Error('Sepolia chain mismatch');
  if ((await cc3Provider.getNetwork()).chainId !== CC3_CHAIN_ID) throw new Error('CC3 chain mismatch');

  const sourceWallet = new Wallet(sepoliaKey, sepoliaProvider);
  const cc3Wallet = new Wallet(cc3Key, cc3Provider);
  const debtorWallet = new Wallet(cc3Key, sepoliaProvider);
  if (debtorWallet.address.toLowerCase() !== cc3Wallet.address.toLowerCase()) {
    throw new Error('cross-chain debtor identity mismatch');
  }
  if ((await sepoliaProvider.getBalance(sourceWallet.address)) === 0n) throw new Error('Sepolia deployer has zero balance');
  if ((await cc3Provider.getBalance(cc3Wallet.address)) === 0n) throw new Error('CC3 deployer has zero balance');

  const debtorGasFloor = parseEther('0.003');
  const debtorBalance = await sepoliaProvider.getBalance(debtorWallet.address);
  let debtorFundingTxHash: string | null = null;
  if (debtorBalance < debtorGasFloor && sourceWallet.address.toLowerCase() !== debtorWallet.address.toLowerCase()) {
    const fundingTx = await sourceWallet.sendTransaction({ to: debtorWallet.address, value: parseEther('0.006') });
    const fundingReceipt = await fundingTx.wait();
    if (!fundingReceipt || fundingReceipt.status !== 1) throw new Error('debtor gas funding failed');
    debtorFundingTxHash = fundingTx.hash;
  }
  if ((await sepoliaProvider.getBalance(debtorWallet.address)) === 0n) throw new Error('Sepolia debtor has zero gas balance');

  const sourceBlock = await sepoliaProvider.getBlock('latest');
  const cc3Block = await cc3Provider.getBlock('latest');
  if (!sourceBlock || !cc3Block) throw new Error('latest block unavailable');
  const baseTimestamp = Math.max(sourceBlock.timestamp, cc3Block.timestamp);

  // Source-side contracts. The mock token is testnet-only evidence infrastructure.
  const token = await deploy(sourceWallet, 'out/MockERC20.sol/MockERC20.json');
  const commitmentVault = await deploy(sourceWallet, 'out/CapitalCommitmentVault.sol/CapitalCommitmentVault.json', [
    sourceWallet.address,
  ]);
  const settlementAdapter = await deploy(sourceWallet, 'out/SettlementAdapter.sol/SettlementAdapter.json');

  // Fresh CC3 prerequisite stack. The prior M7 capitalization horizon has expired; M11 does not reuse stale capital.
  const domainRegistry = await deploy(cc3Wallet, 'out/DomainRegistry.sol/DomainRegistry.json', [cc3Wallet.address]);
  const assetRegistry = await deploy(cc3Wallet, 'out/AssetRegistry.sol/AssetRegistry.json', [cc3Wallet.address]);
  const evidenceRegistry = await deploy(cc3Wallet, 'out/EvidenceRegistry.sol/EvidenceRegistry.json', [cc3Wallet.address]);
  const claimRegistry = await deploy(cc3Wallet, 'out/ClaimRegistry.sol/ClaimRegistry.json', [cc3Wallet.address]);
  const encumbranceRegistry = await deploy(cc3Wallet, 'out/EncumbranceRegistry.sol/EncumbranceRegistry.json', [
    cc3Wallet.address,
    await claimRegistry.getAddress(),
  ]);
  const facilityManager = await deploy(cc3Wallet, 'out/FacilityManager.sol/FacilityManager.json', [
    cc3Wallet.address,
    await encumbranceRegistry.getAddress(),
  ]);
  const allocationManager = await deploy(cc3Wallet, 'out/AllocationManager.sol/AllocationManager.json', [
    cc3Wallet.address,
    await facilityManager.getAddress(),
  ]);
  const commitmentRegistry = await deploy(cc3Wallet, 'out/CommitmentRegistry.sol/CommitmentRegistry.json', [
    cc3Wallet.address,
  ]);
  const capitalizationManager = await deploy(cc3Wallet, 'out/CapitalizationManager.sol/CapitalizationManager.json', [
    cc3Wallet.address,
    await facilityManager.getAddress(),
    await allocationManager.getAddress(),
    await commitmentRegistry.getAddress(),
  ]);

  await (
    await claimRegistry.grantRole(await claimRegistry.ENCUMBRANCE_ROLE(), await encumbranceRegistry.getAddress())
  ).wait();
  await (
    await encumbranceRegistry.grantRole(await encumbranceRegistry.FACILITY_ROLE(), await facilityManager.getAddress())
  ).wait();
  await (
    await facilityManager.grantRole(await facilityManager.FACILITY_MANAGER_ROLE(), await allocationManager.getAddress())
  ).wait();
  await (await allocationManager.grantRole(await allocationManager.COMMITMENT_GATEWAY_ROLE(), cc3Wallet.address)).wait();
  await (await commitmentRegistry.grantRole(await commitmentRegistry.COMMITMENT_GATEWAY_ROLE(), cc3Wallet.address)).wait();
  await (await facilityManager.bindCapitalizationManager(await capitalizationManager.getAddress())).wait();

  const coder = AbiCoder.defaultAbiCoder();
  const environmentId = keccak256(toUtf8Bytes('CC3_TESTNET'));
  const sourceDomainId = keccak256(
    coder.encode(['string', 'bytes32', 'uint256'], ['CLEARA_DOMAIN_V1', environmentId, SEPOLIA_CHAIN_ID]),
  );
  const denomination = encodeBytes32String('USD');
  const policyNamespace = keccak256(toUtf8Bytes('CLEARA_M11_USD_POLICY_V1'));
  const assetClassId = keccak256(
    coder.encode(
      ['string', 'bytes32', 'uint8', 'bytes32'],
      ['CLEARA_ASSET_CLASS_V1', denomination, 18, policyNamespace],
    ),
  );

  await (
    await domainRegistry.configureDomain([
      sourceDomainId,
      SOURCE_CHAIN_KEY,
      SEPOLIA_CHAIN_ID,
      true,
      false,
      true,
      false,
      true,
      true,
      1,
      true,
    ])
  ).wait();
  await (await assetRegistry.configureAssetClass([assetClassId, denomination, 18, policyNamespace, true])).wait();
  const representationId = await assetRegistry.computeRepresentationId(
    assetClassId,
    sourceDomainId,
    await token.getAddress(),
  );
  await (
    await assetRegistry.configureRepresentation([
      representationId,
      assetClassId,
      sourceDomainId,
      await token.getAddress(),
      18,
      true,
    ])
  ).wait();

  const targetAmount = 1_000_000n;
  const residualAmount = 340_000n;
  const totalMint = targetAmount + residualAmount;
  const claimMaturity = BigInt(baseTimestamp + 30 * 24 * 60 * 60);
  const facilityOpensAt = BigInt(baseTimestamp);
  const facilityClosesAt = BigInt(baseTimestamp + 2 * 24 * 60 * 60);
  const encumbranceExpiresAt = BigInt(baseTimestamp + 2 * 24 * 60 * 60);
  const allocationExpiresAt = BigInt(baseTimestamp + 36 * 60 * 60);
  const commitmentExpiresAt = BigInt(baseTimestamp + 24 * 60 * 60);
  const capitalRequiredUntil = BigInt(baseTimestamp + 12 * 60 * 60);

  // Explicit prerequisite fixture: current financing state is created fresh on CC3. M11 does not claim this fixture
  // re-proves M3-M7 Attestcoin semantics; those milestones are separately evidenced.
  const claimId = await claimRegistry.registerVerifiedClaim.staticCall(
    sourceDomainId,
    await commitmentVault.getAddress(),
    1n,
    cc3Wallet.address,
    PROVIDER_A,
    assetClassId,
    targetAmount,
    claimMaturity,
    keccak256(toUtf8Bytes('M11_PREREQUISITE_CLAIM_SOURCE')),
    keccak256(toUtf8Bytes('M11_PREREQUISITE_CLAIM_EVIDENCE')),
  );
  await (
    await claimRegistry.registerVerifiedClaim(
      sourceDomainId,
      await commitmentVault.getAddress(),
      1n,
      cc3Wallet.address,
      PROVIDER_A,
      assetClassId,
      targetAmount,
      claimMaturity,
      keccak256(toUtf8Bytes('M11_PREREQUISITE_CLAIM_SOURCE')),
      keccak256(toUtf8Bytes('M11_PREREQUISITE_CLAIM_EVIDENCE')),
    )
  ).wait();
  await (
    await claimRegistry.setFinanceableCapacity(
      claimId,
      targetAmount,
      keccak256(toUtf8Bytes('M11_FINANCEABILITY_POLICY')),
      keccak256(toUtf8Bytes('M11_FINANCEABILITY_DECISION')),
    )
  ).wait();

  const facilityPolicy = keccak256(toUtf8Bytes('M11_FACILITY_POLICY'));
  const facilityId = await facilityManager.createFacility.staticCall(
    assetClassId,
    targetAmount,
    facilityOpensAt,
    facilityClosesAt,
    facilityPolicy,
  );
  await (
    await facilityManager.createFacility(
      assetClassId,
      targetAmount,
      facilityOpensAt,
      facilityClosesAt,
      facilityPolicy,
    )
  ).wait();
  await (await facilityManager.verifyFacility(facilityId)).wait();
  await (await facilityManager.openFacility(facilityId)).wait();

  const encumbranceId = await encumbranceRegistry.createEncumbrance.staticCall(
    claimId,
    facilityId,
    cc3Wallet.address,
    targetAmount,
    encumbranceExpiresAt,
  );
  await (
    await encumbranceRegistry.createEncumbrance(
      claimId,
      facilityId,
      cc3Wallet.address,
      targetAmount,
      encumbranceExpiresAt,
    )
  ).wait();
  await (await facilityManager.bindEncumbrance(facilityId, encumbranceId)).wait();
  await (await facilityManager.beginAllocating(facilityId)).wait();

  const allocationId = await allocationManager.proposeAllocation.staticCall(
    facilityId,
    debtorWallet.address,
    targetAmount,
    allocationExpiresAt,
  );
  await (
    await allocationManager.proposeAllocation(
      facilityId,
      debtorWallet.address,
      targetAmount,
      allocationExpiresAt,
    )
  ).wait();
  await (await allocationManager.activateAllocation(allocationId)).wait();

  // Make the prerequisite capital constraint real on Sepolia even though M11 is not using this commit tx as its proof target.
  await (await token.mint(debtorWallet.address, totalMint)).wait();
  const tokenAsDebtor = token.connect(debtorWallet) as Contract;
  const vaultAsDebtor = commitmentVault.connect(debtorWallet) as Contract;
  await (await tokenAsDebtor.approve(await commitmentVault.getAddress(), targetAmount)).wait();
  const sourceCommitmentId = await commitmentVault.computeSourceCommitmentId(
    facilityId,
    allocationId,
    debtorWallet.address,
    0n,
  );
  const commitmentTx = await vaultAsDebtor.commit(
    facilityId,
    allocationId,
    assetClassId,
    await token.getAddress(),
    targetAmount,
    commitmentExpiresAt,
  );
  const commitmentReceipt = await commitmentTx.wait();
  if (!commitmentReceipt || commitmentReceipt.status !== 1) throw new Error('prerequisite source capital lock failed');
  if ((await token.balanceOf(await commitmentVault.getAddress())) !== targetAmount) {
    throw new Error('prerequisite vault balance mismatch');
  }
  if ((await token.balanceOf(debtorWallet.address)) !== residualAmount) {
    throw new Error('debtor did not retain exact residual settlement balance');
  }

  const commitmentId = await commitmentRegistry.registerActiveCommitment.staticCall(
    sourceCommitmentId,
    sourceDomainId,
    await commitmentVault.getAddress(),
    facilityId,
    allocationId,
    debtorWallet.address,
    assetClassId,
    await token.getAddress(),
    targetAmount,
    commitmentExpiresAt,
    keccak256(toUtf8Bytes('M11_PREREQUISITE_COMMITMENT_REGISTRATION')),
  );
  await (
    await commitmentRegistry.registerActiveCommitment(
      sourceCommitmentId,
      sourceDomainId,
      await commitmentVault.getAddress(),
      facilityId,
      allocationId,
      debtorWallet.address,
      assetClassId,
      await token.getAddress(),
      targetAmount,
      commitmentExpiresAt,
      keccak256(toUtf8Bytes('M11_PREREQUISITE_COMMITMENT_REGISTRATION')),
    )
  ).wait();
  await (await allocationManager.recognizeCommitment(allocationId, debtorWallet.address, targetAmount)).wait();
  await (await facilityManager.beginCapitalizing(facilityId)).wait();
  const sealTx = await capitalizationManager.sealCapitalization(facilityId, capitalRequiredUntil, [commitmentId]);
  const sealReceipt = await sealTx.wait();
  if (!sealReceipt || sealReceipt.status !== 1) throw new Error('fresh capitalization seal failed');
  const facility = await facilityManager.getFacility(facilityId);
  if (Number(facility.status) !== 6) throw new Error('fresh fixture facility not CAPITALIZED');
  if (facility.capitalRequiredUntil <= BigInt(baseTimestamp)) throw new Error('fresh capital horizon invalid');

  // M11-capable obligations/clearing/residual/settlement stack.
  const obligations = await deploy(cc3Wallet, 'out/ObligationLedger.sol/ObligationLedger.json', [
    cc3Wallet.address,
    await facilityManager.getAddress(),
  ]);
  const clearingPolicies = await deploy(cc3Wallet, 'out/ClearingPolicyRegistry.sol/ClearingPolicyRegistry.json', [
    cc3Wallet.address,
  ]);
  const clearing = await deploy(cc3Wallet, 'out/ClearingEngine.sol/ClearingEngine.json', [
    cc3Wallet.address,
    await obligations.getAddress(),
    await clearingPolicies.getAddress(),
  ]);
  const residuals = await deploy(cc3Wallet, 'out/ResidualLedger.sol/ResidualLedger.json', [
    cc3Wallet.address,
    await clearing.getAddress(),
  ]);
  const router = await deploy(cc3Wallet, 'out/SettlementRouter.sol/SettlementRouter.json', [
    cc3Wallet.address,
    await residuals.getAddress(),
    await domainRegistry.getAddress(),
    await assetRegistry.getAddress(),
  ]);
  const reconciler = await deploy(cc3Wallet, 'out/SettlementReconciler.sol/SettlementReconciler.json', [
    cc3Wallet.address,
    await residuals.getAddress(),
    await router.getAddress(),
    await evidenceRegistry.getAddress(),
  ]);
  const settlementAsc = await deploy(cc3Wallet, 'out/SettlementASC.sol/SettlementASC.json', [
    BLOCK_PROVER,
    await domainRegistry.getAddress(),
    await assetRegistry.getAddress(),
    await evidenceRegistry.getAddress(),
    await router.getAddress(),
    await reconciler.getAddress(),
    SOURCE_CHAIN_KEY,
    sourceDomainId,
    await settlementAdapter.getAddress(),
  ]);

  await (await obligations.bindClearingEngine(await clearing.getAddress())).wait();
  await (await residuals.bindSettlementRouter(await router.getAddress())).wait();
  await (await residuals.bindSettlementReconciler(await reconciler.getAddress())).wait();
  await (await obligations.bindSettlementReconciler(await reconciler.getAddress())).wait();
  await (await reconciler.bindSettlementASC(await settlementAsc.getAddress())).wait();
  await (await evidenceRegistry.grantRole(await evidenceRegistry.GATEWAY_ROLE(), await settlementAsc.getAddress())).wait();
  await (await evidenceRegistry.grantRole(await evidenceRegistry.CONSUMER_ROLE(), await reconciler.getAddress())).wait();

  const adapterId = await router.configureAdapter.staticCall(sourceDomainId, await settlementAdapter.getAddress(), true);
  await (await router.configureAdapter(sourceDomainId, await settlementAdapter.getAddress(), true)).wait();

  const maturity = BigInt(baseTimestamp + 6 * 60 * 60);
  const obligationPolicy = keccak256(toUtf8Bytes('M11_OBLIGATION_POLICY'));
  const drawdownId = await obligations.createObligation.staticCall(
    facilityId,
    cc3Wallet.address,
    PROVIDER_A,
    assetClassId,
    400_000n,
    maturity,
    obligationPolicy,
    keccak256(toUtf8Bytes('M11_SPONSOR_TO_PROVIDER_A_400K')),
    1,
  );
  await (
    await obligations.createObligation(
      facilityId,
      cc3Wallet.address,
      PROVIDER_A,
      assetClassId,
      400_000n,
      maturity,
      obligationPolicy,
      keccak256(toUtf8Bytes('M11_SPONSOR_TO_PROVIDER_A_400K')),
      1,
    )
  ).wait();
  await (await obligations.finalizeObligation(drawdownId)).wait();

  const feeId = await obligations.createObligation.staticCall(
    facilityId,
    PROVIDER_A,
    cc3Wallet.address,
    assetClassId,
    60_000n,
    maturity,
    obligationPolicy,
    keccak256(toUtf8Bytes('M11_PROVIDER_A_TO_SPONSOR_60K')),
    4,
  );
  await (
    await obligations.createObligation(
      facilityId,
      PROVIDER_A,
      cc3Wallet.address,
      assetClassId,
      60_000n,
      maturity,
      obligationPolicy,
      keccak256(toUtf8Bytes('M11_PROVIDER_A_TO_SPONSOR_60K')),
      4,
    )
  ).wait();
  await (await obligations.finalizeObligation(feeId)).wait();

  const compatibilityHash = keccak256(toUtf8Bytes('M11_BILATERAL_COMPATIBILITY_ASSERTION'));
  const clearingPolicyId = await clearingPolicies.configurePolicy.staticCall(assetClassId, compatibilityHash, 1);
  await (await clearingPolicies.configurePolicy(assetClassId, compatibilityHash, 1)).wait();
  await (await obligations.authorizeClearing(drawdownId, clearingPolicyId)).wait();
  await (await obligations.authorizeClearing(feeId, clearingPolicyId)).wait();

  const epochId = await clearing.openEpoch.staticCall(clearingPolicyId, assetClassId);
  await (await clearing.openEpoch(clearingPolicyId, assetClassId)).wait();
  await (await clearing.sealBilateral(epochId, drawdownId, feeId)).wait();
  await (await clearing.computeBilateral(epochId)).wait();
  await (await clearing.finalizeBilateral(epochId)).wait();
  const epoch = await clearing.getEpoch(epochId);
  if (epoch.grossBefore !== 460_000n || epoch.clearingAmount !== 60_000n || epoch.grossAfter !== residualAmount) {
    throw new Error('M11 prerequisite clearing economics mismatch');
  }

  const residualId = await residuals.createBilateralResidual.staticCall(epochId);
  await (await residuals.createBilateralResidual(epochId)).wait();
  const residualBeforeRoute = await residuals.getResidual(residualId);
  if (
    residualBeforeRoute.debtor.toLowerCase() !== cc3Wallet.address.toLowerCase() ||
    residualBeforeRoute.creditor.toLowerCase() !== PROVIDER_A.toLowerCase() ||
    residualBeforeRoute.amount !== residualAmount
  ) {
    throw new Error('M11 residual direction/amount mismatch');
  }

  const routeDataHash = keccak256(
    coder.encode(
      ['string', 'address', 'address', 'bytes32', 'address', 'uint256'],
      [
        'CLEARA_ROUTE_V1',
        cc3Wallet.address,
        PROVIDER_A,
        assetClassId,
        await token.getAddress(),
        residualAmount,
      ],
    ),
  );
  const settlementId = await router.routeResidual.staticCall(
    residualId,
    adapterId,
    sourceDomainId,
    representationId,
    routeDataHash,
  );
  const routeTx = await router.routeResidual(
    residualId,
    adapterId,
    sourceDomainId,
    representationId,
    routeDataHash,
  );
  const routeReceipt = await routeTx.wait();
  if (!routeReceipt || routeReceipt.status !== 1) throw new Error('M11 route failed');
  if ((await obligations.getObligation(drawdownId)).settledAmount !== 0n) throw new Error('routing settled value');

  // Exact source settlement. The CC3 residual debtor is the Sepolia token payer.
  await (await tokenAsDebtor.approve(await settlementAdapter.getAddress(), residualAmount)).wait();
  const adapterAsDebtor = settlementAdapter.connect(debtorWallet) as Contract;
  const creditorBefore = await token.balanceOf(PROVIDER_A);
  const debtorBeforeSettlement = await token.balanceOf(debtorWallet.address);
  if (debtorBeforeSettlement !== residualAmount) throw new Error('debtor source balance is not exact residual');

  const settlementTx = await adapterAsDebtor.executeSettlement(
    settlementId,
    residualId,
    PROVIDER_A,
    assetClassId,
    await token.getAddress(),
    residualAmount,
  );
  const settlementReceipt = await settlementTx.wait();
  if (!settlementReceipt || settlementReceipt.status !== 1) throw new Error('Sepolia settlement execution failed');
  const creditorAfter = await token.balanceOf(PROVIDER_A);
  const debtorAfterSettlement = await token.balanceOf(debtorWallet.address);
  if (creditorAfter - creditorBefore !== residualAmount) throw new Error('creditor did not receive exact residual');
  if (debtorAfterSettlement !== 0n) throw new Error('debtor retained settlement tokens');

  const rawProof = await buildProof(settlementTx.hash, settlementReceipt.blockNumber);
  const proof = asProof(rawProof);
  const acceptTx = await settlementAsc.acceptAttestedSettlement(proof);
  const acceptReceipt = await acceptTx.wait();
  if (!acceptReceipt || acceptReceipt.status !== 1) throw new Error('CC3 settlement acceptance failed');

  let settlementEvidenceId: string | undefined;
  for (const log of acceptReceipt.logs) {
    try {
      const parsed = settlementAsc.interface.parseLog(log);
      if (parsed?.name === 'SettlementAccepted') settlementEvidenceId = parsed.args.evidenceId;
    } catch {}
  }
  if (!settlementEvidenceId) throw new Error('SettlementAccepted event missing');

  const residualAfter = await residuals.getResidual(residualId);
  const drawdownAfter = await obligations.getObligation(drawdownId);
  const feeAfter = await obligations.getObligation(feeId);
  const settlementEvidence = await evidenceRegistry.getEvidence(settlementEvidenceId);
  if (Number(residualAfter.status) !== 4) throw new Error(`residual not SETTLED: ${residualAfter.status}`);
  if (Number(drawdownAfter.status) !== 8) throw new Error(`source obligation not SETTLED: ${drawdownAfter.status}`);
  if (drawdownAfter.clearedAmount !== 60_000n || drawdownAfter.settledAmount !== residualAmount) {
    throw new Error('drawdown final accounting mismatch');
  }
  if ((await obligations.remainingAmount(drawdownId)) !== 0n) throw new Error('settled obligation has remainder');
  if (feeAfter.settledAmount !== 0n || (await obligations.remainingAmount(feeId)) !== 0n) {
    throw new Error('extinguished reciprocal fee accounting drifted');
  }
  if (!settlementEvidence.consumed) throw new Error('settlement evidence not consumed');
  if (!(await reconciler.reconciledSettlement(settlementId))) throw new Error('settlement replay lock missing');

  const replayRejected = await expectRevert(async () => {
    const tx = await settlementAsc.acceptAttestedSettlement(proof);
    await tx.wait();
  });
  const wrongChainRejected = await expectRevert(async () => {
    const tx = await settlementAsc.acceptAttestedSettlement({ ...proof, chainKey: 3 });
    await tx.wait();
  });

  const latestCc3 = await cc3Provider.getBlock('latest');
  const evidence = {
    status: 'PASS',
    checkedAt,
    networks: {
      sepolia: { chainId: SEPOLIA_CHAIN_ID, deployer: sourceWallet.address, debtor: debtorWallet.address },
      cc3: { chainId: CC3_CHAIN_ID, sponsorAndDebtor: cc3Wallet.address, blockTimestamp: latestCc3?.timestamp ?? null },
    },
    identityContinuity: {
      cc3ResidualDebtor: cc3Wallet.address,
      sepoliaSettlementPayer: debtorWallet.address,
      sameAddress: cc3Wallet.address.toLowerCase() === debtorWallet.address.toLowerCase(),
    },
    sourceContracts: {
      token: await token.getAddress(),
      capitalCommitmentVault: await commitmentVault.getAddress(),
      settlementAdapter: await settlementAdapter.getAddress(),
    },
    prerequisiteFixture: {
      note: 'Fresh current-capital prerequisite for M11. The source capital is actually locked on Sepolia, but this commitment registration is not the M11 Attestcoin proof target and does not replace prior M6/M7 evidence.',
      claimId,
      facilityId,
      encumbranceId,
      allocationId,
      sourceCommitmentId,
      commitmentId,
      targetAmount,
      capitalRequiredUntil,
      capitalizationRoot: facility.capitalizationRoot,
      commitmentTxHash: commitmentTx.hash,
      commitmentBlockNumber: commitmentReceipt.blockNumber,
      sourceVaultBalance: await token.balanceOf(await commitmentVault.getAddress()),
    },
    creditcoinContracts: {
      domainRegistry: await domainRegistry.getAddress(),
      assetRegistry: await assetRegistry.getAddress(),
      evidenceRegistry: await evidenceRegistry.getAddress(),
      claimRegistry: await claimRegistry.getAddress(),
      encumbranceRegistry: await encumbranceRegistry.getAddress(),
      facilityManager: await facilityManager.getAddress(),
      allocationManager: await allocationManager.getAddress(),
      commitmentRegistry: await commitmentRegistry.getAddress(),
      capitalizationManager: await capitalizationManager.getAddress(),
      obligationLedger: await obligations.getAddress(),
      clearingPolicyRegistry: await clearingPolicies.getAddress(),
      clearingEngine: await clearing.getAddress(),
      residualLedger: await residuals.getAddress(),
      settlementRouter: await router.getAddress(),
      settlementReconciler: await reconciler.getAddress(),
      settlementASC: await settlementAsc.getAddress(),
    },
    settlementRoute: {
      sourceDomainId,
      assetClassId,
      representationId,
      adapterId,
      clearingPolicyId,
      epochId,
      drawdownId,
      feeId,
      residualId,
      settlementId,
      routeDataHash,
      grossBefore: epoch.grossBefore,
      clearingAmount: epoch.clearingAmount,
      grossAfter: epoch.grossAfter,
      movementReduced: epoch.movementReduced,
      routeTxHash: routeTx.hash,
    },
    sourceSettlement: {
      txHash: settlementTx.hash,
      blockNumber: settlementReceipt.blockNumber,
      debtor: debtorWallet.address,
      creditor: PROVIDER_A,
      token: await token.getAddress(),
      amount: residualAmount,
      debtorBalanceBefore: debtorBeforeSettlement,
      debtorBalanceAfter: debtorAfterSettlement,
      creditorBalanceBefore: creditorBefore,
      creditorBalanceAfter: creditorAfter,
    },
    attestcoin: {
      chainKey: SOURCE_CHAIN_KEY,
      proofBuilderUrl,
      blockProver: BLOCK_PROVER,
      acceptanceTxHash: acceptTx.hash,
      evidenceId: settlementEvidenceId,
      evidenceConsumed: settlementEvidence.consumed,
    },
    finalAccounting: {
      drawdownOriginalAmount: drawdownAfter.originalAmount,
      drawdownClearedAmount: drawdownAfter.clearedAmount,
      drawdownSettledAmount: drawdownAfter.settledAmount,
      drawdownRemaining: await obligations.remainingAmount(drawdownId),
      drawdownStatus: Number(drawdownAfter.status),
      residualStatus: Number(residualAfter.status),
      reconciled: await reconciler.reconciledSettlement(settlementId),
    },
    negative: { replayRejected, wrongChainRejected },
    gasFunding: { debtorFundingTxHash },
    semanticBoundary:
      'M11 proves testnet mock-token settlement execution on Sepolia, Attestcoin verification of that exact successful transaction, route/domain/representation semantic validation on CC3, one-time evidence consumption, and exact full-residual reconciliation. It does not prove production stablecoin settlement, legal finality, or a production settlement rail.',
  };

  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, `${json(evidence)}\n`, 'utf8');
  console.log(json(evidence));
}

main().catch((error) => {
  const failure = {
    status: 'FAIL',
    checkedAt: new Date().toISOString(),
    error: error instanceof Error ? error.message : String(error),
  };
  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, `${json(failure)}\n`, 'utf8');
  console.error(json(failure));
  process.exit(1);
});
