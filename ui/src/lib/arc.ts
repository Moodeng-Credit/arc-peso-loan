import { defineChain } from 'viem';

// Arc mainnet. Re-confirm RPC/params against https://docs.arc.io before production use.
export const arc = defineChain({
   id: 5042,
   name: 'Arc',
   nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
   rpcUrls: {
      default: { http: [import.meta.env.VITE_ARC_RPC_URL || 'https://rpc.mainnet.arc.io'] }
   },
   blockExplorers: {
      default: { name: 'Arc Explorer', url: 'https://explorer.arc.io' }
   }
});

// USDC on Arc — ERC-20 interface, 6 decimals (native gas token uses 18; we only use the ERC-20 interface).
export const ARC_USDC_ADDRESS = (import.meta.env.VITE_USDC_ADDRESS ||
   '0x3600000000000000000000000000000000000000') as `0x${string}`;

export const USDC_DECIMALS = 6;

// PesoLoan contract on Arc — set after deploy via VITE_PESO_LOAN_ADDRESS.
export const PESO_LOAN_ADDRESS = (import.meta.env.VITE_PESO_LOAN_ADDRESS || '') as `0x${string}`;

export const explorerTx = (hash: string) => `${arc.blockExplorers.default.url}/tx/${hash}`;
export const explorerAddress = (addr: string) => `${arc.blockExplorers.default.url}/address/${addr}`;
