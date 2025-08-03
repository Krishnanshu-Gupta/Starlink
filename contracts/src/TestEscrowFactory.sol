// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./HTLC.sol";
import "./IERC20.sol";

/**
 * Factory contract that creates 10 separate HTLC contracts for each swap
 * Each contract represents 10% of the total swap amount
 * Resolvers can claim individual contracts based on their fill percentage
 */
contract TestEscrowFactory {
    struct SwapInfo {
        address initiator;
        address recipient;
        address token; // address(0) for ETH
        uint256 totalAmount;
        uint256 amountPerContract; // totalAmount / 10
        bytes32 hash;
        uint256 timelock;
        bool isActive;
        uint256 filledContracts; // 0-10, tracks how many contracts have been claimed
    }

    // Mapping from swap ID to swap info
    mapping(bytes32 => SwapInfo) public swaps;

    // Mapping from swap ID to array of HTLC contract addresses
    mapping(bytes32 => address[10]) public swapContracts;

    // Mapping from swap ID to contract index to resolver address
    mapping(bytes32 => mapping(uint256 => address)) public contractResolvers;

    event SwapCreated(bytes32 indexed swapId, address indexed initiator, uint256 totalAmount, uint256 amountPerContract);
    event ContractCreated(bytes32 indexed swapId, uint256 contractIndex, address contractAddress, uint256 amount);
    event ContractClaimed(bytes32 indexed swapId, uint256 contractIndex, address indexed resolver, uint256 amount);
    event SwapCompleted(bytes32 indexed swapId, uint256 totalClaimed);

    /**
     * Create a new swap with 10 separate HTLC contracts
     * @param recipient The recipient address
     * @param token The token address (address(0) for ETH)
     * @param totalAmount The total amount to swap
     * @param hash The hash-lock
     * @param timelock The timelock
     * @return swapId The unique swap identifier
     */
    function createSwap(
        address recipient,
        address token,
        uint256 totalAmount,
        bytes32 hash,
        uint256 timelock
    ) external payable returns (bytes32 swapId) {
        require(totalAmount > 0, "Amount must be greater than 0");
        require(totalAmount % 10 == 0, "Amount must be divisible by 10");
        require(timelock > block.timestamp, "Timelock must be in the future");

        // Calculate amount per contract (10% of total)
        uint256 amountPerContract = totalAmount / 10;

        // Generate swap ID
        swapId = keccak256(abi.encodePacked(
            msg.sender,
            recipient,
            token,
            totalAmount,
            hash,
            timelock,
            block.timestamp
        ));

        require(swaps[swapId].initiator == address(0), "Swap already exists");

        // Store swap info
        swaps[swapId] = SwapInfo({
            initiator: msg.sender,
            recipient: recipient,
            token: token,
            totalAmount: totalAmount,
            amountPerContract: amountPerContract,
            hash: hash,
            timelock: timelock,
            isActive: true,
            filledContracts: 0
        });

        // Create 10 HTLC contracts
        for (uint256 i = 0; i < 10; i++) {
            address contractAddress = createHTLCContract(swapId, i, amountPerContract);
            swapContracts[swapId][i] = contractAddress;
        }

        emit SwapCreated(swapId, msg.sender, totalAmount, amountPerContract);

        return swapId;
    }

    /**
     * Create a single HTLC contract for a specific portion of the swap
     */
    function createHTLCContract(
        bytes32 swapId,
        uint256 contractIndex,
        uint256 amount
    ) internal returns (address contractAddress) {
        SwapInfo storage swap = swaps[swapId];

        // Deploy new HTLC contract
        HTLC htlc = new HTLC();
        contractAddress = address(htlc);

        // Lock funds in the contract
        if (swap.token == address(0)) {
            // ETH
            require(msg.value >= amount, "Insufficient ETH sent");
            htlc.lockETH{value: amount}(address(this), swap.hash, swap.timelock);
        } else {
            // ERC20 token
            IERC20(swap.token).transferFrom(msg.sender, address(htlc), amount);
            htlc.lock(address(this), swap.token, amount, swap.hash, swap.timelock);
        }

        emit ContractCreated(swapId, contractIndex, contractAddress, amount);
    }

    /**
     * Claim a specific contract (10% of the total swap)
     * @param swapId The swap identifier
     * @param contractIndex The contract index (0-9)
     * @param preimage The preimage for the hash-lock
     */
    function claimContract(
        bytes32 swapId,
        uint256 contractIndex,
        bytes32 preimage
    ) external {
        require(contractIndex < 10, "Invalid contract index");
        require(swaps[swapId].isActive, "Swap not active");
        require(contractResolvers[swapId][contractIndex] == address(0), "Contract already claimed");

        SwapInfo storage swap = swaps[swapId];
        address contractAddress = swapContracts[swapId][contractIndex];
        require(contractAddress != address(0), "Contract not found");

        // Mark this contract as claimed by this resolver
        contractResolvers[swapId][contractIndex] = msg.sender;
        swap.filledContracts++;

        // Claim from the HTLC contract
        HTLC htlc = HTLC(contractAddress);
        htlc.claim(swapId, preimage);

        // Transfer the claimed amount to the resolver
        if (swap.token == address(0)) {
            // ETH
            payable(msg.sender).transfer(swap.amountPerContract);
        } else {
            // ERC20 token
            IERC20(swap.token).transfer(msg.sender, swap.amountPerContract);
        }

        emit ContractClaimed(swapId, contractIndex, msg.sender, swap.amountPerContract);

        // Check if all contracts are claimed
        if (swap.filledContracts == 10) {
            swap.isActive = false;
            emit SwapCompleted(swapId, swap.totalAmount);
        }
    }

    /**
     * Get swap information
     */
    function getSwapInfo(bytes32 swapId) external view returns (
        address initiator,
        address recipient,
        address token,
        uint256 totalAmount,
        uint256 amountPerContract,
        bytes32 hash,
        uint256 timelock,
        bool isActive,
        uint256 filledContracts
    ) {
        SwapInfo storage swap = swaps[swapId];
        return (
            swap.initiator,
            swap.recipient,
            swap.token,
            swap.totalAmount,
            swap.amountPerContract,
            swap.hash,
            swap.timelock,
            swap.isActive,
            swap.filledContracts
        );
    }

    /**
     * Get contract addresses for a swap
     */
    function getSwapContracts(bytes32 swapId) external view returns (address[10] memory) {
        return swapContracts[swapId];
    }

    /**
     * Get resolver for a specific contract
     */
    function getContractResolver(bytes32 swapId, uint256 contractIndex) external view returns (address) {
        return contractResolvers[swapId][contractIndex];
    }

    /**
     * Calculate how many contracts a resolver can claim based on their fill percentage
     * @param fillPercentage Fill percentage (0-100, must be multiple of 10)
     * @return numContracts Number of contracts that can be claimed
     */
    function calculateClaimableContracts(uint256 fillPercentage) external pure returns (uint256) {
        require(fillPercentage <= 100, "Fill percentage cannot exceed 100");
        require(fillPercentage % 10 == 0, "Fill percentage must be multiple of 10");
        return fillPercentage / 10;
    }

    /**
     * Get remaining unclaimed contracts for a swap
     */
    function getRemainingContracts(bytes32 swapId) external view returns (uint256[] memory) {
        SwapInfo storage swap = swaps[swapId];
        uint256 remainingCount = 10 - swap.filledContracts;
        uint256[] memory remaining = new uint256[](remainingCount);

        uint256 index = 0;
        for (uint256 i = 0; i < 10; i++) {
            if (contractResolvers[swapId][i] == address(0)) {
                remaining[index] = i;
                index++;
            }
        }

        return remaining;
    }
}
