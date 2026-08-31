import { readFileSync } from 'node:fs';
import { Interface, JsonRpcProvider, getAddress } from 'ethers';

const evidencePath = process.env.EVIDENCE_PATH ?? 'evidence/runtime/m11-settlement.json';
const sepoliaRpc = process.env.SEPOLIA_RPC_HTTP ?? 'https://ethereum-sepolia-rpc.publicnode.com';
const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));

if (evidence.status !== 'PASS') throw new Error(`M11 evidence is not PASS: ${evidence.status}`);

const source = evidence.sourceSettlement;
if (!source?.txHash || !source?.debtor || !source?.creditor || !source?.token || source?.amount == null) {
  throw new Error('M11 sourceSettlement evidence is incomplete');
}

const provider = new JsonRpcProvider(sepoliaRpc);
const receipt = await provider.getTransactionReceipt(source.txHash);
if (!receipt) throw new Error(`missing Sepolia receipt ${source.txHash}`);
if (receipt.status !== 1) throw new Error(`source settlement receipt status is ${receipt.status}, expected 1`);

const transfer = new Interface(['event Transfer(address indexed from,address indexed to,uint256 value)']);
const transferTopic = transfer.getEvent('Transfer')!.topicHash;
const token = getAddress(source.token);
const debtor = getAddress(source.debtor);
const creditor = getAddress(source.creditor);
const amount = BigInt(source.amount);

const matches: Array<{ logIndex: number; payer: string; recipient: string; amount: string }> = [];
for (const log of receipt.logs) {
  if (getAddress(log.address) !== token || log.topics[0] !== transferTopic) continue;
  const parsed = transfer.parseLog(log);
  if (!parsed) continue;
  const payer = getAddress(parsed.args.from);
  const recipient = getAddress(parsed.args.to);
  const value = BigInt(parsed.args.value);
  if (payer === debtor && recipient === creditor && value === amount) {
    matches.push({ logIndex: log.index, payer, recipient, amount: value.toString() });
  }
}

if (matches.length !== 1) {
  throw new Error(`expected exactly one matching ERC20 Transfer, found ${matches.length}`);
}

if (getAddress(evidence.identityContinuity.cc3ResidualDebtor) !== matches[0].payer) {
  throw new Error('Transfer topics[1] payer does not match CC3 residual debtor');
}

console.log(
  JSON.stringify(
    {
      status: 'PASS',
      txHash: source.txHash,
      receiptStatus: receipt.status,
      token,
      transferLogIndex: matches[0].logIndex,
      payerFromTransferTopic1: matches[0].payer,
      recipientFromTransferTopic2: matches[0].recipient,
      amount: matches[0].amount,
      txFromNotUsedAsEconomicPayer: true,
    },
    null,
    2,
  ),
);
