// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../src/ArcEscrowV2.sol";

// Minimal Foundry script cheatcode interface — no forge-std dependency.
interface Vm {
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
    function envUint(string calldata name) external returns (uint256);
}

// Deploys ArcEscrowV2 pointed at the Arc Testnet native USDC precompile.
//
// Usage (from contracts/):
//   PRIVATE_KEY=0x... forge script script/DeployV2.s.sol:DeployV2 \
//     --rpc-url https://rpc.testnet.arc.network --broadcast
//
// After deployment, copy the printed address into:
//   - src/App.tsx (ARC_ESCROW constant)
//   - api/evaluate.js (ARC_ESCROW constant)
//   - agent/runner.mjs (ARC_ESCROW_ADDRESS default, or pass via env)
contract DeployV2 {
    Vm constant vm = Vm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);

    address constant ARC_TESTNET_USDC = 0x3600000000000000000000000000000000000000;

    function run() external returns (ArcEscrowV2) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);
        ArcEscrowV2 escrow = new ArcEscrowV2(ARC_TESTNET_USDC);
        vm.stopBroadcast();
        return escrow;
    }
}
