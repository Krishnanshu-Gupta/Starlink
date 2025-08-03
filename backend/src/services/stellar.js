import pkg from "@stellar/stellar-sdk";
const { Horizon, Networks, TransactionBuilder, Operation, Keypair, TimeBounds, Signer } = pkg;

// Stellar network configuration
const STELLAR_NETWORK_PASSPHRASE = Networks.TESTNET;
const STELLAR_SERVER_URL = "https://horizon-testnet.stellar.org";

// Get Stellar server instance
export function getStellarServer() {
  return new Horizon.Server(STELLAR_SERVER_URL, { allowHttp: true });
}

export async function createStellarHTLC(recipientAddress, hash, timelock, amount, sourceKeypair) {
  const server = getStellarServer();

  try {
    // Create escrow keypair
    const escrow = Keypair.random();
    const sourceAccount = await server.loadAccount(sourceKeypair.publicKey());

    console.log(`🔧 Creating Stellar HTLC:`, {
      escrowAddress: escrow.publicKey(),
      recipientAddress,
      amount,
      hash
    });

    // Check source account balance
    const sourceBalance = parseFloat(sourceAccount.balances.find(b => b.asset_type === 'native').balance);
    const requiredBalance = parseFloat(amount) + 0.02; // amount + fees for 2 transactions
    console.log(`💰 Source balance: ${sourceBalance} XLM, Required: ${requiredBalance} XLM`);

    if (sourceBalance < requiredBalance) {
      throw new Error(`Insufficient balance: ${sourceBalance} XLM available, ${requiredBalance} XLM required`);
    }

    // Step 1: Create account with starting balance
    console.log(`📝 Step 1: Creating escrow account`);

    // Format amount to have at most 7 decimal places (Stellar requirement)
    const formattedAmount = parseFloat(amount).toFixed(7);
    console.log(`💰 Formatted amount for Stellar: ${formattedAmount} XLM`);

    const createAccountOp = Operation.createAccount({
      destination: escrow.publicKey(),
      startingBalance: formattedAmount
    });

    let createAccountTx = new TransactionBuilder(sourceAccount, {
      fee: "100",
      networkPassphrase: STELLAR_NETWORK_PASSPHRASE
    })
      .addOperation(createAccountOp)
      .setTimeout(60)
      .build();

    createAccountTx.sign(sourceKeypair);

    let createAccountResp;
    let retryCount = 0;
    const maxRetries = 3;
    while (retryCount < maxRetries) {
      try {
        createAccountResp = await server.submitTransaction(createAccountTx);
        console.log(`✅ Escrow account created: ${createAccountResp.hash}`);
        break;
      } catch (e) {
        retryCount++;
        console.log(`⚠️ Create account attempt ${retryCount}/${maxRetries} failed:`, e.message);
        if (e.response?.data) {
          console.log(`🔍 Create account error details:`, JSON.stringify(e.response.data, null, 2));
        }

        // Handle 504 timeout - check if transaction was actually submitted
        if (e.response?.status === 504 && e.response.data.extras?.hash) {
          const hash = e.response.data.extras.hash;
          console.log(`🔍 Create account might have been included despite timeout. Hash: ${hash}`);
          await new Promise(r => setTimeout(r, 3000));
          try {
            const info = await server.transactions().transaction(hash).call();
            if (info.successful) {
              console.log(`✅ Create account confirmed on ledger: ${hash}`);
              createAccountResp = { hash };
              break;
            }
          } catch (pollError) {
            console.log(`⚠️ Could not verify create account status:`, pollError.message);
          }
        }

        if (retryCount >= maxRetries) throw e;

        // Refresh source account to get updated sequence number
        if (e.response?.data?.extras?.result_codes?.transaction === 'tx_bad_seq') {
          console.log(`🔄 Refreshing source account sequence number...`);
          const refreshedSourceAccount = await server.loadAccount(sourceKeypair.publicKey());
          createAccountTx = new TransactionBuilder(refreshedSourceAccount, {
            fee: "100",
            networkPassphrase: STELLAR_NETWORK_PASSPHRASE
          })
            .addOperation(createAccountOp)
            .setTimeout(60)
            .build();
          createAccountTx.sign(sourceKeypair);
        }

        await new Promise(r => setTimeout(r, 2000 * retryCount));
      }
    }

    // Wait a moment for the account to be available
    await new Promise(r => setTimeout(r, 3000));

    // Step 2: Set up the escrow account with hash-X signer and disable master key
    console.log(`📝 Step 2: Setting up escrow account with hash-X signer`);
    const escrowAccount = await server.loadAccount(escrow.publicKey());

    // Add hash-x signer (sha256Hash as Buffer)
    const hashWithoutPrefix = hash.startsWith('0x') ? hash.slice(2) : hash;
    const sha256Hash = Buffer.from(hashWithoutPrefix, 'hex');
    console.log(`🔧 Using sha256Hash: ${sha256Hash.toString('hex')}`);

    const setSignerOp = Operation.setOptions({
      source: escrow.publicKey(),
      signer: { sha256Hash, weight: 1 }
    });

    const disableMasterOp = Operation.setOptions({
      source: escrow.publicKey(),
      masterWeight: 0
    });

    let setupTx = new TransactionBuilder(escrowAccount, {
      fee: "100",
      networkPassphrase: STELLAR_NETWORK_PASSPHRASE
    })
      .addOperation(setSignerOp)
      .addOperation(disableMasterOp)
      .setTimeout(60)
      .build();

    // Sign with the escrow account itself (it has authority to modify itself)
    setupTx.sign(escrow);

    let setupResp;
    retryCount = 0;
    while (retryCount < maxRetries) {
      try {
        setupResp = await server.submitTransaction(setupTx);
        console.log(`✅ Escrow account setup completed: ${setupResp.hash}`);
        break;
      } catch (e) {
        retryCount++;
        console.log(`⚠️ Setup account attempt ${retryCount}/${maxRetries} failed:`, e.message);
        if (e.response?.data) {
          console.log(`🔍 Setup error details:`, JSON.stringify(e.response.data, null, 2));
        }

        // Handle 504 timeout - check if transaction was actually submitted
        if (e.response?.status === 504 && e.response.data.extras?.hash) {
          const hash = e.response.data.extras.hash;
          console.log(`🔍 Setup might have been included despite timeout. Hash: ${hash}`);
          await new Promise(r => setTimeout(r, 3000));
          try {
            const info = await server.transactions().transaction(hash).call();
            if (info.successful) {
              console.log(`✅ Setup confirmed on ledger: ${hash}`);
              setupResp = { hash };
              break;
            }
          } catch (pollError) {
            console.log(`⚠️ Could not verify setup status:`, pollError.message);
          }
        }

        if (retryCount >= maxRetries) throw e;

        // Refresh escrow account to get updated sequence number
        if (e.response?.data?.extras?.result_codes?.transaction === 'tx_bad_seq') {
          console.log(`🔄 Refreshing escrow account sequence number...`);
          const refreshedEscrowAccount = await server.loadAccount(escrow.publicKey());
          setupTx = new TransactionBuilder(refreshedEscrowAccount, {
            fee: "100",
            networkPassphrase: STELLAR_NETWORK_PASSPHRASE
          })
            .addOperation(setSignerOp)
            .addOperation(disableMasterOp)
            .setTimeout(60)
            .build();
          setupTx.sign(escrow);
        }

        await new Promise(r => setTimeout(r, 2000 * retryCount));
      }
    }

    return {
      escrowAddress: escrow.publicKey(),
      escrowKeypair: escrow,
      transactionHash: setupResp.hash
    };
  } catch (error) {
    console.error("❌ Error creating Stellar HTLC:", error);
    throw error;
  }
}

