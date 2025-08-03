# Starlink 🌠  
Next-generation, trustless cross-chain swap protocol bridging **Ethereum** and **Stellar**, inspired by **1inch Fusion+**. Starlink delivers atomic swaps with no wrapped tokens, no custodians, and no hidden intermediaries.

---

## ✨ Core Innovations

| Feature | What It Does | Why It Matters |
|---------|--------------|----------------|
| **10-Contract HTLC Sharding** | Splits every swap into 10 identical HTLCs (each 10 % of total). | Enables partial fills and parallel resolver participation. |
| **Dutch-Auction Resolver Marketplace** | Off-chain bidders compete as the price decays. | Drives down user costs and boosts liquidity. |
| **Multi-Resolver Support** | Several resolvers can claim different slices of the same swap. | Improves throughput and spreads risk. |
| **Atomic Cross-Chain Execution** | Same SHA-256 hashlock and synchronized timelocks on both chains. | Either both sides settle or both refund—no exceptions. |
| **Native Assets Only** | ETH and XLM lock in native HTLC contracts. | Eliminates custodial and wrapper risk. |
| **Real-Time Settlement** | Preimage reveal on the first chain triggers instant claim on the second. | Near-instant cross-chain finality. |

> **Scalable Sharding**  
> Tune the shard count to 100 or even thousands for large trades, lowering gas per fill and letting dozens of resolvers bid simultaneously.

---

## 🏗️ Architecture

### 1. Smart-Contract Layer (Solidity on Sepolia)

| Contract | Role |
|----------|------|
| `HTLC.sol` | Standard hash-timelock contract (lock, claim, refund). |
| `HTLCFactory.sol` | Deploys N HTLC instances per swap (default 10). |
| `Resolver.sol` | Tracks off-chain bids and assigns tickets. |
| `IERC20.sol` | Minimal ERC-20 interface for future token support. |

### 2. Backend (Node + Express)

- **REST API** — `/swap/initiate`, `/swap/fill`, `/swap/status`, `/swap/refund`.  
- **SQLite** — persistent state for every parent swap and its sub-HTLCs.  
- **Dutch-Auction Engine** — computes live price curve.  
- **Resolver Bots** — monitor open swaps, post XLM HTLCs, and claim ETH once preimage is seen.  
- **Relayer Watchers**  
  - `stellarWatcher.js` (XLM → ETH)  
  - `ethWatcher.js` (ETH → XLM)

### 3. Frontend (React + Vite)

- **Wallet Hooks** — MetaMask (Ethereum) and Freighter or Albedo (Stellar).  
- **Swap Dashboard** — live progress bars for each HTLC ticket.  
- **Resolver Chips** — shows which resolver filled which percent.  
- **Tailwind UI** — sleek, responsive, and status-aware.

---

## 🔄 Swap Flow (ETH → XLM example)

1. **User** calls `/swap/initiate` with amount and desired rate.  
2. **Factory** deploys 10 HTLCs on Sepolia holding ETH.  
3. **Backend** broadcasts a Dutch-auction order.  
4. **Resolvers** watch price decay and post matching XLM HTLCs on Stellar.  
5. **User** reveals preimage when first XLM arrives — all remaining resolvers now claim ETH with that preimage.  
6. **Timeouts** guarantee refunds if any side fails.

*The opposite flow (XLM → ETH) is symmetrical and planned for v1.1.*

---

## 🗂️ Repository Layout

- contracts/ Solidity sources and Hardhat tests
- backend/ Node API, resolver bots, relayer watchers
- frontend/ React UI (Vite + Tailwind)

### Prerequisites
- Node 18+
- Yarn or npm
- Foundry or Hardhat CLI
- MetaMask (Sepolia ETH) and Freighter (Stellar XLM)
