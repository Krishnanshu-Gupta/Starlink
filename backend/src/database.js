import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let db;

export async function createDatabase() {
  db = await open({
    filename: join(__dirname, "../data/fusion-cross.db"),
    driver: sqlite3.Database
  });

  console.log("📊 Database initialized");
  return db;
}

export async function initializeTables() {
  // Swaps table - stores all swap information
  await db.exec(`
    CREATE TABLE IF NOT EXISTS swaps (
      id TEXT PRIMARY KEY,
      initiator_address TEXT NOT NULL,
      recipient_address TEXT NOT NULL,
      token_address TEXT NOT NULL,
      amount TEXT NOT NULL,
      hash_hex TEXT NOT NULL,
      secret_hex TEXT NOT NULL,
      timelock INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      stellar_escrow_public TEXT,
      stellar_escrow_secret TEXT,
      ethereum_swap_id TEXT,
      ethereum_tx_hash TEXT,
      stellar_tx_hash TEXT,
      claim_tx_hash TEXT,
      refund_tx_hash TEXT
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

  // Create indexes for better performance
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_swaps_status ON swaps(status);
    CREATE INDEX IF NOT EXISTS idx_swaps_initiator ON swaps(initiator_address);
    CREATE INDEX IF NOT EXISTS idx_swaps_recipient ON swaps(recipient_address);
    CREATE INDEX IF NOT EXISTS idx_transactions_swap_id ON transactions(swap_id);
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