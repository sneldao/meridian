// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title TripEscrow — per-trip escrow with attested release
/// @notice A traveller deposits a fixed USDC price per trip. The deposit is
/// released to the treasury when the backend attester signs that the trip's
/// plan passed the deterministic gate (evaluatePlan), or refunded to the
/// traveller when the attestation says it failed. If the attester never
/// signs, the traveller claims their own refund after `REFUND_WINDOW`.
/// No token, no upgrade path, no pause. Plan and personal data never touch
/// the chain — only a planHash binds the attestation to the scored artifact.
contract TripEscrow is EIP712, Ownable {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    enum State {
        None,
        Held,
        Settled,
        Refunded
    }

    struct Escrow {
        uint256 amount;
        uint256 depositedAt;
        State state;
    }

    struct Attestation {
        address buyer;
        bytes32 tripId;
        bytes32 planHash;
        bool passed;
        uint256 expiry;
    }

    bytes32 public constant ATTESTATION_TYPEHASH = keccak256(
        "Attestation(address buyer,bytes32 tripId,bytes32 planHash,bool passed,uint256 expiry)"
    );

    IERC20 public immutable USDC_TOKEN;
    address public immutable TREASURY;
    uint64 public immutable REFUND_WINDOW;

    address public attester;
    uint256 public price;

    /// @notice escrow[buyer][tripId] — one deposit per trip per wallet.
    mapping(address => mapping(bytes32 => Escrow)) public escrows;

    event Deposited(address indexed buyer, bytes32 indexed tripId, uint256 amount);
    event Settled(
        address indexed buyer, bytes32 indexed tripId, bytes32 planHash, uint256 amount
    );
    event Refunded(
        address indexed buyer, bytes32 indexed tripId, bytes32 planHash, uint256 amount
    );
    event PriceUpdated(uint256 oldPrice, uint256 newPrice);
    event AttesterUpdated(address oldAttester, address newAttester);

    error AlreadyDeposited();
    error NoEscrow();
    error NotHeld();
    error AttestationExpired();
    error InvalidAttestation();
    error RefundNotYetClaimable();
    error ZeroPrice();

    constructor(
        address usdcToken_,
        uint256 price_,
        address treasury_,
        address attester_,
        uint64 refundWindow_,
        address initialOwner
    ) EIP712("MeridianTripEscrow", "1") Ownable(initialOwner) {
        require(usdcToken_ != address(0) && treasury_ != address(0), "zero address");
        require(price_ > 0, "zero price");
        USDC_TOKEN = IERC20(usdcToken_);
        price = price_;
        TREASURY = treasury_;
        attester = attester_;
        REFUND_WINDOW = refundWindow_;
    }

    /// @notice Pull `price` USDC into escrow for (msg.sender, tripId).
    /// Requires a prior USDC approve() covering `price` — handled by the
    /// frontend immediately before this call.
    function deposit(bytes32 tripId) external {
        Escrow storage e = escrows[msg.sender][tripId];
        if (e.state != State.None) revert AlreadyDeposited();

        uint256 amount = price;
        USDC_TOKEN.safeTransferFrom(msg.sender, address(this), amount);

        e.amount = amount;
        e.depositedAt = block.timestamp;
        e.state = State.Held;

        emit Deposited(msg.sender, tripId, amount);
    }

    /// @notice Release or refund a held escrow, gated by the attester's
    /// EIP-712 signature over {buyer, tripId, planHash, passed, expiry}.
    /// Permissionless to call — the backend relays it right after signing —
    /// because the signature is what authorises the transition, not the caller.
    function settle(bytes32 tripId, Attestation calldata att, bytes calldata signature)
        external
    {
        Escrow storage e = escrows[att.buyer][tripId];
        if (e.state == State.None) revert NoEscrow();
        if (e.state != State.Held) revert NotHeld();
        if (att.expiry < block.timestamp) revert AttestationExpired();
        if (att.tripId != tripId) revert InvalidAttestation();

        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    ATTESTATION_TYPEHASH,
                    att.buyer,
                    att.tripId,
                    att.planHash,
                    att.passed,
                    att.expiry
                )
            )
        );
        address recovered = digest.recover(signature);
        if (recovered != attester) revert InvalidAttestation();

        uint256 amount = e.amount;
        e.state = att.passed ? State.Settled : State.Refunded;

        if (att.passed) {
            USDC_TOKEN.safeTransfer(TREASURY, amount);
            emit Settled(att.buyer, tripId, att.planHash, amount);
        } else {
            USDC_TOKEN.safeTransfer(att.buyer, amount);
            emit Refunded(att.buyer, tripId, att.planHash, amount);
        }
    }

    /// @notice Permissionless refund once the escrow has sat unsettled for
    /// `REFUND_WINDOW`. The attester going dark can never trap funds.
    function claimRefund(bytes32 tripId) external {
        Escrow storage e = escrows[msg.sender][tripId];
        if (e.state == State.None) revert NoEscrow();
        if (e.state != State.Held) revert NotHeld();
        if (block.timestamp < e.depositedAt + REFUND_WINDOW) {
            revert RefundNotYetClaimable();
        }

        uint256 amount = e.amount;
        e.state = State.Refunded;

        USDC_TOKEN.safeTransfer(msg.sender, amount);
        emit Refunded(msg.sender, tripId, bytes32(0), amount);
    }

    function getPrice() external view returns (uint256) {
        return price;
    }

    function getEscrow(address buyer, bytes32 tripId)
        external
        view
        returns (Escrow memory)
    {
        return escrows[buyer][tripId];
    }

    function setPrice(uint256 newPrice) external onlyOwner {
        if (newPrice == 0) revert ZeroPrice();
        emit PriceUpdated(price, newPrice);
        price = newPrice;
    }

    function setAttester(address newAttester) external onlyOwner {
        emit AttesterUpdated(attester, newAttester);
        attester = newAttester;
    }
}
