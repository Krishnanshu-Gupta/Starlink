import { ethers } from "ethers";
import pkg from "@stellar/stellar-sdk";
const { Horizon, Networks, TransactionBuilder, Operation, Keypair, TimeBounds, Signer } = pkg;

// Ethereum configuration - Sepolia testnet with fallback
const ETH_RPC_URL = process.env.ETH_RPC_URL || "https://sepolia.infura.io/v3/04944e1b094c4f93ad909a10bcff6803";
const ETH_RPC_FALLBACK = "https://rpc.sepolia.org";
const ETH_CHAIN_ID = process.env.ETH_CHAIN_ID || "11155111";
const HTLC_CONTRACT_ADDRESS = process.env.HTLC_CONTRACT_ADDRESS || "0x55A636413A2956687B02cAd9e6ea53B83d2D64F0";
const RESOLVER_CONTRACT_ADDRESS = process.env.RESOLVER_CONTRACT_ADDRESS || "0xA7c9B608d78b4c97A59c747F2C6d24006938403b";
const FACTORY_CONTRACT_ADDRESS = process.env.FACTORY_CONTRACT_ADDRESS || "0xCD0604dA567d7A691d73A694338deB8B2354D715";

// Production settings
const ENABLE_REAL_TRANSACTIONS = process.env.ENABLE_REAL_TRANSACTIONS === "true";
const ENABLE_SIGNATURE_VERIFICATION = process.env.ENABLE_SIGNATURE_VERIFICATION === "true";

// Stellar configuration - use your testnet settings
const STELLAR_HORIZON_URL = process.env.STELLAR_HORIZON_URL || "https://horizon-testnet.stellar.org";
const STELLAR_NETWORK_PASSPHRASE = process.env.STELLAR_NETWORK_PASSPHRASE || Networks.TESTNET;

