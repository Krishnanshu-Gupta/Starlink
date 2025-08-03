import { ethers } from "ethers";
import pkg from "@stellar/stellar-sdk";
const { Keypair, Networks } = pkg;
import { createStellarHTLC } from "./stellar.js";
import { getDatabase } from "../database.js";

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
    minBid: 50,   // Min XLM they'll accept
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
    minBid: 60,
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
    minBid: 55,
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
  ethAmount: 0
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

// Start Dutch auction for a swap
export function startDutchAuction(swapId, totalAmount, initialPrice, durationMinutes = 5) {
  const startTime = Date.now();
  const endTime = startTime + (durationMinutes * 60 * 1000);

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
    ]
  };

  console.log(`🚀 Smart Dutch auction started for swap ${swapId}`);
  console.log(`💰 Initial price: ${initialPrice} XLM`);
  console.log(`⏰ Duration: ${durationMinutes} minutes`);
  console.log(`📊 Price range: ${(initialPrice * (1 - auctionState.maxPriceDecrease)).toFixed(2)} - ${initialPrice} XLM`);

  return auctionState;
}

// Get current auction price (smart decrease based on time and fills)
export function getCurrentAuctionPrice() {
  if (!auctionState.active) return null;

  const now = Date.now();
  const elapsed = now - auctionState.startTime;
  const totalDuration = auctionState.endTime - auctionState.startTime;
  const progress = Math.min(elapsed / totalDuration, 1);

  // Calculate filled percentage
  const filledPercentage = auctionState.filledAmount / auctionState.totalAmount;

  // Find appropriate price decrease based on fill level
  let priceDecrease = auctionState.minPriceDecrease;
  for (const threshold of auctionState.partialFillThresholds) {
    if (filledPercentage <= threshold.percentage) {
      priceDecrease = threshold.priceDecrease;
      break;
    }
  }

  // Apply time-based acceleration
  const timeAcceleration = progress * 0.5; // Additional 50% decrease over time
  const totalPriceDecrease = Math.min(priceDecrease + timeAcceleration, auctionState.maxPriceDecrease);

  const currentPrice = auctionState.initialPrice * (1 - totalPriceDecrease);
  auctionState.currentPrice = Math.max(currentPrice, auctionState.initialPrice * 0.985); // Never below 98.5%

  return auctionState.currentPrice;
}

// Submit bid with smart partial fill logic and real transaction simulation
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

  const currentPrice = getCurrentAuctionPrice();
  const remainingAmount = auctionState.totalAmount - auctionState.filledAmount;

  // Calculate how much this resolver can actually fill based on success rate
  const maxFillAmount = Math.min(amount, remainingAmount);
  const successFactor = resolver.successRate;
  const actualFillAmount = Math.min(maxFillAmount, amount * successFactor);

  if (actualFillAmount <= 0) {
    throw new Error("No remaining amount to fill");
  }

  // Create bid with realistic partial fill
  const bid = {
    resolverId,
    resolverName: resolver.name,
    amount: actualFillAmount,
    price: currentPrice,
    timestamp: Date.now(),
    successRate: resolver.successRate,
    responseTime: resolver.avgResponseTime
  };

  auctionState.bids.push(bid);
  auctionState.filledAmount += actualFillAmount;

  console.log(`💰 Bid submitted: ${resolver.name} - ${actualFillAmount.toFixed(2)} XLM at ${currentPrice.toFixed(2)} XLM`);
  console.log(`📊 Fill progress: ${((auctionState.filledAmount / auctionState.totalAmount) * 100).toFixed(1)}%`);

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
    remainingAmount: auctionState.totalAmount - auctionState.filledAmount
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

  return {
    winners,
    totalFilled,
    finalPrice: winners.length > 0 ? winners[0].price : auctionState.currentPrice
  };
}

// Simulate resolver watching for new swaps
export function watchForNewSwaps() {
  // This would be called by the stellarWatcher.js
  console.log("👀 Resolvers watching for new swaps...");
}

// Simulate resolver claiming ETH after XLM is claimed
export async function claimEthForResolver(resolverId, swapId, secret) {
  const resolver = getResolver(resolverId);
  if (!resolver) {
    throw new Error("Invalid resolver");
  }

  console.log(`🔓 Resolver ${resolver.name} claiming ETH for swap ${swapId}`);

  // In production, this would use the resolver's private key
  // const signer = new ethers.Wallet(resolver.ethPrivateKey, provider);
  // const htlcContract = getHTLCContract(signer);
  // const tx = await htlcContract.claim(swapId, secret);
  // return await tx.wait();

  // For now, simulate the transaction
  const txHash = "0x" + crypto.randomBytes(32).toString("hex");
  console.log(`✅ ETH claimed by resolver ${resolver.name}: ${txHash}`);

  return { txHash };
}

