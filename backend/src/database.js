import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let db;

export async function createDatabase() {
  db = await open({
    filename: join(__dirname, "../data/starlink.db"),
    driver: sqlite3.Database
  });

  console.log("📊 Database initialized");
  return db;
}

export async function initializeTables() {
  // Swaps table - stores all swap information for bidirectional HTLC swaps
  await db.exec(`
    CREATE TABLE IF NOT EXISTS swaps (
      id TEXT PRIMARY KEY,
      direction TEXT NOT NULL CHECK (direction IN ('ETH_TO_XLM', 'XLM_TO_ETH')),
      initiator_address TEXT NOT NULL,
      recipient_address TEXT NOT NULL,
      eth_amount TEXT NOT NULL,
      xlm_amount TEXT NOT NULL,
      secret TEXT NOT NULL,
      hash TEXT NOT NULL,
      timelock INTEGER NOT NULL,
      status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'locked_eth', 'locked_stellar', 'claimed_xlm', 'claimed_eth', 'completed', 'refunded')),
      ethereum_tx_hash TEXT,
      factory_swap_id TEXT,
      resolver_swap_id TEXT,
      stellar_tx_hash TEXT,
      escrow_address TEXT,
      claim_tx_hash TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);

  // Users table - for session management
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      ethereum_address TEXT UNIQUE,
      stellar_address TEXT UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_active DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Transactions table - for detailed transaction history
  await db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      swap_id TEXT NOT NULL,
      chain TEXT NOT NULL,
      tx_type TEXT NOT NULL,
      tx_hash TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      block_number INTEGER,
      gas_used INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (swap_id) REFERENCES swaps (id)
    )
  `);

  // Create resolver_locks table for partial fills
  await db.exec(`
    CREATE TABLE IF NOT EXISTS resolver_locks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      swap_id TEXT NOT NULL,
      resolver_id TEXT NOT NULL,
      amount REAL NOT NULL,
      escrow_address TEXT,
      stellar_tx_hash TEXT,
      claim_tx_hash TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (swap_id) REFERENCES swaps (id)
    )
  `);

  // Create swap_contracts table for 10-contract system
  await db.exec(`
    CREATE TABLE IF NOT EXISTS swap_contracts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      swap_id TEXT NOT NULL,
      contract_index INTEGER NOT NULL CHECK (contract_index >= 0 AND contract_index < 10),
      contract_address TEXT NOT NULL,
      resolver_id TEXT,
      claim_tx_hash TEXT,
      status TEXT DEFAULT 'created' CHECK (status IN ('created', 'claimed', 'failed')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      claimed_at DATETIME,
      FOREIGN KEY (swap_id) REFERENCES swaps (id),
      FOREIGN KEY (resolver_id) REFERENCES resolver_locks (resolver_id),
      UNIQUE(swap_id, contract_index)
    )
  `);

  // Create contract_claims table for tracking real contract claims
  await db.exec(`
    CREATE TABLE IF NOT EXISTS contract_claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      swap_id TEXT NOT NULL,
      resolver_id TEXT NOT NULL,
      contract_index INTEGER NOT NULL CHECK (contract_index >= 0 AND contract_index < 10),
      transaction_hash TEXT,
      status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'claimed', 'failed')),
      gas_used TEXT,
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      claimed_at DATETIME,
      FOREIGN KEY (swap_id) REFERENCES swaps (id)
    )
  `);

  // Create indexes for better performance
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_swaps_status ON swaps(status);
    CREATE INDEX IF NOT EXISTS idx_swaps_direction ON swaps(direction);
    CREATE INDEX IF NOT EXISTS idx_swaps_initiator ON swaps(initiator_address);
    CREATE INDEX IF NOT EXISTS idx_swaps_recipient ON swaps(recipient_address);
    CREATE INDEX IF NOT EXISTS idx_transactions_swap_id ON transactions(swap_id);
    CREATE INDEX IF NOT EXISTS idx_swap_contracts_swap_id ON swap_contracts(swap_id);
    CREATE INDEX IF NOT EXISTS idx_swap_contracts_status ON swap_contracts(status);
  `);

  console.log("📋 Database tables initialized");
}

export async function getDatabase() {
  if (!db) {
    await createDatabase();
  }
  return db;
}

// Helper functions for common database operations
export async function createSwap(swapData) {
  const db = await getDatabase();
  const { id, ...data } = swapData;

  await db.run(`
    INSERT INTO swaps (
      id, initiator_address, recipient_address, token_address,
      amount, hash_hex, secret_hex, timelock, stellar_escrow_public,
      stellar_escrow_secret
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id, data.initiator_address, data.recipient_address, data.token_address,
    data.amount, data.hash_hex, data.secret_hex, data.timelock,
    data.stellar_escrow_public, data.stellar_escrow_secret
  ]);

  return id;
}

