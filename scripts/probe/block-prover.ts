import { JsonRpcProvider } from 'ethers';
import { blockProver } from '@gluwa/usc-sdk';
const rpc = process.env.CREDITCOIN_RPC_HTTP;
if (!rpc) throw new Error('CREDITCOIN_RPC_HTTP required');
const provider = new JsonRpcProvider(rpc);
const prover = new blockProver.PrecompileBlockProver(provider);
console.log(JSON.stringify({status:'READY', message:'Provide a captured ProofBuilder result to run verifySingle and the tampered-proof negative test.', prover: typeof prover, checkedAt:new Date().toISOString()}, null, 2));
