import { JsonRpcProvider } from 'ethers';
import { chainInfo } from '@gluwa/usc-sdk';
const rpc = process.env.CREDITCOIN_RPC_HTTP;
if (!rpc) throw new Error('CREDITCOIN_RPC_HTTP required');
const provider = new JsonRpcProvider(rpc);
const info = new chainInfo.PrecompileChainInfoProvider(provider);
const supported = await info.getSupportedChains();
console.log(JSON.stringify({status:'PASS', supported, checkedAt:new Date().toISOString()}, (_,v)=>typeof v==='bigint'?v.toString():v, 2));
