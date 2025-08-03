import { ethers } from "ethers";
import pkg from "@stellar/stellar-sdk";
const { Keypair, Networks } = pkg;
import crypto from "crypto";
import { createStellarHTLC } from "./stellar.js";
import { getDatabase } from "../database.js";
import {
  getFactoryContract,
  calculateClaimableContracts,
  claimContractFromFactory,
  getSwapInfoFromFactory,
  getSwapContractsFromFactory
} from "./blockchain.js";

// Production settings
const ENABLE_AUTOMATED_BIDDING = process.env.ENABLE_AUTOMATED_BIDDING === "true";

// Resolver configuration with your testnet accounts
const RESOLVERS = [
  {
    id: "resolver1",
    name: "Resolver Alpha",
    ethAddress: process.env.RESOLVER1_ETH_ADDRESS || "0x1234567890123456789012345678901234567890",
    ethPrivateKey: process.env.RESOLVER1_ETH_KEY || "0x1111111111111111111111111111111111111111111111111111111111111111",
    stellarAddress: process.env.RESOLVER1_STELLAR_ADDRESS || "GALPHA123456789012345678901234567890123456789012345678901234567890",
    stellarSecretKey: process.env.RESOLVER1_STELLAR_KEY || "SALPHA123456789012345678901234567890123456789012345678901234567890",
    maxBid: 100, // Max XLM they're willing to send
    minBid: 0.01,   // Min XLM they'll accept (reduced from 50)
    successRate: 0.85, // 85% success rate
    avgResponseTime: 2000 // 2 seconds average response time
  },
  {
    id: "resolver2",
    name: "Resolver Beta",
    ethAddress: process.env.RESOLVER2_ETH_ADDRESS || "0x2345678901234567890123456789012345678901",
    ethPrivateKey: process.env.RESOLVER2_ETH_KEY || "0x2222222222222222222222222222222222222222222222222222222222222222",
    stellarAddress: process.env.RESOLVER2_STELLAR_ADDRESS || "GBETA123456789012345678901234567890123456789012345678901234567890",
    stellarSecretKey: process.env.RESOLVER2_STELLAR_KEY || "SBETA123456789012345678901234567890123456789012345678901234567890",
    maxBid: 120,
    minBid: 0.01, // Min XLM they'll accept (reduced from 60)
    successRate: 0.90, // 90% success rate
    avgResponseTime: 1500 // 1.5 seconds average response time
  },
  {
    id: "resolver3",
    name: "Resolver Gamma",
    ethAddress: process.env.RESOLVER3_ETH_ADDRESS || "0x3456789012345678901234567890123456789012",
    ethPrivateKey: process.env.RESOLVER3_ETH_KEY || "0x3333333333333333333333333333333333333333333333333333333333333333",
    stellarAddress: process.env.RESOLVER3_STELLAR_ADDRESS || "GGAMMA123456789012345678901234567890123456789012345678901234567890",
    stellarSecretKey: process.env.RESOLVER3_STELLAR_KEY || "SGAMMA123456789012345678901234567890123456789012345678901234567890",
    maxBid: 110,
    minBid: 0.01, // Min XLM they'll accept (reduced from 55)
    successRate: 0.88, // 88% success rate
    avgResponseTime: 1800 // 1.8 seconds average response time
  }
];

// Dutch auction state
let auctionState = {
  active: false,
  swapId: null,
  startTime: null,
  endTime: null,
  initialPrice: 0,
  currentPrice: 0,
  bids: [],
  filledAmount: 0,
  totalAmount: 0,
  ethAmount: 0,
  // New fields for 10-contract system
  contractsClaimed: 0, // 0-10
  resolverClaims: {}, // Maps resolverId to array of contract indices they can claim
  remainingContracts: [] // Array of available contract indices (0-9)
};

// Automated resolver bidding system
let automatedBiddingInterval = null;

// Get all resolvers
export function getResolvers() {
  return RESOLVERS;
}

// Get resolver by ID
export function getResolver(id) {
  return RESOLVERS.find(r => r.id === id);
}

