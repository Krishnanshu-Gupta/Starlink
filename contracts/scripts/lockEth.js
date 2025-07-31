const hre = require("hardhat");
const { parseEther } = hre.ethers;
const fs = require("fs");
const path = require("path");

async function main() {
  const CONTRACT_ADDR = fs.readFileSync(path.resolve(__dirname, "../../htlc_address.txt"), "utf8").trim();
  const RECIPIENT_ADDR = "0x04Eca0Fb63db38BB051Cbf23c4485ce9c405D3AF";
  const INITIATOR_ADDR = "0x07d09FECEc12928C6eaeFFc87fB86D1160C3A690";

  const htlc = await hre.ethers.getContractAt("HTLC", CONTRACT_ADDR);
  const swapInfo = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../swap_info.json"), "utf8"));

  const hash = "0x" + swapInfo.hash_hex;
  const timelock = Math.floor(Date.now() / 1000) + 600; // 10 min from now

  const tx = await htlc.lockETH(RECIPIENT_ADDR, hash, timelock, {
    value: parseEther("0.01"),
  });

  const receipt = await tx.wait();
  const event = receipt.logs
    .map((log) => {
      try {
        return htlc.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((e) => e && e.name === "Locked");

  fs.writeFileSync(
    path.resolve(__dirname, "../../eth_lock.json"),
    JSON.stringify({
      initiator: INITIATOR_ADDR,
      recipient: RECIPIENT_ADDR,
      token: "0x0000000000000000000000000000000000000000", // ETH placeholder
      amount: parseEther("0.01").toString(),
      timelock,
      contract: CONTRACT_ADDR,
    }, null, 2)
  );

  console.log("Swap locked, swapId:", event?.args?.swapId);
}

main();
