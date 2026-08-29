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
const TARGET = 1_000_000n;
const AMOUNTS = [400_000n, 350_000n, 250_000n] as const;
const sepoliaRpc = process.env.SEPOLIA_RPC_HTTP ?? 'https://ethereum-sepolia-rpc.publicnode.com';
const cc3Rpc = process.env.CREDITCOIN_RPC_HTTP ?? 'https://rpc.cc3-testnet.creditcoin.network';
const proofBuilderUrl =
  process.env.ATTESTCOIN_PROOF_BUILDER_URL ?? 'https://prover.cc3-testnet.creditcoin.network/';
const sepoliaKey = required('SEPOLIA_DEPLOYER_PRIVATE_KEY');
const cc3Key = required('CC3_DEPLOYER_PRIVATE_KEY');
const evidencePath = process.env.EVIDENCE_PATH ?? 'evidence/runtime/m7-capitalization.json';

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

function sorted(values: string[]): string[] {
  return [...values].sort((a, b) => BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0);
}

async function main(): Promise<void> {
  const checkedAt = new Date().toISOString();
  const sepoliaProvider = new JsonRpcProvider(sepoliaRpc);
  const cc3Provider = new JsonRpcProvider(cc3Rpc);
  if ((await sepoliaProvider.getNetwork()).chainId !== SEPOLIA_CHAIN_ID) throw new Error('Sepolia chain mismatch');
  if ((await cc3Provider.getNetwork()).chainId !== CC3_CHAIN_ID) throw new Error('CC3 chain mismatch');

  const sourceDeployer = new Wallet(sepoliaKey, sepoliaProvider);
  const cc3Wallet = new Wallet(cc3Key, cc3Provider);
  if ((await sepoliaProvider.getBalance(sourceDeployer.address)) === 0n) throw new Error('Sepolia signer has zero balance');
  if ((await cc3Provider.getBalance(cc3Wallet.address)) === 0n) throw new Error('CC3 signer has zero balance');

  const providerWallets = [0, 1, 2].map(() => Wallet.createRandom().connect(sepoliaProvider));
  for (const provider of providerWallets) {
    const funding = await sourceDeployer.sendTransaction({ to: provider.address, value: 2_000_000_000_000_000n });
    await funding.wait();
  }

  const token = await deploy(sourceDeployer, 'out/MockERC20.sol/MockERC20.json');
  const vault = await deploy(sourceDeployer, 'out/CapitalCommitmentVault.sol/CapitalCommitmentVault.json', [sourceDeployer.address]);

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
  const capitalizationManager = await deploy(cc3Wallet, 'out/CapitalizationManager.sol/CapitalizationManager.json', [
    cc3Wallet.address,
    await facilityManager.getAddress(),
    await allocationManager.getAddress(),
    await commitmentRegistry.getAddress(),
  ]);

  await (await claimRegistry.grantRole(await claimRegistry.ENCUMBRANCE_ROLE(), await encumbranceRegistry.getAddress())).wait();
  await (await encumbranceRegistry.grantRole(await encumbranceRegistry.FACILITY_ROLE(), await facilityManager.getAddress())).wait();
  await (await facilityManager.grantRole(await facilityManager.FACILITY_MANAGER_ROLE(), await allocationManager.getAddress())).wait();
  await (await facilityManager.bindCapitalizationManager(await capitalizationManager.getAddress())).wait();

  const coder = AbiCoder.defaultAbiCoder();
  const environmentId = keccak256(toUtf8Bytes('CC3_TESTNET'));
  const sourceDomainId = keccak256(
    coder.encode(['string', 'bytes32', 'uint256'], ['CLEARA_DOMAIN_V1', environmentId, SEPOLIA_CHAIN_ID]),
  );
  const denomination = encodeBytes32String('USD');
  const policyNamespace = keccak256(toUtf8Bytes('CLEARA_M7_USD_POLICY_V1'));
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
      false,
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

  const now = BigInt(Math.floor(Date.now() / 1000));
  const maturity = now + 90n * 24n * 60n * 60n;
  const claimId = await claimRegistry.registerVerifiedClaim.staticCall(
    sourceDomainId,
    addressDead(),
    7n,
    cc3Wallet.address,
    addressBob(),
    assetClassId,
    TARGET,
    maturity,
    keccak256(toUtf8Bytes('M7_FIXTURE')),
    keccak256(toUtf8Bytes('M7_EVIDENCE')),
  );
  await (
    await claimRegistry.registerVerifiedClaim(
      sourceDomainId,
      addressDead(),
      7n,
      cc3Wallet.address,
      addressBob(),
      assetClassId,
      TARGET,
      maturity,
      keccak256(toUtf8Bytes('M7_FIXTURE')),
      keccak256(toUtf8Bytes('M7_EVIDENCE')),
    )
  ).wait();
  await (
    await claimRegistry.setFinanceableCapacity(
      claimId,
      TARGET,
      keccak256(toUtf8Bytes('M7_FINANCE_POLICY')),
      keccak256(toUtf8Bytes('M7_DECISION')),
    )
  ).wait();

  const facilityPolicy = keccak256(toUtf8Bytes('M7_FACILITY_POLICY'));
  const facilityId = await facilityManager.createFacility.staticCall(
    assetClassId,
    TARGET,
    now,
    now + 30n * 24n * 60n * 60n,
    facilityPolicy,
  );
  await (
    await facilityManager.createFacility(assetClassId, TARGET, now, now + 30n * 24n * 60n * 60n, facilityPolicy)
  ).wait();
  await (await facilityManager.verifyFacility(facilityId)).wait();
  await (await facilityManager.openFacility(facilityId)).wait();
  const encumbranceId = await encumbranceRegistry.createEncumbrance.staticCall(
    claimId,
    facilityId,
    cc3Wallet.address,
    TARGET,
    now + 45n * 24n * 60n * 60n,
  );
  await (
    await encumbranceRegistry.createEncumbrance(
      claimId,
      facilityId,
      cc3Wallet.address,
      TARGET,
      now + 45n * 24n * 60n * 60n,
    )
  ).wait();
  await (await facilityManager.bindEncumbrance(facilityId, encumbranceId)).wait();
  await (await facilityManager.beginAllocating(facilityId)).wait();

  const allocationIds: string[] = [];
  for (let i = 0; i < providerWallets.length; i++) {
    const allocationId = await allocationManager.proposeAllocation.staticCall(
      facilityId,
      providerWallets[i].address,
      AMOUNTS[i],
      now + 7n * 24n * 60n * 60n,
    );
    await (
      await allocationManager.proposeAllocation(
        facilityId,
        providerWallets[i].address,
        AMOUNTS[i],
        now + 7n * 24n * 60n * 60n,
      )
    ).wait();
    await (await allocationManager.activateAllocation(allocationId)).wait();
    allocationIds.push(allocationId);
  }

  const commitmentAsc = await deploy(cc3Wallet, 'out/CommitmentASC.sol/CommitmentASC.json', [
    BLOCK_PROVER,
    await domainRegistry.getAddress(),
    await assetRegistry.getAddress(),
    await evidenceRegistry.getAddress(),
    await allocationManager.getAddress(),
    await facilityManager.getAddress(),
    await commitmentRegistry.getAddress(),
    SOURCE_CHAIN_KEY,
    sourceDomainId,
    await vault.getAddress(),
  ]);
  await (await evidenceRegistry.grantRole(await evidenceRegistry.GATEWAY_ROLE(), await commitmentAsc.getAddress())).wait();
  await (
    await commitmentRegistry.grantRole(
      await commitmentRegistry.COMMITMENT_GATEWAY_ROLE(),
      await commitmentAsc.getAddress(),
    )
  ).wait();
  await (
    await allocationManager.grantRole(
      await allocationManager.COMMITMENT_GATEWAY_ROLE(),
      await commitmentAsc.getAddress(),
    )
  ).wait();

  const commitmentExpiry = now + 3n * 24n * 60n * 60n;
  const sourceCommitments: Array<{
    provider: string;
    amount: bigint;
    allocationId: string;
    sourceCommitmentId: string;
    txHash: string;
    blockNumber: number;
    proof?: any;
    commitmentId?: string;
    evidenceId?: string;
  }> = [];

  for (let i = 0; i < providerWallets.length; i++) {
    const provider = providerWallets[i];
    await (await token.mint(provider.address, AMOUNTS[i])).wait();
    await (await token.connect(provider).approve(await vault.getAddress(), AMOUNTS[i])).wait();
    const sourceCommitmentId = await vault.computeSourceCommitmentId(
      facilityId,
      allocationIds[i],
      provider.address,
      0n,
    );
    const tx = await vault
      .connect(provider)
      .commit(facilityId, allocationIds[i], assetClassId, await token.getAddress(), AMOUNTS[i], commitmentExpiry);
    const receipt = await tx.wait();
    if (!receipt || receipt.status !== 1) throw new Error(`source commitment ${i} failed`);
    sourceCommitments.push({
      provider: provider.address,
      amount: AMOUNTS[i],
      allocationId: allocationIds[i],
      sourceCommitmentId,
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
    });
  }

  if ((await token.balanceOf(await vault.getAddress())) !== TARGET) {
    throw new Error('vault balance does not equal aggregate committed capital');
  }

  for (const source of sourceCommitments) {
    const raw = await buildProof(source.txHash, source.blockNumber);
    source.proof = asProof(raw);
    const acceptance = await commitmentAsc.acceptAttestedCommitment(source.proof);
    const acceptanceReceipt = await acceptance.wait();
    if (!acceptanceReceipt || acceptanceReceipt.status !== 1) throw new Error('CC3 commitment acceptance failed');
    for (const log of acceptanceReceipt.logs) {
      try {
        const parsed = commitmentAsc.interface.parseLog(log);
        if (parsed?.name === 'CommitmentAccepted') {
          source.commitmentId = parsed.args.commitmentId;
          source.evidenceId = parsed.args.evidenceId;
        }
      } catch {}
    }
    if (!source.commitmentId || !source.evidenceId) throw new Error('CommitmentAccepted event missing');
  }

  const preCapitalization = await facilityManager.getFacility(facilityId);
  if (preCapitalization.committedAmount !== TARGET) throw new Error('aggregate committed amount did not reach target');
  for (const allocationId of allocationIds) {
    const allocation = await allocationManager.getAllocation(allocationId);
    if (Number(allocation.status) !== 3) throw new Error('allocation did not become COMMITTED');
  }

  await (await facilityManager.beginCapitalizing(facilityId)).wait();
  const requiredUntil = now + 24n * 60n * 60n;
  const commitmentIds = sorted(sourceCommitments.map((entry) => entry.commitmentId!));

  const directFinalizeRejected = await expectRevert(async () => {
    const tx = await facilityManager.finalizeCapitalization(
      facilityId,
      keccak256(toUtf8Bytes('FAKE_ROOT')),
      requiredUntil,
      3,
    );
    await tx.wait();
  });

  const duplicateIds = [commitmentIds[0], commitmentIds[0], commitmentIds[0]];
  const duplicateRejected = await expectRevert(async () => {
    const tx = await capitalizationManager.sealCapitalization(facilityId, requiredUntil, duplicateIds);
    await tx.wait();
  });

  const horizonRejected = await expectRevert(async () => {
    const tx = await capitalizationManager.sealCapitalization(
      facilityId,
      commitmentExpiry + 1n,
      commitmentIds,
    );
    await tx.wait();
  });

  const expectedRoot = await capitalizationManager.computeCapitalizationRoot(
    facilityId,
    requiredUntil,
    commitmentIds,
  );
  const sealTx = await capitalizationManager.sealCapitalization(facilityId, requiredUntil, commitmentIds);
  const sealReceipt = await sealTx.wait();
  if (!sealReceipt || sealReceipt.status !== 1) throw new Error('capitalization seal failed');

  const facility = await facilityManager.getFacility(facilityId);
  const seal = await capitalizationManager.getSeal(facilityId);
  if (Number(facility.status) !== 6) throw new Error('facility did not become CAPITALIZED');
  if (facility.capitalizationRoot !== expectedRoot || seal.capitalizationRoot !== expectedRoot) {
    throw new Error('capitalization root mismatch');
  }
  if (facility.capitalizationCommitmentCount !== 3n || seal.commitmentCount !== 3n) {
    throw new Error('capitalization membership count mismatch');
  }
  if (seal.totalCommitted !== TARGET) throw new Error('sealed total does not equal target');

  const resealRejected = await expectRevert(async () => {
    const tx = await capitalizationManager.sealCapitalization(facilityId, requiredUntil, commitmentIds);
    await tx.wait();
  });

  for (const source of sourceCommitments) {
    const sourceState = await vault.getCommitment(source.sourceCommitmentId);
    if (Number(sourceState.status) !== 1) throw new Error('source commitment no longer COMMITTED at seal time');
  }

  const evidence = {
    status: 'PASS',
    checkedAt,
    networks: {
      sepolia: { chainId: SEPOLIA_CHAIN_ID, deployer: sourceDeployer.address },
      cc3: { chainId: CC3_CHAIN_ID, signer: cc3Wallet.address },
    },
    contracts: {
      token: await token.getAddress(),
      vault: await vault.getAddress(),
      domainRegistry: await domainRegistry.getAddress(),
      assetRegistry: await assetRegistry.getAddress(),
      evidenceRegistry: await evidenceRegistry.getAddress(),
      claimRegistry: await claimRegistry.getAddress(),
      encumbranceRegistry: await encumbranceRegistry.getAddress(),
      facilityManager: await facilityManager.getAddress(),
      allocationManager: await allocationManager.getAddress(),
      commitmentRegistry: await commitmentRegistry.getAddress(),
      commitmentAsc: await commitmentAsc.getAddress(),
      capitalizationManager: await capitalizationManager.getAddress(),
    },
    objects: {
      claimId,
      facilityId,
      encumbranceId,
      assetClassId,
      representationId,
      commitmentIds,
      capitalizationRoot: expectedRoot,
      capitalRequiredUntil: requiredUntil,
    },
    providers: sourceCommitments.map((entry) => ({
      address: entry.provider,
      amount: entry.amount,
      allocationId: entry.allocationId,
      sourceCommitmentId: entry.sourceCommitmentId,
      sourceTxHash: entry.txHash,
      sourceBlockNumber: entry.blockNumber,
      commitmentId: entry.commitmentId,
      evidenceId: entry.evidenceId,
    })),
    source: {
      vaultBalance: await token.balanceOf(await vault.getAddress()),
      aggregateCommitted: TARGET,
      commitmentExpiry,
    },
    creditcoin: {
      facilityStatus: Number(facility.status),
      encumberedAmount: facility.encumberedAmount,
      allocatedAmount: facility.allocatedAmount,
      committedAmount: facility.committedAmount,
      capitalizationRoot: facility.capitalizationRoot,
      commitmentCount: facility.capitalizationCommitmentCount,
      sealTotal: seal.totalCommitted,
    },
    negative: {
      directFinalizeRejected,
      duplicateRejected,
      horizonRejected,
      resealRejected,
    },
    note:
      'M7 isolates multiparty capitalization. Three ephemeral Sepolia provider wallets independently lock test capital; their private keys are generated only inside the runner and are never persisted or emitted.',
  };

  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, `${json(evidence)}\n`, 'utf8');
  console.log(json(evidence));
}

function addressDead(): string {
  return '0x000000000000000000000000000000000000dEaD';
}

function addressBob(): string {
  return '0x000000000000000000000000000000000000B0B0';
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