// Start Dutch auction for a swap with 10-contract system
export function startDutchAuction(swapId, totalAmount, initialPrice, durationMinutes = 5) {
  const startTime = Date.now();
  const endTime = startTime + (durationMinutes * 60 * 1000);

  // Initialize remaining contracts (0-9)
  const remainingContracts = Array.from({length: 10}, (_, i) => i);

  auctionState = {
    active: true,
    swapId,
    startTime,
    endTime,
    initialPrice,
    currentPrice: initialPrice,
    bids: [],
    filledAmount: 0,
    totalAmount,
    ethAmount: 0, // Will be set when ETH is locked
    // Smart auction parameters
    minPriceDecrease: 0.001, // 0.1%
    maxPriceDecrease: 0.015, // 1.5%
    partialFillThresholds: [
      { percentage: 0.1, priceDecrease: 0.002 }, // 10% at 0.2% decrease
      { percentage: 0.3, priceDecrease: 0.005 }, // 30% at 0.5% decrease
      { percentage: 0.6, priceDecrease: 0.010 }, // 60% at 1.0% decrease
      { percentage: 1.0, priceDecrease: 0.015 }  // 100% at 1.5% decrease
    ],
    // 10-contract system fields
    contractsClaimed: 0,
    resolverClaims: {},
    remainingContracts
  };

  console.log(`🚀 Smart Dutch auction started for swap ${swapId}`);
  console.log(`💰 Initial price: ${initialPrice} XLM`);
  console.log(`⏰ Duration: ${durationMinutes} minutes`);
  console.log(`📊 Price range: ${(initialPrice * (1 - auctionState.maxPriceDecrease)).toFixed(2)} - ${initialPrice} XLM`);
  console.log(`🔢 10-contract system initialized with ${remainingContracts.length} available contracts`);

  return auctionState;
}

// Get current auction price (smart decrease based on time and fills)
export function getCurrentAuctionPrice() {
  if (!auctionState.active) return null;

  const now = Date.now();
  const elapsed = now - auctionState.startTime;
  const totalDuration = auctionState.endTime - auctionState.startTime;
  const progress = Math.min(elapsed / totalDuration, 1);

  // Calculate filled percentage based on contracts claimed
  const filledPercentage = auctionState.contractsClaimed / 10;

  // Find appropriate price decrease based on fill level
  let priceDecrease = auctionState.minPriceDecrease;
  for (const threshold of auctionState.partialFillThresholds) {
    if (filledPercentage <= threshold.percentage) {
      priceDecrease = threshold.priceDecrease;
      break;
    }
  }

  // Apply time-based acceleration - more aggressive
  const timeAcceleration = progress * 0.8; // Additional 80% decrease over time (increased from 50%)
  const totalPriceDecrease = Math.min(priceDecrease + timeAcceleration, auctionState.maxPriceDecrease);

  const currentPrice = auctionState.initialPrice * (1 - totalPriceDecrease);
  auctionState.currentPrice = Math.max(currentPrice, auctionState.initialPrice * 0.95); // Never below 95% (more aggressive)

  return auctionState.currentPrice;
}

// Submit bid with 10-contract system and enforce 10% increments
export function submitBid(resolverId, amount, price) {
  if (!auctionState.active) {
    throw new Error("No active auction");
  }

  const resolver = getResolver(resolverId);
  if (!resolver) {
    throw new Error("Invalid resolver");
  }

  if (amount > resolver.maxBid) {
    throw new Error(`Amount exceeds resolver's max bid of ${resolver.maxBid} XLM`);
  }

  if (amount < resolver.minBid) {
    throw new Error(`Amount below resolver's min bid of ${resolver.minBid} XLM`);
  }

  // Calculate fill percentage (must be multiple of 10)
  const fillPercentage = Math.round((amount / auctionState.totalAmount) * 100);
  const adjustedFillPercentage = Math.floor(fillPercentage / 10) * 10; // Round down to nearest 10%

  if (adjustedFillPercentage === 0) {
    throw new Error("Fill amount too small - minimum 10% required");
  }

  // Calculate how many contracts this resolver can claim
  const numContracts = adjustedFillPercentage / 10;

  // Check if enough contracts are available
  if (numContracts > auctionState.remainingContracts.length) {
    throw new Error(`Only ${auctionState.remainingContracts.length} contracts available, requested ${numContracts}`);
  }

  // Calculate actual fill amount based on adjusted percentage
  const actualFillAmount = (adjustedFillPercentage / 100) * auctionState.totalAmount;

  // Assign specific contracts to this resolver
  const assignedContracts = auctionState.remainingContracts.slice(0, numContracts);
  auctionState.resolverClaims[resolverId] = assignedContracts;

  // Remove assigned contracts from remaining
  auctionState.remainingContracts.splice(0, numContracts);
  auctionState.contractsClaimed += numContracts;

  // Create bid with the specified price
  const bid = {
    resolverId,
    resolverName: resolver.name,
    amount: actualFillAmount,
    price: price,
    timestamp: Date.now(),
    successRate: resolver.successRate,
    responseTime: resolver.avgResponseTime,
    fillPercentage: adjustedFillPercentage,
    numContracts,
    assignedContracts
  };

  auctionState.bids.push(bid);
  auctionState.filledAmount += actualFillAmount;

  console.log(`💰 Bid submitted: ${resolver.name} - ${actualFillAmount.toFixed(2)} XLM (${adjustedFillPercentage}%) at ${price.toFixed(2)} XLM`);
  console.log(`🔢 Contracts assigned: ${assignedContracts.join(', ')}`);
  console.log(`📊 Fill progress: ${((auctionState.contractsClaimed / 10) * 100).toFixed(1)}% (${auctionState.contractsClaimed}/10 contracts)`);

  return bid;
}

