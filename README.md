# Peso Loan on Arc

A minimal, working **PHP-denominated microloan settled in USDC on Arc**, by [Moodeng Credit](https://github.com/Moodeng-Credit).

> **Live on Arc mainnet (chain 5042).**
> Contract: **`0x28D9b4042E1625Fe07eaAaD8BE43E9f7fCa51660`**
> Explorer: https://explorer.arc.io/address/0x28D9b4042E1625Fe07eaAaD8BE43E9f7fCa51660
> Deploy tx: [`0xccbe99…2a84b2`](https://explorer.arc.io/tx/0xccbe992edfc7d7dd935659064e51947314b2eb068c365b97f70c83d1712a84b2)

The borrower's obligation is recorded in **pesos (PHP)**; value moves in **USDC**. A funder fronts the principal, the borrower repays, and on full repayment the contract forwards the USDC to the funder. It's the smallest honest slice of Moodeng's credit product — peso-denominated lending — running on Arc.

## How it uses Arc

- **USDC-native settlement + gas.** Funding and repayment move USDC on Arc, and Arc's native USDC gas means neither party needs a separate gas token to transact.
- **Peso-denominated obligation on-chain.** The loan stores the PHP principal and total owed alongside the USDC amounts, so the borrower's debt is denominated in the currency they actually earn — the core of Moodeng's thesis — while settlement stays in USDC.
- The exchange rate is locked at creation by the funder supplying the matched (PHP, USDC) amounts, so the on-chain record is peso-denominated with no oracle dependency.

## Live

- **Contract (Arc mainnet, chain 5042):** `0x28D9b4042E1625Fe07eaAaD8BE43E9f7fCa51660` — https://explorer.arc.io/address/0x28D9b4042E1625Fe07eaAaD8BE43E9f7fCa51660
- **App:** _<Vercel URL after deploy>_

## Structure

- `contracts/` — Foundry project. `src/PesoLoan.sol` (the contract), `test/PesoLoan.t.sol` (unit tests), `script/DeployPesoLoan.s.sol` (deploy).
- `ui/` — minimal Vite + React + viem dapp (connect wallet, create loan, repay, view status).

## Contract

`PesoLoan.sol`:
- `createLoan(borrower, principalPHP, totalOwedPHP, principalUSDC, totalOwedUSDC, dueDate)` — funder fronts `principalUSDC` to the borrower and records the peso obligation.
- `repay(loanId, amountUSDC)` — borrower repays; on full payoff the USDC is forwarded to the funder.
- Views: `getLoan`, `getRemainingOwedUSDC`, `nextLoanId`.

USDC on Arc (ERC-20 interface, 6 decimals): `0x3600000000000000000000000000000000000000`.

## Build & test

```bash
cd contracts
forge install foundry-rs/forge-std openzeppelin/openzeppelin-contracts
forge build
forge test
```

## Run it locally, end-to-end (no real funds)

Prove the full create → repay flow against a local chain:

```bash
# 1. start a local node
anvil

# 2. deploy mock USDC + PesoLoan and run a full create+repay cycle
cd contracts
forge script script/LocalDemo.s.sol:LocalDemo --rpc-url http://localhost:8545 --broadcast

# 3. copy the printed MockUSDC + PesoLoan addresses into ui/.env (see ui/.env.example), then:
cd ../ui && npm install && npm run dev
```

`LocalDemo.s.sol` deploys a mock USDC, deploys `PesoLoan`, funds a loan (100 USDC out / peso-denominated terms) and repays it in full — so you can immediately look the loan up in the UI. The anvil keys it uses are the well-known public dev keys (local only).

## Deploy (Arc mainnet, chain 5042)

The deployer wallet needs USDC on Arc (USDC is Arc's gas asset). Re-confirm the RPC and USDC address against https://docs.arc.io before deploying.

```bash
cd contracts
USDC_ADDRESS=0x3600000000000000000000000000000000000000 \
forge script script/DeployPesoLoan.s.sol:DeployPesoLoan \
  --rpc-url "$ARC_RPC_URL" --broadcast \
  --private-key "$DEPLOYER_PRIVATE_KEY"
```

Then set the UI env and run/deploy it:

```bash
cd ui
# .env
# VITE_PESO_LOAN_ADDRESS=0x...        (deployed contract)
# VITE_ARC_RPC_URL=<arc rpc>
npm install
npm run dev      # local
npm run build    # production build in dist/ (deploy to Vercel/Netlify)
```

## License

MIT
