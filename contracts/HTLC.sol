// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint amount) external returns (bool);
    function transferFrom(address from, address to, uint amount) external returns (bool);
}

contract HTLC {
    event Locked(bytes32 indexed swapId, address indexed initiator, address indexed recipient, address token, uint amount, bytes32 hash, uint timelock);
    event Claimed(bytes32 indexed swapId, bytes32 preimage);
    event Refunded(bytes32 indexed swapId);

    struct Swap {
        address initiator;
        address recipient;
        address token;   // address(0) for ETH
        uint amount;
        bytes32 hash;
        uint timelock;
        bool claimed;
        bool refunded;
    }

    mapping(bytes32 => Swap) public swaps;

    // lock ERC‑20
    function lock(address recipient, address token, uint amount, bytes32 hash, uint timelock) external returns (bytes32) {
        require(timelock > block.timestamp, "timelock past");
        bytes32 id = keccak256(abi.encodePacked(msg.sender, recipient, token, amount, hash, timelock));
        require(swaps[id].initiator == address(0), "dup");
        IERC20(token).transferFrom(msg.sender, address(this), amount);
        swaps[id] = Swap(msg.sender, recipient, token, amount, hash, timelock, false, false);
        emit Locked(id, msg.sender, recipient, token, amount, hash, timelock);
        return id;
    }

    // lock ETH
    function lockETH(address recipient, bytes32 hash, uint timelock) external payable returns (bytes32) {
        require(timelock > block.timestamp, "timelock past");
        bytes32 id = keccak256(abi.encodePacked(msg.sender, recipient, address(0), msg.value, hash, timelock));
        require(swaps[id].initiator == address(0), "dup");
        swaps[id] = Swap(msg.sender, recipient, address(0), msg.value, hash, timelock, false, false);
        emit Locked(id, msg.sender, recipient, address(0), msg.value, hash, timelock);
        return id;
    }

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
        require(msg.sender == s.initiator, "Not initiator");
        require(!s.claimed && !s.refunded, "done");
        require(block.timestamp >= s.timelock, "early");
        s.refunded = true;
        if (s.token == address(0)) payable(msg.sender).transfer(s.amount);
        else IERC20(s.token).transfer(msg.sender, s.amount);
        emit Refunded(id);
    }
}