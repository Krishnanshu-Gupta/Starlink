import express from "express";
import crypto from "crypto";
import { getDatabase } from "../database.js";
import {
  getHTLCContract,
  getResolverContract,
  getFactoryContract,
  getEthereumProvider,
  generateSecretAndHash,
  calculateTimelock,
  formatEthAmount,
  formatXlmAmount,
  verifyEthSignature,
  lockEthInHTLC,
  claimEthFromHTLC,
  createSwapWithFactory,
  claimContractFromFactory,
  getSwapInfoFromFactory,
  getSwapContractsFromFactory,
  calculateClaimableContracts
} from "../services/blockchain.js";
import {
  startDutchAuction,
  getCurrentAuctionPrice,
  submitBid,
  getAuctionStatus,
  endAuction,
  getResolvers,
  startAutomatedBidding,
  getResolverStats,
  claimContractsForResolver
} from "../services/resolver.js";
import { ethers } from "ethers";
import { Keypair } from "@stellar/stellar-sdk";
import { createStellarHTLC, claimStellarHTLC } from "../services/stellar.js";

const router = express.Router();

// Contract addresses - Sepolia testnet (Updated 2025-08-03)
const HTLC_CONTRACT_ADDRESS = "0x3bb9Be9BF982E1A3743097A538059829b0e753FB";
const RESOLVER_CONTRACT_ADDRESS = "0x7cEdc8aa8cba26aA1C14CeBe82Fc34bE2d84Fcb0";
const FACTORY_CONTRACT_ADDRESS = "0x7Cf5cd365721F2c4491737D5e1415650aD0e80c8";

// GET /api/swap/exchange-rate - Get current exchange rates from CoinGecko
router.get("/exchange-rate", async (req, res) => {
  console.log('📊 Exchange rate request received');

  try {
    // Add timeout to the fetch request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

    console.log('🔄 Fetching rates from CoinGecko...');
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum,stellar&vs_currencies=usd', {
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    const data = await response.json();

    // Validate the response data
    if (!data.ethereum?.usd || !data.stellar?.usd) {
      throw new Error('Invalid response format from CoinGecko API');
    }

    console.log('✅ Real-time rates fetched successfully');
    console.log(`ETH: $${data.ethereum.usd}, XLM: $${data.stellar.usd}`);

    res.json({
      success: true,
      data: {
        ethereum: data.ethereum.usd,
        stellar: data.stellar.usd,
        ethToXlmRate: data.ethereum.usd / data.stellar.usd,
        xlmToEthRate: data.stellar.usd / data.ethereum.usd
      }
    });
  } catch (error) {
    console.error("❌ Failed to fetch exchange rate:", error.message);
    console.log('🔄 Using fallback rates...');

    // Fallback rates if API fails
    const fallbackRates = {
      ethereum: 2500, // Approximate ETH price
      stellar: 0.27,  // Approximate XLM price
      ethToXlmRate: 9250, // 1 ETH = 9250 XLM
      xlmToEthRate: 0.000108 // 1 XLM = 0.000108 ETH
    };

    res.json({
      success: false,
      error: "Using fallback rates due to API failure",
      data: fallbackRates
    });
  }
});

