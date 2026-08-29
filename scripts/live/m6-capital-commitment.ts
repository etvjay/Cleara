import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { AbiCoder, Contract, ContractFactory, JsonRpcProvider, Wallet, encodeBytes32String, keccak256, toUtf8Bytes } from 'ethers';
import { proofProvider } from '@gluwa/usc-sdk';

const SEPOLIA_CHAIN_ID = 11155111n;
const CC3_CHAIN_ID = 102031n;
const SOURCE_CHAIN_KEY = 1;
const BLOCK_PROVER = '0x0000000000000000000000000000000000000FD2';
const sepoliaRpc = process.env.SEPOLIA_RPC_HTTP ?? 'https://ethereum-sepolia-rpc.publicnode.com';
const cc3Rpc = process.env.CREDITCOIN_RPC_HTTP ?? 'https://rpc.cc3-testnet.creditcoin.network';
const proofBuilderUrl = process.env.ATTESTCOIN_PROOF_BUILDER_URL ?? 'https://prover.cc3-testnet.creditcoin.network/';
const sepoliaKey = required('SEPOLIA_DEPLOYER_PRIVATE_KEY');
const cc3Key = required('CC3_DEPLOYER_PRIVATE_KEY');
const evidencePath = process.env.EVIDENCE_PATH ?? 'evidence/runtime/m6-capital-commitment.json';

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
  if ((await sepoliaProvider.getBalance(sourceWallet.address)) === 0n) throw new Error('Sepolia signer has zero balance');
  if ((await cc3Provider.getBalance(cc3Wallet.address)) === 0n) throw new Error('CC3 signer has zero balance');

  const token = await deploy(sourceWallet, 'out/MockERC20.sol/MockERC20.json');
  const vault = await deploy(sourceWallet, 'out/CapitalCommitmentVault.sol/CapitalCommitmentVault.json', [sourceWallet.address]);

  const domainRegistry = await deploy(cc3Wallet, 'out/DomainRegistry.sol/DomainRegistry.json', [cc3Wallet.address]);
  const assetRegistry = await deploy(cc3Wallet, 'out/AssetRegistry.sol/AssetRegistry.json', [cc3Wallet.address]);
  const evidenceRegistry = await deploy(cc3Wallet, 'out/EvidenceRegistry.sol/EvidenceRegistry.json', [cc3Wallet.address]);
  const claimRegistry = await deploy(cc3Wallet, 'out/ClaimRegistry.sol/ClaimRegistry.json', [cc3Wallet.address]);
  const encumbranceRegistry = await deploy(cc3Wallet, 'out/EncumbranceRegistry.sol/EncumbranceRegistry.json', [cc3Wallet.address, await claimRegistry.getAddress()]);
  const facilityManager = await deploy(cc3Wallet, 'out/FacilityManager.sol/FacilityManager.json', [cc3Wallet.address, await encumbranceRegistry.getAddress()]);
  const allocationManager = await deploy(cc3Wallet, 'out/AllocationManager.sol/AllocationManager.json', [cc3Wallet.address, await facilityManager.getAddress()]);
  const commitmentRegistry = await deploy(cc3Wallet, 'out/CommitmentRegistry.sol/CommitmentRegistry.json', [cc3Wallet.address]);

  await (await claimRegistry.grantRole(await claimRegistry.ENCUMBRANCE_ROLE(), await encumbranceRegistry.getAddress())).wait();
  await (await encumbranceRegistry.grantRole(await encumbranceRegistry.FACILITY_ROLE(), await facilityManager.getAddress())).wait();
  await (await facilityManager.grantRole(await facilityManager.FACILITY_MANAGER_ROLE(), await allocationManager.getAddress())).wait();

  const coder = AbiCoder.defaultAbiCoder();
  const environmentId = keccak256(toUtf8Bytes('CC3_TESTNET'));
  const sourceDomainId = keccak256(coder.encode(['string', 'bytes32', 'uint256'], ['CLEARA_DOMAIN_V1', environmentId, SEPOLIA_CHAIN_ID]));
  const denomination = encodeBytes32String('USD');
  const policyNamespace = keccak256(toUtf8Bytes('CLEARA_M6_USD_POLICY_V1'));
  const assetClassId = keccak256(coder.encode(['string', 'bytes32', 'uint8', 'bytes32'], ['CLEARA_ASSET_CLASS_V1', denomination, 18, policyNamespace]));

  await (await domainRegistry.configureDomain([sourceDomainId, SOURCE_CHAIN_KEY, SEPOLIA_CHAIN_ID, true, false, false, false, true, true, 1, true])).wait();
  await (await assetRegistry.configureAssetClass([assetClassId, denomination, 18, policyNamespace, true])).wait();
  const representationId = await assetRegistry.computeRepresentationId(assetClassId, sourceDomainId, await token.getAddress());
  await (await assetRegistry.configureRepresentation([representationId, assetClassId, sourceDomainId, await token.getAddress(), 18, true])).wait();

  const faceValue = 1_000_000n;
  const maturity = BigInt(Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60);
  const claimId = await claimRegistry.registerVerifiedClaim.staticCall(sourceDomainId, addressDead(), 1n, cc3Wallet.address, addressBob(), assetClassId, faceValue, maturity, keccak256(toUtf8Bytes('M6_FIXTURE')), keccak256(toUtf8Bytes('M6_EVIDENCE')));
  await (await claimRegistry.registerVerifiedClaim(sourceDomainId, addressDead(), 1n, cc3Wallet.address, addressBob(), assetClassId, faceValue, maturity, keccak256(toUtf8Bytes('M6_FIXTURE')), keccak256(toUtf8Bytes('M6_EVIDENCE')))).wait();
  await (await claimRegistry.setFinanceableCapacity(claimId, faceValue, keccak256(toUtf8Bytes('M6_FINANCE_POLICY')), keccak256(toUtf8Bytes('M6_DECISION')))).wait();

  const facilityId = await facilityManager.createFacility.staticCall(assetClassId, faceValue, BigInt(Math.floor(Date.now() / 1000)), BigInt(Math.floor(Date.now() / 1000) + 14 * 24 * 60 * 60), keccak256(toUtf8Bytes('M6_FACILITY_POLICY')));
  await (await facilityManager.createFacility(assetClassId, faceValue, BigInt(Math.floor(Date.now() / 1000)), BigInt(Math.floor(Date.now() / 1000) + 14 * 24 * 60 * 60), keccak256(toUtf8Bytes('M6_FACILITY_POLICY')))).wait();
  await (await facilityManager.verifyFacility(facilityId)).wait();
  await (await facilityManager.openFacility(facilityId)).wait();
  const encumbranceId = await encumbranceRegistry.createEncumbrance.staticCall(claimId, facilityId, cc3Wallet.address, faceValue, BigInt(Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60));
  await (await encumbranceRegistry.createEncumbrance(claimId, facilityId, cc3Wallet.address, faceValue, BigInt(Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60))).wait();
  await (await facilityManager.bindEncumbrance(facilityId, encumbranceId)).wait();
  await (await facilityManager.beginAllocating(facilityId)).wait();
  const allocationId = await allocationManager.proposeAllocation.staticCall(facilityId, sourceWallet.address, faceValue, BigInt(Math.floor(Date.now() / 1000) + 3 * 24 * 60 * 60));
  await (await allocationManager.proposeAllocation(facilityId, sourceWallet.address, faceValue, BigInt(Math.floor(Date.now() / 1000) + 3 * 24 * 60 * 60))).wait();
  await (await allocationManager.activateAllocation(allocationId)).wait();

  const commitmentAsc = await deploy(cc3Wallet, 'out/CommitmentASC.sol/CommitmentASC.json', [BLOCK_PROVER, await domainRegistry.getAddress(), await assetRegistry.getAddress(), await evidenceRegistry.getAddress(), await allocationManager.getAddress(), await facilityManager.getAddress(), await commitmentRegistry.getAddress(), SOURCE_CHAIN_KEY, sourceDomainId, await vault.getAddress()]);
  await (await evidenceRegistry.grantRole(await evidenceRegistry.GATEWAY_ROLE(), await commitmentAsc.getAddress())).wait();
  await (await commitmentRegistry.grantRole(await commitmentRegistry.COMMITMENT_GATEWAY_ROLE(), await commitmentAsc.getAddress())).wait();
  await (await allocationManager.grantRole(await allocationManager.COMMITMENT_GATEWAY_ROLE(), await commitmentAsc.getAddress())).wait();

  await (await token.mint(sourceWallet.address, faceValue)).wait();
  await (await token.approve(await vault.getAddress(), faceValue)).wait();
  const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 24 * 60 * 60);
  const commitTx = await vault.commit(facilityId, allocationId, assetClassId, await token.getAddress(), faceValue, expiresAt);
  const commitReceipt = await commitTx.wait();
  if (!commitReceipt || commitReceipt.status !== 1) throw new Error('source commitment failed');
  if ((await token.balanceOf(await vault.getAddress())) !== faceValue) throw new Error('vault did not receive committed capital');

  const rawProof = await buildProof(commitTx.hash, commitReceipt.blockNumber);
  const proof = asProof(rawProof);
  const acceptTx = await commitmentAsc.acceptAttestedCommitment(proof);
  const acceptReceipt = await acceptTx.wait();
  if (!acceptReceipt || acceptReceipt.status !== 1) throw new Error('CC3 commitment acceptance failed');

  let commitmentId: string | undefined;
  let evidenceId: string | undefined;
  for (const log of acceptReceipt.logs) {
    try {
      const parsed = commitmentAsc.interface.parseLog(log);
      if (parsed?.name === 'CommitmentAccepted') {
        commitmentId = parsed.args.commitmentId;
        evidenceId = parsed.args.evidenceId;
      }
    } catch {}
  }
  if (!commitmentId || !evidenceId) throw new Error('CommitmentAccepted event missing');

  const allocation = await allocationManager.getAllocation(allocationId);
  const commitment = await commitmentRegistry.getCommitment(commitmentId);
  const sourceCommitmentId = await vault.computeSourceCommitmentId(facilityId, allocationId, sourceWallet.address, 0n);
  const sourceCommitment = await vault.getCommitment(sourceCommitmentId);
  if (Number(allocation.status) !== 3) throw new Error('allocation did not become COMMITTED');
  if (Number(commitment.status) !== 3) throw new Error('commitment registry did not become ACTIVE');
  if (Number(sourceCommitment.status) !== 1) throw new Error('source capital is no longer COMMITTED');
  if ((await token.balanceOf(await vault.getAddress())) !== faceValue) throw new Error('source vault balance drifted');

  await (await facilityManager.beginCapitalizing(facilityId)).wait();
  await (await facilityManager.finalizeCapitalization(facilityId)).wait();
  const facility = await facilityManager.getFacility(facilityId);
  if (Number(facility.status) !== 6 || facility.committedAmount !== faceValue) throw new Error('facility did not become CAPITALIZED');

  const replayError = await expectRevert(async () => {
    const tx = await commitmentAsc.acceptAttestedCommitment(proof);
    await tx.wait();
  });

  const evidence = {
    status: 'PASS', checkedAt,
    networks: { sepolia: { chainId: SEPOLIA_CHAIN_ID, signer: sourceWallet.address }, cc3: { chainId: CC3_CHAIN_ID, signer: cc3Wallet.address } },
    contracts: { token: await token.getAddress(), vault: await vault.getAddress(), domainRegistry: await domainRegistry.getAddress(), assetRegistry: await assetRegistry.getAddress(), evidenceRegistry: await evidenceRegistry.getAddress(), claimRegistry: await claimRegistry.getAddress(), encumbranceRegistry: await encumbranceRegistry.getAddress(), facilityManager: await facilityManager.getAddress(), allocationManager: await allocationManager.getAddress(), commitmentRegistry: await commitmentRegistry.getAddress(), commitmentAsc: await commitmentAsc.getAddress() },
    objects: { claimId, facilityId, encumbranceId, allocationId, sourceCommitmentId, commitmentId, evidenceId, assetClassId, representationId },
    source: { txHash: commitTx.hash, blockNumber: commitReceipt.blockNumber, amount: faceValue, expiresAt, vaultBalance: await token.balanceOf(await vault.getAddress()), sourceStatus: Number(sourceCommitment.status) },
    creditcoin: { allocationStatus: Number(allocation.status), commitmentStatus: Number(commitment.status), facilityStatus: Number(facility.status), committedAmount: facility.committedAmount },
    negative: { replayRejected: replayError },
    note: 'M6 isolates the capital-commitment boundary. The prerequisite claim/facility/allocation state is created directly on CC3; M3 independently proves Attestcoin claim ingestion.'
  };
  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, `${json(evidence)}\n`, 'utf8');
  console.log(json(evidence));
}

function addressDead(): string { return '0x000000000000000000000000000000000000dEaD'; }
function addressBob(): string { return '0x000000000000000000000000000000000000B0B0'; }

main().catch((error) => {
  const failure = { status: 'FAIL', checkedAt: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) };
  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, `${json(failure)}\n`, 'utf8');
  console.error(json(failure));
  process.exit(1);
});