// Get auction status
export function getAuctionStatus() {
  if (!auctionState.active) {
    return { active: false };
  }

  const currentPrice = getCurrentAuctionPrice();
  const timeRemaining = Math.max(0, auctionState.endTime - Date.now());

  return {
    ...auctionState,
    currentPrice,
    timeRemaining,
    remainingAmount: auctionState.totalAmount - auctionState.filledAmount,
    contractsRemaining: auctionState.remainingContracts.length,
    fillProgress: (auctionState.contractsClaimed / 10) * 100
  };
}

// End auction and determine winners
export function endAuction() {
  if (!auctionState.active) {
    throw new Error("No active auction");
  }

  // Sort bids by price (lowest first) and timestamp
  const sortedBids = auctionState.bids.sort((a, b) => {
    if (a.price !== b.price) return a.price - b.price;
    return a.timestamp - b.timestamp;
  });

  const winners = [];
  let totalFilled = 0;

  for (const bid of sortedBids) {
    if (totalFilled >= auctionState.totalAmount) break;

    const fillAmount = Math.min(bid.amount, auctionState.totalAmount - totalFilled);
    winners.push({
      ...bid,
      fillAmount
    });
    totalFilled += fillAmount;
  }

  auctionState.active = false;

  console.log(`🏁 Auction ended. Winners:`, winners);
  console.log(`🔢 Total contracts claimed: ${auctionState.contractsClaimed}/10`);

  return {
    winners,
    totalFilled,
    finalPrice: winners.length > 0 ? winners[0].price : auctionState.currentPrice,
    contractsClaimed: auctionState.contractsClaimed,
    resolverClaims: auctionState.resolverClaims
  };
}

// Simulate resolver watching for new swaps
export function watchForNewSwaps() {
  // This would be called by the stellarWatcher.js
  console.log("👀 Resolvers watching for new swaps...");
}

// Claim specific contracts for a resolver
export async function claimContractsForResolver(resolverId, swapId, secret) {
  const resolver = getResolver(resolverId);
  if (!resolver) {
    throw new Error("Invalid resolver");
  }

  // Get the contracts assigned to this resolver
  const assignedContracts = auctionState.resolverClaims[resolverId];
  if (!assignedContracts || assignedContracts.length === 0) {
    throw new Error("No contracts assigned to this resolver");
  }

  console.log(`🔓 Resolver ${resolver.name} claiming contracts ${assignedContracts.join(', ')} for swap ${swapId}`);

  const claimResults = [];

  for (const contractIndex of assignedContracts) {
    try {
      // Create signer for resolver
      const provider = getEthereumProvider();
      const signer = new ethers.Wallet(resolver.ethPrivateKey, provider);

      // Claim the specific contract
      const result = await claimContractFromFactory(swapId, contractIndex, secret, signer);

      claimResults.push({
        contractIndex,
        txHash: result.hash,
        status: "claimed"
      });

      console.log(`✅ Contract ${contractIndex} claimed by resolver ${resolver.name}: ${result.hash}`);
    } catch (error) {
      console.error(`❌ Failed to claim contract ${contractIndex} for resolver ${resolver.name}:`, error);
      claimResults.push({
        contractIndex,
        error: error.message,
        status: "failed"
      });
    }
  }

  return {
    resolverId,
    resolverName: resolver.name,
    assignedContracts,
    claimResults
  };
}

