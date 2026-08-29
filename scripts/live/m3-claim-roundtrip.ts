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
const proofBuilderUrl = process.env.ATTESTCOIN_PROOF_BUILDER_URL ?? 'https://prover.cc3-testnet.creditcoin.network/';
const sepoliaKey = required('SEPOLIA_DEPLOYER_PRIVATE_KEY');
const cc3Key = required('CC3_DEPLOYER_PRIVATE_KEY');
const evidencePath = process.env.EVIDENCE_PATH ?? 'evidence/runtime/m3-claim-roundtrip.json';

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
  const factory = new ContractFactory(built.abi, built.bytecode, wallet);
  const contract = await factory.deploy(...args);
  await contract.waitForDeployment();
  return contract;
}

async function assertNetwork(provider: JsonRpcProvider, expected: bigint, label: string): Promise<void> {
  const network = await provider.getNetwork();
  if (network.chainId !== expected) {
    throw new Error(`${label} chain mismatch: expected ${expected}, got ${network.chainId}`);
  }
}

async function expectRevert(label: string, action: () => Promise<unknown>): Promise<string> {
  try {
    await action();
  } catch (error: any) {
    return error?.shortMessage ?? error?.reason ?? error?.message ?? String(error);
  }
  throw new Error(`${label}: expected revert but call succeeded`);
}

async function buildProof(txHash: string, blockNumber: number): Promise<any> {
  const builder = new proofProvider.service.ProofBuilder(SOURCE_CHAIN_KEY, proofBuilderUrl);
  await builder.waitUntilHeightAttested(SOURCE_CHAIN_KEY, blockNumber, 15_000, 1_800_000);
  const result = await builder.getProof(txHash);
  if (!result.success || !result.data) {
    throw new Error(`proof generation failed for ${txHash}: ${result.error ?? 'unknown error'}`);
  }
  return result.data;
}

function asClaimAscProof(proof: any): any {
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

function json(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v), 2);
}

