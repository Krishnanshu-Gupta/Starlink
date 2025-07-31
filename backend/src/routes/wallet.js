import express from "express";
import { ethers } from "ethers";
import pkg from "stellar-sdk";
const { TransactionBuilder, Operation, Asset, Memo } = pkg;
import {
  getEthBalance,
  getXlmBalance,
  isValidEthAddress,
  isValidStellarAddress,
  getEthereumProvider,
  getStellarServer
} from "../services/blockchain.js";

const router = express.Router();

// GET /api/wallet/eth/balance/:address - Get ETH balance
router.get("/eth/balance/:address", async (req, res) => {
  try {
    const { address } = req.params;

    if (!isValidEthAddress(address)) {
      return res.status(400).json({ error: "Invalid Ethereum address" });
    }

    const balance = await getEthBalance(address);

    res.json({
      address,
      balance,
      symbol: "ETH",
      decimals: 18
    });

  } catch (error) {
    console.error("Error getting ETH balance:", error);
    res.status(500).json({ error: "Failed to get ETH balance" });
  }
});

// GET /api/wallet/xlm/balance/:address - Get XLM balance
router.get("/xlm/balance/:address", async (req, res) => {
  try {
    const { address } = req.params;

    if (!isValidStellarAddress(address)) {
      return res.status(400).json({ error: "Invalid Stellar address" });
    }

    const balance = await getXlmBalance(address);

    res.json({
      address,
      balance,
      symbol: "XLM",
      decimals: 7
    });

  } catch (error) {
    console.error("Error getting XLM balance:", error);
    res.status(500).json({ error: "Failed to get XLM balance" });
  }
});

// POST /api/wallet/eth/validate-signature - Validate Ethereum signature
router.post("/eth/validate-signature", async (req, res) => {
  try {
    const { message, signature, expectedAddress } = req.body;

    if (!message || !signature || !expectedAddress) {
      return res.status(400).json({ error: "Missing required parameters" });
    }

    if (!isValidEthAddress(expectedAddress)) {
      return res.status(400).json({ error: "Invalid Ethereum address" });
    }

    const recoveredAddress = ethers.verifyMessage(message, signature);
    const isValid = recoveredAddress.toLowerCase() === expectedAddress.toLowerCase();

    res.json({
      isValid,
      recoveredAddress,
      expectedAddress,
      message
    });

  } catch (error) {
    console.error("Error validating signature:", error);
    res.status(500).json({ error: "Failed to validate signature" });
  }
});

// POST /api/wallet/eth/create-transaction - Create Ethereum transaction
router.post("/eth/create-transaction", async (req, res) => {
  try {
    const { to, value, data, gasLimit } = req.body;

    if (!to || !value) {
      return res.status(400).json({ error: "Missing required parameters" });
    }

    if (!isValidEthAddress(to)) {
      return res.status(400).json({ error: "Invalid recipient address" });
    }

    const provider = getEthereumProvider();
    const nonce = await provider.getTransactionCount(req.body.from || "0x0000000000000000000000000000000000000000");
    const gasPrice = await provider.getFeeData();

    const transaction = {
      to,
      value: ethers.parseEther(value.toString()),
      data: data || "0x",
      nonce,
      gasLimit: gasLimit || 21000,
      gasPrice: gasPrice.gasPrice
    };

    res.json({
      transaction,
      estimatedGas: transaction.gasLimit,
      gasPrice: ethers.formatUnits(transaction.gasPrice, "gwei") + " gwei"
    });

  } catch (error) {
    console.error("Error creating transaction:", error);
    res.status(500).json({ error: "Failed to create transaction" });
  }
});

