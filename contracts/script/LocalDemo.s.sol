// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Script, console2} from "forge-std/Script.sol";

import {PesoLoan} from "../src/PesoLoan.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";

/**
 * @notice End-to-end local demo against anvil. Deploys a mock USDC and PesoLoan,
 *         mints USDC to the two default anvil accounts, then runs a full
 *         create -> repay cycle to prove the flow works. Prints addresses to plug
 *         into the UI (.env).
 *
 * Run:
 *   anvil                       # in one terminal
 *   forge script script/LocalDemo.s.sol:LocalDemo --rpc-url http://localhost:8545 --broadcast
 *
 * The private keys below are anvil's well-known, deterministic DEV keys — public
 * by design and safe to hardcode for local use ONLY. Never use them on a real network.
 */
contract LocalDemo is Script {
    // anvil account #0 (funder) and #1 (borrower) — public dev keys.
    uint256 constant FUNDER_PK = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    uint256 constant BORROWER_PK = 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d;

    function run() external {
        address funder = vm.addr(FUNDER_PK);
        address borrower = vm.addr(BORROWER_PK);

        // --- deploy + mint (as funder) ---
        vm.startBroadcast(FUNDER_PK);
        MockUSDC usdc = new MockUSDC();
        PesoLoan peso = new PesoLoan(address(usdc));
        usdc.mint(funder, 1_000e6);
        usdc.mint(borrower, 1_000e6);

        // funder creates a peso-denominated loan (rate ~58 PHP/USDC): 5,800 PHP / $100 out, 6,380 PHP / $110 owed.
        usdc.approve(address(peso), 100e6);
        uint256 loanId = peso.createLoan(borrower, 5_800, 6_380, 100e6, 110e6, block.timestamp + 8 weeks);
        vm.stopBroadcast();

        // --- borrower repays in full ---
        vm.startBroadcast(BORROWER_PK);
        usdc.approve(address(peso), 110e6);
        peso.repay(loanId, 110e6);
        vm.stopBroadcast();

        PesoLoan.Loan memory loan = peso.getLoan(loanId);

        console2.log("=== Local demo complete ===");
        console2.log("MockUSDC:", address(usdc));
        console2.log("PesoLoan:", address(peso));
        console2.log("Loan id:", loanId);
        console2.log("Loan status (0=Active,1=Repaid):", uint256(loan.status));
        console2.log("Funder USDC balance (expect 1010e6):", usdc.balanceOf(funder));
        console2.log("");
        console2.log("UI .env:");
        console2.log("  VITE_ARC_RPC_URL=http://localhost:8545");
        console2.log("  VITE_USDC_ADDRESS=%s", address(usdc));
        console2.log("  VITE_PESO_LOAN_ADDRESS=%s", address(peso));
    }
}