async function main(): Promise<void> {
  const checkedAt = new Date().toISOString();
  const sepoliaProvider = new JsonRpcProvider(sepoliaRpc);
  const cc3Provider = new JsonRpcProvider(cc3Rpc);
  await assertNetwork(sepoliaProvider, SEPOLIA_CHAIN_ID, 'Sepolia');
  await assertNetwork(cc3Provider, CC3_CHAIN_ID, 'CC3');

  const sourceWallet = new Wallet(sepoliaKey, sepoliaProvider);
  const cc3Wallet = new Wallet(cc3Key, cc3Provider);
  const sourceBalance = await sepoliaProvider.getBalance(sourceWallet.address);
  const cc3Balance = await cc3Provider.getBalance(cc3Wallet.address);
  if (sourceBalance === 0n) throw new Error(`Sepolia signer ${sourceWallet.address} has zero balance`);
  if (cc3Balance === 0n) throw new Error(`CC3 signer ${cc3Wallet.address} has zero balance`);

  const claimSource = await deploy(sourceWallet, 'out/ClaimSource.sol/ClaimSource.json');
  const domainRegistry = await deploy(cc3Wallet, 'out/DomainRegistry.sol/DomainRegistry.json', [cc3Wallet.address]);
  const assetRegistry = await deploy(cc3Wallet, 'out/AssetRegistry.sol/AssetRegistry.json', [cc3Wallet.address]);
  const evidenceRegistry = await deploy(cc3Wallet, 'out/EvidenceRegistry.sol/EvidenceRegistry.json', [cc3Wallet.address]);
  const policyRegistry = await deploy(cc3Wallet, 'out/PolicyRegistry.sol/PolicyRegistry.json', [cc3Wallet.address]);
  const authorityRegistry = await deploy(cc3Wallet, 'out/AuthorityRegistry.sol/AuthorityRegistry.json', [cc3Wallet.address]);
  const claimRegistry = await deploy(cc3Wallet, 'out/ClaimRegistry.sol/ClaimRegistry.json', [cc3Wallet.address]);

  const coder = AbiCoder.defaultAbiCoder();
  const cc3EnvironmentId = keccak256(toUtf8Bytes('CC3_TESTNET'));
  const sourceDomainId = keccak256(
    coder.encode(['string', 'bytes32', 'uint256'], ['CLEARA_DOMAIN_V1', cc3EnvironmentId, SEPOLIA_CHAIN_ID]),
  );
  const denomination = encodeBytes32String('USD');
  const policyNamespace = keccak256(toUtf8Bytes('CLEARA_DEMO_USD_POLICY_V1'));
  const assetClassId = keccak256(
    coder.encode(
      ['string', 'bytes32', 'uint8', 'bytes32'],
      ['CLEARA_ASSET_CLASS_V1', denomination, 6, policyNamespace],
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
      true,
      true,
      true,
      1,
      true,
    ])
  ).wait();
  await (await assetRegistry.configureAssetClass([assetClassId, denomination, 6, policyNamespace, true])).wait();

  const claimAsc = await deploy(cc3Wallet, 'out/ClaimASC.sol/ClaimASC.json', [
    BLOCK_PROVER,
    await domainRegistry.getAddress(),
    await assetRegistry.getAddress(),
    await evidenceRegistry.getAddress(),
    await claimRegistry.getAddress(),
    SOURCE_CHAIN_KEY,
    sourceDomainId,
    await claimSource.getAddress(),
  ]);

  const gatewayRole = await evidenceRegistry.GATEWAY_ROLE();
  const claimGatewayRole = await claimRegistry.CLAIM_GATEWAY_ROLE();
  await (await evidenceRegistry.grantRole(gatewayRole, await claimAsc.getAddress())).wait();
  await (await claimRegistry.grantRole(claimGatewayRole, await claimAsc.getAddress())).wait();

  const maturity = BigInt(Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60);
  const sourceEvidenceHash = keccak256(toUtf8Bytes('CLEARA_M3_LIVE_DEMO'));
  const obligor = '0x000000000000000000000000000000000000B0B0';

  const createTx = await claimSource.createClaim(obligor, assetClassId, 1_000_000n, maturity, sourceEvidenceHash);
  const createReceipt = await createTx.wait();
  if (!createReceipt || createReceipt.status !== 1) throw new Error('successful ClaimCreated transaction did not succeed');

  const validProofRaw = await buildProof(createTx.hash, createReceipt.blockNumber);
  const validProof = asClaimAscProof(validProofRaw);
  const acceptTx = await claimAsc.acceptAttestedClaim(validProof);
  const acceptReceipt = await acceptTx.wait();
  if (!acceptReceipt || acceptReceipt.status !== 1) throw new Error('ClaimASC acceptance transaction failed');

  let claimId: string | undefined;
  let evidenceId: string | undefined;
  for (const log of acceptReceipt.logs) {
    try {
      const parsed = claimAsc.interface.parseLog(log);
      if (parsed?.name === 'ClaimAccepted') {
        claimId = parsed.args.claimId;
        evidenceId = parsed.args.evidenceId;
        break;
      }
    } catch {
      // Ignore logs emitted by other contracts in the transaction.
    }
  }
  if (!claimId || !evidenceId) throw new Error('ClaimAccepted event not found');

  const claim = await claimRegistry.getClaim(claimId);
  if (Number(claim.state) !== 2) throw new Error(`claim did not reach VERIFIED state: ${claim.state}`);

  const replayError = await expectRevert('replay', async () => {
    const tx = await claimAsc.acceptAttestedClaim(validProof);
    await tx.wait();
  });

  const wrongChainProof = { ...validProof, chainKey: 3 };
  const wrongChainError = await expectRevert('wrong chain', async () => {
    const tx = await claimAsc.acceptAttestedClaim(wrongChainProof);
    await tx.wait();
  });

  const wrongSourceAsc = await deploy(cc3Wallet, 'out/ClaimASC.sol/ClaimASC.json', [
    BLOCK_PROVER,
    await domainRegistry.getAddress(),
    await assetRegistry.getAddress(),
    await evidenceRegistry.getAddress(),
    await claimRegistry.getAddress(),
    SOURCE_CHAIN_KEY,
    sourceDomainId,
    '0x000000000000000000000000000000000000dEaD',
  ]);
  const wrongSourceError = await expectRevert('wrong source', async () => {
    const tx = await wrongSourceAsc.acceptAttestedClaim(validProof);
    await tx.wait();
  });

  const failedRequest = await claimSource.createClaim.populateTransaction(
    obligor,
    assetClassId,
    0,
    maturity,
    sourceEvidenceHash,
  );
  const failedSent = await sourceWallet.sendTransaction({ ...failedRequest, gasLimit: 300_000n });
  let failedReceipt: any;
  try {
    failedReceipt = await failedSent.wait();
  } catch {
    failedReceipt = await sepoliaProvider.getTransactionReceipt(failedSent.hash);
  }
  if (!failedReceipt || failedReceipt.status !== 0) throw new Error('deliberately failed source transaction did not fail');
  const failedProofRaw = await buildProof(failedSent.hash, failedReceipt.blockNumber);
  const failedProof = asClaimAscProof(failedProofRaw);
  const failedReceiptError = await expectRevert('failed receipt', async () => {
    const tx = await claimAsc.acceptAttestedClaim(failedProof);
    await tx.wait();
  });

  const evidence = {
    status: 'PASS',
    checkedAt,
    networks: {
      sepolia: { chainId: SEPOLIA_CHAIN_ID, rpc: sepoliaRpc, signer: sourceWallet.address },
      cc3: { chainId: CC3_CHAIN_ID, rpc: cc3Rpc, signer: cc3Wallet.address },
    },
    contracts: {
      claimSource: await claimSource.getAddress(),
      domainRegistry: await domainRegistry.getAddress(),
      assetRegistry: await assetRegistry.getAddress(),
      evidenceRegistry: await evidenceRegistry.getAddress(),
      policyRegistry: await policyRegistry.getAddress(),
      authorityRegistry: await authorityRegistry.getAddress(),
      claimRegistry: await claimRegistry.getAddress(),
      claimAsc: await claimAsc.getAddress(),
      wrongSourceAsc: await wrongSourceAsc.getAddress(),
    },
    configuration: { sourceChainKey: SOURCE_CHAIN_KEY, sourceDomainId, assetClassId, proofBuilderUrl },
    positive: {
      sourceTxHash: createTx.hash,
      sourceBlock: createReceipt.blockNumber,
      cc3AcceptTxHash: acceptTx.hash,
      claimId,
      evidenceId,
      claimState: Number(claim.state),
    },
    negative: {
      replayRejected: replayError,
      wrongChainRejected: wrongChainError,
      wrongSourceRejected: wrongSourceError,
      failedSourceTxHash: failedSent.hash,
      failedSourceBlock: failedReceipt.blockNumber,
      failedReceiptRejected: failedReceiptError,
    },
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
