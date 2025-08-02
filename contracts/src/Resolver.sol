// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./HTLC.sol";
import "./IERC20.sol";

/**
 * Minimal “resolver” that records swap intents and
 * lets an off-chain relayer execute claim once a preimage is known.
 * Supports partial fills and non-EVM (Stellar) target chain.
 */
contract Resolver {
    uint32 constant ETHEREUM_SEPOLIA = 111_551_11;
    uint32 constant STELLAR_TESTNET  = 10_001;

    struct Swap {
        address escrow;       // HTLC address
        uint32  toChain;      // target chain id
        uint256 total;        // total amount locked
        uint256 filled;       // amount already claimed
        bytes32 hash;         // hash-lock
        uint256 timelock;     // seconds
    }
    mapping(bytes32 => Swap) public swaps;

    event SwapOpened(bytes32 id, address escrow, uint16 toChain, uint256 amount, bytes32 hash);
    event SwapFilled(bytes32 id, uint256 amount, bytes32 preimage);

    /* ------------------------------------------------------------ */
    function openSwap(address escrow, uint16 toChain, uint256 amount, bytes32 hash, uint256 timelock)
        external returns (bytes32 id)
    {
        id = keccak256(abi.encodePacked(escrow, hash, amount, block.timestamp));
        swaps[id] = Swap(escrow, toChain, amount, 0, hash, timelock);
        emit SwapOpened(id, escrow, toChain, amount, hash);
    }

    /* ------------------------------------------------------------ */
    function fillSwap(bytes32 id, bytes32 preimage, uint256 part) external {
        Swap storage s = swaps[id];
        require(s.total > 0, "no swap");
        require(s.filled + part <= s.total, "overfill");
        require(sha256(abi.encodePacked(preimage)) == s.hash, "bad preimage");
        s.filled += part;

        if (s.toChain == ETHEREUM_SEPOLIA) {
            // same chain: call HTLC directly
            HTLC(s.escrow).claim(id, preimage);
        } else if (s.toChain == STELLAR_TESTNET) {
            // off-chain target – nothing to do on EVM
        }
        emit SwapFilled(id, part, preimage);
    }

    /* helper view */
    function remaining(bytes32 id) external view returns (uint256) {
        Swap storage s = swaps[id];
        return s.total - s.filled;
    }
}
