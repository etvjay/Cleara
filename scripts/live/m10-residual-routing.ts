import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Contract, ContractFactory, JsonRpcProvider, Wallet, keccak256, toUtf8Bytes } from 'ethers';

const CC3_CHAIN_ID = 102031n;
const rpc = process.env.CREDITCOIN_RPC_HTTP ?? 'https://rpc.cc3-testnet.creditcoin.network';
const key = required('CC3_DEPLOYER_PRIVATE_KEY');
const evidencePath = process.env.EVIDENCE_PATH ?? 'evidence/runtime/m10-residual-routing.json';

const CLEARING_ENGINE = '0xe87835B72e49EEBe4778c8769A0546a216A71f69';
const OBLIGATION_LEDGER = '0xCe29e08e9668aa0c3CE3A2C9E29774a2233abB86';
const EPOCH_ID = '0xb16d67f3a82e4e79409c344f012565125e77fbd2293be85404a7de10abf1f8c2';
const DRAWDOWN_ID = '0x330647cb907ce83563e27d406c3c3789b2756705ff4cbb1aa8c63a65d0966129';
const FEE_ID = '0x2368e5edab11f2c0bafdf20672794924523581b71abccb1531e6c921b379d3f7';
const ASSET_CLASS_ID = '0x1cda873901f7e3d40e3c769bad5e796dde83cc8879f8425ac25ac3ff12fbeb77';
const PROVIDER_A = '0x8766760e375bD43f600D23C40aDCeeDD62a60e2b';
const SPONSOR = '0x5ac98dc6f8408564645f36195aC0F9c5B1c0C0C8';

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
  const provider = new JsonRpcProvider(rpc);
  const network = await provider.getNetwork();
  if (network.chainId !== CC3_CHAIN_ID) throw new Error(`CC3 chain mismatch: ${network.chainId}`);

  const wallet = new Wallet(key, provider);
  if (wallet.address.toLowerCase() !== SPONSOR.toLowerCase()) throw new Error('M9 sponsor/signer mismatch');
  if ((await provider.getBalance(wallet.address)) === 0n) throw new Error('CC3 signer has zero balance');

  const clearingBuilt = artifact('out/ClearingEngine.sol/ClearingEngine.json');
  const obligationBuilt = artifact('out/ObligationLedger.sol/ObligationLedger.json');
  const clearing = new Contract(CLEARING_ENGINE, clearingBuilt.abi, wallet);
  const obligations = new Contract(OBLIGATION_LEDGER, obligationBuilt.abi, wallet);

  if ((await clearing.obligationLedger()).toLowerCase() !== OBLIGATION_LEDGER.toLowerCase()) {
    throw new Error('M9 ClearingEngine/ObligationLedger binding drifted');
  }

  const epoch = await clearing.getEpoch(EPOCH_ID);
  if (Number(epoch.status) !== 4) throw new Error(`M9 epoch not FINALIZED: ${epoch.status}`);
  if (epoch.assetClassId.toLowerCase() !== ASSET_CLASS_ID.toLowerCase()) throw new Error('M9 epoch asset drifted');
  if (epoch.grossBefore !== 460_000n || epoch.clearingAmount !== 60_000n || epoch.grossAfter !== 340_000n) {
    throw new Error('M9 clearing economics drifted');
  }
  if (epoch.obligationA.toLowerCase() !== DRAWDOWN_ID.toLowerCase()) throw new Error('M9 drawdown membership drifted');
  if (epoch.obligationB.toLowerCase() !== FEE_ID.toLowerCase()) throw new Error('M9 fee membership drifted');

  const drawdownBefore = await obligations.getObligation(DRAWDOWN_ID);
  const feeBefore = await obligations.getObligation(FEE_ID);
  if (drawdownBefore.debtor.toLowerCase() !== PROVIDER_A.toLowerCase()) throw new Error('drawdown debtor drifted');
  if (drawdownBefore.creditor.toLowerCase() !== SPONSOR.toLowerCase()) throw new Error('drawdown creditor drifted');
  if (drawdownBefore.clearedAmount !== 60_000n || drawdownBefore.settledAmount !== 0n) {
    throw new Error('drawdown accounting drifted');
  }
  if (feeBefore.clearedAmount !== 60_000n || feeBefore.settledAmount !== 0n) throw new Error('fee accounting drifted');
  if ((await obligations.remainingAmount(DRAWDOWN_ID)) !== 340_000n) throw new Error('drawdown residual drifted');
  if ((await obligations.remainingAmount(FEE_ID)) !== 0n) throw new Error('fee should be extinguished');

  const residualLedger = await deploy(wallet, 'out/ResidualLedger.sol/ResidualLedger.json', [wallet.address, CLEARING_ENGINE]);
  const router = await deploy(wallet, 'out/SettlementRouter.sol/SettlementRouter.json', [
    wallet.address,
    await residualLedger.getAddress(),
  ]);
  await (await residualLedger.bindSettlementRouter(await router.getAddress())).wait();

  const residualId = await residualLedger.createBilateralResidual.staticCall(EPOCH_ID);
  const createTx = await residualLedger.createBilateralResidual(EPOCH_ID);
  const createReceipt = await createTx.wait();
  if (!createReceipt || createReceipt.status !== 1) throw new Error('residual creation failed');

  const created = await residualLedger.getResidual(residualId);
  if (created.sourceObligationId.toLowerCase() !== DRAWDOWN_ID.toLowerCase()) throw new Error('wrong residual source');
  if (created.debtor.toLowerCase() !== PROVIDER_A.toLowerCase()) throw new Error('wrong residual debtor');
  if (created.creditor.toLowerCase() !== SPONSOR.toLowerCase()) throw new Error('wrong residual creditor');
  if (created.assetClassId.toLowerCase() !== ASSET_CLASS_ID.toLowerCase()) throw new Error('wrong residual asset');
  if (created.amount !== 340_000n || Number(created.status) !== 1) throw new Error('wrong residual state');

  const duplicateResidualRejected = await expectRevert(async () => {
    const tx = await residualLedger.createBilateralResidual(EPOCH_ID);
    await tx.wait();
  });

  // These are explicit test-only route identifiers. M10 records network-qualified fields but
  // does not yet authenticate them against DomainRegistry / AssetRegistry; that remains a known limitation.
  const adapterId = keccak256(toUtf8Bytes('CLEARA_M10_MANUAL_TESTNET_ADAPTER_V1'));
  const settlementDomainId = keccak256(toUtf8Bytes('CLEARA_M10_TEST_ONLY_SEPOLIA_DOMAIN_V1'));
  const settlementRepresentationId = keccak256(toUtf8Bytes('CLEARA_M10_TEST_ONLY_USD_REPRESENTATION_V1'));
  const routeDataHash = keccak256(
    toUtf8Bytes(`CLEARA_M10_ROUTE:${PROVIDER_A}:${SPONSOR}:340000:${ASSET_CLASS_ID}`),
  );

  const settlementId = await router.routeResidual.staticCall(
    residualId,
    adapterId,
    settlementDomainId,
    settlementRepresentationId,
    routeDataHash,
  );
  const routeTx = await router.routeResidual(
    residualId,
    adapterId,
    settlementDomainId,
    settlementRepresentationId,
    routeDataHash,
  );
  const routeReceipt = await routeTx.wait();
  if (!routeReceipt || routeReceipt.status !== 1) throw new Error('route creation failed');

  const routed = await residualLedger.getResidual(residualId);
  const instruction = await router.getInstruction(settlementId);
  const drawdownAfter = await obligations.getObligation(DRAWDOWN_ID);
  const feeAfter = await obligations.getObligation(FEE_ID);

  if (Number(routed.status) !== 2) throw new Error('residual not ROUTED');
  if (Number(instruction.status) !== 1) throw new Error('instruction not ROUTED');
  if (instruction.residualId.toLowerCase() !== residualId.toLowerCase()) throw new Error('instruction residual mismatch');
  if (drawdownAfter.settledAmount !== 0n || feeAfter.settledAmount !== 0n) {
    throw new Error('routing mutated settlement accounting');
  }

  const duplicateRouteRejected = await expectRevert(async () => {
    const tx = await router.routeResidual(
      residualId,
      keccak256(toUtf8Bytes('CLEARA_M10_SECOND_ADAPTER_FORBIDDEN')),
      settlementDomainId,
      settlementRepresentationId,
      routeDataHash,
    );
    await tx.wait();
  });

  const latest = await provider.getBlock('latest');
  const evidence = {
    status: 'PASS',
    checkedAt,
    network: { chainId: CC3_CHAIN_ID, signer: wallet.address, blockTimestamp: latest?.timestamp ?? null },
    reusedM9: {
      clearingEngine: CLEARING_ENGINE,
      obligationLedger: OBLIGATION_LEDGER,
      epochId: EPOCH_ID,
      epochStatus: Number(epoch.status),
      assetClassId: epoch.assetClassId,
      grossBefore: epoch.grossBefore,
      clearingAmount: epoch.clearingAmount,
      grossAfter: epoch.grossAfter,
      movementReduced: epoch.movementReduced,
      drawdownObligationId: DRAWDOWN_ID,
      feeObligationId: FEE_ID,
    },
    deployments: {
      residualLedger: await residualLedger.getAddress(),
      settlementRouter: await router.getAddress(),
    },
    residual: {
      residualId,
      createTxHash: createTx.hash,
      epochId: created.epochId,
      sourceObligationId: created.sourceObligationId,
      debtor: created.debtor,
      creditor: created.creditor,
      assetClassId: created.assetClassId,
      amount: created.amount,
      residualIndex: created.residualIndex,
      statusBeforeRoute: 1,
      statusAfterRoute: Number(routed.status),
    },
    route: {
      settlementId,
      routeTxHash: routeTx.hash,
      adapterId,
      settlementDomainId,
      settlementRepresentationId,
      routeDataHash,
      settlementNonce: instruction.settlementNonce,
      status: Number(instruction.status),
      identifiersAuthenticatedAgainstRegistries: false,
    },
    settlementAccounting: {
      drawdownSettledBefore: drawdownBefore.settledAmount,
      drawdownSettledAfter: drawdownAfter.settledAmount,
      feeSettledBefore: feeBefore.settledAmount,
      feeSettledAfter: feeAfter.settledAmount,
    },
    negative: {
      duplicateResidualRejected,
      duplicateRouteRejected,
    },
    semanticBoundary:
      'M10 derives a canonical economic residual from a FINALIZED M9 epoch and records one settlement route instruction. It does not call a settlement adapter, move value, authenticate route IDs against registries, or mark any obligation/residual SETTLED.',
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