// Start automated bidding for resolvers with 10-contract system
export function startAutomatedBidding() {
  if (!ENABLE_AUTOMATED_BIDDING) {
    console.log("🤖 Automated bidding disabled");
    return;
  }

  if (automatedBiddingInterval) {
    clearInterval(automatedBiddingInterval);
  }

  automatedBiddingInterval = setInterval(async () => {
    if (!auctionState.active) {
      console.log("🤖 No active auction, skipping bidding cycle");
      return;
    }

    const resolvers = getResolvers();
    const currentPrice = getCurrentAuctionPrice();
    const remainingContracts = auctionState.remainingContracts.length;

    console.log(`🤖 Bidding cycle - Price: ${currentPrice?.toFixed(2)} XLM, Remaining contracts: ${remainingContracts}`);

    if (remainingContracts === 0) {
      console.log("✅ Auction completed - all contracts claimed");
      clearInterval(automatedBiddingInterval);
      return;
    }

    // Deterministic bidding system with 10% increments
    const remainingPercentage = (remainingContracts / 10) * 100;

    if (remainingPercentage > 0) {
      // Define resolver strategies with fill ranges (must be multiples of 10)
      const resolverStrategies = {
        'resolver1': {
          fillRange: { min: 10, max: 20 }, // 10-20% of total (1-2 contracts)
          priceDecreaseRange: { min: 0.15, max: 0.25 }, // 0.15-0.25% decrease
          name: 'Alpha'
        },
        'resolver2': {
          fillRange: { min: 30, max: 50 }, // 30-50% of total (3-5 contracts)
          priceDecreaseRange: { min: 0.45, max: 0.55 }, // 0.45-0.55% decrease
          name: 'Beta'
        },
        'resolver3': {
          fillRange: { min: 40, max: 60 }, // 40-60% of total (4-6 contracts)
          priceDecreaseRange: { min: 0.95, max: 1.05 }, // ~1% decrease
          name: 'Gamma'
        }
      };

      // Randomly select which resolver to bid (equal probability)
      const resolverIds = Object.keys(resolverStrategies);
      const selectedResolverId = resolverIds[Math.floor(Math.random() * resolverIds.length)];
      const selectedResolver = getResolver(selectedResolverId);
      const strategy = resolverStrategies[selectedResolverId];

      if (selectedResolver) {
        // Calculate fill percentage within resolver's range (must be multiple of 10)
        const maxPossibleFill = Math.min(strategy.fillRange.max, remainingPercentage);
        const minPossibleFill = Math.min(strategy.fillRange.min, maxPossibleFill);

        if (minPossibleFill >= 10) {
          // Round to nearest 10%
          const fillPercentage = Math.floor(minPossibleFill / 10) * 10;

          // Calculate price decrease within resolver's range
          const priceDecrease = strategy.priceDecreaseRange.min + Math.random() * (strategy.priceDecreaseRange.max - strategy.priceDecreaseRange.min);

          // Calculate actual fill amount
          const fillAmount = (fillPercentage / 100) * auctionState.totalAmount;

          console.log(`🤖 Selected ${strategy.name} - Fill: ${fillPercentage}% (${fillAmount.toFixed(2)} XLM), Price decrease: ${priceDecrease.toFixed(2)}%`);

          try {
            const targetPrice = currentPrice * (1 - priceDecrease / 100);

            if (fillAmount >= selectedResolver.minBid) {
              console.log(`🤖 Attempting bid: ${strategy.name} - Amount: ${fillAmount.toFixed(2)} XLM, Price: ${targetPrice.toFixed(4)} XLM`);
              try {
                const bid = submitBid(selectedResolverId, fillAmount, targetPrice);
                console.log(`🤖 Automated bid: ${strategy.name} filled ${bid.amount.toFixed(2)} XLM at ${targetPrice.toFixed(4)} XLM (${bid.fillPercentage}%)`);

                // Lock XLM in Stellar HTLC for this resolver
                try {
                  const lockResult = await lockXlmForResolver(selectedResolverId, auctionState.swapId, bid.amount);
                  console.log(`🔒 Resolver ${strategy.name} locked ${bid.amount} XLM in Stellar HTLC`);
                } catch (lockError) {
                  console.log(`❌ Resolver ${strategy.name} failed to lock XLM: ${lockError.message}`);
                }

                // Simulate resolver claiming their contracts after a delay
                // Add random delay to avoid rate limiting conflicts between resolvers
                const randomDelay = selectedResolver.avgResponseTime + Math.random() * 5000;
                setTimeout(() => {
                  claimResolverContracts(selectedResolverId, bid.assignedContracts, targetPrice);
                }, randomDelay);
              } catch (error) {
                console.log(`🤖 Resolver ${strategy.name} bid failed: ${error.message}`);
              }
            } else {
              console.log(`🤖 Bid amount ${fillAmount.toFixed(2)} XLM below minimum ${selectedResolver.minBid} XLM for ${strategy.name}`);
            }
          } catch (error) {
            console.log(`🤖 Resolver ${strategy.name} bid failed: ${error.message}`);
          }
        } else {
          console.log(`🤖 Not enough remaining contracts for ${strategy.name} (${remainingContracts} available)`);
        }
      }
    }
  }, 1000); // Check every 1 second

  console.log("🤖 Automated resolver bidding started with 10-contract system");
}

