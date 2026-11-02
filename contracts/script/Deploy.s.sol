// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {TripEscrow} from "../src/TripEscrow.sol";

/// Deploys TripEscrow to Arc. Testnet defaults: the broadcasting key serves
/// as treasury, attester and initial owner (split them on mainnet).
///
///   forge script script/Deploy.s.sol \
///     --rpc-url https://rpc.testnet.arc.io \
///     --broadcast --private-key $ATTESTER_PRIVATE_KEY
///
/// Override defaults via env: ARC_USDC_ADDRESS, TRIP_PRICE, REFUND_WINDOW_S,
/// TREASURY_ADDRESS, ATTESTER_ADDRESS, OWNER_ADDRESS.
contract Deploy is Script {
    // Arc's USDC ERC-20 address — identical on testnet and mainnet.
    address constant ARC_USDC = 0x3600000000000000000000000000000000000000;
    uint256 constant DEFAULT_PRICE = 1_000_000; // 1 USDC, 6 decimals
    uint64 constant DEFAULT_REFUND_WINDOW = 30 days;

    function run() external {
        address usdc = vm.envOr("ARC_USDC_ADDRESS", ARC_USDC);
        uint256 price = vm.envOr("TRIP_PRICE", DEFAULT_PRICE);
        uint64 refundWindow = uint64(vm.envOr("REFUND_WINDOW_S", uint256(DEFAULT_REFUND_WINDOW)));

        vm.startBroadcast();
        address deployer = msg.sender;
        TripEscrow escrow = new TripEscrow(
            usdc,
            price,
            vm.envOr("TREASURY_ADDRESS", deployer),
            vm.envOr("ATTESTER_ADDRESS", deployer),
            refundWindow,
            vm.envOr("OWNER_ADDRESS", deployer)
        );
        vm.stopBroadcast();

        console.log("TripEscrow deployed:", address(escrow));
        console.log("  usdcToken:", usdc);
        console.log("  price:", price);
        console.log("  treasury:", escrow.TREASURY());
        console.log("  attester:", escrow.attester());
        console.log("  refundWindow:", refundWindow);
        console.log("Set NEXT_PUBLIC_TRIP_ESCROW_ADDRESS and TRIP_ESCROW_ADDRESS to this address.");
    }
}
