import { Interface } from "ethers";
import type { SourceScopeManifest } from "../../source-scope/src/manifest.js";
import { loadCanonicalD0Manifest } from "./canonical-manifest.js";
import type {
  FixtureDataset,
  SourceBlockHeader,
  SourceChainIdentity,
  SourceLog,
  SourceTransactionReceipt,
} from "./types.js";

export const manifest = loadCanonicalD0Manifest().manifest;

export const identity: SourceChainIdentity = {
  sourceDomain: manifest.sourceDomain,
  chainKey: manifest.chainKey,
  evmChainId: manifest.evmChainId,
  adapterVersion: manifest.adapterVersion,
  schemaVersion: manifest.eventFamily.schemaVersion,
};

export function hexWord(value: number): string {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

export function txHash(value: number): string {
  return hexWord(0xa000 + value);
}

export function blockHash(value: number): string {
  return hexWord(0xb000 + value);
}

export const providerAddress = "0x0000000000000000000000000000000000000101";
export const secondProviderAddress = "0x0000000000000000000000000000000000000102";

const eventDeclaration = `event ${manifest.eventFamily.name}(${[...manifest.eventFamily.indexedFields, ...manifest.eventFamily.dataFields].map((field) => `${field.type}${field.indexed ? " indexed" : ""} ${field.name}`).join(",")})`;
const eventInterface = new Interface([eventDeclaration]);

export function makeBlock(number: number, overrides: Partial<SourceBlockHeader> = {}): SourceBlockHeader {
  return {
    blockNumber: number,
    blockHash: overrides.blockHash ?? blockHash(number),
    parentHash: overrides.parentHash ?? (number === 0 ? null : blockHash(number - 1)),
    timestamp: overrides.timestamp ?? 1_000 + number * 10,
  };
}

export interface EventOptions {
  readonly blockNumber?: number;
  readonly blockHash?: string;
  readonly transactionHash?: string;
  readonly logIndex?: number;
  readonly transactionIndex?: number;
  readonly sourceCommitmentId?: string;
  readonly facilityId?: string;
  readonly allocationId?: string;
  readonly provider?: string;
  readonly assetClassId?: string;
  readonly token?: string;
  readonly amount?: bigint;
  readonly expiresAt?: bigint;
}

export function makeEvent(options: EventOptions = {}): { log: SourceLog; receipt: SourceTransactionReceipt; block: SourceBlockHeader } {
  const blockNumber = options.blockNumber ?? 10;
  const block = makeBlock(blockNumber, { blockHash: options.blockHash });
  const transactionHash = options.transactionHash ?? txHash(blockNumber);
  const logIndex = options.logIndex ?? 0;
  const transactionIndex = options.transactionIndex ?? 0;
  const values = [
    options.sourceCommitmentId ?? hexWord(1),
    options.facilityId ?? hexWord(100),
    options.allocationId ?? hexWord(200),
    options.provider ?? providerAddress,
    options.assetClassId ?? hexWord(300),
    options.token ?? manifest.token.address,
    options.amount ?? 1_000_000n,
    options.expiresAt ?? 2_000n,
  ] as const;
  const encoded = eventInterface.encodeEventLog(manifest.eventFamily.name, values);
  const log: SourceLog = {
    address: manifest.contract.address,
    topics: [...encoded.topics],
    data: encoded.data,
    transactionHash,
    blockNumber,
    blockHash: block.blockHash,
    transactionIndex,
    logIndex,
  };
  const receipt: SourceTransactionReceipt = {
    transactionHash,
    status: 1,
    blockNumber,
    blockHash: block.blockHash,
    transactionIndex,
    logs: [log],
  };
  return { log, receipt, block };
}

export function defaultEvents(): readonly ReturnType<typeof makeEvent>[] {
  return [
    makeEvent({ blockNumber: 10, transactionHash: txHash(10), sourceCommitmentId: hexWord(1) }),
    makeEvent({ blockNumber: 11, transactionHash: txHash(11), sourceCommitmentId: hexWord(2), provider: secondProviderAddress, logIndex: 1 }),
  ];
}

export function createFixtureDataset(options: {
  readonly latestBlockNumber?: number;
  readonly blocks?: readonly SourceBlockHeader[];
  readonly events?: readonly ReturnType<typeof makeEvent>[];
} = {}): FixtureDataset {
  const blocks = options.blocks ?? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((number) => makeBlock(number));
  const events = options.events ?? defaultEvents();
  return {
    scopeId: manifest.scopeId,
    identity,
    latestBlockNumber: options.latestBlockNumber ?? 12,
    blocks,
    logs: events.map((event) => event.log),
    receipts: events.map((event) => event.receipt),
  };
}

export function createReplacementDataset(): FixtureDataset {
  const replacement = makeEvent({
    blockNumber: 10,
    blockHash: hexWord(0xc010),
    transactionHash: txHash(110),
    sourceCommitmentId: hexWord(3),
  });
  const blocks = [
    ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((number) => makeBlock(number)),
    makeBlock(10, { blockHash: hexWord(0xc010) }),
    makeBlock(11, { parentHash: hexWord(0xc010) }),
    makeBlock(12, { parentHash: blockHash(11) }),
  ];
  return { scopeId: manifest.scopeId, identity, latestBlockNumber: 12, blocks, logs: [replacement.log], receipts: [replacement.receipt] };
}

export function createReplacementDatasetMultiple(): FixtureDataset {
  const first = makeEvent({ blockNumber: 10, blockHash: hexWord(0xc010), transactionHash: txHash(110), sourceCommitmentId: hexWord(3) });
  const second = makeEvent({ blockNumber: 10, blockHash: hexWord(0xc010), transactionHash: txHash(111), sourceCommitmentId: hexWord(4), logIndex: 1, transactionIndex: 1, provider: secondProviderAddress });
  const base = createReplacementDataset();
  return { ...base, logs: [second.log, first.log], receipts: [second.receipt, first.receipt] };
}

export function manifestCopy(): SourceScopeManifest {
  return JSON.parse(JSON.stringify(manifest)) as SourceScopeManifest;
}
