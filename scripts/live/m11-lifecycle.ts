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
  toUtf8Bytes,
} from 'ethers';
import { proofProvider } from '@gluwa/usc-sdk';

const SEPOLIA_CHAIN_ID = 11155111n;
const CC3_CHAIN_ID = 102031n;
const SOURCE_CHAIN_KEY = 1;
const BLOCK_PROVER = '0x0000000000000000000000000000000000000FD2';
const sepoliaRpc = process.env.SEPOLIA_RPC_HTTP ?? 'https://ethereum-sepolia-rpc.publicnode.com';
const cc3Rpc = process.env.CREDITCOIN_RPC_HTTP ?? 'https://rpc.cc3-testnet.creditcoin.network';
const proofBuilderUrl =
  process.env.ATTESTCOIN_PROOF_BUILDER_URL ?? 'https://prover.cc3-testnet.creditcoin.network/';
const sepoliaKey = required('SEPOLIA_DEPLOYER_PRIVATE_KEY');
const cc3Key = required('CC3_DEPLOYER_PRIVATE_KEY');
const evidencePath = process.env.EVIDENCE_PATH ?? 'evidence/runtime/m11-lifecycle.json';

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
  return contract as unknown as Contract;
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

async function waitUntil(provider: JsonRpcProvider, timestamp: bigint): Promise<void> {
  while (BigInt((await provider.getBlock('latest'))?.timestamp ?? 0) < timestamp) {
    await new Promise((resolve) => setTimeout(resolve, 15_000));
  }
}

function json(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v), 2);
}

function eventArg(contract: Contract, receipt: any, name: string, arg: string): any {
  for (const log of receipt.logs) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed?.name === name) return parsed.args[arg];
    } catch {
      // Ignore logs emitted by other contracts in the receipt.
    }
  }
  throw new Error(`${name} event missing`);
}