// POST /api/wallet/xlm/create-transaction - Create Stellar transaction
router.post("/xlm/create-transaction", async (req, res) => {
  try {
    const { sourceAddress, destinationAddress, amount, memo } = req.body;

    if (!sourceAddress || !destinationAddress || !amount) {
      return res.status(400).json({ error: "Missing required parameters" });
    }

    if (!isValidStellarAddress(sourceAddress) || !isValidStellarAddress(destinationAddress)) {
      return res.status(400).json({ error: "Invalid Stellar address" });
    }

    const server = getStellarServer();
    const sourceAccount = await server.loadAccount(sourceAddress);
    const fee = await server.fetchBaseFee();

    const transaction = new TransactionBuilder(sourceAccount, {
      networkPassphrase: "Test SDF Network ; September 2015",
      fee: fee.toString()
    })
      .addOperation(Operation.payment({
        destination: destinationAddress,
        asset: Asset.native(),
        amount: amount.toString()
      }))
      .setTimeout(30)
      .build();

    if (memo) {
      transaction.addMemo(Memo.text(memo));
    }

    res.json({
      transaction: transaction.toXDR(),
      fee: fee.toString(),
      network: "TESTNET"
    });

  } catch (error) {
    console.error("Error creating Stellar transaction:", error);
    res.status(500).json({ error: "Failed to create Stellar transaction" });
  }
});

// GET /api/wallet/eth/network-info - Get Ethereum network info
router.get("/eth/network-info", async (req, res) => {
  try {
    const provider = getEthereumProvider();
    const network = await provider.getNetwork();
    const feeData = await provider.getFeeData();

    res.json({
      chainId: network.chainId,
      name: network.name,
      gasPrice: ethers.formatUnits(feeData.gasPrice, "gwei") + " gwei",
      maxFeePerGas: feeData.maxFeePerGas ? ethers.formatUnits(feeData.maxFeePerGas, "gwei") + " gwei" : null,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ? ethers.formatUnits(feeData.maxPriorityFeePerGas, "gwei") + " gwei" : null
    });

  } catch (error) {
    console.error("Error getting network info:", error);
    res.status(500).json({ error: "Failed to get network info" });
  }
});

// GET /api/wallet/xlm/network-info - Get Stellar network info
router.get("/xlm/network-info", async (req, res) => {
  try {
    const server = getStellarServer();
    const feeStats = await server.feeStats();

    res.json({
      network: "TESTNET",
      passphrase: "Test SDF Network ; September 2015",
      feeStats: {
        lastLedger: feeStats.last_ledger,
        lastLedgerBaseFee: feeStats.last_ledger_base_fee,
        ledgerCapacityUsage: feeStats.ledger_capacity_usage,
        minAcceptedFee: feeStats.min_accepted_fee,
        modeAcceptedFee: feeStats.mode_accepted_fee,
        p10AcceptedFee: feeStats.p10_accepted_fee,
        p20AcceptedFee: feeStats.p20_accepted_fee,
        p30AcceptedFee: feeStats.p30_accepted_fee,
        p40AcceptedFee: feeStats.p40_accepted_fee,
        p50AcceptedFee: feeStats.p50_accepted_fee,
        p60AcceptedFee: feeStats.p60_accepted_fee,
        p70AcceptedFee: feeStats.p70_accepted_fee,
        p80AcceptedFee: feeStats.p80_accepted_fee,
        p90AcceptedFee: feeStats.p90_accepted_fee,
        p95AcceptedFee: feeStats.p95_accepted_fee,
        p99AcceptedFee: feeStats.p99_accepted_fee
      }
    });

  } catch (error) {
    console.error("Error getting Stellar network info:", error);
    res.status(500).json({ error: "Failed to get Stellar network info" });
  }
});

// POST /api/wallet/validate-addresses - Validate both ETH and XLM addresses
router.post("/validate-addresses", async (req, res) => {
  try {
    const { ethAddress, xlmAddress } = req.body;

    const validation = {
      eth: {
        address: ethAddress,
        isValid: ethAddress ? isValidEthAddress(ethAddress) : false
      },
      xlm: {
        address: xlmAddress,
        isValid: xlmAddress ? isValidStellarAddress(xlmAddress) : false
      }
    };

    res.json(validation);

  } catch (error) {
    console.error("Error validating addresses:", error);
    res.status(500).json({ error: "Failed to validate addresses" });
  }
});

export default router;