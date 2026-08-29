import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Contract, ContractFactory, JsonRpcProvider, Wallet, keccak256, toUtf8Bytes } from 'ethers';

const CC3_CHAIN_ID = 102031n;
const cc3Rpc = process.env.CREDITCOIN_RPC_HTTP ?? 'https://rpc.cc3-testnet.creditcoin.network';
const cc3Key = required('CC3_DEPLOYER_PRIVATE_KEY');
const evidencePath = process.env.EVIDENCE_PATH ?? 'evidence/runtime/m5-facility-allocation.json';

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
  if (network.chainId !== CC3_CHAIN_ID) throw new Error(`CC3 chain mismatch: expected ${CC3_CHAIN_ID}, got ${network.chainId}`);

  const wallet = new Wallet(cc3Key, provider);
  const startingBalance = await provider.getBalance(wallet.address);
  if (startingBalance === 0n) throw new Error(`CC3 signer ${wallet.address} has zero balance`);

  const claims = await deploy(wallet, 'out/ClaimRegistry.sol/ClaimRegistry.json', [wallet.address]);
  const encumbrances = await deploy(wallet, 'out/EncumbranceRegistry.sol/EncumbranceRegistry.json', [wallet.address, await claims.getAddress()]);
  const facilities = await deploy(wallet, 'out/FacilityManager.sol/FacilityManager.json', [wallet.address, await encumbrances.getAddress()]);
  const allocations = await deploy(wallet, 'out/AllocationManager.sol/AllocationManager.json', [wallet.address, await facilities.getAddress()]);

  const grantClaimRoleTx = await claims.grantRole(await claims.ENCUMBRANCE_ROLE(), await encumbrances.getAddress());
  await grantClaimRoleTx.wait();
  const grantFacilityRoleTx = await encumbrances.grantRole(await encumbrances.FACILITY_ROLE(), await facilities.getAddress());
  await grantFacilityRoleTx.wait();
  const grantAllocationRoleTx = await facilities.grantRole(await facilities.FACILITY_MANAGER_ROLE(), await allocations.getAddress());
  await grantAllocationRoleTx.wait();

  const domainId = keccak256(toUtf8Bytes('CLEARA_M5_CC3_TEST_DOMAIN'));
  const assetClassId = keccak256(toUtf8Bytes('CLEARA_M5_USD'));
  const sourceEvidenceHash = keccak256(toUtf8Bytes('CLEARA_M5_SOURCE_EVIDENCE'));
  const attestationEvidenceId = keccak256(toUtf8Bytes('CLEARA_M5_ATTESTED_FIXTURE'));
  const financePolicyId = keccak256(toUtf8Bytes('CLEARA_M5_FINANCE_POLICY'));
  const financeDecisionHash = keccak256(toUtf8Bytes('CLEARA_M5_FINANCE_DECISION'));
  const facilityPolicyHash = keccak256(toUtf8Bytes('CLEARA_M5_FACILITY_POLICY'));
  const sourceContract = '0x000000000000000000000000000000000000CA11';
  const obligor = '0x000000000000000000000000000000000000B0B0';
  const faceValue = 100_000_000n;
  const financeableCapacity = 80_000_000n;
  const facilityTarget = 80_000_000n;
  const encumbranceAmount = 60_000_000n;
  const allocationAAmount = 40_000_000n;
  const allocationBAmount = 30_000_000n;
  const now = Math.floor(Date.now() / 1000);

  const registerClaimTx = await claims.registerVerifiedClaim(
    domainId,
    sourceContract,
    1n,
    wallet.address,
    obligor,
    assetClassId,
    faceValue,
    BigInt(now + 30 * 24 * 60 * 60),
    sourceEvidenceHash,
    attestationEvidenceId,
  );
  await registerClaimTx.wait();

  const claimId = await claims.computeClaimId(domainId, sourceContract, wallet.address, obligor, assetClassId, 1n);
  const financeTx = await claims.setFinanceableCapacity(claimId, financeableCapacity, financePolicyId, financeDecisionHash);
  await financeTx.wait();

  const createFacilityTx = await facilities.createFacility(
    assetClassId,
    facilityTarget,
    BigInt(now),
    BigInt(now + 14 * 24 * 60 * 60),
    facilityPolicyHash,
  );
  await createFacilityTx.wait();
  const facilityId = await facilities.computeFacilityId(wallet.address, 0n, facilityPolicyHash);
  const verifyFacilityTx = await facilities.verifyFacility(facilityId);
  await verifyFacilityTx.wait();
  const openFacilityTx = await facilities.openFacility(facilityId);
  await openFacilityTx.wait();

  const createEncumbranceTx = await encumbrances.createEncumbrance(
    claimId,
    facilityId,
    wallet.address,
    encumbranceAmount,
    BigInt(now + 7 * 24 * 60 * 60),
  );
  await createEncumbranceTx.wait();
  const encumbranceId = await encumbrances.computeEncumbranceId(claimId, facilityId, 0n);

  const bindTx = await facilities.bindEncumbrance(facilityId, encumbranceId);
  await bindTx.wait();
  const consumed = await encumbrances.getEncumbrance(encumbranceId);
  const claimAfterBind = await claims.getClaim(claimId);
  if (Number(consumed.status) !== 3) throw new Error('encumbrance was not CONSUMED');
  if (claimAfterBind.activeEncumbrance !== encumbranceAmount) throw new Error('binding freed claim capacity');

  const beginAllocatingTx = await facilities.beginAllocating(facilityId);
  await beginAllocatingTx.wait();

  const proposeATx = await allocations.proposeAllocation(
    facilityId,
    wallet.address,
    allocationAAmount,
    BigInt(now + 3 * 24 * 60 * 60),
  );
  await proposeATx.wait();
  const allocationAId = await allocations.computeAllocationId(facilityId, wallet.address, 0n);
  const activateATx = await allocations.activateAllocation(allocationAId);
  await activateATx.wait();

  const activeAllocationA = await allocations.getAllocation(allocationAId);
  if (Number(activeAllocationA.status) !== 2) throw new Error('allocation A did not become ACTIVE');
  if (Number(activeAllocationA.status) === 3) throw new Error('allocation silently became COMMITTED');

  const proposeBTx = await allocations.proposeAllocation(
    facilityId,
    '0x000000000000000000000000000000000000A002',
    allocationBAmount,
    BigInt(now + 3 * 24 * 60 * 60),
  );
  await proposeBTx.wait();
  const allocationBId = await allocations.computeAllocationId(facilityId, '0x000000000000000000000000000000000000A002', 0n);

  const overAllocationError = await expectRevert('over-allocation', async () => {
    const tx = await allocations.activateAllocation(allocationBId);
    await tx.wait();
  });

  const afterRejected = await facilities.getFacility(facilityId);
  const rejectedAllocation = await allocations.getAllocation(allocationBId);
  if (afterRejected.allocatedAmount !== allocationAAmount) throw new Error('failed activation mutated allocated total');
  if (Number(rejectedAllocation.status) !== 1) throw new Error('failed activation mutated allocation state');

  const cancelATx = await allocations.cancelAllocation(allocationAId);
  await cancelATx.wait();
  const afterCancel = await facilities.getFacility(facilityId);
  if (afterCancel.allocatedAmount !== 0n) throw new Error('cancel did not restore allocation total');
  if (afterCancel.encumberedAmount !== encumbranceAmount) throw new Error('cancel changed facility encumbrance');
  if ((await claims.getClaim(claimId)).activeEncumbrance !== encumbranceAmount) throw new Error('cancel freed claim capacity');

  const doubleCancelError = await expectRevert('double cancel', async () => {
    const tx = await allocations.cancelAllocation(allocationAId);
    await tx.wait();
  });

  const endingBalance = await provider.getBalance(wallet.address);
  const evidence = {
    status: 'PASS',
    checkedAt,
    network: { chainId: network.chainId, rpc: cc3Rpc, signer: wallet.address },
    contracts: {
      claimRegistry: await claims.getAddress(),
      encumbranceRegistry: await encumbrances.getAddress(),
      facilityManager: await facilities.getAddress(),
      allocationManager: await allocations.getAddress(),
    },
    transactions: {
      grantClaimRole: grantClaimRoleTx.hash,
      grantFacilityRole: grantFacilityRoleTx.hash,
      grantAllocationRole: grantAllocationRoleTx.hash,
      registerClaim: registerClaimTx.hash,
      setFinanceability: financeTx.hash,
      createFacility: createFacilityTx.hash,
      verifyFacility: verifyFacilityTx.hash,
      openFacility: openFacilityTx.hash,
      createEncumbrance: createEncumbranceTx.hash,
      bindEncumbrance: bindTx.hash,
      beginAllocating: beginAllocatingTx.hash,
      proposeAllocationA: proposeATx.hash,
      activateAllocationA: activateATx.hash,
      proposeAllocationB: proposeBTx.hash,
      cancelAllocationA: cancelATx.hash,
    },
    objects: { claimId, facilityId, encumbranceId, allocationAId, allocationBId },
    accounting: {
      faceValue,
      financeableCapacity,
      facilityTarget,
      encumbranceAmount,
      allocationAAmount,
      rejectedAllocationB: allocationBAmount,
      allocatedAfterRejection: afterRejected.allocatedAmount,
      allocatedAfterCancel: afterCancel.allocatedAmount,
      facilityEncumberedAfterCancel: afterCancel.encumberedAmount,
      claimActiveEncumbranceAfterCancel: (await claims.getClaim(claimId)).activeEncumbrance,
      claimAvailableCapacityAfterCancel: await claims.availableCapacity(claimId),
    },
    negative: { overAllocationRejected: overAllocationError, doubleCancelRejected: doubleCancelError },
    semantic: {
      allocationAStatus: Number(activeAllocationA.status),
      committedStatusValue: 3,
      allocationDidNotBecomeCommitment: Number(activeAllocationA.status) !== 3,
    },
    balances: { starting: startingBalance, ending: endingBalance },
    note: 'This M5 run uses a directly registered VERIFIED claim fixture to isolate facility and allocation semantics. It does not replace the independent M3 Attestcoin claim-ingestion proof or the M4 accounting evidence.',
  };

  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, `${json(evidence)}\n`, 'utf8');
  console.log(json(evidence));
}

main().catch((error) => {
  const failure = { status: 'FAIL', checkedAt: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) };
  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, `${json(failure)}\n`, 'utf8');
  console.error(json(failure));
  process.exit(1);
});
