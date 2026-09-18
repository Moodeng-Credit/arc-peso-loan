/// <reference types="vite/client" />

interface ImportMetaEnv {
   readonly VITE_ARC_RPC_URL?: string;
   readonly VITE_USDC_ADDRESS?: string;
   readonly VITE_PESO_LOAN_ADDRESS?: string;
}
interface ImportMeta {
   readonly env: ImportMetaEnv;
}

interface Window {
   ethereum?: import('viem').EIP1193Provider;
}
