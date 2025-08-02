// contracts/scripts/lockEth.js  (CommonJS)

const fs   = require("fs");
const path = require("path");
const hre  = require("hardhat");
require("dotenv").config();

async function main() {
  // ---------- read inputs ----------
  const swap          = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../swap_info.json")));
  const contractAddr  = fs.readFileSync(path.resolve(__dirname, "../../htlc_address.txt"), "utf8").trim();
  const resolverAddr  = fs.readFileSync(path.resolve(__dirname, "../../resolver_address.txt"), "utf8").trim();
  const recipient     = process.env.RECIPIENT_ETH_ADDR;
  const hash          = "0x" + swap.hash_hex;
  const timelock      = Math.floor(Date.now() / 1000) + 600;   // 10 minutes

  // ---------- hardhat / ethers ----------
  const { ethers } = hre;
  const [signer]   = await ethers.getSigners();

  const htlc     = await ethers.getContractAt("HTLC",     contractAddr, signer);
  const resolver = await ethers.getContractAt("Resolver", resolverAddr, signer);

  // ---------- lock ETH ----------
  const valueWei = ethers.parseEther("0.01");
  console.log("Locking 0.01 ETH into HTLC…");
  await (await htlc.lockETH(recipient, hash, timelock, { value: valueWei })).wait();

  // ---------- open swap record on Resolver ----------
  console.log("Opening swap record on Resolver…");
  const openTx = await (await resolver.openSwap(contractAddr, 10001, valueWei, hash, timelock)).wait();

  // parse SwapOpened event
  const id = openTx.logs
    .map((l) => {
      try { return resolver.interface.parseLog(l); } catch { return null; }
    })
    .find((e) => e && e.name === "SwapOpened").args.id;

  // ---------- persist for backend ----------
  fs.writeFileSync(
    path.resolve(__dirname, "../../eth_lock.json"),
    JSON.stringify({ swapId: id, timelock, hash_hex: swap.hash_hex }, null, 2)
  );

  console.log("✅ SwapId:", id);
}

main().catch((e) => { console.error(e); process.exit(1); });
