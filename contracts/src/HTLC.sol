// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IERC20.sol";

contract HTLC {
    event Locked   (bytes32 indexed id, address indexed sender,  address indexed recipient, address token, uint256 amount, bytes32 hash, uint256 timelock);
    event Claimed  (bytes32 indexed id, bytes32 preimage);
    event Refunded (bytes32 indexed id);

    struct Swap {
        address sender;
        address recipient;
        address token;        // address(0) for ETH
        uint256 amount;
        bytes32 hash;
        uint256 timelock;
        bool    claimed;
        bool    refunded;
    }
    mapping(bytes32 => Swap) public swaps;

    /* ---------- lock ---------- */
    function lockETH(address recipient, bytes32 hash, uint256 timelock) external payable returns (bytes32 id) {
        require(msg.value > 0, "no value");
        require(timelock > block.timestamp, "bad time");
        id = keccak256(abi.encodePacked(msg.sender, recipient, address(0), msg.value, hash, timelock));
        require(swaps[id].sender == address(0), "dup");
        swaps[id] = Swap(msg.sender, recipient, address(0), msg.value, hash, timelock, false, false);
        emit Locked(id, msg.sender, recipient, address(0), msg.value, hash, timelock);
    }

    function lock(address recipient, address token, uint256 amount, bytes32 hash, uint256 timelock) external returns (bytes32 id) {
        require(amount > 0, "no amount");
        IERC20(token).transferFrom(msg.sender, address(this), amount);
        require(timelock > block.timestamp, "bad time");
        id = keccak256(abi.encodePacked(msg.sender, recipient, token, amount, hash, timelock));
        require(swaps[id].sender == address(0), "dup");
        swaps[id] = Swap(msg.sender, recipient, token, amount, hash, timelock, false, false);
        emit Locked(id, msg.sender, recipient, token, amount, hash, timelock);
    }

    /* ---------- claim / refund ---------- */
    function claim(bytes32 id, bytes32 preimage) external {
        Swap storage s = swaps[id];
        require(msg.sender == s.recipient, "Not recipient");
        require(!s.claimed && !s.refunded, "done");
        require(sha256(abi.encodePacked(preimage)) == s.hash, "bad preimage");
        require(block.timestamp < s.timelock, "expired");
        s.claimed = true;
        if (s.token == address(0)) payable(msg.sender).transfer(s.amount);
        else IERC20(s.token).transfer(msg.sender, s.amount);
        emit Claimed(id, preimage);
    }

    function refund(bytes32 id) external {
        Swap storage s = swaps[id];
        require(msg.sender == s.sender, "Not sender");
        require(!s.claimed && !s.refunded, "done");
        require(block.timestamp >= s.timelock, "early");
        s.refunded = true;
        if (s.token == address(0)) payable(msg.sender).transfer(s.amount);
        else IERC20(s.token).transfer(msg.sender, s.amount);
        emit Refunded(id);
    }
}