// Start automated bidding for resolvers with real transaction simulation
export function startAutomatedBidding() {
  if (!ENABLE_AUTOMATED_BIDDING) {
    console.log("🤖 Automated bidding disabled");
    return;
  }

  if (automatedBiddingInterval) {
    clearInterval(automatedBiddingInterval);
  }

  automatedBiddingInterval = setInterval(async () => {
    if (!auctionState.active) return;

    const resolvers = getResolvers();
    const currentPrice = getCurrentAuctionPrice();
    const remainingAmount = auctionState.totalAmount - auctionState.filledAmount;

    if (remainingAmount <= 0) {
      console.log("✅ Auction completed - all amounts filled");
      clearInterval(automatedBiddingInterval);
      return;
    }

    // Each resolver has a chance to bid based on their strategy and success rate
    for (const resolver of resolvers) {
      // Calculate bid probability based on resolver's success rate and current market conditions
      const baseProbability = 0.3; // 30% base chance
      const successRateBonus = resolver.successRate * 0.2; // Up to 20% bonus for high success rate
      const priceCompetitiveness = Math.max(0, (currentPrice - auctionState.initialPrice * 0.99) / auctionState.initialPrice) * 0.3; // Up to 30% bonus for competitive pricing

      const bidProbability = baseProbability + successRateBonus + priceCompetitiveness;

      if (Math.random() < bidProbability) {
        try {
          // Calculate bid amount based on resolver's strategy
          const maxBidAmount = Math.min(
            resolver.maxBid * (0.1 + Math.random() * 0.4), // 10-50% of max bid
            remainingAmount
          );

          if (maxBidAmount >= resolver.minBid) {
            // Simulate response time delay
            setTimeout(async () => {
              try {
                const bid = submitBid(resolver.id, maxBidAmount, currentPrice);
                console.log(`🤖 Automated bid: ${resolver.name} filled ${bid.amount.toFixed(2)} XLM`);

                // Actually lock XLM in Stellar HTLC
                try {
                  const lockResult = await lockXlmForResolver(resolver.id, auctionState.swapId, bid.amount);
                  console.log(`🔒 Resolver ${resolver.name} locked ${bid.amount} XLM in Stellar HTLC`);
                } catch (lockError) {
                  console.log(`❌ Resolver ${resolver.name} failed to lock XLM: ${lockError.message}`);
                }

                // Simulate resolver claiming their portion after a delay
                setTimeout(() => {
                  claimResolverPortion(resolver.id, bid.amount, currentPrice);
                }, resolver.avgResponseTime);
              } catch (error) {
                console.log(`🤖 Resolver ${resolver.name} bid failed: ${error.message}`);
              }
            }, Math.random() * resolver.avgResponseTime); // Random delay within resolver's response time
          }
        } catch (error) {
          console.log(`🤖 Resolver ${resolver.name} bid failed: ${error.message}`);
        }
      }
    }
  }, 3000); // Check every 3 seconds

  console.log("🤖 Automated resolver bidding started with real transaction simulation");
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
    // Get swap details from database
    const db = await getDatabase();
    const swap = await db.get("SELECT * FROM swaps WHERE id = ?", [swapId]);
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

// Simulate resolver claiming their portion with real transaction simulation
async function claimResolverPortion(resolverId, amount, price) {
  const resolver = getResolver(resolverId);
  if (!resolver) return;

  try {
    // Calculate the ETH portion this resolver can claim
    const ethPortion = (amount / auctionState.totalAmount) * parseFloat(auctionState.ethAmount);

    console.log(`💰 Resolver ${resolver.name} claiming ${ethPortion.toFixed(6)} ETH for ${amount} XLM`);

    // In a real system, this would trigger the HTLC claim with real private keys
    // For now, we'll simulate the claim with realistic transaction data
    const simulatedTxHash = "0x" + crypto.randomBytes(32).toString("hex");
    console.log(`🔓 Resolver ${resolver.name} would claim ${ethPortion.toFixed(6)} ETH to ${resolver.ethAddress}`);
    console.log(`📝 Simulated transaction hash: ${simulatedTxHash}`);

  } catch (error) {
    console.error(`❌ Resolver ${resolver.name} claim failed:`, error);
  }
}

// Get resolver fill statistics
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

      stats[resolver.id] = {
        name: resolver.name,
        totalFilled: totalFilled.toFixed(2),
        averagePrice: averagePrice.toFixed(2),
        bidCount: resolverBids.length,
        percentage: auctionState.totalAmount > 0 ? ((totalFilled / auctionState.totalAmount) * 100).toFixed(1) : "0.0",
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
        successRate: resolver.successRate,
        avgResponseTime: resolver.avgResponseTime,
        status: "idle"
      };
    }
  });

  return stats;
}