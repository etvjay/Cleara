const rpc = process.env.CREDITCOIN_RPC_HTTP ?? 'https://rpc.cc3-testnet.creditcoin.network';
const expected = BigInt(process.env.CREDITCOIN_CHAIN_ID ?? '102031');
async function call(method: string, params: unknown[] = []) {
  const r = await fetch(rpc, {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({jsonrpc:'2.0', id:1, method, params})});
  if (!r.ok) throw new Error(`RPC HTTP ${r.status}`);
  const j:any = await r.json();
  if (j.error) throw new Error(`${method}: ${JSON.stringify(j.error)}`);
  return j.result;
}
const chainId = BigInt(await call('eth_chainId'));
if (chainId !== expected) throw new Error(`chain mismatch expected=${expected} got=${chainId}`);
const block = BigInt(await call('eth_blockNumber'));
console.log(JSON.stringify({status:'PASS', rpc, chainId: chainId.toString(), blockNumber:block.toString(), checkedAt:new Date().toISOString()}, null, 2));
