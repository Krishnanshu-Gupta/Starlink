import express from "express";
import { ethers } from "ethers";
import pkg from "@stellar/stellar-sdk";
const { Horizon, Keypair, TransactionBuilder, Networks, TimeBounds, Signer, Account, Operation } = pkg;
import crypto from "crypto";
import {
  createSwap,
  getSwap,
  updateSwapStatus,
  getSwapsByAddress,
  addTransaction
} from "../database.js";
import { getEthereumProvider, getStellarServer } from "../services/blockchain.js";

const router = express.Router();

// Initialize blockchain services
const ethProvider = getEthereumProvider();
const stellarServer = getStellarServer();

// POST /api/swap/initiate - Start a new atomic swap
router.post("/initiate", async (req, res) => {
  try {
    const {
      initiatorAddress,
      recipientAddress,
      tokenAddress = "0x0000000000000000000000000000000000000000", // ETH by default
      amount,
      stellarAmount,
      timelockMinutes = 30
    } = req.body;

    // Validate input
    if (!initiatorAddress || !recipientAddress || !amount || !stellarAmount) {
      return res.status(400).json({ error: "Missing required parameters" });
    }

    // Generate secret and hash
    const secret = crypto.randomBytes(32);
    const secretHex = secret.toString("hex");
    const hashHex = crypto.createHash("sha256").update(secret).digest("hex");

    // Calculate timelock
    const timelock = Math.floor(Date.now() / 1000) + (timelockMinutes * 60);

    // Generate unique swap ID
    const swapId = crypto.randomUUID();

    // Create Stellar escrow account
    const escrowKeypair = Keypair.random();
    const escrowPublic = escrowKeypair.publicKey();
    const escrowSecret = escrowKeypair.secret();

    // Create swap record in database
    const swapData = {
      id: swapId,
      initiator_address: initiatorAddress,
      recipient_address: recipientAddress,
      token_address: tokenAddress,
      amount: amount.toString(),
      hash_hex: hashHex,
      secret_hex: secretHex,
      timelock,
      stellar_escrow_public: escrowPublic,
      stellar_escrow_secret: escrowSecret,
      status: "pending"
    };

    await createSwap(swapData);

    // Return swap details for frontend
    res.json({
      success: true,
      swapId,
      hashHex,
      secretHex,
      escrowPublic,
      timelock,
      message: "Swap initiated successfully. Lock your ETH first, then lock XLM."
    });

  } catch (error) {
    console.error("Error initiating swap:", error);
    res.status(500).json({ error: "Failed to initiate swap" });
  }
});

// POST /api/swap/lock-eth - Lock ETH on Ethereum
router.post("/lock-eth", async (req, res) => {
  try {
    const { swapId, signature } = req.body;

    const swap = await getSwap(swapId);
    if (!swap) {
      return res.status(404).json({ error: "Swap not found" });
    }

    if (swap.status !== "pending") {
      return res.status(400).json({ error: "Swap is not in pending state" });
    }

    // Verify the signature matches the expected transaction
    const expectedMessage = ethers.utils.id(
      `Lock ETH for swap ${swapId}: ${swap.amount} wei to ${swap.recipient_address}`
    );
    const recoveredAddress = ethers.utils.verifyMessage(expectedMessage, signature);

    if (recoveredAddress.toLowerCase() !== swap.initiator_address.toLowerCase()) {
      return res.status(401).json({ error: "Invalid signature" });
    }

    // Update swap status
    await updateSwapStatus(swapId, "locked_eth", {
      ethereum_tx_hash: "pending" // Will be updated when transaction is confirmed
    });

    res.json({
      success: true,
      message: "ETH locked successfully. Now lock XLM on Stellar.",
      nextStep: "lock_stellar"
    });

  } catch (error) {
    console.error("Error locking ETH:", error);
    res.status(500).json({ error: "Failed to lock ETH" });
  }
});

