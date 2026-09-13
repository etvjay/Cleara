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
  token: "0x99232978f7f9E01B7f58608057e417459267B085" as Address,
  vault: "0x0DBa84A9F8226c5CA4A60Ed1B75ee69E7E628be6" as Address,
  facilityId: "0x772ed1527b2137634f30da4dd62245906719b697dc7ca0bd27e11a8a2d5c7a73" as `0x${string}`,
  allocationId: "0xd6b410ef29e293cf6b4427601a4bc5e4e9a313a29f01310def95e27b4d1f9344" as `0x${string}`,
  assetClassId: "0x1cda873901f7e3d40e3c769bad5e796dde83cc8879f8425ac25ac3ff12fbeb77" as `0x${string}`,
  amount: 400_000n,
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
