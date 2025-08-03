import { ethers } from "ethers";
import pkg from "@stellar/stellar-sdk";
const { Horizon, Networks, TransactionBuilder, Operation, Keypair, TimeBounds, Signer } = pkg;

// Ethereum configuration
const ETH_RPC_URL = process.env.ETH_RPC_URL || "https://sepolia.infura.io/v3/04944e1b094c4f93ad909a10bcff6803";
const HTLC_CONTRACT_ADDRESS = process.env.HTLC_CONTRACT_ADDRESS || "0x6c91739cbC4c9e4F1907Cc11AC8431ca1a55d0C6";
const RESOLVER_CONTRACT_ADDRESS = process.env.RESOLVER_CONTRACT_ADDRESS || "0xD5cA355e5Cf8Ba93d0A363C956204d0734e73F50";

// Production settings
const ENABLE_REAL_TRANSACTIONS = process.env.ENABLE_REAL_TRANSACTIONS === "true";
const ENABLE_SIGNATURE_VERIFICATION = process.env.ENABLE_SIGNATURE_VERIFICATION === "true";

// Stellar configuration
const STELLAR_HORIZON_URL = "https://horizon-testnet.stellar.org";
const STELLAR_NETWORK_PASSPHRASE = Networks.TESTNET;

// Ethereum provider
let ethProvider = null;
export function getEthereumProvider() {
  if (!ethProvider) {
    ethProvider = new ethers.JsonRpcProvider(ETH_RPC_URL);
  }
  return ethProvider;
}

// Stellar server
let stellarServer = null;
export function getStellarServer() {
  if (!stellarServer) {
    stellarServer = new Horizon.Server(STELLAR_HORIZON_URL);
  }
  return stellarServer;
}

// HTLC Contract ABI (simplified version)
const HTLC_ABI = [
  "function lockETH(address recipient, bytes32 hash, uint256 timelock) external payable returns (bytes32)",
  "function claim(bytes32 swapId, bytes32 preimage) external",
  "function refund(bytes32 swapId) external",
  "event Locked(bytes32 indexed swapId, address indexed initiator, address indexed recipient, address token, uint256 amount, bytes32 hash, uint256 timelock)",
  "event Claimed(bytes32 indexed swapId, bytes32 secret)",
  "event Refunded(bytes32 indexed swapId)"
];

// Resolver Contract ABI
const RESOLVER_ABI = [
  "function openSwap(address escrow, uint16 toChain, uint256 amount, bytes32 hash, uint256 timelock) external returns (bytes32)",
  "function fillSwap(bytes32 id, bytes32 preimage, uint256 part) external",
  "function remaining(bytes32 id) external view returns (uint256)",
  "event SwapOpened(bytes32 id, address escrow, uint16 toChain, uint256 amount, bytes32 hash)",
  "event SwapFilled(bytes32 id, uint256 amount, bytes32 preimage)"
];

// Get HTLC contract instance
export function getHTLCContract(signer = null) {
  const provider = getEthereumProvider();
  const contract = new ethers.Contract(HTLC_CONTRACT_ADDRESS, HTLC_ABI, signer || provider);
  return contract;
}

// Get Resolver contract instance
export function getResolverContract(signer = null) {
  const provider = getEthereumProvider();
  const contract = new ethers.Contract(RESOLVER_CONTRACT_ADDRESS, RESOLVER_ABI, signer || provider);
  return contract;
}

// Helper function to compute swap ID
export function computeSwapId(initiator, recipient, token, amount, hash, timelock) {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "address", "address", "uint256", "bytes32", "uint256"],
      [initiator, recipient, token, amount, hash, timelock]
    )
  );
}

// Helper function to format ETH amount
export function formatEthAmount(amount, decimals = 18) {
  return ethers.parseUnits(amount.toString(), decimals);
}

// Helper function to format XLM amount
export function formatXlmAmount(amount) {
  return (parseFloat(amount) * 10000000).toString(); // XLM has 7 decimal places
}

// Helper function to parse XLM amount
export function parseXlmAmount(amount) {
  return (parseInt(amount) / 10000000).toString();
}

// Get ETH balance
export async function getEthBalance(address) {
  const provider = getEthereumProvider();
  const balance = await provider.getBalance(address);
  return ethers.formatEther(balance);
}

