// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Script, console2} from "forge-std/Script.sol";

import {PesoLoan} from "../src/PesoLoan.sol";

/**
 * @notice Deploys PesoLoan.
 *
 * Required env var:
 *   USDC_ADDRESS - USDC token on the target network.
 *                  Arc mainnet (chain 5042): 0x3600000000000000000000000000000000000000 (ERC-20 interface, 6 decimals)
 *
 * Example (Arc mainnet):
 *   USDC_ADDRESS=0x3600000000000000000000000000000000000000 \
 *   forge script script/DeployPesoLoan.s.sol:DeployPesoLoan \
 *     --rpc-url "$ARC_RPC_URL" --broadcast \
 *     --private-key "$DEPLOYER_PRIVATE_KEY"
 *
 * The deployer wallet needs USDC on Arc for gas (USDC is Arc's native gas asset).
 * Keys are read from the environment at run time only — no secrets are committed.
 */
contract DeployPesoLoan is Script {
    function run() external returns (PesoLoan pesoLoan) {
        address usdc = vm.envAddress("USDC_ADDRESS");

        vm.startBroadcast();
        pesoLoan = new PesoLoan(usdc);
        vm.stopBroadcast();

        console2.log("PesoLoan deployed at:", address(pesoLoan));
        console2.log("USDC:", usdc);
    }
}
