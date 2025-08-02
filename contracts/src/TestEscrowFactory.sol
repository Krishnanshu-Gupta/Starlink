// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./HTLC.sol";

contract TestEscrowFactory {
    event NewEscrow(address indexed deployer, address escrow);

    mapping(address => address[]) public myEscrows;

    function create() external returns (address escrow) {
        escrow = address(new HTLC());
        myEscrows[msg.sender].push(escrow);
        emit NewEscrow(msg.sender, escrow);
    }

    function listMine() external view returns (address[] memory) {
        return myEscrows[msg.sender];
    }
}