export async function getSwap(swapId) {
  const db = await getDatabase();
  return await db.get("SELECT * FROM swaps WHERE id = ?", [swapId]);
}

export async function updateSwapStatus(swapId, status, additionalData = {}) {
  const db = await getDatabase();
  const updates = Object.keys(additionalData).map(key => `${key} = ?`).join(", ");
  const values = Object.values(additionalData);

  await db.run(`
    UPDATE swaps
    SET status = ?, updated_at = CURRENT_TIMESTAMP${updates ? ", " + updates : ""}
    WHERE id = ?
  `, [status, ...values, swapId]);
}

export async function getSwapsByAddress(address) {
  const db = await getDatabase();
  return await db.all(`
    SELECT * FROM swaps
    WHERE initiator_address = ? OR recipient_address = ?
    ORDER BY created_at DESC
  `, [address, address]);
}

export async function getPendingSwaps() {
  const db = await getDatabase();
  return await db.all(`
    SELECT * FROM swaps
    WHERE status IN ('pending', 'locked_eth', 'locked_stellar')
    ORDER BY created_at ASC
  `);
}

export async function addTransaction(transactionData) {
  const db = await getDatabase();
  const { swap_id, chain, tx_type, tx_hash, status, block_number, gas_used } = transactionData;

  await db.run(`
    INSERT INTO transactions (
      swap_id, chain, tx_type, tx_hash, status, block_number, gas_used
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [swap_id, chain, tx_type, tx_hash, status, block_number, gas_used]);
}

export async function getTransactions(swapId) {
  const db = await getDatabase();
  return await db.all(`
    SELECT * FROM transactions
    WHERE swap_id = ?
    ORDER BY created_at ASC
  `, [swapId]);
}

// New helper functions for 10-contract system
export async function createSwapContracts(swapId, contractAddresses) {
  const db = await getDatabase();

  for (let i = 0; i < contractAddresses.length; i++) {
    await db.run(`
      INSERT INTO swap_contracts (
        swap_id, contract_index, contract_address, status
      ) VALUES (?, ?, ?, ?)
    `, [swapId, i, contractAddresses[i], "created"]);
  }
}

export async function getSwapContracts(swapId) {
  const db = await getDatabase();
  return await db.all(`
    SELECT * FROM swap_contracts
    WHERE swap_id = ?
    ORDER BY contract_index ASC
  `, [swapId]);
}

export async function updateContractStatus(swapId, contractIndex, status, resolverId = null, claimTxHash = null) {
  const db = await getDatabase();

  const updates = [];
  const values = [];

  if (resolverId) {
    updates.push("resolver_id = ?");
    values.push(resolverId);
  }

  if (claimTxHash) {
    updates.push("claim_tx_hash = ?");
    values.push(claimTxHash);
  }

  if (status === "claimed") {
    updates.push("claimed_at = CURRENT_TIMESTAMP");
  }

  updates.push("status = ?");
  values.push(status);

  await db.run(`
    UPDATE swap_contracts
    SET ${updates.join(", ")}
    WHERE swap_id = ? AND contract_index = ?
  `, [...values, swapId, contractIndex]);
}

export async function getAvailableContracts(swapId) {
  const db = await getDatabase();
  return await db.all(`
    SELECT * FROM swap_contracts
    WHERE swap_id = ? AND status = 'created'
    ORDER BY contract_index ASC
  `, [swapId]);
}

export async function getClaimedContracts(swapId) {
  const db = await getDatabase();
  return await db.all(`
    SELECT * FROM swap_contracts
    WHERE swap_id = ? AND status = 'claimed'
    ORDER BY contract_index ASC
  `, [swapId]);
}

export async function getContractByResolver(swapId, resolverId) {
  const db = await getDatabase();
  return await db.all(`
    SELECT * FROM swap_contracts
    WHERE swap_id = ? AND resolver_id = ?
    ORDER BY contract_index ASC
  `, [swapId, resolverId]);
}