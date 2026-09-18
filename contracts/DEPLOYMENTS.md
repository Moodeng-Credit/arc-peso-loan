# PesoLoan Deployments

## Arc Mainnet (chain 5042)

| Field | Value |
|-------|-------|
| **PesoLoan** | `0x28D9b4042E1625Fe07eaAaD8BE43E9f7fCa51660` |
| USDC (ERC-20 interface, 6 decimals) | `0x3600000000000000000000000000000000000000` |
| RPC | `https://rpc.mainnet.arc.io` |
| Explorer | https://explorer.arc.io/address/0x28D9b4042E1625Fe07eaAaD8BE43E9f7fCa51660 |
| Deploy tx | `0xccbe992edfc7d7dd935659064e51947314b2eb068c365b97f70c83d1712a84b2` |
| Deployed | 2026-09-18 |
| Compiler | solc 0.8.27 (OpenZeppelin v5.7.0) |

### Frontend env (ui/.env)

```
VITE_ARC_RPC_URL=https://rpc.mainnet.arc.io
VITE_USDC_ADDRESS=0x3600000000000000000000000000000000000000
VITE_PESO_LOAN_ADDRESS=0x28D9b4042E1625Fe07eaAaD8BE43E9f7fCa51660
```

> Deployed via a throwaway EOA (gas only). PesoLoan has no owner/admin roles, so the deployer has no privileges over the contract.
