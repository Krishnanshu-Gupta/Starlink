import pkg from "@stellar/stellar-sdk";
const { Horizon, Networks, TransactionBuilder, Operation, Keypair, TimeBounds, Signer } = pkg;

// Stellar network configuration
const STELLAR_NETWORK_PASSPHRASE = Networks.TESTNET;
const STELLAR_SERVER_URL = "https://horizon-testnet.stellar.org";

// Get Stellar server instance
export function getStellarServer() {
  return new Horizon.Server(STELLAR_SERVER_URL, { allowHttp: true });
}

// Create Stellar HTLC escrow account
export async function createStellarHTLC(recipientAddress, hash, timelock, amount, sourceKeypair) {
  const server = getStellarServer();

  // Create escrow account keypair
  const escrowKeypair = Keypair.random();

  try {
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
  } catch (error) {
    console.error("Error creating Stellar HTLC:", error);
    throw error;
  }
}

// Claim XLM from Stellar HTLC
export async function claimStellarHTLC(escrowAddress, recipientAddress, secret, escrowKeypair) {
  const server = getStellarServer();

  try {
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
      transactionHash: response.hash,
      recipientAddress
    };
  } catch (error) {
    console.error("Error claiming Stellar HTLC:", error);
    throw error;
  }
}

// Refund Stellar HTLC (if timelock expires)
export async function refundStellarHTLC(escrowAddress, sourceAddress, timelock, sourceKeypair) {
  const server = getStellarServer();

  try {
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

    // Sign with source account (pre-authorized refund)
    transaction.sign(sourceKeypair);

    // Submit transaction
    const response = await server.submitTransaction(transaction);

    return {
      transactionHash: response.hash,
      sourceAddress
    };
  } catch (error) {
    console.error("Error refunding Stellar HTLC:", error);
    throw error;
  }
}