// Get XLM balance
export async function getXlmBalance(address) {
  const server = getStellarServer();
  try {
    const account = await server.loadAccount(address);
    const xlmBalance = account.balances.find(b => b.asset_type === "native");
    return xlmBalance ? xlmBalance.balance : "0";
  } catch (error) {
    console.error("Error getting XLM balance:", error);
    return "0";
  }
}

// Verify Ethereum signature
export async function verifyEthSignature(message, signature, expectedAddress) {
  if (!ENABLE_SIGNATURE_VERIFICATION) {
    console.log("⚠️ Signature verification disabled for development");
    return true;
  }

  try {
    const recoveredAddress = ethers.verifyMessage(message, signature);
    return recoveredAddress.toLowerCase() === expectedAddress.toLowerCase();
  } catch (error) {
    console.error("Signature verification failed:", error);
    return false;
  }
}

// Create Ethereum transaction for locking ETH
export async function createLockEthTransaction(recipient, hash, timelock, amount, signer) {
  const contract = getHTLCContract(signer);
  const tx = await contract.lockETH.populateTransaction(recipient, hash, timelock, {
    value: amount
  });
  return tx;
}

// Lock ETH in HTLC contract
export async function lockEthInHTLC(recipient, hash, timelock, amount, signer) {
  if (!ENABLE_REAL_TRANSACTIONS) {
    console.log("⚠️ Real transactions disabled - simulating lock");
    return { hash: "simulated_lock_tx_hash", status: 1 };
  }

  const contract = getHTLCContract(signer);
  const tx = await contract.lockETH(recipient, hash, timelock, { value: amount });
  return await tx.wait();
}

// Open swap on Resolver
export async function openSwapOnResolver(escrowAddress, toChain, amount, hash, timelock, signer) {
  if (!ENABLE_REAL_TRANSACTIONS) {
    console.log("⚠️ Real transactions disabled - simulating swap open");
    return "simulated_swap_id";
  }

  const contract = getResolverContract(signer);
  const tx = await contract.openSwap(escrowAddress, toChain, amount, hash, timelock);
  const receipt = await tx.wait();

  // Parse SwapOpened event to get swap ID
  const event = receipt.logs
    .map(log => {
      try { return contract.interface.parseLog(log); } catch { return null; }
    })
    .find(e => e && e.name === "SwapOpened");

  return event ? event.args.id : null;
}

// Claim ETH from HTLC
export async function claimEthFromHTLC(swapId, preimage, signer) {
  if (!ENABLE_REAL_TRANSACTIONS) {
    console.log("⚠️ Real transactions disabled - simulating claim");
    return { hash: "simulated_claim_tx_hash", status: 1 };
  }

  const contract = getHTLCContract(signer);
  const tx = await contract.claim(swapId, preimage);
  return await tx.wait();
}

// Fill swap on Resolver (called by relayer)
export async function fillSwapOnResolver(swapId, preimage, amount, signer) {
  if (!ENABLE_REAL_TRANSACTIONS) {
    console.log("⚠️ Real transactions disabled - simulating fill");
    return { hash: "simulated_fill_tx_hash", status: 1 };
  }

  const contract = getResolverContract(signer);
  const tx = await contract.fillSwap(swapId, preimage, amount);
  return await tx.wait();
}

// Create Ethereum transaction for claiming
export async function createClaimTransaction(swapId, preimage, signer) {
  const contract = getHTLCContract(signer);
  const tx = await contract.claim.populateTransaction(swapId, preimage);
  return tx;
}

// Create Ethereum transaction for refunding
export async function createRefundTransaction(swapId, signer) {
  const contract = getHTLCContract(signer);
  const tx = await contract.refund.populateTransaction(swapId);
  return tx;
}

// Wait for transaction confirmation
export async function waitForTransaction(txHash, confirmations = 1) {
  const provider = getEthereumProvider();
  const receipt = await provider.waitForTransaction(txHash, confirmations);
  return receipt;
}

// Get transaction status
export async function getTransactionStatus(txHash) {
  const provider = getEthereumProvider();
  const receipt = await provider.getTransactionReceipt(txHash);
  return receipt ? (receipt.status === 1 ? "confirmed" : "failed") : "pending";
}

// Validate Ethereum address
export function isValidEthAddress(address) {
  try {
    ethers.getAddress(address);
    return true;
  } catch {
    return false;
  }
}