// Retry utility for network operations
async function retryOperation(operation, maxRetries = 3, delay = 2000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }

      // If it's a network timeout, retry
      if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
        console.log(`⚠️ Network timeout, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
        continue;
      }

      // For other errors, don't retry
      throw error;
    }
  }
}

// Ethereum provider with fallback
let ethProvider = null;
let currentRpcUrl = ETH_RPC_URL;

export async function getEthereumProvider() {
  if (!ethProvider) {
    try {
      ethProvider = new ethers.JsonRpcProvider(currentRpcUrl);
      // Test the connection
      await ethProvider.getNetwork();
      console.log(`✅ Connected to Ethereum RPC: ${currentRpcUrl}`);
    } catch (error) {
      console.log(`❌ Failed to connect to ${currentRpcUrl}, trying fallback...`);
      currentRpcUrl = ETH_RPC_FALLBACK;
      ethProvider = new ethers.JsonRpcProvider(currentRpcUrl);
      await ethProvider.getNetwork();
      console.log(`✅ Connected to Ethereum RPC fallback: ${currentRpcUrl}`);
    }
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

// Factory Contract ABI
const FACTORY_ABI = [
  "function createSwap(address recipient, address token, uint256 totalAmount, bytes32 hash, uint256 timelock) external payable returns (bytes32)",
  "function claimContract(bytes32 swapId, uint256 contractIndex, bytes32 preimage) external",
  "function getSwapInfo(bytes32 swapId) external view returns (address, address, address, uint256, uint256, bytes32, uint256, bool, uint256)",
  "function getSwapContracts(bytes32 swapId) external view returns (address[10])",
  "function getContractResolver(bytes32 swapId, uint256 contractIndex) external view returns (address)",
  "function calculateClaimableContracts(uint256 fillPercentage) external pure returns (uint256)",
  "function getRemainingContracts(bytes32 swapId) external view returns (uint256[])",
  "event SwapCreated(bytes32 indexed swapId, address indexed initiator, uint256 totalAmount, uint256 amountPerContract)",
  "event ContractCreated(bytes32 indexed swapId, uint256 contractIndex, address contractAddress, uint256 amount)",
  "event ContractClaimed(bytes32 indexed swapId, uint256 contractIndex, address indexed resolver, uint256 amount)",
  "event SwapCompleted(bytes32 indexed swapId, uint256 totalClaimed)"
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
export async function getHTLCContract(signer = null) {
  const provider = await getEthereumProvider();
  const contract = new ethers.Contract(HTLC_CONTRACT_ADDRESS, HTLC_ABI, signer || provider);
  return contract;
}

// Get Factory contract instance
export async function getFactoryContract(signer = null) {
  const provider = await getEthereumProvider();
  // verify there's bytecode at that address
  const code = await provider.getCode(FACTORY_CONTRACT_ADDRESS);
  if (code === "0x") {
    throw new Error(`No contract deployed at ${FACTORY_CONTRACT_ADDRESS}`);
  }

  console.log(`🔍 Contract bytecode length: ${code.length}`);

  const contract = new ethers.Contract(
    FACTORY_CONTRACT_ADDRESS,
    FACTORY_ABI,
    signer || provider
  );

  // debug: list available functions with error handling for ethers v6
  try {
    // In ethers v6, we need to use contract.interface.fragments instead of functions
    const fragments = contract.interface.fragments;
    const functionNames = fragments
      .filter(fragment => fragment.type === 'function')
      .map(fragment => fragment.name);

    console.log(
      `🔍 Factory at ${FACTORY_CONTRACT_ADDRESS} exposes:`,
      functionNames.length > 0 ? functionNames : "No functions found"
    );
  } catch (error) {
    console.log(`⚠️ Could not get contract functions:`, error.message);
    console.log(`🔍 Contract interface:`, contract.interface);
  }

  return contract;
}

// Get Resolver contract instance
export async function getResolverContract(signer = null) {
  const provider = await getEthereumProvider();
  const contract = new ethers.Contract(RESOLVER_CONTRACT_ADDRESS, RESOLVER_ABI, signer || provider);
  return contract;
}

// Synchronous versions for backward compatibility
export function getHTLCContractSync(signer = null) {
  const provider = new ethers.JsonRpcProvider(ETH_RPC_URL);
  const contract = new ethers.Contract(HTLC_CONTRACT_ADDRESS, HTLC_ABI, signer || provider);
  return contract;
}

export function getFactoryContractSync(signer = null) {
  const provider = new ethers.JsonRpcProvider(ETH_RPC_URL);
  const contract = new ethers.Contract(FACTORY_CONTRACT_ADDRESS, FACTORY_ABI, signer || provider);
  return contract;
}

export function getResolverContractSync(signer = null) {
  const provider = new ethers.JsonRpcProvider(ETH_RPC_URL);
  const contract = new ethers.Contract(RESOLVER_CONTRACT_ADDRESS, RESOLVER_ABI, signer || provider);
  return contract;
}

// Helper function to compute swap ID
export function computeSwapId(initiator, recipient, token, amount, hash, timelock) {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "address", "address", "uint256", "bytes32", "uint256", "uint256"],
      [initiator, recipient, token, amount, hash, timelock, Math.floor(Date.now() / 1000)]
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
    console.log("🔐 Verifying signature:", {
      message,
      signature: signature.slice(0, 10) + "...",
      expectedAddress
    });

    const recoveredAddress = ethers.verifyMessage(message, signature);
    const isValid = recoveredAddress.toLowerCase() === expectedAddress.toLowerCase();

    console.log("🔐 Signature verification result:", {
      recoveredAddress,
      expectedAddress,
      isValid
    });

    return isValid;
  } catch (error) {
    console.error("Signature verification failed:", error);
    return false;
  }
}

// Create swap with 10 contracts using Factory
export async function createSwapWithFactory(recipient, token, totalAmount, hash, timelock, signer) {
  if (!ENABLE_REAL_TRANSACTIONS) {
    console.log("⚠️ Real transactions disabled - simulating swap creation");
    return "simulated_swap_id";
  }

  return retryOperation(async () => {
    // Ensure signer is connected to a provider
    let connectedSigner = signer;
    if (signer && !signer.provider) {
      const provider = await getEthereumProvider();
      connectedSigner = signer.connect(provider);
    }

    const contract = await getFactoryContract(connectedSigner);

    // Convert totalAmount to BigInt and ensure it's divisible by 10
    const totalAmountBigInt = BigInt(totalAmount);
    if (totalAmountBigInt % 10n !== 0n) {
      throw new Error("Amount must be divisible by 10");
    }

    console.log(`🔧 Creating swap with factory:`, {
      recipient,
      token,
      totalAmount: totalAmountBigInt.toString(),
      hash,
      timelock
    });

    const tx = await contract.createSwap(recipient, token, totalAmountBigInt, hash, timelock, {
      value: token === ethers.ZeroAddress ? totalAmountBigInt : 0
    });

    console.log(`📝 Transaction submitted: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);

    // Parse SwapCreated event to get swap ID
    console.log(`🔍 Looking for SwapCreated event in ${receipt.logs.length} logs`);
    const event = receipt.logs
      .map(log => {
        try {
          const parsed = contract.interface.parseLog(log);
          if (parsed && parsed.name) {
            console.log(`🔍 Log: ${parsed.name}`, parsed.args);
            return parsed;
          } else {
            console.log(`🔍 Could not parse log: Invalid parsed result`);
            return null;
          }
        } catch (e) {
          console.log(`🔍 Could not parse log:`, e.message);
          return null;
        }
      })
      .find(e => e && e.name === "SwapCreated");

    if (event) {
      console.log(`✅ Found SwapCreated event with swapId: ${event.args.swapId}`);
      return event.args.swapId;
    } else {
      console.log(`❌ No SwapCreated event found in transaction`);
      // Try to compute the swap ID manually as fallback
      const swapId = computeSwapId(connectedSigner.address, recipient, token, totalAmountBigInt, hash, timelock);
      console.log(`🔧 Computed swap ID as fallback: ${swapId}`);
      return swapId;
    }
  });
}

