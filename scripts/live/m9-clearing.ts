import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Contract, ContractFactory, JsonRpcProvider, Wallet, keccak256, toUtf8Bytes } from 'ethers';

const CC3_CHAIN_ID = 102031n;
const cc3Rpc = process.env.CREDITCOIN_RPC_HTTP ?? 'https://rpc.cc3-testnet.creditcoin.network';
const cc3Key = required('CC3_DEPLOYER_PRIVATE_KEY');
const evidencePath = process.env.EVIDENCE_PATH ?? 'evidence/runtime/m9-clearing.json';

const FACILITY_MANAGER = '0xa9662e17409976Cc2886404394ab8714E7bC7224';
const FACILITY_ID = '0x772ed1527b2137634f30da4dd62245906719b697dc7ca0bd27e11a8a2d5c7a73';
const ASSET_CLASS_ID = '0x1cda873901f7e3d40e3c769bad5e796dde83cc8879f8425ac25ac3ff12fbeb77';
const CAPITALIZATION_ROOT = '0x1ca109babcb91c33eb6124d1693b27fe6d9397cfa0730e56ce765feb3ae0f512';
const PROVIDER_A = '0x8766760e375bD43f600D23C40aDCeeDD62a60e2b';

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

async function createAndFinalize(
  ledger: Contract,
  facilityId: string,
  debtor: string,
  creditor: string,
  amount: bigint,
  maturity: bigint,
  termsLabel: string,
  kind: number,
): Promise<{ obligationId: string; createTxHash: string; finalizeTxHash: string }> {
  const policyId = keccak256(toUtf8Bytes('CLEARA_M9_OBLIGATION_POLICY_V1'));
  const termsHash = keccak256(toUtf8Bytes(termsLabel));
  const obligationId = await ledger.createObligation.staticCall(
    facilityId,
    debtor,
    creditor,
    ASSET_CLASS_ID,
    amount,
    maturity,
    policyId,
    termsHash,
    kind,
  );
  const createTx = await ledger.createObligation(
    facilityId,
    debtor,
    creditor,
    ASSET_CLASS_ID,
    amount,
    maturity,
    policyId,
    termsHash,
    kind,
  );
  const createReceipt = await createTx.wait();
  if (!createReceipt || createReceipt.status !== 1) throw new Error(`${termsLabel} creation failed`);
  const finalizeTx = await ledger.finalizeObligation(obligationId);
  const finalizeReceipt = await finalizeTx.wait();
  if (!finalizeReceipt || finalizeReceipt.status !== 1) throw new Error(`${termsLabel} finalization failed`);
  return { obligationId, createTxHash: createTx.hash, finalizeTxHash: finalizeTx.hash };
}

