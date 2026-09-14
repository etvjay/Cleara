import { defineChain, type Address } from "viem";
import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { sepolia } from "wagmi/chains";

export const creditcoinCC3 = defineChain({
  id: 102031,
  name: "Creditcoin CC3 Testnet",
  nativeCurrency: { name: "Creditcoin", symbol: "CTC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.cc3-testnet.creditcoin.network"] } },
});

export const walletConfig = createConfig({
  chains: [sepolia, creditcoinCC3],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [sepolia.id]: http("https://ethereum-sepolia-rpc.publicnode.com"),
    [creditcoinCC3.id]: http("https://rpc.cc3-testnet.creditcoin.network"),
  },
});

export const TESTNET_FIXTURE = {
  sourceChainId: sepolia.id,
  token: "0xA98Aab287246b8484168Aa7538BE911FB45172F5" as Address,
  vault: "0x760caf59A7FF095598aa1376140774a7538590C8" as Address,
  settlementAdapter: "0xD9cCCdDdFAf34b6F16dB33b934a03554813A7f6e" as Address,
  settlementASC: "0x2d7aD6422F6c64d781441FAA2623EA5314Ac68d1" as Address,
  facilityId: "0x033b4fa040971ba85fe884da725124ec4466acfa36c2af0306aa25d514af439c" as `0x${string}`,
  allocationId: "0x0a4d8198a4ebb81c5a5603e13897c4a9298cd114ca85a4641a9506ccd2dfae56" as `0x${string}`,
  assetClassId: "0xcf7dcc36a417695f4e970c3815db47b68ee5488515a0ef2dbf9ad2f91f18540d" as `0x${string}`,
  obligationId: "0x28300bed2ac76e5f0b5216806c8d1187243f794b674d560284e68ff0ccbd2bc2" as `0x${string}`,
  residualId: "0xe92bfd187228af14f5a7e45fe87c926317db3fc60f3b27ad35c281855f4159a6" as `0x${string}`,
  settlementId: "0x620c27b79ae79d68a5a1b9263813b69b8bfa0211d91164f08bcdf85f622c7d75" as `0x${string}`,
  evidenceId: "0xff125dcb93016f196e32c98a5d05aca50fa02254a546372192cc23f6449c84dd" as `0x${string}`,
  sourceSettlementTx: "0x8ad0d0835cfcfc34696783274b9e3bd2d28ad5d2376e2045ec6dc36034de6dd8" as `0x${string}`,
  amount: 340_000n,
} as const;

export const MOCK_ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export const CAPITAL_COMMITMENT_VAULT_ABI = [
  {
    type: "function",
    name: "nextNonceByProviderAndFacility",
    stateMutability: "view",
    inputs: [{ name: "provider", type: "address" }, { name: "facilityId", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "commit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "facilityId", type: "bytes32" },
      { name: "allocationId", type: "bytes32" },
      { name: "assetClassId", type: "bytes32" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "expiresAt", type: "uint64" },
    ],
    outputs: [{ name: "sourceCommitmentId", type: "bytes32" }],
  },
] as const;

export const SEPOLIA_EXPLORER = "https://sepolia.etherscan.io";
