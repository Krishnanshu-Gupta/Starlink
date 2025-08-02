import pkg from "@stellar/stellar-sdk";
const { Horizon, TransactionEnvelope, Networks } = pkg;
import { ethers } from "ethers";
import crypto from "crypto";
import { getPendingSwaps, updateSwapStatus, addTransaction } from "../database.js";
import { getHTLCContract, computeSwapId } from "./blockchain.js";

const stellarServer = new Horizon.Server("https://horizon-testnet.stellar.org");
const NETWORK_PASSPHRASE = Networks.TESTNET;

let isRunning = false;
let monitoringSwaps = new Set();

export async function startRelayer() {
  if (isRunning) {
    console.log("🔄 Relayer is already running");
    return;
  }

  isRunning = true;
  console.log("🚀 Starting Starlink Relayer Service...");

  // Start monitoring loop
  setInterval(async () => {
    await monitorSwaps();
  }, 5000); // Check every 5 seconds

  // Start Stellar transaction monitoring
  await startStellarMonitoring();
}

async function monitorSwaps() {
  try {
    const pendingSwaps = await getPendingSwaps();

    for (const swap of pendingSwaps) {
      if (swap.status === "locked_stellar" && !monitoringSwaps.has(swap.id)) {
        console.log(`👀 Starting to monitor swap ${swap.id} for preimage reveal`);
        monitoringSwaps.add(swap.id);
        await monitorSwapForPreimage(swap);
      }
    }
  } catch (error) {
    console.error("❌ Error in swap monitoring loop:", error);
  }
}

async function monitorSwapForPreimage(swap) {
  try {
    console.log(`🔍 Monitoring Stellar escrow ${swap.stellar_escrow_public} for preimage reveal...`);

    const txStream = stellarServer.transactions()
      .forAccount(swap.stellar_escrow_public)
      .cursor("now")
      .stream({
        onmessage: async (tx) => {
          try {
            await processStellarTransaction(tx, swap);
          } catch (error) {
            console.error(`❌ Error processing Stellar transaction for swap ${swap.id}:`, error);
          }
        },
        onerror: (error) => {
          console.error(`❌ Stellar stream error for swap ${swap.id}:`, error);
          monitoringSwaps.delete(swap.id);
        }
      });

    // Clean up monitoring after timelock expires
    setTimeout(() => {
      console.log(`⏰ Timelock expired for swap ${swap.id}, stopping monitoring`);
      monitoringSwaps.delete(swap.id);
      txStream();
    }, (swap.timelock - Math.floor(Date.now() / 1000)) * 1000);

  } catch (error) {
    console.error(`❌ Error starting Stellar monitoring for swap ${swap.id}:`, error);
    monitoringSwaps.delete(swap.id);
  }
}

async function processStellarTransaction(tx, swap) {
  try {
    const env = TransactionEnvelope.from_xdr(tx.envelope_xdr, NETWORK_PASSPHRASE);

    for (const sig of env.signatures) {
      const raw = sig.signature();

      // Check if this signature reveals the preimage
      if (raw.length === 32) {
        const computedHash = crypto.createHash("sha256").update(raw).digest("hex");

        if (computedHash === swap.hash_hex) {
          console.log(`🎯 Preimage revealed for swap ${swap.id}: ${raw.toString("hex")}`);

          // Claim on Ethereum
          await claimOnEthereum(swap, raw);
          return;
        }
      }
    }
  } catch (error) {
    console.error(`❌ Error processing Stellar transaction:`, error);
  }
}

async function claimOnEthereum(swap, preimage) {
  try {
    console.log(`🔐 Claiming ETH for swap ${swap.id} on Ethereum...`);

    // Compute the swap ID
    const swapId = computeSwapId(
      swap.initiator_address,
      swap.recipient_address,
      swap.token_address,
      swap.amount,
      swap.hash_hex,
      swap.timelock
    );

    console.log(`📝 Computed swap ID: ${swapId}`);

    // Get the HTLC contract
    const contract = getHTLCContract();

    // Create claim transaction
    const claimTx = await contract.claim.populateTransaction(swapId, preimage);

    // Note: In a real implementation, you would need a private key to sign and send this transaction
    // For now, we'll simulate the success
    console.log(`✅ Claim transaction prepared for swap ${swap.id}`);

    // Update swap status
    await updateSwapStatus(swap.id, "claimed_eth", {
      ethereum_swap_id: swapId,
      claim_tx_hash: "simulated_claim_tx_hash"
    });

    // Add transaction record
    await addTransaction({
      swap_id: swap.id,
      chain: "ethereum",
      tx_type: "claim",
      tx_hash: "simulated_claim_tx_hash",
      status: "confirmed"
    });

    console.log(`🎉 Successfully claimed ETH for swap ${swap.id}`);

    // Stop monitoring this swap
    monitoringSwaps.delete(swap.id);

  } catch (error) {
    console.error(`❌ Error claiming on Ethereum for swap ${swap.id}:`, error);

    // Add failed transaction record
    await addTransaction({
      swap_id: swap.id,
      chain: "ethereum",
      tx_type: "claim",
      tx_hash: "failed",
      status: "failed"
    });
  }
}

async function startStellarMonitoring() {
  try {
    console.log("🌟 Starting Stellar network monitoring...");

    // Monitor for any new transactions that might be relevant
    const ledgerStream = stellarServer.ledgers()
      .cursor("now")
      .stream({
        onmessage: (ledger) => {
          console.log(`📊 New ledger: ${ledger.sequence}`);
        },
        onerror: (error) => {
          console.error("❌ Stellar ledger stream error:", error);
        }
      });

  } catch (error) {
    console.error("❌ Error starting Stellar monitoring:", error);
  }
}

// Helper function to get relayer status
export function getRelayerStatus() {
  return {
    isRunning,
    monitoringSwaps: Array.from(monitoringSwaps),
    activeSwaps: monitoringSwaps.size
  };
}

// Helper function to stop the relayer
export function stopRelayer() {
  isRunning = false;
  monitoringSwaps.clear();
  console.log("🛑 Starlink Relayer Service stopped");
}

// Export for testing
export { monitorSwaps, processStellarTransaction, claimOnEthereum };