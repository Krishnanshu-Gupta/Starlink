import { ethers } from "ethers";
import pkg from "stellar-sdk";
const { Horizon, Networks } = pkg;

// Ethereum configuration
const ETH_RPC_URL = process.env.ETH_RPC_URL || "https://sepolia.infura.io/v3/04944e1b094c4f93ad909a10bcff6803";
const HTLC_CONTRACT_ADDRESS = process.env.HTLC_CONTRACT_ADDRESS || "0xd7447E3BADe78e7fa93F86390be28f81c43B7500";

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

// Get HTLC contract instance
export function getHTLCContract(signer = null) {
  const provider = getEthereumProvider();
  const contract = new ethers.Contract(HTLC_CONTRACT_ADDRESS, HTLC_ABI, signer || provider);
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
    return xlmBalance ? parseXlmAmount(xlmBalance.balance) : "0";
  } catch (error) {
    console.error("Error getting XLM balance:", error);
    return "0";
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