async function main(): Promise<void> {
  const checkedAt = new Date().toISOString();
  const provider = new JsonRpcProvider(cc3Rpc);
  const network = await provider.getNetwork();
  if (network.chainId !== CC3_CHAIN_ID) throw new Error(`CC3 chain mismatch: ${network.chainId}`);
  const wallet = new Wallet(cc3Key, provider);
  if ((await provider.getBalance(wallet.address)) === 0n) throw new Error('CC3 signer has zero balance');

  const facilityBuilt = artifact('out/FacilityManager.sol/FacilityManager.json');
  const facilityManager = new Contract(FACILITY_MANAGER, facilityBuilt.abi, wallet);
  const facility = await facilityManager.getFacility(FACILITY_ID);
  const latestBlock = await provider.getBlock('latest');
  if (!latestBlock) throw new Error('latest CC3 block unavailable');
  if (Number(facility.status) !== 6) throw new Error(`M7 facility not CAPITALIZED: ${facility.status}`);
  if (facility.assetClassId.toLowerCase() !== ASSET_CLASS_ID.toLowerCase()) throw new Error('M7 asset class drifted');
  if (facility.capitalizationRoot.toLowerCase() !== CAPITALIZATION_ROOT.toLowerCase()) {
    throw new Error('M7 capitalization root drifted');
  }
  if (BigInt(facility.capitalRequiredUntil) <= BigInt(latestBlock.timestamp)) {
    throw new Error(`M7 capitalization horizon expired at ${facility.capitalRequiredUntil}; now ${latestBlock.timestamp}`);
  }
  if (facility.sponsor.toLowerCase() !== wallet.address.toLowerCase()) throw new Error('M7 sponsor/signer mismatch');

  // M8 v1 is not upgradeable and has no clearing mutation authority. M9 therefore deploys
  // a new obligation ledger version against the same live M7 facility rather than pretending
  // the old deployment can be changed in place.
  const ledger = await deploy(wallet, 'out/ObligationLedger.sol/ObligationLedger.json', [wallet.address, FACILITY_MANAGER]);
  const policyRegistry = await deploy(wallet, 'out/ClearingPolicyRegistry.sol/ClearingPolicyRegistry.json', [wallet.address]);
  const clearingEngine = await deploy(wallet, 'out/ClearingEngine.sol/ClearingEngine.json', [
    wallet.address,
    await ledger.getAddress(),
    await policyRegistry.getAddress(),
  ]);
  await (await ledger.bindClearingEngine(await clearingEngine.getAddress())).wait();

  const sponsor = wallet.address;
  const maturity = BigInt(latestBlock.timestamp + 12 * 60 * 60);
  const drawdown = await createAndFinalize(
    ledger,
    FACILITY_ID,
    PROVIDER_A,
    sponsor,
    400_000n,
    maturity,
    'CLEARA_M9_DRAWDOWN_PROVIDER_A_400K',
    1,
  );
  const fee = await createAndFinalize(
    ledger,
    FACILITY_ID,
    sponsor,
    PROVIDER_A,
    60_000n,
    maturity,
    'CLEARA_M9_FINANCING_FEE_SPONSOR_TO_PROVIDER_A_60K',
    4,
  );

  const compatibilityHash = keccak256(
    toUtf8Bytes('CLEARA_M9_BILATERAL_SAME_ASSET_PRIORITY_JURISDICTION_PARTICIPANTS_V1'),
  );
  const clearingPolicyId = await policyRegistry.configurePolicy.staticCall(ASSET_CLASS_ID, compatibilityHash, 1);
  await (await policyRegistry.configurePolicy(ASSET_CLASS_ID, compatibilityHash, 1)).wait();

  const epochId = await clearingEngine.openEpoch.staticCall(clearingPolicyId, ASSET_CLASS_ID);
  await (await clearingEngine.openEpoch(clearingPolicyId, ASSET_CLASS_ID)).wait();

  const unauthorizedSetoffRejected = await expectRevert(async () => {
    const tx = await clearingEngine.sealBilateral(epochId, drawdown.obligationId, fee.obligationId);
    await tx.wait();
  });
  const epochAfterUnauthorized = await clearingEngine.getEpoch(epochId);
  if (Number(epochAfterUnauthorized.status) !== 1) throw new Error('unauthorized setoff mutated epoch');
  if ((await ledger.remainingAmount(drawdown.obligationId)) !== 400_000n) throw new Error('unauthorized setoff mutated drawdown');
  if ((await ledger.remainingAmount(fee.obligationId)) !== 60_000n) throw new Error('unauthorized setoff mutated fee');

  await (await ledger.authorizeClearing(drawdown.obligationId, clearingPolicyId)).wait();
  await (await ledger.authorizeClearing(fee.obligationId, clearingPolicyId)).wait();
  await (await clearingEngine.sealBilateral(epochId, drawdown.obligationId, fee.obligationId)).wait();
  await (await clearingEngine.computeBilateral(epochId)).wait();

  const computed = await clearingEngine.getEpoch(epochId);
  if (computed.grossBefore !== 460_000n) throw new Error(`grossBefore mismatch: ${computed.grossBefore}`);
  if (computed.clearingAmount !== 60_000n) throw new Error(`clearingAmount mismatch: ${computed.clearingAmount}`);
  if (computed.grossAfter !== 340_000n) throw new Error(`grossAfter mismatch: ${computed.grossAfter}`);
  if (computed.movementReduced !== 120_000n) throw new Error(`movementReduced mismatch: ${computed.movementReduced}`);

  await (await clearingEngine.finalizeBilateral(epochId)).wait();
  const finalizedEpoch = await clearingEngine.getEpoch(epochId);
  const drawdownAfter = await ledger.getObligation(drawdown.obligationId);
  const feeAfter = await ledger.getObligation(fee.obligationId);
  const drawdownRemaining = await ledger.remainingAmount(drawdown.obligationId);
  const feeRemaining = await ledger.remainingAmount(fee.obligationId);

  if (Number(finalizedEpoch.status) !== 4) throw new Error('epoch not FINALIZED');
  if (drawdownAfter.clearedAmount !== 60_000n || feeAfter.clearedAmount !== 60_000n) {
    throw new Error('cleared amounts mismatch');
  }
  if (drawdownRemaining !== 340_000n || feeRemaining !== 0n) throw new Error('residual math mismatch');
  if (Number(drawdownAfter.status) !== 5 || Number(feeAfter.status) !== 5) throw new Error('obligations not CLEARED');

  const multilateralRejected = await expectRevert(async () => {
    const tx = await policyRegistry.configurePolicy(
      ASSET_CLASS_ID,
      keccak256(toUtf8Bytes('M9_MULTILATERAL_FORBIDDEN')),
      2,
    );
    await tx.wait();
  });
  const resealRejected = await expectRevert(async () => {
    const tx = await clearingEngine.sealBilateral(epochId, drawdown.obligationId, fee.obligationId);
    await tx.wait();
  });

  const evidence = {
    status: 'PASS',
    checkedAt,
    network: { chainId: CC3_CHAIN_ID, signer: wallet.address, blockTimestamp: latestBlock.timestamp },
    reusedM7: {
      facilityManager: FACILITY_MANAGER,
      facilityId: FACILITY_ID,
      sponsor,
      assetClassId: facility.assetClassId,
      capitalizationRoot: facility.capitalizationRoot,
      capitalRequiredUntil: facility.capitalRequiredUntil,
      status: Number(facility.status),
    },
    deployments: {
      obligationLedgerV2: await ledger.getAddress(),
      clearingPolicyRegistry: await policyRegistry.getAddress(),
      clearingEngine: await clearingEngine.getAddress(),
    },
    obligations: {
      drawdown: {
        ...drawdown,
        debtor: PROVIDER_A,
        creditor: sponsor,
        originalAmount: 400_000n,
        clearedAmount: drawdownAfter.clearedAmount,
        remaining: drawdownRemaining,
        status: Number(drawdownAfter.status),
      },
      financingFee: {
        ...fee,
        debtor: sponsor,
        creditor: PROVIDER_A,
        originalAmount: 60_000n,
        clearedAmount: feeAfter.clearedAmount,
        remaining: feeRemaining,
        status: Number(feeAfter.status),
      },
    },
    clearingPolicy: {
      clearingPolicyId,
      compatibilityHash,
      mode: 'BILATERAL',
      note: 'Compatibility hash is an explicit governed assertion; this run does not prove legal setoff enforceability.',
    },
    epoch: {
      epochId,
      inputRoot: finalizedEpoch.inputRoot,
      grossBefore: finalizedEpoch.grossBefore,
      clearingAmount: finalizedEpoch.clearingAmount,
      grossAfter: finalizedEpoch.grossAfter,
      movementReduced: finalizedEpoch.movementReduced,
      status: Number(finalizedEpoch.status),
    },
    negative: {
      reciprocityWithoutAuthorizationRejected: unauthorizedSetoffRejected,
      multilateralPolicyRejected: multilateralRejected,
      resealRejected,
    },
    semanticBoundary:
      'M9 authorizes and executes bilateral setoff only. It records clearing extinguishment but creates no ResidualLedger entry and performs no settlement.',
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
