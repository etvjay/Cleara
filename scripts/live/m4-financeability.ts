import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Contract, ContractFactory, JsonRpcProvider, Wallet, keccak256, toUtf8Bytes } from 'ethers';

const CC3_CHAIN_ID = 102031n;
const cc3Rpc = process.env.CREDITCOIN_RPC_HTTP ?? 'https://rpc.cc3-testnet.creditcoin.network';
const cc3Key = required('CC3_DEPLOYER_PRIVATE_KEY');
const evidencePath = process.env.EVIDENCE_PATH ?? 'evidence/runtime/m4-financeability.json';

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

async function expectRevert(label: string, action: () => Promise<unknown>): Promise<string> {
  try {
    await action();
  } catch (error: any) {
    return error?.shortMessage ?? error?.reason ?? error?.message ?? String(error);
  }
  throw new Error(`${label}: expected revert but call succeeded`);
}

function json(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v), 2);
}

async function main(): Promise<void> {
  const checkedAt = new Date().toISOString();
  const provider = new JsonRpcProvider(cc3Rpc);
  const network = await provider.getNetwork();
  if (network.chainId !== CC3_CHAIN_ID) {
    throw new Error(`CC3 chain mismatch: expected ${CC3_CHAIN_ID}, got ${network.chainId}`);
  }

  const wallet = new Wallet(cc3Key, provider);
  const startingBalance = await provider.getBalance(wallet.address);
  if (startingBalance === 0n) throw new Error(`CC3 signer ${wallet.address} has zero balance`);

  const claims = await deploy(wallet, 'out/ClaimRegistry.sol/ClaimRegistry.json', [wallet.address]);
  const encumbrances = await deploy(wallet, 'out/EncumbranceRegistry.sol/EncumbranceRegistry.json', [
    wallet.address,
    await claims.getAddress(),
  ]);

  const encumbranceRole = await claims.ENCUMBRANCE_ROLE();
  const grantTx = await claims.grantRole(encumbranceRole, await encumbrances.getAddress());
  await grantTx.wait();

  const domainId = keccak256(toUtf8Bytes('CLEARA_M4_CC3_TEST_DOMAIN'));
  const assetClassId = keccak256(toUtf8Bytes('CLEARA_M4_USD'));
  const sourceEvidenceHash = keccak256(toUtf8Bytes('CLEARA_M4_SOURCE_EVIDENCE'));
  const attestationEvidenceId = keccak256(toUtf8Bytes('CLEARA_M4_ATTESTED_FIXTURE'));
  const policyId = keccak256(toUtf8Bytes('CLEARA_M4_FINANCEABILITY_POLICY_V1'));
  const decisionHash = keccak256(toUtf8Bytes('CLEARA_M4_CAPACITY_80_PERCENT'));
  const facilityA = keccak256(toUtf8Bytes('CLEARA_M4_FACILITY_A'));
  const facilityB = keccak256(toUtf8Bytes('CLEARA_M4_FACILITY_B'));
  const claimant = wallet.address;
  const obligor = '0x000000000000000000000000000000000000B0B0';
  const sourceContract = '0x000000000000000000000000000000000000CA11';
  const faceValue = 100_000_000n;
  const financeableCapacity = 80_000_000n;
  const firstReservation = 50_000_000n;
  const rejectedReservation = 40_000_000n;
  const maturity = BigInt(Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60);

  const registerTx = await claims.registerVerifiedClaim(
    domainId,
    sourceContract,
    1n,
    claimant,
    obligor,
    assetClassId,
    faceValue,
    maturity,
    sourceEvidenceHash,
    attestationEvidenceId,
  );
  const registerReceipt = await registerTx.wait();
  if (!registerReceipt || registerReceipt.status !== 1) throw new Error('claim registration failed');

  const claimId = await claims.computeClaimId(domainId, sourceContract, claimant, obligor, assetClassId, 1n);
  const beforeFinanceability = await claims.getClaim(claimId);
  if (Number(beforeFinanceability.state) !== 2 || beforeFinanceability.financeableCapacity !== 0n) {
    throw new Error('verified claim did not begin with zero financeable capacity');
  }

  const financeTx = await claims.setFinanceableCapacity(claimId, financeableCapacity, policyId, decisionHash);
  const financeReceipt = await financeTx.wait();
  if (!financeReceipt || financeReceipt.status !== 1) throw new Error('financeability transaction failed');

  const afterFinanceability = await claims.getClaim(claimId);
  if (Number(afterFinanceability.state) !== 3) throw new Error('claim did not transition to ACTIVE');
  if (afterFinanceability.financeableCapacity !== financeableCapacity) throw new Error('capacity mismatch');

  const expiryA = BigInt(Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60);
  const createATx = await encumbrances.createEncumbrance(
    claimId,
    facilityA,
    wallet.address,
    firstReservation,
    expiryA,
  );
  const createAReceipt = await createATx.wait();
  if (!createAReceipt || createAReceipt.status !== 1) throw new Error('first encumbrance failed');
  const encumbranceA = await encumbrances.computeEncumbranceId(claimId, facilityA, 0n);

  const afterA = await claims.getClaim(claimId);
  const availableAfterA = await claims.availableCapacity(claimId);
  if (afterA.activeEncumbrance !== firstReservation || availableAfterA !== 30_000_000n) {
    throw new Error('capacity accounting mismatch after first encumbrance');
  }

  const overReservationError = await expectRevert('over-reservation', async () => {
    const tx = await encumbrances.createEncumbrance(
      claimId,
      facilityB,
      wallet.address,
      rejectedReservation,
      expiryA,
    );
    await tx.wait();
  });

  const afterRejected = await claims.getClaim(claimId);
  if (afterRejected.activeEncumbrance !== firstReservation || (await claims.availableCapacity(claimId)) !== 30_000_000n) {
    throw new Error('rejected reservation mutated claim accounting');
  }

  const tooLowCapacityError = await expectRevert('capacity below active encumbrance', async () => {
    const tx = await claims.setFinanceableCapacity(
      claimId,
      49_000_000n,
      keccak256(toUtf8Bytes('CLEARA_M4_POLICY_REDUCTION')),
      keccak256(toUtf8Bytes('CLEARA_M4_INVALID_REDUCTION')),
    );
    await tx.wait();
  });

  const releaseTx = await encumbrances.releaseEncumbrance(encumbranceA);
  const releaseReceipt = await releaseTx.wait();
  if (!releaseReceipt || releaseReceipt.status !== 1) throw new Error('encumbrance release failed');
  if ((await claims.availableCapacity(claimId)) !== financeableCapacity) {
    throw new Error('release did not restore capacity');
  }

  const doubleReleaseError = await expectRevert('double release', async () => {
    const tx = await encumbrances.releaseEncumbrance(encumbranceA);
    await tx.wait();
  });

  const finalClaim = await claims.getClaim(claimId);
  const finalEncumbrance = await encumbrances.getEncumbrance(encumbranceA);
  if (finalClaim.activeEncumbrance !== 0n || Number(finalEncumbrance.status) !== 4) {
    throw new Error('final accounting/state mismatch');
  }

  const endingBalance = await provider.getBalance(wallet.address);
  const evidence = {
    status: 'PASS',
    checkedAt,
    network: { chainId: network.chainId, rpc: cc3Rpc, signer: wallet.address },
    contracts: {
      claimRegistry: await claims.getAddress(),
      encumbranceRegistry: await encumbrances.getAddress(),
    },
    transactions: {
      grantEncumbranceRole: grantTx.hash,
      registerClaim: registerTx.hash,
      setFinanceability: financeTx.hash,
      createEncumbranceA: createATx.hash,
      releaseEncumbranceA: releaseTx.hash,
    },
    objects: {
      claimId,
      encumbranceA,
      facilityA,
      facilityB,
      policyId,
      decisionHash,
    },
    accounting: {
      faceValue,
      financeableCapacity,
      firstReservation,
      rejectedReservation,
      availableAfterA,
      finalActiveEncumbrance: finalClaim.activeEncumbrance,
      finalAvailableCapacity: await claims.availableCapacity(claimId),
    },
    negative: {
      overReservationRejected: overReservationError,
      capacityBelowActiveRejected: tooLowCapacityError,
      doubleReleaseRejected: doubleReleaseError,
    },
    balances: { starting: startingBalance, ending: endingBalance },
    note: 'The claim was registered directly through ClaimRegistry for this M4 accounting test. This run does not replace or repeat the M3 Attestcoin claim-ingestion proof.',
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
