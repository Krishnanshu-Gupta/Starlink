import express from "express";
import crypto from "crypto";
import { getDatabase } from "../database.js";
import {
  getHTLCContract,
  getResolverContract,
  getEthereumProvider,
  generateSecretAndHash,
  calculateTimelock,
  formatEthAmount,
  formatXlmAmount,
  verifyEthSignature,
  lockEthInHTLC,
  claimEthFromHTLC
} from "../services/blockchain.js";
import {
  startDutchAuction,
  getCurrentAuctionPrice,
  submitBid,
  getAuctionStatus,
  endAuction,
  getResolvers,
  startAutomatedBidding,
  getResolverStats
} from "../services/resolver.js";
import { ethers } from "ethers";
import { Keypair } from "@stellar/stellar-sdk";
import { createStellarHTLC, claimStellarHTLC } from "../services/stellar.js";

const router = express.Router();

// Contract addresses
const HTLC_CONTRACT_ADDRESS = "0x6c91739cbC4c9e4F1907Cc11AC8431ca1a55d0C6";
const RESOLVER_CONTRACT_ADDRESS = "0xD5cA355e5Cf8Ba93d0A363C956204d0734e73F50";

// POST /api/swap/initiate-eth - Initiate ETH to XLM swap
router.post("/initiate-eth", async (req, res) => {
  try {
    const { ethAmount, xlmAmount, timelockMinutes, initiatorAddress, recipientAddress } = req.body;

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

    // Start Dutch auction for resolvers
    const auction = startDutchAuction(swapId, parseFloat(xlmAmount), parseFloat(xlmAmount), 5);

    // Start automated resolver bidding
    startAutomatedBidding();

    console.log(`🔄 Swap initiated: ${swapId}`);
    console.log(`💰 Amount: ${ethAmount} ETH → ${xlmAmount} XLM`);
    console.log(`⏰ Timelock: ${timelockMinutes || 30} minutes`);

    res.json({
      swapId,
      hash,
      timelock,
      secret: secretHex,
      auction: auction
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

    if (!status.active || status.swapId !== swapId) {
      return res.status(404).json({ error: "Auction not found" });
    }

    res.json(status);
  } catch (error) {
    console.error("Error getting auction status:", error);
    res.status(500).json({ error: "Failed to get auction status" });
  }
});

// POST /api/swap/bid - Submit a bid from a resolver
router.post("/bid", async (req, res) => {
  try {
    const { resolverId, amount, price } = req.body;

    const bid = submitBid(resolverId, parseFloat(amount), parseFloat(price));

    res.json({
      success: true,
      bid,
      auctionStatus: getAuctionStatus()
    });
  } catch (error) {
    console.error("Error submitting bid:", error);
    res.status(400).json({ error: error.message });
  }
});

// POST /api/swap/lock-eth - Lock ETH in HTLC (called by user)
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

    console.log(`🔒 Updating swap status to locked_eth: ${swapId}`);

    try {
      // Since the frontend handles the actual MetaMask transaction,
      // we just need to update the database status
      // The frontend will provide the transaction hash in a separate call

      // Update database status to locked_eth
      await db.run(
        "UPDATE swaps SET status = 'locked_eth' WHERE id = ?",
        [swapId]
      );

      console.log("✅ Swap status updated to locked_eth");
      res.json({
        success: true,
        message: "Swap status updated. ETH transaction should be completed via MetaMask.",
        status: "locked_eth"
      });
    } catch (error) {
      console.error("Database update error:", error);
      return res.status(500).json({ error: "Failed to update swap status" });
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
      const resolver = getResolver(resolverId);
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

// POST /api/swap/claim-xlm - Claim XLM using secret
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

    try {
      // Get all resolver locks for this swap
      const resolverLocks = await db.all("SELECT * FROM resolver_locks WHERE swap_id = ? AND status = 'locked'", [swapId]);

      const claimResults = [];

      for (const lock of resolverLocks) {
        console.log(`Claiming ${lock.amount} XLM from resolver ${lock.resolver_id}`);

        try {
          // Get resolver configuration
          const resolver = getResolver(lock.resolver_id);
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
            txHash: stellarResult.transactionHash
          });
        } catch (error) {
          console.error(`Error claiming from resolver ${lock.resolver_id}:`, error);
          // Continue with other resolvers even if one fails
        }
      }

      // Update main swap status
      await db.run("UPDATE swaps SET status = 'claimed_xlm' WHERE id = ?", [swapId]);

      console.log(`✅ Total XLM claimed: ${totalClaimed}`);

      res.json({
        success: true,
        message: "XLM claimed successfully",
        status: "claimed_xlm",
        totalClaimed,
        claimResults
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

// POST /api/swap/claim-eth - Claim ETH using secret (called by relayer)
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

    console.log(`🔓 Resolver ${resolverId} claiming ETH for swap ${swapId}`);

    try {
      // Get resolver configuration
      const resolver = getResolver(resolverId);
      if (!resolver) {
        return res.status(400).json({ error: "Invalid resolver" });
      }

      // Create signer for resolver
      const provider = getEthereumProvider();
      const signer = new ethers.Wallet(resolver.ethPrivateKey, provider);

      // Claim ETH from HTLC contract
      const result = await claimEthFromHTLC(swapId, "0x" + secret, signer);

      console.log("Real HTLC claim transaction hash:", result.hash);

      // Update database
      await db.run("UPDATE swaps SET status = 'completed', claim_tx_hash = ? WHERE id = ?", [result.hash, swapId]);

      console.log("✅ ETH claimed successfully by resolver");
      res.json({
        success: true,
        message: "ETH claimed successfully by resolver",
        status: "completed",
        txHash: result.hash
      });
    } catch (error) {
      console.error("HTLC claim error:", error);
      return res.status(500).json({ error: "Failed to claim ETH from HTLC contract" });
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

    res.json({
      swap,
      status: swap.status,
      canClaim: swap.status === "locked_stellar",
      canRefund: swap.status === "locked_eth" && Date.now() / 1000 > swap.timelock
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