import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Contract, ContractFactory, JsonRpcProvider, Wallet, keccak256, toUtf8Bytes } from 'ethers';

const CC3_CHAIN_ID = 102031n;
const cc3Rpc = process.env.CREDITCOIN_RPC_HTTP ?? 'https://rpc.cc3-testnet.creditcoin.network';
const cc3Key = required('CC3_DEPLOYER_PRIVATE_KEY');
const evidencePath = process.env.EVIDENCE_PATH ?? 'evidence/runtime/m8-obligations.json';

const FACILITY_MANAGER = '0xa9662e17409976Cc2886404394ab8714E7bC7224';
const FACILITY_ID = '0x772ed1527b2137634f30da4dd62245906719b697dc7ca0bd27e11a8a2d5c7a73';
const EXPECTED_ASSET_CLASS = '0x1cda873901f7e3d40e3c769bad5e796dde83cc8879f8425ac25ac3ff12fbeb77';
const EXPECTED_CAPITALIZATION_ROOT = '0x1ca109babcb91c33eb6124d1693b27fe6d9397cfa0730e56ce765feb3ae0f512';

const PROVIDERS = [
  { address: '0x8766760e375bD43f600D23C40aDCeeDD62a60e2b', amount: 400_000n },
  { address: '0x9c97121F58967a5D4E060467aa4ec704A4c20D8c', amount: 350_000n },
  { address: '0xA4498B69683178ab46133BEc4A140de670A0C2D2', amount: 250_000n },
] as const;

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
  const provider = new JsonRpcProvider(cc3Rpc);
  const network = await provider.getNetwork();
  if (network.chainId !== CC3_CHAIN_ID) throw new Error(`CC3 chain mismatch: ${network.chainId}`);

  const wallet = new Wallet(cc3Key, provider);
  if ((await provider.getBalance(wallet.address)) === 0n) throw new Error('CC3 signer has zero balance');

  const facilityArtifact = artifact('out/FacilityManager.sol/FacilityManager.json');
  const facilityManager = new Contract(FACILITY_MANAGER, facilityArtifact.abi, wallet);
  const facility = await facilityManager.getFacility(FACILITY_ID);
  const latestBlock = await provider.getBlock('latest');
  if (!latestBlock) throw new Error('latest CC3 block unavailable');

  if (Number(facility.status) !== 6) throw new Error(`M7 facility is not CAPITALIZED: ${facility.status}`);
  if (facility.assetClassId.toLowerCase() !== EXPECTED_ASSET_CLASS.toLowerCase()) throw new Error('M7 asset class drifted');
  if (facility.capitalizationRoot.toLowerCase() !== EXPECTED_CAPITALIZATION_ROOT.toLowerCase()) {
    throw new Error('M7 capitalization root drifted');
  }
  if (BigInt(facility.capitalRequiredUntil) <= BigInt(latestBlock.timestamp)) {
    throw new Error(`M7 capitalization horizon expired at ${facility.capitalRequiredUntil}; CC3 now ${latestBlock.timestamp}`);
  }
  if (facility.committedAmount !== 1_000_000n || facility.allocatedAmount !== 1_000_000n) {
    throw new Error('M7 facility accounting drifted');
  }

  const obligations = await deploy(wallet, 'out/ObligationLedger.sol/ObligationLedger.json', [wallet.address, FACILITY_MANAGER]);
  const borrower = facility.sponsor as string;
  if (borrower.toLowerCase() !== wallet.address.toLowerCase()) {
    throw new Error(`M7 sponsor/signer mismatch: sponsor=${borrower} signer=${wallet.address}`);
  }

  const maturity = BigInt(latestBlock.timestamp + 12 * 60 * 60);
  const policyId = keccak256(toUtf8Bytes('CLEARA_M8_DRAWDOWN_POLICY_V1'));
  const issued: any[] = [];
  let totalRemaining = 0n;

  for (let i = 0; i < PROVIDERS.length; i++) {
    const item = PROVIDERS[i];
    const termsHash = keccak256(toUtf8Bytes(`CLEARA_M8_DRAWDOWN_TERMS_V1:${i}:${item.address}:${item.amount}`));
    const expectedId = await obligations.computeObligationId(
      FACILITY_ID,
      item.address,
      borrower,
      EXPECTED_ASSET_CLASS,
      BigInt(i),
    );

    const obligationId = await obligations.createObligation.staticCall(
      FACILITY_ID,
      item.address,
      borrower,
      EXPECTED_ASSET_CLASS,
      item.amount,
      maturity,
      policyId,
      termsHash,
      1,
    );
    if (obligationId !== expectedId) throw new Error(`canonical obligation id mismatch at nonce ${i}`);

    const createTx = await obligations.createObligation(
      FACILITY_ID,
      item.address,
      borrower,
      EXPECTED_ASSET_CLASS,
      item.amount,
      maturity,
      policyId,
      termsHash,
      1,
    );
    const createReceipt = await createTx.wait();
    if (!createReceipt || createReceipt.status !== 1) throw new Error(`obligation ${i} creation failed`);

    const created = await obligations.getObligation(obligationId);
    if (Number(created.status) !== 1) throw new Error(`obligation ${i} not CREATED`);
    if (created.originalAmount !== item.amount || created.clearedAmount !== 0n || created.settledAmount !== 0n) {
      throw new Error(`obligation ${i} accounting mismatch at creation`);
    }

    const finalizeTx = await obligations.finalizeObligation(obligationId);
    const finalizeReceipt = await finalizeTx.wait();
    if (!finalizeReceipt || finalizeReceipt.status !== 1) throw new Error(`obligation ${i} finalization failed`);

    const finalized = await obligations.getObligation(obligationId);
    if (Number(finalized.status) !== 2) throw new Error(`obligation ${i} not FINALIZED`);
    if (Number(finalized.status) === 3) throw new Error(`obligation ${i} silently became clearing-eligible`);
    const remaining = await obligations.remainingAmount(obligationId);
    if (remaining !== item.amount) throw new Error(`obligation ${i} remaining amount drifted`);
    totalRemaining += remaining;

    issued.push({
      nonce: i,
      obligationId,
      debtor: item.address,
      creditor: borrower,
      amount: item.amount,
      maturity,
      policyId,
      termsHash,
      createTxHash: createTx.hash,
      finalizeTxHash: finalizeTx.hash,
      status: Number(finalized.status),
      remaining,
    });
  }

  if ((await obligations.nextNonceByFacility(FACILITY_ID)) !== 3n) throw new Error('facility obligation nonce did not reach 3');
  if (totalRemaining !== 1_000_000n) throw new Error(`aggregate remaining mismatch: ${totalRemaining}`);

  const nonceBeforeNegatives = await obligations.nextNonceByFacility(FACILITY_ID);
  const wrongAssetRejected = await expectRevert(async () => {
    const tx = await obligations.createObligation(
      FACILITY_ID,
      PROVIDERS[0].address,
      borrower,
      keccak256(toUtf8Bytes('WRONG_ASSET')),
      1n,
      maturity,
      policyId,
      keccak256(toUtf8Bytes('wrong-asset-terms')),
      1,
    );
    await tx.wait();
  });
  const selfRejected = await expectRevert(async () => {
    const tx = await obligations.createObligation(
      FACILITY_ID,
      borrower,
      borrower,
      EXPECTED_ASSET_CLASS,
      1n,
      maturity,
      policyId,
      keccak256(toUtf8Bytes('self-terms')),
      1,
    );
    await tx.wait();
  });
  const unknownFacilityRejected = await expectRevert(async () => {
    const tx = await obligations.createObligation(
      keccak256(toUtf8Bytes('UNKNOWN_FACILITY')),
      PROVIDERS[0].address,
      borrower,
      EXPECTED_ASSET_CLASS,
      1n,
      maturity,
      policyId,
      keccak256(toUtf8Bytes('unknown-facility-terms')),
      1,
    );
    await tx.wait();
  });
  const doubleFinalizeRejected = await expectRevert(async () => {
    const tx = await obligations.finalizeObligation(issued[0].obligationId);
    await tx.wait();
  });
  if ((await obligations.nextNonceByFacility(FACILITY_ID)) !== nonceBeforeNegatives) {
    throw new Error('negative issuance consumed facility nonce');
  }

  const evidence = {
    status: 'PASS',
    checkedAt,
    network: { chainId: CC3_CHAIN_ID, signer: wallet.address, blockTimestamp: latestBlock.timestamp },
    reusedM7: {
      facilityManager: FACILITY_MANAGER,
      facilityId: FACILITY_ID,
      sponsor: borrower,
      assetClassId: facility.assetClassId,
      capitalizationRoot: facility.capitalizationRoot,
      capitalRequiredUntil: facility.capitalRequiredUntil,
      encumberedAmount: facility.encumberedAmount,
      allocatedAmount: facility.allocatedAmount,
      committedAmount: facility.committedAmount,
      status: Number(facility.status),
    },
    obligationLedger: await obligations.getAddress(),
    issued,
    aggregate: { obligationCount: issued.length, totalRemaining, nextNonce: await obligations.nextNonceByFacility(FACILITY_ID) },
    negative: {
      wrongAssetRejected,
      selfObligationRejected: selfRejected,
      unknownFacilityRejected,
      doubleFinalizeRejected,
      noncePreserved: (await obligations.nextNonceByFacility(FACILITY_ID)) === nonceBeforeNegatives,
    },
    semanticBoundary: 'M8 creates and finalizes drawdown rights against a live M7-sealed facility. It grants no clearing eligibility and performs no settlement.',
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