// Claim specific contract from Factory
export async function claimContractFromFactory(swapId, contractIndex, preimage, signer) {
  if (!ENABLE_REAL_TRANSACTIONS) {
    console.log("⚠️ Real transactions disabled - simulating contract claim");
    return { hash: "simulated_claim_tx_hash", status: 1 };
  }

  try {
    let contract = await getFactoryContract(signer);
    // small delay so on-chain state catches up
    await new Promise((r) => setTimeout(r, 2000));

    // Validate that getSwapInfo exists before we proceed (ethers v6 compatible)
    const hasGetSwapInfo = contract.interface.fragments.some(
      fragment => fragment.type === 'function' && fragment.name === 'getSwapInfo'
    );

    if (!hasGetSwapInfo) {
      const functionNames = contract.interface.fragments
        .filter(fragment => fragment.type === 'function')
        .map(fragment => fragment.name);

      console.error(
        `❌ Factory contract is missing getSwapInfo; methods:`,
        functionNames
      );
      throw new Error("Factory ABI mismatch: getSwapInfo not found");
    }

    // fetch info to confirm we're in the right state
    const info = await contract.getSwapInfo(swapId);
    console.log(`🔍 SwapInfo(${swapId}):`, info);

    const tx = await contract.claimContract(swapId, contractIndex, preimage);
    return await tx.wait();
  } catch (error) {
    console.error(
      `❌ Failed to claim contract ${contractIndex} for swap ${swapId}:`,
      error.message
    );
    throw error;
  }
}

// Get swap info from Factory
export async function getSwapInfoFromFactory(swapId) {
  try {
    const contract = await getFactoryContract();
    return await contract.getSwapInfo(swapId);
  } catch (error) {
    console.log("Falling back to sync factory contract");
    const contract = getFactoryContractSync();
    return await contract.getSwapInfo(swapId);
  }
}

// Get swap contracts from Factory
export async function getSwapContractsFromFactory(swapId) {
  try {
    const contract = await getFactoryContract();
    return await contract.getSwapContracts(swapId);
  } catch (error) {
    console.log("Falling back to sync factory contract");
    const contract = getFactoryContractSync();
    return await contract.getSwapContracts(swapId);
  }
}

// Calculate claimable contracts based on fill percentage
export async function calculateClaimableContracts(fillPercentage) {
  try {
    const contract = await getFactoryContract();
    return await contract.calculateClaimableContracts(fillPercentage);
  } catch (error) {
    console.log("Falling back to sync factory contract");
    const contract = getFactoryContractSync();
    return await contract.calculateClaimableContracts(fillPercentage);
  }
}

// Get remaining contracts for a swap
export async function getRemainingContracts(swapId) {
  try {
    const contract = await getFactoryContract();
    return await contract.getRemainingContracts(swapId);
  } catch (error) {
    console.log("Falling back to sync factory contract");
    const contract = getFactoryContractSync();
    return await contract.getRemainingContracts(swapId);
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
  const secretHex = ethers.hexlify(secret);
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