export async function claimStellarHTLC(escrowAddress, recipientAddress, secret, escrowKeypair) {
  const server = getStellarServer();
  // load the escrow account
  const escrowAcct = await server.loadAccount(escrowAddress);
  const op = Operation.accountMerge({ destination: recipientAddress });
  const tx = new TransactionBuilder(escrowAcct, {
    fee: "100",
    networkPassphrase: STELLAR_NETWORK_PASSPHRASE
  })
    .addOperation(op)
    .setTimeout(60) // 60 second timeout
    .build();
  // get the hash-X Keypair from the preimage
  const hashXSigner = Keypair.fromRawEd25519Seed(Buffer.from(secret.replace(/^0x/, ''), "hex"));
  tx.sign(hashXSigner);
  // try submit, but if we get a 504, poll first
  let response;
  let retryCount = 0;
  const maxRetries = 3;
  while (retryCount < maxRetries) {
    try {
      response = await server.submitTransaction(tx);
      console.log(`✅ Stellar HTLC claimed: ${response.hash}`);
      break;
    } catch (submitError) {
      retryCount++;
      console.log(`⚠️ Attempt ${retryCount}/${maxRetries} failed:`, submitError.message);
      // if Horizon 504, poll the tx endpoint
      if (submitError.response?.status === 504 && submitError.response.data.extras?.hash) {
        const txHash = submitError.response.data.extras.hash;
        console.log(`🔍 Might have been included despite timeout. Hash: ${txHash}`);
        await new Promise(r => setTimeout(r, 2000));
        try {
          const info = await server.transactions().transaction(txHash).call();
          if (info.successful) {
            console.log(`✅ Confirmed on ledger: ${txHash}`);
            return { transactionHash: txHash, recipientAddress };
          }
        } catch {}
      }
      if (retryCount >= maxRetries) throw submitError;
      await new Promise(r => setTimeout(r, 2000 * retryCount));
    }
  }
  return {
    transactionHash: response.hash,
    recipientAddress
  };
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

    // Build transaction with timebounds
    const transaction = new TransactionBuilder(escrowAccount, {
      fee: "100",
      networkPassphrase: STELLAR_NETWORK_PASSPHRASE
    })
      .addOperation(refundOp)
      .setTimeout(30) // 30 second timeout
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