async function main(): Promise<void> {
  const checkedAt = new Date().toISOString();
  const sepoliaProvider = new JsonRpcProvider(sepoliaRpc);
  const cc3Provider = new JsonRpcProvider(cc3Rpc);
  if ((await sepoliaProvider.getNetwork()).chainId !== SEPOLIA_CHAIN_ID) throw new Error('Sepolia chain mismatch');
  if ((await cc3Provider.getNetwork()).chainId !== CC3_CHAIN_ID) throw new Error('CC3 chain mismatch');

  const sourceWallet = new Wallet(sepoliaKey, sepoliaProvider);
  const cc3Wallet = new Wallet(cc3Key, cc3Provider);
  if ((await sepoliaProvider.getBalance(sourceWallet.address)) === 0n) throw new Error('Sepolia deployer has zero balance');
  if ((await cc3Provider.getBalance(cc3Wallet.address)) === 0n) throw new Error('CC3 deployer has zero balance');

  const sourceBlock = await sepoliaProvider.getBlock('latest');
  const cc3Block = await cc3Provider.getBlock('latest');
  if (!sourceBlock || !cc3Block) throw new Error('latest block unavailable');
  const baseTimestamp = Math.max(sourceBlock.timestamp, cc3Block.timestamp);

  const token = await deploy(sourceWallet, 'out/MockERC20.sol/MockERC20.json');
  const vault = await deploy(sourceWallet, 'out/CapitalCommitmentVault.sol/CapitalCommitmentVault.json', [sourceWallet.address]);

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
  const commitmentRegistry = await deploy(cc3Wallet, 'out/CommitmentRegistry.sol/CommitmentRegistry.json', [cc3Wallet.address]);

  await (await claimRegistry.grantRole(await claimRegistry.ENCUMBRANCE_ROLE(), await encumbranceRegistry.getAddress())).wait();
  await (await encumbranceRegistry.grantRole(await encumbranceRegistry.FACILITY_ROLE(), await facilityManager.getAddress())).wait();
  await (await facilityManager.grantRole(await facilityManager.FACILITY_MANAGER_ROLE(), await allocationManager.getAddress())).wait();
  await (await allocationManager.grantRole(await allocationManager.COMMITMENT_GATEWAY_ROLE(), cc3Wallet.address)).wait();
  await (await commitmentRegistry.grantRole(await commitmentRegistry.COMMITMENT_GATEWAY_ROLE(), cc3Wallet.address)).wait();

  const coder = AbiCoder.defaultAbiCoder();
  const environmentId = keccak256(toUtf8Bytes('CC3_TESTNET'));
  const sourceDomainId = keccak256(
    coder.encode(['string', 'bytes32', 'uint256'], ['CLEARA_DOMAIN_V1', environmentId, SEPOLIA_CHAIN_ID]),
  );
  const denomination = encodeBytes32String('USD');
  const policyNamespace = keccak256(toUtf8Bytes('CLEARA_M11_LIFECYCLE_USD_POLICY_V1'));
  const assetClassId = keccak256(
    coder.encode(['string', 'bytes32', 'uint8', 'bytes32'], ['CLEARA_ASSET_CLASS_V1', denomination, 18, policyNamespace]),
  );

  await (
    await domainRegistry.configureDomain([
      sourceDomainId,
      SOURCE_CHAIN_KEY,
      SEPOLIA_CHAIN_ID,
      true,
      false,
      false,
      false,
      true,
      true,
      1,
      true,
    ])
  ).wait();
  await (await assetRegistry.configureAssetClass([assetClassId, denomination, 18, policyNamespace, true])).wait();
  const representationId = await assetRegistry.computeRepresentationId(assetClassId, sourceDomainId, await token.getAddress());
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

  const amount = 100_000n;
  const targetAmount = amount * 2n;
  const claimId = await claimRegistry.registerVerifiedClaim.staticCall(
    sourceDomainId,
    await vault.getAddress(),
    1n,
    cc3Wallet.address,
    sourceWallet.address,
    assetClassId,
    targetAmount,
    BigInt(baseTimestamp + 30 * 24 * 60 * 60),
    keccak256(toUtf8Bytes('M11_LIFECYCLE_CLAIM_SOURCE')),
    keccak256(toUtf8Bytes('M11_LIFECYCLE_CLAIM_EVIDENCE')),
  );
  await (
    await claimRegistry.registerVerifiedClaim(
      sourceDomainId,
      await vault.getAddress(),
      1n,
      cc3Wallet.address,
      sourceWallet.address,
      assetClassId,
      targetAmount,
      BigInt(baseTimestamp + 30 * 24 * 60 * 60),
      keccak256(toUtf8Bytes('M11_LIFECYCLE_CLAIM_SOURCE')),
      keccak256(toUtf8Bytes('M11_LIFECYCLE_CLAIM_EVIDENCE')),
    )
  ).wait();
  await (
    await claimRegistry.setFinanceableCapacity(
      claimId,
      targetAmount,
      keccak256(toUtf8Bytes('M11_LIFECYCLE_FINANCE_POLICY')),
      keccak256(toUtf8Bytes('M11_LIFECYCLE_FINANCE_DECISION')),
    )
  ).wait();

  const facilityId = await facilityManager.createFacility.staticCall(
    assetClassId,
    targetAmount,
    BigInt(baseTimestamp),
    BigInt(baseTimestamp + 2 * 24 * 60 * 60),
    keccak256(toUtf8Bytes('M11_LIFECYCLE_FACILITY_POLICY')),
  );
  await (
    await facilityManager.createFacility(
      assetClassId,
      targetAmount,
      BigInt(baseTimestamp),
      BigInt(baseTimestamp + 2 * 24 * 60 * 60),
      keccak256(toUtf8Bytes('M11_LIFECYCLE_FACILITY_POLICY')),
    )
  ).wait();
  await (await facilityManager.verifyFacility(facilityId)).wait();
  await (await facilityManager.openFacility(facilityId)).wait();
  const encumbranceId = await encumbranceRegistry.createEncumbrance.staticCall(
    claimId,
    facilityId,
    cc3Wallet.address,
    targetAmount,
    BigInt(baseTimestamp + 2 * 24 * 60 * 60),
  );
  await (
    await encumbranceRegistry.createEncumbrance(
      claimId,
      facilityId,
      cc3Wallet.address,
      targetAmount,
      BigInt(baseTimestamp + 2 * 24 * 60 * 60),
    )
  ).wait();
  await (await facilityManager.bindEncumbrance(facilityId, encumbranceId)).wait();
  await (await facilityManager.beginAllocating(facilityId)).wait();

  const allocationExpiresAt = BigInt(baseTimestamp + 2 * 24 * 60 * 60);
  const allocationA = await allocationManager.proposeAllocation.staticCall(
    facilityId,
    sourceWallet.address,
    amount,
    allocationExpiresAt,
  );
  await (await allocationManager.proposeAllocation(facilityId, sourceWallet.address, amount, allocationExpiresAt)).wait();
  await (await allocationManager.activateAllocation(allocationA)).wait();
  const allocationB = await allocationManager.proposeAllocation.staticCall(
    facilityId,
    sourceWallet.address,
    amount,
    allocationExpiresAt,
  );
  await (await allocationManager.proposeAllocation(facilityId, sourceWallet.address, amount, allocationExpiresAt)).wait();
  await (await allocationManager.activateAllocation(allocationB)).wait();

  const lifecycle = await deploy(cc3Wallet, 'out/CommitmentLifecycleASC.sol/CommitmentLifecycleASC.json', [
    BLOCK_PROVER,
    await domainRegistry.getAddress(),
    await evidenceRegistry.getAddress(),
    await allocationManager.getAddress(),
    await commitmentRegistry.getAddress(),
    SOURCE_CHAIN_KEY,
    sourceDomainId,
    await vault.getAddress(),
  ]);
  await (await evidenceRegistry.grantRole(await evidenceRegistry.GATEWAY_ROLE(), await lifecycle.getAddress())).wait();
  await (await evidenceRegistry.grantRole(await evidenceRegistry.CONSUMER_ROLE(), await lifecycle.getAddress())).wait();
  await (await commitmentRegistry.grantRole(await commitmentRegistry.COMMITMENT_LIFECYCLE_ROLE(), await lifecycle.getAddress())).wait();
  await (await allocationManager.grantRole(await allocationManager.COMMITMENT_LIFECYCLE_ROLE(), await lifecycle.getAddress())).wait();
  await (await vault.grantRole(await vault.CONSUMER_ROLE(), sourceWallet.address)).wait();

  const tokenAsSource = token.connect(sourceWallet) as Contract;
  const vaultAsSource = vault.connect(sourceWallet) as Contract;
  await (await tokenAsSource.mint(sourceWallet.address, targetAmount)).wait();
  await (await tokenAsSource.approve(await vault.getAddress(), targetAmount)).wait();
  const commitmentSourceBlock = await sepoliaProvider.getBlock('latest');
  const commitmentCc3Block = await cc3Provider.getBlock('latest');
  if (!commitmentSourceBlock || !commitmentCc3Block) throw new Error('block unavailable before commitment fixture');
  const commitmentBaseTimestamp = Math.max(commitmentSourceBlock.timestamp, commitmentCc3Block.timestamp);
  const commitmentExpiresAtConsumed = BigInt(commitmentBaseTimestamp + 2 * 60 * 60);
  const commitmentExpiresAtExpired = BigInt(commitmentBaseTimestamp + 20 * 60);
  const sourceCommitmentA = await vault.computeSourceCommitmentId(facilityId, allocationA, sourceWallet.address, 0n);
  const sourceCommitmentB = await vault.computeSourceCommitmentId(facilityId, allocationB, sourceWallet.address, 1n);

  const sourceCommitmentTxA = await vaultAsSource.commit(
    facilityId,
    allocationA,
    assetClassId,
    await token.getAddress(),
    amount,
    commitmentExpiresAtConsumed,
  );
  const sourceCommitmentReceiptA = await sourceCommitmentTxA.wait();
  if (!sourceCommitmentReceiptA || sourceCommitmentReceiptA.status !== 1) throw new Error('source commitment A failed');
  const sourceCommitmentTxB = await vaultAsSource.commit(
    facilityId,
    allocationB,
    assetClassId,
    await token.getAddress(),
    amount,
    commitmentExpiresAtExpired,
  );
  const sourceCommitmentReceiptB = await sourceCommitmentTxB.wait();
  if (!sourceCommitmentReceiptB || sourceCommitmentReceiptB.status !== 1) throw new Error('source commitment B failed');

  // M6 separately proves the CapitalCommitted -> CommitmentASC path. This
  // slice creates the prerequisite ACTIVE commitments directly so its live
  // gate spends its Attestcoin budget on both terminal lifecycle branches.
  const commitmentEvidenceA = keccak256(toUtf8Bytes('M11_LIFECYCLE_COMMITMENT_A'));
  const commitmentEvidenceB = keccak256(toUtf8Bytes('M11_LIFECYCLE_COMMITMENT_B'));
  const commitmentIdA = await commitmentRegistry.registerActiveCommitment.staticCall(
    sourceCommitmentA,
    sourceDomainId,
    await vault.getAddress(),
    facilityId,
    allocationA,
    sourceWallet.address,
    assetClassId,
    await token.getAddress(),
    amount,
    commitmentExpiresAtConsumed,
    commitmentEvidenceA,
  );
  await (
    await commitmentRegistry.registerActiveCommitment(
      sourceCommitmentA,
      sourceDomainId,
      await vault.getAddress(),
      facilityId,
      allocationA,
      sourceWallet.address,
      assetClassId,
      await token.getAddress(),
      amount,
      commitmentExpiresAtConsumed,
      commitmentEvidenceA,
    )
  ).wait();
  const commitmentIdB = await commitmentRegistry.registerActiveCommitment.staticCall(
    sourceCommitmentB,
    sourceDomainId,
    await vault.getAddress(),
    facilityId,
    allocationB,
    sourceWallet.address,
    assetClassId,
    await token.getAddress(),
    amount,
    commitmentExpiresAtExpired,
    commitmentEvidenceB,
  );
  await (
    await commitmentRegistry.registerActiveCommitment(
      sourceCommitmentB,
      sourceDomainId,
      await vault.getAddress(),
      facilityId,
      allocationB,
      sourceWallet.address,
      assetClassId,
      await token.getAddress(),
      amount,
      commitmentExpiresAtExpired,
      commitmentEvidenceB,
    )
  ).wait();
  await (await allocationManager.recognizeCommitment(allocationA, sourceWallet.address, amount)).wait();
  await (await allocationManager.recognizeCommitment(allocationB, sourceWallet.address, amount)).wait();

  const recipient = cc3Wallet.address;
  const sourceConsumeTx = await vaultAsSource.consume(sourceCommitmentA, recipient);
  const sourceConsumeReceipt = await sourceConsumeTx.wait();
  if (!sourceConsumeReceipt || sourceConsumeReceipt.status !== 1) throw new Error('source consume failed');
  const consumeProof = asProof(await buildProof(sourceConsumeTx.hash, sourceConsumeReceipt.blockNumber));
  const consumeAcceptanceTx = await lifecycle.acceptAttestedCommitmentLifecycle(consumeProof);
  const consumeAcceptanceReceipt = await consumeAcceptanceTx.wait();
  if (!consumeAcceptanceReceipt || consumeAcceptanceReceipt.status !== 1) throw new Error('consume lifecycle acceptance failed');
  const consumeEvidenceId = eventArg(lifecycle, consumeAcceptanceReceipt, 'CommitmentLifecycleAccepted', 'evidenceId');

  await waitUntil(sepoliaProvider, commitmentExpiresAtExpired);
  const sourceExpireTx = await vaultAsSource.expire(sourceCommitmentB);
  const sourceExpireReceipt = await sourceExpireTx.wait();
  if (!sourceExpireReceipt || sourceExpireReceipt.status !== 1) throw new Error('source expiry failed');
  const expireProof = asProof(await buildProof(sourceExpireTx.hash, sourceExpireReceipt.blockNumber));
  const expireAcceptanceTx = await lifecycle.acceptAttestedCommitmentLifecycle(expireProof);
  const expireAcceptanceReceipt = await expireAcceptanceTx.wait();
  if (!expireAcceptanceReceipt || expireAcceptanceReceipt.status !== 1) throw new Error('expiry lifecycle acceptance failed');
  const expireEvidenceId = eventArg(lifecycle, expireAcceptanceReceipt, 'CommitmentLifecycleAccepted', 'evidenceId');

  const replayRejected = await expectRevert(async () => {
    const tx = await lifecycle.acceptAttestedCommitmentLifecycle(consumeProof);
    await tx.wait();
  });
  const wrongChainRejected = await expectRevert(async () => {
    const tx = await lifecycle.acceptAttestedCommitmentLifecycle({ ...expireProof, chainKey: 3 });
    await tx.wait();
  });

  const facility = await facilityManager.getFacility(facilityId);
  const allocationStateA = await allocationManager.getAllocation(allocationA);
  const allocationStateB = await allocationManager.getAllocation(allocationB);
  const commitmentStateA = await commitmentRegistry.getCommitment(commitmentIdA);
  const commitmentStateB = await commitmentRegistry.getCommitment(commitmentIdB);
  const consumeEvidence = await evidenceRegistry.getEvidence(consumeEvidenceId);
  const expireEvidence = await evidenceRegistry.getEvidence(expireEvidenceId);
  if (Number(commitmentStateA.status) !== 4 || Number(allocationStateA.status) !== 4) throw new Error('consumed state mismatch');
  if (Number(commitmentStateB.status) !== 6 || Number(allocationStateB.status) !== 5) throw new Error('expired state mismatch');
  if (facility.committedAmount !== targetAmount || facility.consumedAmount !== amount || facility.expiredAmount !== amount) {
    throw new Error('terminal facility accounting mismatch');
  }
  if ((await facilityManager.activeCommittedAmount(facilityId)) !== 0n) throw new Error('active commitment accounting mismatch');
  if (!consumeEvidence.consumed || !expireEvidence.consumed) throw new Error('lifecycle evidence not consumed');

  const latestCc3 = await cc3Provider.getBlock('latest');
  const evidence = {
    status: 'PASS',
    checkedAt,
    networks: {
      sepolia: { chainId: SEPOLIA_CHAIN_ID, signer: sourceWallet.address },
      cc3: { chainId: CC3_CHAIN_ID, signer: cc3Wallet.address, blockTimestamp: latestCc3?.timestamp ?? null },
    },
    contracts: {
      token: await token.getAddress(),
      capitalCommitmentVault: await vault.getAddress(),
      domainRegistry: await domainRegistry.getAddress(),
      assetRegistry: await assetRegistry.getAddress(),
      evidenceRegistry: await evidenceRegistry.getAddress(),
      claimRegistry: await claimRegistry.getAddress(),
      encumbranceRegistry: await encumbranceRegistry.getAddress(),
      facilityManager: await facilityManager.getAddress(),
      allocationManager: await allocationManager.getAddress(),
      commitmentRegistry: await commitmentRegistry.getAddress(),
      commitmentLifecycleASC: await lifecycle.getAddress(),
    },
    objects: {
      sourceDomainId,
      assetClassId,
      representationId,
      claimId,
      facilityId,
      encumbranceId,
      allocationConsumed: allocationA,
      allocationExpired: allocationB,
      sourceCommitmentConsumed: sourceCommitmentA,
      sourceCommitmentExpired: sourceCommitmentB,
      commitmentConsumed: commitmentIdA,
      commitmentExpired: commitmentIdB,
      consumeEvidenceId,
      expireEvidenceId,
    },
    prerequisite: {
      note: 'M6 separately proves CapitalCommitted -> CommitmentASC. This lifecycle gate creates matching ACTIVE Creditcoin commitments directly before proving the two terminal source events.',
      sourceCommitmentTxConsumed: sourceCommitmentTxA.hash,
      sourceCommitmentTxExpired: sourceCommitmentTxB.hash,
    },
    source: {
      commitmentConsumed: {
        txHash: sourceConsumeTx.hash,
        blockNumber: sourceConsumeReceipt.blockNumber,
        sourceCommitmentId: sourceCommitmentA,
        recipient,
        amount,
        status: Number((await vault.getCommitment(sourceCommitmentA)).status),
      },
      commitmentExpired: {
        txHash: sourceExpireTx.hash,
        blockNumber: sourceExpireReceipt.blockNumber,
        sourceCommitmentId: sourceCommitmentB,
        provider: sourceWallet.address,
        amount,
        status: Number((await vault.getCommitment(sourceCommitmentB)).status),
      },
      vaultBalance: await token.balanceOf(await vault.getAddress()),
    },
    creditcoin: {
      commitmentConsumedStatus: Number(commitmentStateA.status),
      commitmentExpiredStatus: Number(commitmentStateB.status),
      allocationConsumedStatus: Number(allocationStateA.status),
      allocationExpiredStatus: Number(allocationStateB.status),
      facilityStatus: Number(facility.status),
      grossCommittedAmount: facility.committedAmount,
      consumedAmount: facility.consumedAmount,
      expiredAmount: facility.expiredAmount,
      activeCommittedAmount: await facilityManager.activeCommittedAmount(facilityId),
    },
    attestcoin: {
      chainKey: SOURCE_CHAIN_KEY,
      proofBuilderUrl,
      blockProver: BLOCK_PROVER,
      consumeAcceptanceTxHash: consumeAcceptanceTx.hash,
      expireAcceptanceTxHash: expireAcceptanceTx.hash,
      consumeEvidenceId,
      expireEvidenceId,
      consumeEvidenceConsumed: consumeEvidence.consumed,
      expireEvidenceConsumed: expireEvidence.consumed,
    },
    negative: { replayRejected, wrongChainRejected },
    invariant: {
      grossEqualsTerminalPlusActive:
        facility.committedAmount === facility.consumedAmount + facility.expiredAmount + (await facilityManager.activeCommittedAmount(facilityId)),
      sourceVaultEmpty: (await token.balanceOf(await vault.getAddress())) === 0n,
    },
    semanticBoundary:
      'M11-Lifecycle proves source CapitalConsumed and CapitalExpired receipts through Attestcoin, exact Creditcoin commitment/allocation terminal transitions, atomic evidence consumption, and gross-versus-terminal facility accounting. It does not prove an indexed read model, production capital, or Attestcoin writability.',
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
