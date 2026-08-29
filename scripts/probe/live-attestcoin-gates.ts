import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { JsonRpcProvider } from 'ethers';
import { blockProver, chainInfo, proofProvider } from '@gluwa/usc-sdk';

const ccRpc = process.env.CREDITCOIN_RPC_HTTP ?? 'https://rpc.cc3-testnet.creditcoin.network';
const expectedCcChainId = BigInt(process.env.CREDITCOIN_CHAIN_ID ?? '102031');
const proofBuilderUrl = process.env.ATTESTCOIN_PROOF_BUILDER_URL ?? 'https://prover.cc3-testnet.creditcoin.network/';
const sourceChainKey = Number(process.env.SOURCE_CHAIN_KEY ?? '1');
const sourceRpc = process.env.SOURCE_CHAIN_RPC_HTTP ?? 'https://ethereum-sepolia-rpc.publicnode.com';
const suppliedTxHash = process.env.SOURCE_CHAIN_TXN_HASH?.trim();
const attestedLag = BigInt(process.env.SOURCE_ATTESTED_LAG_BLOCKS ?? '5');
const evidencePath = process.env.EVIDENCE_PATH ?? 'evidence/runtime/attestcoin-gates.json';

function serialise(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v), 2);
}

function tamperHex(hex: string): string {
  if (!hex.startsWith('0x') || hex.length < 4) throw new Error('cannot tamper non-hex txBytes');
  const last = hex.at(-1)!;
  const replacement = last === '0' ? '1' : '0';
  return `${hex.slice(0, -1)}${replacement}`;
}

async function selectSuccessfulTransaction(
  provider: JsonRpcProvider,
  startHeight: bigint,
  maxBlocks = 40,
): Promise<{ hash: string; blockNumber: bigint }> {
  for (let offset = 0n; offset < BigInt(maxBlocks); offset++) {
    const height = startHeight - offset;
    if (height <= 0n) break;
    const rawBlock = await provider.send('eth_getBlockByNumber', [`0x${height.toString(16)}`, true]);
    const transactions: Array<{ hash?: string }> = rawBlock?.transactions ?? [];
    for (const tx of transactions) {
      if (!tx.hash) continue;
      const receipt = await provider.getTransactionReceipt(tx.hash);
      if (receipt?.status === 1) return { hash: tx.hash, blockNumber: BigInt(receipt.blockNumber) };
    }
  }
  throw new Error(`no successful source transaction found within ${maxBlocks} blocks from ${startHeight}`);
}

async function main(): Promise<void> {
  const checkedAt = new Date().toISOString();
  const ccProvider = new JsonRpcProvider(ccRpc);
  const sourceProvider = new JsonRpcProvider(sourceRpc);

  // G0 — Creditcoin environment.
  const ccNetwork = await ccProvider.getNetwork();
  if (ccNetwork.chainId !== expectedCcChainId) {
    throw new Error(`G0 chain mismatch: expected ${expectedCcChainId}, received ${ccNetwork.chainId}`);
  }
  const ccBlockNumber = await ccProvider.getBlockNumber();

  // G1 — live ChainInfo and supported source chain.
  const info = new chainInfo.PrecompileChainInfoProvider(ccProvider);
  const supportedChains = await info.getSupportedChains();
  if (!supportedChains.some((entry: any) => Number(entry.chainKey) === sourceChainKey)) {
    throw new Error(`G1 source chainKey ${sourceChainKey} is not supported by live ChainInfo`);
  }
  const latestAttested = await info.getLatestAttestedHeightAndHash(sourceChainKey);
  const latestAttestedHeight = BigInt((latestAttested as any).height);

  // Select a successful transaction from already-attested source history when no fixture is supplied.
  let sourceTxHash = suppliedTxHash;
  let sourceBlockNumber: bigint;
  if (sourceTxHash) {
    const tx = await sourceProvider.getTransaction(sourceTxHash);
    if (!tx?.blockNumber) throw new Error(`source transaction ${sourceTxHash} not found or not mined`);
    const receipt = await sourceProvider.getTransactionReceipt(sourceTxHash);
    if (!receipt || receipt.status !== 1) throw new Error(`source transaction ${sourceTxHash} did not succeed`);
    sourceBlockNumber = BigInt(tx.blockNumber);
  } else {
    const safeHeight = latestAttestedHeight > attestedLag ? latestAttestedHeight - attestedLag : latestAttestedHeight;
    const selected = await selectSuccessfulTransaction(sourceProvider, safeHeight);
    sourceTxHash = selected.hash;
    sourceBlockNumber = selected.blockNumber;
  }

  if (!sourceTxHash) throw new Error('source transaction selection failed');
  if (sourceBlockNumber > latestAttestedHeight) {
    await info.waitUntilHeightAttested(sourceChainKey, Number(sourceBlockNumber));
  }

  // G2 — proof construction from the hosted Proof Builder.
  const builder = new proofProvider.service.ProofBuilder(sourceChainKey, proofBuilderUrl);
  await builder.waitUntilHeightAttested(sourceChainKey, Number(sourceBlockNumber), 15_000, 300_000);
  const proofResult = await builder.getProof(sourceTxHash);
  if (!proofResult.success || !proofResult.data) {
    throw new Error(`G2 proof generation failed: ${proofResult.error ?? 'unknown error'}`);
  }
  const proof = proofResult.data;

  // G3 — positive and adversarial verification through Creditcoin Block Prover.
  const prover = new blockProver.PrecompileBlockProver(ccProvider);
  const validResult = await prover.verifySingle(
    proof.chainKey,
    proof.headerNumber,
    proof.txBytes,
    proof.merkleProof,
    proof.continuityProof,
  );
  if (!validResult) throw new Error('G3 valid proof was rejected');

  let tamperedRejected = false;
  try {
    const tamperedResult = await prover.verifySingle(
      proof.chainKey,
      proof.headerNumber,
      tamperHex(proof.txBytes),
      proof.merkleProof,
      proof.continuityProof,
    );
    tamperedRejected = !tamperedResult;
  } catch {
    tamperedRejected = true;
  }
  if (!tamperedRejected) throw new Error('G3 tampered proof was unexpectedly accepted');

  const evidence = {
    status: 'PASS',
    checkedAt,
    gates: { G0: 'PASS', G1: 'PASS', G2: 'PASS', G3: 'PASS' },
    creditcoin: {
      rpc: ccRpc,
      chainId: ccNetwork.chainId.toString(),
      blockNumber: ccBlockNumber.toString(),
    },
    attestcoin: {
      sourceChainKey,
      proofBuilderUrl,
      supportedChains,
      latestAttested,
    },
    source: {
      rpc: sourceRpc,
      txHash: sourceTxHash,
      blockNumber: sourceBlockNumber.toString(),
    },
    proof: {
      chainKey: proof.chainKey,
      headerNumber: proof.headerNumber,
      validAccepted: Boolean(validResult),
      tamperedRejected,
    },
  };

  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, `${serialise(evidence)}\n`, 'utf8');
  console.log(serialise(evidence));
}

main().catch((error) => {
  const failure = {
    status: 'FAIL',
    checkedAt: new Date().toISOString(),
    error: error instanceof Error ? error.message : String(error),
  };
  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, `${serialise(failure)}\n`, 'utf8');
  console.error(serialise(failure));
  process.exit(1);
});