// Validate Stellar address
export function isValidStellarAddress(address) {
  try {
    // Basic Stellar address validation
    return /^G[A-Z2-7]{55}$/.test(address);
  } catch {
    return false;
  }
}

// Generate random secret and hash
export function generateSecretAndHash() {
  const secret = ethers.randomBytes(32);
  const secretHex = secret.toString("hex");
  const hash = ethers.keccak256(secret);
  return { secret, secretHex, hash };
}

// Calculate timelock
export function calculateTimelock(minutes = 30) {
  return Math.floor(Date.now() / 1000) + (minutes * 60);
}

// Format timestamp for display
export function formatTimestamp(timestamp) {
  return new Date(timestamp * 1000).toLocaleString();
}

// Get time remaining until timelock
export function getTimeRemaining(timelock) {
  const now = Math.floor(Date.now() / 1000);
  const remaining = timelock - now;
  return Math.max(0, remaining);
}

// Stellar HTLC functions
export async function createStellarHTLC(recipientAddress, hash, timelock, amount, sourceKeypair) {
  const server = getStellarServer();

  // Create escrow account keypair
  const escrowKeypair = Keypair.random();

  // Get source account
  const sourceAccount = await server.loadAccount(sourceKeypair.publicKey());

  // Create escrow account
  const createAccountOp = Operation.createAccount({
    destination: escrowKeypair.publicKey(),
    startingBalance: amount.toString()
  });

  // Set hash-X signer on escrow account
  const setOptionsOp = Operation.setOptions({
    source: escrowKeypair.publicKey(),
    signer: {
      ed25519PublicKey: hash,
      weight: 1
    }
  });

  // Set master key weight to 0 (disable)
  const setMasterWeightOp = Operation.setOptions({
    source: escrowKeypair.publicKey(),
    masterWeight: 0
  });

  // Build transaction
  const transaction = new TransactionBuilder(sourceAccount, {
    fee: "100",
    networkPassphrase: STELLAR_NETWORK_PASSPHRASE
  })
    .addOperation(createAccountOp)
    .addOperation(setOptionsOp)
    .addOperation(setMasterWeightOp)
    .setTimeout(timelock)
    .build();

  // Sign with source account
  transaction.sign(sourceKeypair);

  // Submit transaction
  const response = await server.submitTransaction(transaction);

  return {
    escrowAddress: escrowKeypair.publicKey(),
    escrowKeypair: escrowKeypair,
    transactionHash: response.hash
  };
}

export async function claimStellarHTLC(escrowAddress, recipientAddress, secret, escrowKeypair) {
  const server = getStellarServer();

  // Get escrow account
  const escrowAccount = await server.loadAccount(escrowAddress);

  // Create claim transaction (AccountMerge)
  const claimOp = Operation.accountMerge({
    destination: recipientAddress
  });

  // Build transaction
  const transaction = new TransactionBuilder(escrowAccount, {
    fee: "100",
    networkPassphrase: STELLAR_NETWORK_PASSPHRASE
  })
    .addOperation(claimOp)
    .build();

  // Sign with hash-X signer (using secret as private key)
  const hashXSigner = Keypair.fromRawEd25519Seed(Buffer.from(secret, "hex"));
  transaction.sign(hashXSigner);

  // Submit transaction
  const response = await server.submitTransaction(transaction);

  return {
    transactionHash: response.hash
  };
}

export async function refundStellarHTLC(escrowAddress, sourceAddress, timelock, sourceKeypair) {
  const server = getStellarServer();

  // Check if timelock has expired
  const now = Math.floor(Date.now() / 1000);
  if (now < timelock) {
    throw new Error("Timelock has not expired yet");
  }

  // Get escrow account
  const escrowAccount = await server.loadAccount(escrowAddress);

  // Create refund transaction (AccountMerge back to source)
  const refundOp = Operation.accountMerge({
    destination: sourceAddress
  });

  // Build transaction
  const transaction = new TransactionBuilder(escrowAccount, {
    fee: "100",
    networkPassphrase: STELLAR_NETWORK_PASSPHRASE
  })
    .addOperation(refundOp)
    .build();

  // Sign with source account (pre-authorized)
  transaction.sign(sourceKeypair);

  // Submit transaction
  const response = await server.submitTransaction(transaction);

  return {
    transactionHash: response.hash
  };
}