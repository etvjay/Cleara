import { readFileSync } from 'node:fs';
import { AbiCoder, JsonRpcProvider, keccak256, toUtf8Bytes, zeroPadValue } from 'ethers';

const SEPOLIA_CHAIN_ID = 11155111n;
const CAPITAL_CONSUMED_SIG = keccak256(toUtf8Bytes('CapitalConsumed(bytes32,address,uint256)'));
const CAPITAL_EXPIRED_SIG = keccak256(toUtf8Bytes('CapitalExpired(bytes32,address,uint256)'));
const evidencePath = process.env.EVIDENCE_PATH ?? 'evidence/runtime/m11-lifecycle.json';
const sourceRpc = process.env.SEPOLIA_RPC_HTTP ?? 'https://ethereum-sepolia-rpc.publicnode.com';

function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`missing ${name}`);
  return value;
}

function requireEqual(actual: unknown, expected: unknown, name: string): void {
  if (actual !== expected) throw new Error(`${name}: expected ${String(expected)}, got ${String(actual)}`);
}

function topicAddress(address: string): string {
  return zeroPadValue(address, 32).toLowerCase();
}

async function validateSourceLifecycleReceipt(
  provider: JsonRpcProvider,
  txHash: string,
  expectedSignature: string,
  sourceCommitmentId: string,
  actor: string,
  amount: bigint,
  vault: string,
): Promise<void> {
  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt) throw new Error(`receipt unavailable: ${txHash}`);
  requireEqual(receipt.status, 1, `receipt status ${txHash}`);
  if (!receipt.to || receipt.to.toLowerCase() !== vault.toLowerCase()) {
    throw new Error(`receipt target is not the configured source vault: ${txHash}`);
  }

  const matching = receipt.logs.filter((log) => log.topics[0]?.toLowerCase() === expectedSignature.toLowerCase());
  requireEqual(matching.length, 1, `lifecycle event count ${txHash}`);
  const log = matching[0];
  requireEqual(log.address.toLowerCase(), vault.toLowerCase(), `lifecycle event contract ${txHash}`);
  requireEqual(log.topics.length, 3, `lifecycle topic count ${txHash}`);
  requireEqual(log.topics[1].toLowerCase(), sourceCommitmentId.toLowerCase(), `source commitment topic ${txHash}`);
  requireEqual(log.topics[2].toLowerCase(), topicAddress(actor), `actor topic ${txHash}`);
  requireEqual(log.data.length, 66, `lifecycle amount data length ${txHash}`);
  const decodedAmount = AbiCoder.defaultAbiCoder().decode(['uint256'], log.data)[0] as bigint;
  requireEqual(decodedAmount, amount, `lifecycle amount ${txHash}`);
}

async function main(): Promise<void> {
  const evidence = JSON.parse(readFileSync(evidencePath, 'utf8')) as any;
  requireEqual(evidence.status, 'PASS', 'evidence status');
  requireEqual(BigInt(evidence.networks.sepolia.chainId), SEPOLIA_CHAIN_ID, 'Sepolia chain id');
  requireEqual(evidence.attestcoin.chainKey, 1, 'Attestcoin chain key');

  const amountConsumed = BigInt(evidence.source.commitmentConsumed.amount);
  const amountExpired = BigInt(evidence.source.commitmentExpired.amount);
  requireEqual(amountConsumed, amountExpired, 'consume/expiry amount parity');
  requireEqual(Number(evidence.source.commitmentConsumed.status), 2, 'source consumed status');
  requireEqual(Number(evidence.source.commitmentExpired.status), 4, 'source expired status');

  requireEqual(Number(evidence.creditcoin.commitmentConsumedStatus), 4, 'Creditcoin consumed commitment status');
  requireEqual(Number(evidence.creditcoin.commitmentExpiredStatus), 6, 'Creditcoin expired commitment status');
  requireEqual(Number(evidence.creditcoin.allocationConsumedStatus), 4, 'Creditcoin consumed allocation status');
  requireEqual(Number(evidence.creditcoin.allocationExpiredStatus), 5, 'Creditcoin expired allocation status');
  requireEqual(BigInt(evidence.creditcoin.grossCommittedAmount), amountConsumed + amountExpired, 'gross commitment amount');
  requireEqual(BigInt(evidence.creditcoin.consumedAmount), amountConsumed, 'consumed facility amount');
  requireEqual(BigInt(evidence.creditcoin.expiredAmount), amountExpired, 'expired facility amount');
  requireEqual(BigInt(evidence.creditcoin.activeCommittedAmount), 0n, 'active facility amount');
  requireEqual(evidence.attestcoin.consumeEvidenceConsumed, true, 'consume evidence consumed');
  requireEqual(evidence.attestcoin.expireEvidenceConsumed, true, 'expiry evidence consumed');
  requireEqual(evidence.invariant.grossEqualsTerminalPlusActive, true, 'gross accounting invariant');
  requireEqual(evidence.invariant.sourceVaultEmpty, true, 'source vault empty invariant');
  requireString(evidence.negative.replayRejected, 'replay rejection');
  requireString(evidence.negative.wrongChainRejected, 'wrong-chain rejection');

  const provider = new JsonRpcProvider(sourceRpc);
  if ((await provider.getNetwork()).chainId !== SEPOLIA_CHAIN_ID) throw new Error('source RPC chain mismatch');
  const vault = requireString(evidence.contracts.capitalCommitmentVault, 'source vault address');
  await validateSourceLifecycleReceipt(
    provider,
    requireString(evidence.source.commitmentConsumed.txHash, 'consume transaction hash'),
    CAPITAL_CONSUMED_SIG,
    requireString(evidence.source.commitmentConsumed.sourceCommitmentId, 'consumed source commitment id'),
    requireString(evidence.source.commitmentConsumed.recipient, 'consume recipient'),
    amountConsumed,
    vault,
  );
  await validateSourceLifecycleReceipt(
    provider,
    requireString(evidence.source.commitmentExpired.txHash, 'expiry transaction hash'),
    CAPITAL_EXPIRED_SIG,
    requireString(evidence.source.commitmentExpired.sourceCommitmentId, 'expired source commitment id'),
    requireString(evidence.source.commitmentExpired.provider, 'expiry provider'),
    amountExpired,
    vault,
  );

  const result = {
    status: 'PASS',
    checkedAt: new Date().toISOString(),
    evidencePath,
    sourceReceipts: 'PASS',
    protocolEvidence: 'PASS',
  };
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(JSON.stringify({ status: 'FAIL', error: message }, null, 2));
  process.exitCode = 1;
});