// POST /api/swap/initiate-eth - Initiate ETH to XLM swap with 10-contract system
router.post("/initiate-eth", async (req, res) => {
  try {
    const { ethAmount, xlmAmount, timelockMinutes, initiatorAddress, recipientAddress } = req.body;

    // Any amount can be divided into 10 contracts
    // 0.001 ETH becomes 10 contracts of 0.0001 ETH each
    const ethAmountFloat = parseFloat(ethAmount);
    const xlmAmountFloat = parseFloat(xlmAmount);

    if (ethAmountFloat <= 0) {
      return res.status(400).json({
        error: "ETH amount must be greater than 0"
      });
    }

    if (xlmAmountFloat <= 0) {
      return res.status(400).json({
        error: "XLM amount must be greater than 0"
      });
    }

    // Generate secret and hash
    const { secret, secretHex, hash } = generateSecretAndHash();
    const timelock = calculateTimelock(timelockMinutes || 30);
    const swapId = crypto.randomBytes(32).toString("hex");

    // Store swap in database
    const db = await getDatabase();

    const ethAmountFormatted = formatEthAmount(ethAmount).toString();
    const xlmAmountFormatted = formatXlmAmount(xlmAmount).toString();
    const timelockFormatted = timelock.toString();

    console.log('Debug values:', {
      swapId,
      ethAmountFormatted,
      xlmAmountFormatted,
      hash,
      secretHex,
      timelockFormatted
    });

    await db.run(`
      INSERT INTO swaps (
        id, direction, initiator_address, recipient_address,
        eth_amount, xlm_amount, hash, secret, timelock, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      swapId, "ETH_TO_XLM", initiatorAddress, recipientAddress,
      ethAmountFormatted, xlmAmountFormatted,
      hash, secretHex, timelockFormatted, "pending"
    ]);

    console.log(`🔄 Swap initiated: ${swapId}`);
    console.log(`💰 Amount: ${ethAmount} ETH → ${xlmAmount} XLM`);
    console.log(`⏰ Timelock: ${timelockMinutes || 30} minutes`);
    console.log(`🔢 10-contract system: ${ethAmountFloat/10} ETH per contract`);
    console.log(`⏳ Waiting for ETH to be locked before starting auction...`);

    res.json({
      swapId,
      hash,
      timelock,
      secret: secretHex,
      status: "pending_eth_lock",
      message: "Swap created. Please lock your ETH to start the auction.",
      contractsInfo: {
        totalContracts: 10,
        amountPerContract: ethAmountFloat / 10,
        xlmPerContract: xlmAmountFloat / 10
      }
    });
  } catch (error) {
    console.error("Error initiating swap:", error);
    res.status(500).json({ error: "Failed to initiate swap" });
  }
});

// GET /api/swap/auction/:swapId - Get auction status
router.get("/auction/:swapId", async (req, res) => {
  try {
    const { swapId } = req.params;
    const status = getAuctionStatus();

    // Check if this is the active auction swap ID
    if (status.active && status.swapId === swapId) {
      return res.json(status);
    }

    // If not found, check if this is the original swap ID and get the factory swap ID
    const db = await getDatabase();
    const swap = await db.get("SELECT factory_swap_id FROM swaps WHERE id = ?", [swapId]);

    if (swap && swap.factory_swap_id && status.active && status.swapId === swap.factory_swap_id) {
      // Return the auction status with the original swap ID for frontend compatibility
      return res.json({
        ...status,
        originalSwapId: swapId,
        factorySwapId: status.swapId
      });
    }

    // If auction is not active, check if it was completed
    if (swap && swap.factory_swap_id) {
      // Check if there are any completed contracts for this swap
      const contracts = await db.all("SELECT * FROM swap_contracts WHERE swap_id = ?", [swapId]);
      if (contracts.length > 0) {
        return res.json({
          active: false,
          completed: true,
          swapId: swap.factory_swap_id,
          originalSwapId: swapId,
          factorySwapId: swap.factory_swap_id,
          message: "Auction completed - all contracts claimed",
          contracts: contracts
        });
      }
    }

    return res.status(404).json({ error: "Auction not found" });
  } catch (error) {
    console.error("Error getting auction status:", error);
    res.status(500).json({ error: "Failed to get auction status" });
  }
});

// POST /api/swap/bid - Submit a bid from a resolver (enforces 10% increments)
router.post("/bid", async (req, res) => {
  try {
    const { resolverId, amount, price } = req.body;

    // Enforce 10% increments since we can only pay out in whole contracts (10% each)
    const fillPercentage = Math.round((parseFloat(amount) / 100) * 100);
    const adjustedFillPercentage = Math.floor(fillPercentage / 10) * 10; // Round down to nearest 10%

    if (adjustedFillPercentage === 0) {
      return res.status(400).json({
        error: "Fill amount too small - minimum 10% required for 10-contract system"
      });
    }

    const adjustedAmount = (adjustedFillPercentage / 100) * 100; // Recalculate based on adjusted percentage

    const bid = submitBid(resolverId, adjustedAmount, parseFloat(price));

    res.json({
      success: true,
      bid,
      auctionStatus: getAuctionStatus(),
      fillInfo: {
        originalAmount: amount,
        adjustedAmount: adjustedAmount,
        fillPercentage: adjustedFillPercentage,
        contractsToClaim: adjustedFillPercentage / 10
      }
    });
  } catch (error) {
    console.error("Error submitting bid:", error);
    res.status(400).json({ error: error.message });
  }
});

// POST /api/swap/lock-eth - Lock ETH in Factory contract (creates 10 HTLC contracts)
router.post("/lock-eth", async (req, res) => {
  try {
    const { swapId, signature, userAddress } = req.body;

    const db = await getDatabase();
    const swap = await db.get("SELECT * FROM swaps WHERE id = ?", [swapId]);
    if (!swap) {
      return res.status(404).json({ error: "Swap not found" });
    }

    if (swap.status !== "pending") {
      return res.status(400).json({ error: "Swap is not in pending status" });
    }

    // Verify signature if provided
    if (signature && userAddress) {
      // Convert wei amount to ETH for signature verification
      const ethAmount = ethers.formatEther(swap.eth_amount);
      const message = `Lock ETH for swap ${swapId}: ${ethAmount} ETH`;
      const isValidSignature = await verifyEthSignature(message, signature, userAddress);

      if (!isValidSignature) {
        console.error("Signature verification failed:", {
          message,
          signature,
          userAddress,
          expectedAddress: swap.initiator_address
        });
        return res.status(401).json({ error: "Invalid signature" });
      }
    }

    console.log(`🔒 Creating 10 HTLC contracts for swap: ${swapId}`);

    try {
      // Create signer for the user
      const provider = await getEthereumProvider();
      const signer = new ethers.Wallet(process.env.USER_PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000000", provider);

      // For ETH_TO_XLM swaps, the recipient should be the initiator's Ethereum address
      // The user is locking ETH to receive XLM, so they are the recipient of the ETH contracts
      const ethRecipient = swap.initiator_address;

      // Create swap with 10 contracts using Factory
      const factorySwapId = await createSwapWithFactory(
        ethRecipient, // Use initiator's ETH address as recipient
        ethers.ZeroAddress, // ETH
        swap.eth_amount,
        swap.hash,
        swap.timelock,
        signer
      );

      console.log(`🔧 Factory swap ID returned: ${factorySwapId}`);

      // Get swap info from factory
      const swapInfo = await getSwapInfoFromFactory(factorySwapId);
      console.log(`🔍 Raw swap info from factory:`, swapInfo);

      const swapContracts = await getSwapContractsFromFactory(factorySwapId);
      console.log(`🔍 Swap contracts from factory:`, swapContracts);

      // Update database with factory swap ID and contract addresses
      await db.run(`
        UPDATE swaps
        SET status = 'locked_eth',
            factory_swap_id = ?,
            ethereum_tx_hash = ?
        WHERE id = ?
      `, [factorySwapId, "factory_created", swapId]);

      // Store contract addresses in database
      for (let i = 0; i < swapContracts.length; i++) {
        await db.run(`
          INSERT INTO swap_contracts (
            swap_id, contract_index, contract_address, status
          ) VALUES (?, ?, ?, ?)
        `, [swapId, i, swapContracts[i], "created"]);
      }

      console.log("✅ 10 HTLC contracts created successfully");
      console.log(`📋 Factory Swap ID: ${factorySwapId}`);
      console.log(`🔢 Contract addresses: ${swapContracts.join(', ')}`);

      // Start Dutch auction after ETH is locked
      // Handle decimal values by converting to integer first
      const xlmAmountFloat = parseFloat(swap.xlm_amount);
      const xlmAmountBigInt = BigInt(Math.floor(xlmAmountFloat));
      const formattedAmount = parseFloat(ethers.formatUnits(xlmAmountBigInt.toString(), 7));
      console.log(`🚀 Starting Dutch auction for swap: ${factorySwapId}`);
      console.log(`💰 Auction amount: ${formattedAmount} XLM`);

      const auction = startDutchAuction(factorySwapId, formattedAmount, formattedAmount, 5);
      startAutomatedBidding();

      res.json({
        success: true,
        message: "10 HTLC contracts created successfully. Dutch auction started!",
        status: "locked_eth",
        factorySwapId,
        contracts: swapContracts,
        amountPerContract: ethers.formatEther(swap.eth_amount) / 10,
        auction: auction
      });
    } catch (error) {
      console.error("Factory contract error:", error);
      return res.status(500).json({ error: "Failed to create HTLC contracts" });
    }
  } catch (error) {
    console.error("Error locking ETH:", error);
    res.status(500).json({ error: "Failed to lock ETH" });
  }
});

// POST /api/swap/update-eth-tx - Update ETH transaction hash after MetaMask transaction
router.post("/update-eth-tx", async (req, res) => {
  try {
    const { swapId, txHash } = req.body;

    const db = await getDatabase();
    const swap = await db.get("SELECT * FROM swaps WHERE id = ?", [swapId]);
    if (!swap) {
      return res.status(404).json({ error: "Swap not found" });
    }

    if (swap.status !== "locked_eth") {
      return res.status(400).json({ error: "Swap is not in locked_eth status" });
    }

    // Update database with transaction hash
    await db.run(
      "UPDATE swaps SET ethereum_tx_hash = ? WHERE id = ?",
      [txHash, swapId]
    );

    console.log(`✅ ETH transaction hash updated for swap ${swapId}: ${txHash}`);
    res.json({
      success: true,
      message: "Transaction hash updated successfully",
      txHash
    });
  } catch (error) {
    console.error("Error updating ETH transaction hash:", error);
    res.status(500).json({ error: "Failed to update transaction hash" });
  }
});

// POST /api/swap/lock-xlm - Lock XLM in Stellar escrow (called by resolvers)
router.post("/lock-xlm", async (req, res) => {
  try {
    const { swapId, resolverId, amount } = req.body;
    const db = await getDatabase();
    const swap = await db.get("SELECT * FROM swaps WHERE id = ?", [swapId]);
    if (!swap) { return res.status(404).json({ error: "Swap not found" }); }
    if (swap.status !== "locked_eth") { return res.status(400).json({ error: "ETH must be locked first" }); }

    console.log(`🔒 Resolver ${resolverId} locking ${amount} XLM for swap ${swapId}`);

    try {
      // Get resolver configuration
      const resolver = getResolvers().find(r => r.id === resolverId);
      if (!resolver) {
        return res.status(400).json({ error: "Invalid resolver" });
      }

      // Create Stellar keypair from resolver's secret key
      const resolverKeypair = Keypair.fromSecret(resolver.stellarSecretKey);

      // Create Stellar HTLC escrow
      const stellarResult = await createStellarHTLC(
        swap.recipient_address,
        swap.hash,
        swap.timelock,
        formatXlmAmount(amount),
        resolverKeypair
      );

      console.log("Real Stellar escrow address:", stellarResult.escrowAddress);
      console.log("Real Stellar transaction hash:", stellarResult.transactionHash);

      await db.run(`
        INSERT INTO resolver_locks (
          swap_id, resolver_id, amount, escrow_address, stellar_tx_hash, status
        ) VALUES (?, ?, ?, ?, ?, ?)
      `, [swapId, resolverId, amount, stellarResult.escrowAddress, stellarResult.transactionHash, "locked"]);

      console.log(`✅ ${amount} XLM locked by resolver ${resolverId}`);
      res.json({
        success: true,
        message: `${amount} XLM locked by resolver ${resolverId}`,
        escrowAddress: stellarResult.escrowAddress,
        stellarTxHash: stellarResult.transactionHash
      });
    } catch (error) {
      console.error("Stellar HTLC error:", error);
      return res.status(500).json({ error: "Failed to create Stellar HTLC" });
    }
  } catch (error) {
    console.error("Error locking XLM:", error);
    res.status(500).json({ error: "Failed to lock XLM" });
  }
});

// POST /api/swap/claim-xlm - Claim XLM using secret (claims from all resolver contracts)
router.post("/claim-xlm", async (req, res) => {
  try {
    const { swapId, secret } = req.body;

    const db = await getDatabase();
    const swap = await db.get("SELECT * FROM swaps WHERE id = ?", [swapId]);
    if (!swap) {
      return res.status(404).json({ error: "Swap not found" });
    }

    // Verify secret matches hash
    const hash = ethers.keccak256(secret);
    if (hash !== swap.hash) {
      return res.status(400).json({ error: "Invalid secret" });
    }

    console.log("🔓 Claiming XLM for swap:", swapId);

    let totalClaimed = 0;
    const claimResults = [];

    try {
      // Get all resolver locks for this swap
      const resolverLocks = await db.all("SELECT * FROM resolver_locks WHERE swap_id = ? AND status = 'locked'", [swapId]);

      console.log(`📋 Found ${resolverLocks.length} resolver locks to claim`);

      for (const lock of resolverLocks) {
        console.log(`Claiming ${lock.amount} XLM from resolver ${lock.resolver_id}`);

        try {
          // Get resolver configuration
          const resolver = getResolvers().find(r => r.id === lock.resolver_id);
          if (!resolver) {
            console.error(`Resolver ${lock.resolver_id} not found`);
            continue;
          }

          // Create resolver keypair
          const resolverKeypair = Keypair.fromSecret(resolver.stellarSecretKey);

          // Claim XLM from Stellar HTLC
          const stellarResult = await claimStellarHTLC(
            lock.escrow_address,
            swap.recipient_address,
            secret,
            resolverKeypair
          );

          console.log(`Real Stellar claim transaction hash: ${stellarResult.transactionHash}`);

          // Update resolver lock status
          await db.run(
            "UPDATE resolver_locks SET status = 'claimed', claim_tx_hash = ? WHERE id = ?",
            [stellarResult.transactionHash, lock.id]
          );

          totalClaimed += parseFloat(lock.amount);
          claimResults.push({
            resolverId: lock.resolver_id,
            amount: lock.amount,
            txHash: stellarResult.transactionHash,
            status: "claimed"
          });
        } catch (error) {
          console.error(`Error claiming from resolver ${lock.resolver_id}:`, error);
          claimResults.push({
            resolverId: lock.resolver_id,
            amount: lock.amount,
            error: error.message,
            status: "failed"
          });
          // Continue with other resolvers even if one fails
        }
      }

      // Update main swap status
      await db.run("UPDATE swaps SET status = 'claimed_xlm' WHERE id = ?", [swapId]);

      console.log(`✅ Total XLM claimed: ${totalClaimed}`);

      res.json({
        success: true,
        message: "XLM claimed successfully from all resolver contracts",
        status: "claimed_xlm",
        totalClaimed,
        claimResults,
        summary: {
          totalResolvers: resolverLocks.length,
          successfulClaims: claimResults.filter(r => r.status === "claimed").length,
          failedClaims: claimResults.filter(r => r.status === "failed").length
        }
      });
    } catch (error) {
      console.error("Stellar claim error:", error);
      return res.status(500).json({ error: "Failed to claim XLM from Stellar HTLC" });
    }
  } catch (error) {
    console.error("Error claiming XLM:", error);
    res.status(500).json({ error: "Failed to claim XLM" });
  }
});

// POST /api/swap/claim-eth - Claim ETH using secret (claims specific contracts for each resolver)
router.post("/claim-eth", async (req, res) => {
  try {
    const { swapId, secret, resolverId } = req.body;

    const db = await getDatabase();
    const swap = await db.get("SELECT * FROM swaps WHERE id = ?", [swapId]);
    if (!swap) {
      return res.status(404).json({ error: "Swap not found" });
    }

    // Verify secret matches hash
    const hash = ethers.keccak256(secret);
    if (hash !== swap.hash) {
      return res.status(400).json({ error: "Invalid secret" });
    }

    console.log(`🔓 Resolver ${resolverId} claiming ETH contracts for swap ${swapId}`);

    try {
      // Claim specific contracts for this resolver
      const claimResult = await claimContractsForResolver(resolverId, swapId, secret);

      console.log("✅ ETH contracts claimed successfully by resolver");
      res.json({
        success: true,
        message: "ETH contracts claimed successfully by resolver",
        status: "completed",
        claimResult
      });
    } catch (error) {
      console.error("ETH claim error:", error);
      return res.status(500).json({ error: "Failed to claim ETH contracts" });
    }
  } catch (error) {
    console.error("Error claiming ETH:", error);
    res.status(500).json({ error: "Failed to claim ETH" });
  }
});

// GET /api/swap/resolvers - Get list of resolvers
router.get("/resolvers", async (req, res) => {
  try {
    const resolvers = getResolvers();
    res.json(resolvers);
  } catch (error) {
    console.error("Error getting resolvers:", error);
    res.status(500).json({ error: "Failed to get resolvers" });
  }
});

// GET /api/swap/resolver-stats - Get resolver fill statistics
router.get("/resolver-stats", async (req, res) => {
  try {
    const stats = getResolverStats();
    res.json(stats);
  } catch (error) {
    console.error("Error getting resolver stats:", error);
    res.status(500).json({ error: "Failed to get resolver stats" });
  }
});

// GET /api/swap/status/:swapId - Get swap status
router.get("/status/:swapId", async (req, res) => {
  try {
    const { swapId } = req.params;
    const db = await getDatabase();
    const swap = await db.get("SELECT * FROM swaps WHERE id = ?", [swapId]);

    if (!swap) {
      return res.status(404).json({ error: "Swap not found" });
    }

    // Get resolver locks for this swap
    const resolverLocks = await db.all("SELECT * FROM resolver_locks WHERE swap_id = ?", [swapId]);

    res.json({
      swap,
      status: swap.status,
      canClaim: swap.status === "locked_stellar",
      canRefund: swap.status === "locked_eth" && Date.now() / 1000 > swap.timelock,
      resolverLocks,
      contractsInfo: {
        totalContracts: 10,
        amountPerContract: ethers.formatEther(swap.eth_amount) / 10,
        xlmPerContract: formatXlmAmount(swap.xlm_amount) / 10
      }
    });

  } catch (error) {
    console.error("Error getting swap status:", error);
    res.status(500).json({ error: "Failed to get swap status" });
  }
});

// GET /api/swap/history/:address - Get user's swap history
router.get("/history/:address", async (req, res) => {
  try {
    const { address } = req.params;
    const db = await getDatabase();
    const swaps = await db.all(`
      SELECT * FROM swaps
      WHERE initiator_address = ? OR recipient_address = ?
      ORDER BY created_at DESC
    `, [address, address]);

    res.json({
      swaps,
      total: swaps.length,
      pending: swaps.filter(s => s.status === "pending").length,
      completed: swaps.filter(s => s.status === "completed").length
    });

  } catch (error) {
    console.error("Error getting swap history:", error);
    res.status(500).json({ error: "Failed to get swap history" });
  }
});

// POST /api/swap/refund - Refund a swap
router.post("/refund", async (req, res) => {
  try {
    const { swapId, chain } = req.body;

    const db = await getDatabase();
    const swap = await db.get("SELECT * FROM swaps WHERE id = ?", [swapId]);
    if (!swap) {
      return res.status(404).json({ error: "Swap not found" });
    }

    if (swap.status !== "locked_eth" && swap.status !== "locked_stellar") {
      return res.status(400).json({ error: "Swap cannot be refunded" });
    }

    if (Date.now() / 1000 < swap.timelock) {
      return res.status(400).json({ error: "Timelock has not expired yet" });
    }

    // Update status
    await db.run("UPDATE swaps SET status = 'refunded' WHERE id = ?", [swapId]);

    res.json({
      success: true,
      message: "Refund initiated successfully"
    });

  } catch (error) {
    console.error("Error refunding swap:", error);
    res.status(500).json({ error: "Failed to refund swap" });
  }
});

export default router;