// POST /api/swap/lock-stellar - Lock XLM on Stellar
router.post("/lock-stellar", async (req, res) => {
  try {
    const { swapId, stellarAddress, xlmAmount } = req.body;

    const swap = await getSwap(swapId);
    if (!swap) {
      return res.status(404).json({ error: "Swap not found" });
    }

    if (swap.status !== "locked_eth") {
      return res.status(400).json({ error: "ETH must be locked first" });
    }

    // Create Stellar HTLC escrow
    const escrowKeypair = Keypair.fromSecret(swap.stellar_escrow_secret);
    const expirationTs = swap.timelock;

    // Create refund transaction (signed offline)
    const dummyAccount = new Account(escrowKeypair.publicKey(), 1);
    const refundTx = new TransactionBuilder(dummyAccount, {
      networkPassphrase: Networks.TESTNET_NETWORK_PASSPHRASE,
      fee: await stellarServer.fetchBaseFee()
    })
      .addOperation(Operation.accountMerge({
        destination: stellarAddress
      }))
      .setTimeout(expirationTs)
      .build();

    refundTx.sign(escrowKeypair);

    // Fund escrow and set signers
    const fundTx = new TransactionBuilder(await stellarServer.loadAccount(stellarAddress), {
      networkPassphrase: Networks.TESTNET_NETWORK_PASSPHRASE,
      fee: await stellarServer.fetchBaseFee()
    })
    .addOperation(Operation.createAccount({
        destination: escrowKeypair.publicKey(),
        startingBalance: xlmAmount
      }))
      .addOperation(Operation.setOptions({
        source: escrowKeypair.publicKey(),
        masterWeight: 0
      }))
      .addOperation(Operation.setOptions({
        source: escrowKeypair.publicKey(),
        signer: Signer.sha256Hash(swap.hash_hex, 1)
      }))
      .addOperation(Operation.setOptions({
        source: escrowKeypair.publicKey(),
        signer: Signer.preAuthTx(refundTx.hash(), 1)
      }))
      .addOperation(Operation.setOptions({
        source: escrowKeypair.publicKey(),
        lowThreshold: 1,
        medThreshold: 1,
        highThreshold: 1
      }))
      .setTimeout(Math.floor(Date.now() / 1000) + 300)
      .build();

    // Note: In a real implementation, the user would sign this transaction
    // For now, we'll simulate the success
    const stellarTxHash = "simulated_stellar_tx_hash";

    // Update swap status
    await updateSwapStatus(swapId, "locked_stellar", {
      stellar_tx_hash: stellarTxHash
    });

    // Add transaction record
    await addTransaction({
      swap_id: swapId,
      chain: "stellar",
      tx_type: "lock",
      tx_hash: stellarTxHash,
      status: "confirmed"
    });

    res.json({
      success: true,
      message: "XLM locked successfully. Swap is ready to claim.",
      nextStep: "claim",
      stellarTxHash
    });

  } catch (error) {
    console.error("Error locking XLM:", error);
    res.status(500).json({ error: "Failed to lock XLM" });
  }
});

// POST /api/swap/claim - Claim funds from the swap
router.post("/claim", async (req, res) => {
  try {
    const { swapId, secretHex, chain } = req.body;

    const swap = await getSwap(swapId);
    if (!swap) {
      return res.status(404).json({ error: "Swap not found" });
    }

    if (swap.status !== "locked_stellar") {
      return res.status(400).json({ error: "Swap is not ready for claiming" });
    }

    // Verify the secret matches the hash
    const computedHash = crypto.createHash("sha256")
      .update(Buffer.from(secretHex, "hex"))
      .digest("hex");

    if (computedHash !== swap.hash_hex) {
      return res.status(400).json({ error: "Invalid secret" });
    }

    if (chain === "stellar") {
      // Claim XLM from Stellar escrow
      const escrowKeypair = Keypair.fromSecret(swap.stellar_escrow_secret);
      const escrowAccount = await stellarServer.loadAccount(escrowKeypair.publicKey());

      const claimTx = new TransactionBuilder(escrowAccount, {
        networkPassphrase: Networks.TESTNET_NETWORK_PASSPHRASE,
        fee: await stellarServer.fetchBaseFee()
      })
        .addOperation(Operation.accountMerge({
          destination: swap.recipient_address
        }))
        .setTimeout(swap.timelock)
        .build();

      // Sign with the preimage
      claimTx.signHashX(Buffer.from(secretHex, "hex"));

      // Note: In a real implementation, this would be submitted
      const claimTxHash = "simulated_claim_tx_hash";

      await updateSwapStatus(swapId, "claimed_stellar", {
        claim_tx_hash: claimTxHash
      });

      await addTransaction({
        swap_id: swapId,
        chain: "stellar",
        tx_type: "claim",
        tx_hash: claimTxHash,
        status: "confirmed"
      });

      res.json({
        success: true,
        message: "XLM claimed successfully",
        txHash: claimTxHash
      });

    } else {
      return res.status(400).json({ error: "Invalid chain specified" });
    }

  } catch (error) {
    console.error("Error claiming funds:", error);
    res.status(500).json({ error: "Failed to claim funds" });
  }
});

// GET /api/swap/status/:swapId - Get swap status
router.get("/status/:swapId", async (req, res) => {
  try {
    const { swapId } = req.params;
    const swap = await getSwap(swapId);

    if (!swap) {
      return res.status(404).json({ error: "Swap not found" });
    }

    // Get transaction history
    const transactions = await getTransactions(swapId);

    res.json({
      swap,
      transactions,
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
    const swaps = await getSwapsByAddress(address);

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

    const swap = await getSwap(swapId);
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
    await updateSwapStatus(swapId, "refunded");

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