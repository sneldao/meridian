// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {TripEscrow} from "../src/TripEscrow.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract TripEscrowTest is Test {
    TripEscrow escrow;
    MockUSDC usdc;

    uint256 constant PRICE = 1_000_000; // 1 USDC
    uint64 constant REFUND_WINDOW = 30 days;

    uint256 attesterPk = 0xA77E57;
    address attester;
    address treasury = makeAddr("treasury");
    address buyer = makeAddr("buyer");
    address owner = makeAddr("owner");

    bytes32 tripId = keccak256("LHR-HND-2026-11-10");
    bytes32 planHash = keccak256("plan-json-canonical");

    function setUp() public {
        usdc = new MockUSDC();
        attester = vm.addr(attesterPk);
        escrow = new TripEscrow(
            address(usdc), PRICE, treasury, attester, REFUND_WINDOW, owner
        );
        usdc.mint(buyer, 10_000_000);
        vm.prank(buyer);
        usdc.approve(address(escrow), type(uint256).max);
    }

    // -- helpers --------------------------------------------------------------

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256("MeridianTripEscrow"),
                keccak256("1"),
                block.chainid,
                address(escrow)
            )
        );
    }

    function _attestationDigest(TripEscrow.Attestation memory att)
        internal
        view
        returns (bytes32)
    {
        bytes32 structHash = keccak256(
            abi.encode(
                escrow.ATTESTATION_TYPEHASH(),
                att.buyer,
                att.tripId,
                att.planHash,
                att.passed,
                att.expiry
            )
        );
        return keccak256(
            abi.encodePacked("\x19\x01", _domainSeparator(), structHash)
        );
    }

    function _attestation(bool passed) internal view returns (TripEscrow.Attestation memory) {
        return TripEscrow.Attestation({
            buyer: buyer,
            tripId: tripId,
            planHash: planHash,
            passed: passed,
            expiry: block.timestamp + 1 hours
        });
    }

    function _sign(uint256 pk, TripEscrow.Attestation memory att)
        internal
        view
        returns (bytes memory)
    {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, _attestationDigest(att));
        return abi.encodePacked(r, s, v);
    }

    function _deposit() internal {
        vm.prank(buyer);
        escrow.deposit(tripId);
    }

    // -- deposit ----------------------------------------------------------------

    function test_deposit_pullsUsdcAndHolds() public {
        _deposit();
        assertEq(usdc.balanceOf(address(escrow)), PRICE);
        assertEq(usdc.balanceOf(buyer), 9_000_000);

        TripEscrow.Escrow memory e = escrow.getEscrow(buyer, tripId);
        assertEq(e.amount, PRICE);
        assertEq(uint8(e.state), uint8(TripEscrow.State.Held));
    }

    function test_deposit_revertsOnRepeat() public {
        _deposit();
        vm.expectRevert(TripEscrow.AlreadyDeposited.selector);
        vm.prank(buyer);
        escrow.deposit(tripId);
    }

    function test_deposit_sameBuyerDifferentTrip() public {
        _deposit();
        bytes32 trip2 = keccak256("SFO-NRT-2026-12-01");
        vm.prank(buyer);
        escrow.deposit(trip2);
        assertEq(usdc.balanceOf(address(escrow)), PRICE * 2);
    }

    // -- settle -------------------------------------------------------------------

    function test_settle_passed_releasesToTreasury() public {
        _deposit();
        TripEscrow.Attestation memory att = _attestation(true);
        escrow.settle(tripId, att, _sign(attesterPk, att));

        assertEq(usdc.balanceOf(treasury), PRICE);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        assertEq(uint8(escrow.getEscrow(buyer, tripId).state), uint8(TripEscrow.State.Settled));
    }

    function test_settle_failed_refundsBuyer() public {
        _deposit();
        TripEscrow.Attestation memory att = _attestation(false);
        escrow.settle(tripId, att, _sign(attesterPk, att));

        assertEq(usdc.balanceOf(buyer), 10_000_000);
        assertEq(uint8(escrow.getEscrow(buyer, tripId).state), uint8(TripEscrow.State.Refunded));
    }

    function test_settle_revertsOnWrongSigner() public {
        _deposit();
        TripEscrow.Attestation memory att = _attestation(true);
        bytes memory sig = _sign(0xBAD, att);
        vm.expectRevert(TripEscrow.InvalidAttestation.selector);
        escrow.settle(tripId, att, sig);
    }

    function test_settle_revertsOnExpired() public {
        _deposit();
        TripEscrow.Attestation memory att = _attestation(true);
        att.expiry = block.timestamp - 1;
        bytes memory sig = _sign(attesterPk, att);
        vm.expectRevert(TripEscrow.AttestationExpired.selector);
        escrow.settle(tripId, att, sig);
    }

    function test_settle_revertsOnTripMismatch() public {
        _deposit();
        // Attestation signed for a different trip than the escrow being settled.
        TripEscrow.Attestation memory att = _attestation(true);
        att.tripId = keccak256("OTHER-TRIP");
        bytes memory sig = _sign(attesterPk, att);
        vm.expectRevert(TripEscrow.InvalidAttestation.selector);
        escrow.settle(tripId, att, sig);
    }

    function test_settle_revertsOnWrongTripKey() public {
        _deposit();
        TripEscrow.Attestation memory att = _attestation(true);
        bytes memory sig = _sign(attesterPk, att);
        vm.expectRevert(TripEscrow.NoEscrow.selector);
        escrow.settle(keccak256("OTHER-TRIP"), att, sig);
    }

    function test_settle_revertsOnDoubleSettle() public {
        _deposit();
        TripEscrow.Attestation memory att = _attestation(true);
        bytes memory sig = _sign(attesterPk, att);
        escrow.settle(tripId, att, sig);
        vm.expectRevert(TripEscrow.NotHeld.selector);
        escrow.settle(tripId, att, sig);
    }

    function test_settle_revertsWithNoEscrow() public {
        TripEscrow.Attestation memory att = _attestation(true);
        bytes memory sig = _sign(attesterPk, att);
        vm.expectRevert(TripEscrow.NoEscrow.selector);
        escrow.settle(tripId, att, sig);
    }

    // -- claimRefund ---------------------------------------------------------------

    function test_claimRefund_afterWindow() public {
        _deposit();
        skip(REFUND_WINDOW + 1);
        vm.prank(buyer);
        escrow.claimRefund(tripId);
        assertEq(usdc.balanceOf(buyer), 10_000_000);
        assertEq(uint8(escrow.getEscrow(buyer, tripId).state), uint8(TripEscrow.State.Refunded));
    }

    function test_claimRefund_revertsInsideWindow() public {
        _deposit();
        vm.expectRevert(TripEscrow.RefundNotYetClaimable.selector);
        vm.prank(buyer);
        escrow.claimRefund(tripId);
    }

    function test_claimRefund_revertsAfterSettle() public {
        _deposit();
        TripEscrow.Attestation memory att = _attestation(true);
        escrow.settle(tripId, att, _sign(attesterPk, att));
        skip(REFUND_WINDOW + 1);
        vm.expectRevert(TripEscrow.NotHeld.selector);
        vm.prank(buyer);
        escrow.claimRefund(tripId);
    }

    // -- admin -----------------------------------------------------------------------

    function test_setPrice_ownerOnly() public {
        vm.prank(owner);
        escrow.setPrice(2_000_000);
        assertEq(escrow.getPrice(), 2_000_000);

        vm.expectRevert();
        vm.prank(buyer);
        escrow.setPrice(5_000_000);
    }

    function test_setPrice_revertsOnZero() public {
        vm.expectRevert(TripEscrow.ZeroPrice.selector);
        vm.prank(owner);
        escrow.setPrice(0);
    }

    function test_setAttester_ownerOnly() public {
        address newAttester = makeAddr("newAttester");
        vm.prank(owner);
        escrow.setAttester(newAttester);
        assertEq(escrow.attester(), newAttester);

        vm.expectRevert();
        vm.prank(buyer);
        escrow.setAttester(buyer);
    }

    function test_settle_revertsAfterAttesterRotation_withOldKey() public {
        _deposit();
        vm.prank(owner);
        escrow.setAttester(makeAddr("rotated"));
        TripEscrow.Attestation memory att = _attestation(true);
        bytes memory sig = _sign(attesterPk, att);
        vm.expectRevert(TripEscrow.InvalidAttestation.selector);
        escrow.settle(tripId, att, sig);
    }
}