// Stop automated bidding
export function stopAutomatedBidding() {
  if (automatedBiddingInterval) {
    clearInterval(automatedBiddingInterval);
    automatedBiddingInterval = null;
    console.log("🤖 Automated resolver bidding stopped");
  }
}

// Lock XLM for a resolver in Stellar HTLC
async function lockXlmForResolver(resolverId, swapId, amount) {
  const resolver = getResolver(resolverId);
  if (!resolver) {
    throw new Error("Invalid resolver");
  }

  try {
    // Get swap details from database using factory_swap_id field
    const db = await getDatabase();
    const swap = await db.get("SELECT * FROM swaps WHERE factory_swap_id = ?", [swapId]);
    if (!swap) {
      throw new Error("Swap not found");
    }

    // Create Stellar keypair from resolver's secret key
    const resolverKeypair = Keypair.fromSecret(resolver.stellarSecretKey);

    // Create Stellar HTLC escrow
    const stellarResult = await createStellarHTLC(
      swap.recipient_address,
      swap.hash,
      swap.timelock,
      amount.toString(),
      resolverKeypair
    );

    // Store resolver lock in database
    await db.run(`
      INSERT INTO resolver_locks (
        swap_id, resolver_id, amount, escrow_address, stellar_tx_hash, status
      ) VALUES (?, ?, ?, ?, ?, ?)
    `, [swapId, resolverId, amount, stellarResult.escrowAddress, stellarResult.transactionHash, "locked"]);

    console.log(`🔒 Resolver ${resolver.name} locked ${amount} XLM in escrow ${stellarResult.escrowAddress}`);
    return stellarResult;
  } catch (error) {
    console.error(`❌ Resolver ${resolver.name} failed to lock XLM:`, error);
    throw error;
  }
}

