#!/usr/bin/env node

import { ethers } from "ethers";
import pkg from "@stellar/stellar-sdk";
const { Keypair, Networks } = pkg;

console.log("🔧 Generating Testnet Accounts for Production Setup\n");

// Generate Ethereum accounts (Sepolia)
console.log("📊 Ethereum Accounts (Sepolia Testnet):");
console.log("========================================");

for (let i = 1; i <= 3; i++) {
  const wallet = ethers.Wallet.createRandom();
  console.log(`\nResolver ${i} (${['Alpha', 'Beta', 'Gamma'][i-1]}):`);
  console.log(`  Address: ${wallet.address}`);
  console.log(`  Private Key: ${wallet.privateKey}`);
  console.log(`  Mnemonic: ${wallet.mnemonic?.phrase || 'N/A'}`);
}

// Generate Stellar accounts (Testnet)
console.log("\n\n⭐ Stellar Accounts (Testnet):");
console.log("===============================");

for (let i = 1; i <= 3; i++) {
  const keypair = Keypair.random();
  console.log(`\nResolver ${i} (${['Alpha', 'Beta', 'Gamma'][i-1]}):`);
  console.log(`  Address: ${keypair.publicKey()}`);
  console.log(`  Secret Key: ${keypair.secret()}`);
}

console.log("\n\n📝 Instructions:");
console.log("================");
console.log("1. Copy the Ethereum addresses to Sepolia faucet:");
console.log("   https://sepoliafaucet.com/");
console.log("   https://faucet.sepolia.dev/");
console.log("\n2. Copy the Stellar addresses to Stellar testnet faucet:");
console.log("   https://laboratory.stellar.org/#account-creator?network=test");
console.log("\n3. Update your .env file with the real private keys");
console.log("\n4. Fund each account with test tokens");
console.log("\n5. Test the complete workflow!");

console.log("\n\n🔗 Quick Links:");
console.log("===============");
console.log("• Sepolia Faucet: https://sepoliafaucet.com/");
console.log("• Stellar Testnet: https://laboratory.stellar.org/#account-creator?network=test");
console.log("• Sepolia Explorer: https://sepolia.etherscan.io/");
console.log("• Stellar Explorer: https://testnet.stellarchain.io/");