// Real resolver claiming their contracts
async function claimResolverContracts(resolverId, assignedContracts, price) {
  const resolver = getResolver(resolverId);
  if (!resolver) return;

  try {
    console.log(`💰 Resolver ${resolver.name} claiming contracts ${assignedContracts.join(', ')}`);

    // Create Ethereum signer with resolver's private key
    const { ethers } = await import("ethers");
    const provider = new ethers.JsonRpcProvider(process.env.INFURA_URL || "https://sepolia.infura.io/v3/04944e1b094c4f93ad909a10bcff6803");
    const signer = new ethers.Wallet(resolver.ethPrivateKey, provider);

    // Get the current swap ID from auction state
    const swapId = auctionState.swapId;
    if (!swapId) {
      console.error(`❌ No active swap for resolver ${resolver.name}`);
      return;
    }

    // Convert swap ID to bytes32 format for smart contract (handle 0x prefix properly)
    const cleanSwapId = swapId.startsWith('0x') ? swapId.slice(2) : swapId;
    const swapIdBytes32 = ethers.zeroPadValue(ethers.hexlify("0x" + cleanSwapId), 32);
    console.log(`🔧 Converted swap ID to bytes32: ${swapIdBytes32}`);

    // Get the secret from the database using factory_swap_id
    const db = await getDatabase();
    const swap = await db.get("SELECT * FROM swaps WHERE factory_swap_id = ?", [swapId]);
    if (!swap) {
      console.error(`❌ Swap ${swapId} not found in database`);
      return;
    }

    // Only allow claims when ETH is locked
    if (swap.status !== "locked_eth") {
      console.log(`⏳ Swap ${swapId} not ready for claims yet. Status: ${swap.status}`);
      return;
    }

    const secret = swap.secret;
    console.log(`🔑 Using secret for swap ${swapId}: ${secret}`);

    // Import the claim function
    const { claimContractFromFactory } = await import("./blockchain.js");

    // Claim each assigned contract with real transactions
    for (const contractIndex of assignedContracts) {
      let retryCount = 0;
      const maxRetries = 3;

      // Add delay between different contract claims to avoid rate limiting
      if (contractIndex > assignedContracts[0]) {
        const delay = 1000; // 2 second delay between contract claims
        console.log(`⏳ Waiting ${delay}ms between contract claims to avoid rate limiting...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      while (retryCount < maxRetries) {
        try {
          console.log(`🔓 Resolver ${resolver.name} claiming contract ${contractIndex} to ${resolver.ethAddress} (attempt ${retryCount + 1}/${maxRetries})`);

          // Add delay between retries with exponential backoff
          if (retryCount > 0) {
            const delay = Math.min(retryCount * 10000, 30000); // 10s, 20s, 30s delays (max 30s)
            console.log(`⏳ Waiting ${delay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }

          const claimResult = await claimContractFromFactory(swapIdBytes32, contractIndex, secret, signer);

          console.log(`✅ Resolver ${resolver.name} successfully claimed contract ${contractIndex}`);
          console.log(`📝 Transaction hash: ${claimResult.hash}`);
          console.log(`📊 Gas used: ${claimResult.gasUsed?.toString() || 'N/A'}`);

          // Update database with claim result
          await db.run(`
            INSERT INTO contract_claims (
              swap_id, resolver_id, contract_index, transaction_hash, status, gas_used
            ) VALUES (?, ?, ?, ?, ?, ?)
          `, [swapId, resolverId, contractIndex, claimResult.hash, "claimed", claimResult.gasUsed?.toString() || "0"]);

          break; // Success, exit retry loop

        } catch (claimError) {
          retryCount++;

          // Handle rate limiting specifically
          if (claimError.message.includes("Too Many Requests") || claimError.message.includes("-32005")) {
            console.error(`⚠️ Rate limit hit for resolver ${resolver.name} contract ${contractIndex} (attempt ${retryCount}/${maxRetries})`);
            // Add extra delay for rate limiting
            await new Promise(resolve => setTimeout(resolve, 15000)); // 15 second extra delay
          } else {
            console.error(`❌ Resolver ${resolver.name} failed to claim contract ${contractIndex} (attempt ${retryCount}/${maxRetries}):`, claimError.message);
          }

          if (retryCount >= maxRetries) {
            // Final failure, log the error in database
            await db.run(`
              INSERT INTO contract_claims (
                swap_id, resolver_id, contract_index, transaction_hash, status, error_message
              ) VALUES (?, ?, ?, ?, ?, ?)
            `, [swapId, resolverId, contractIndex, "failed", "failed", claimError.message]);
          }
        }
      }
    }

  } catch (error) {
    console.error(`❌ Resolver ${resolver.name} claim process failed:`, error);
  }
}

// Get resolver fill statistics with 10-contract system
export function getResolverStats() {
  const stats = {};
  const resolvers = getResolvers();

  resolvers.forEach(resolver => {
    if (auctionState.active) {
      // If there's an active auction, calculate real stats
      const resolverBids = auctionState.bids.filter(bid => bid.resolverId === resolver.id);
      const totalFilled = resolverBids.reduce((sum, bid) => sum + bid.amount, 0);
      const averagePrice = resolverBids.length > 0
        ? resolverBids.reduce((sum, bid) => sum + bid.price, 0) / resolverBids.length
        : 0;

      const assignedContracts = auctionState.resolverClaims[resolver.id] || [];
      const numContracts = assignedContracts.length;

      stats[resolver.id] = {
        name: resolver.name,
        totalFilled: totalFilled.toFixed(2),
        averagePrice: averagePrice.toFixed(2),
        bidCount: resolverBids.length,
        percentage: auctionState.totalAmount > 0 ? ((totalFilled / auctionState.totalAmount) * 100).toFixed(1) : "0.0",
        contractsAssigned: numContracts,
        assignedContracts: assignedContracts,
        successRate: resolver.successRate,
        avgResponseTime: resolver.avgResponseTime
      };
    } else {
      // If no active auction, return default stats
      stats[resolver.id] = {
        name: resolver.name,
        totalFilled: "0.00",
        averagePrice: "0.00",
        bidCount: 0,
        percentage: "0.0",
        contractsAssigned: 0,
        assignedContracts: [],
        successRate: resolver.successRate,
        avgResponseTime: resolver.avgResponseTime,
        status: "idle"
      };
    }
  });

  return stats;
}