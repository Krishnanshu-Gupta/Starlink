import { ethers } from "ethers";
import fs from "fs";

export default async function ethClaim(preimageBytes) {
  const swap = JSON.parse(fs.readFileSync("../eth_lock.json"));
  const abi = JSON.parse(fs.readFileSync("../contracts/artifacts/contracts/HTLC.sol/HTLC.json")).abi;

  const provider = new ethers.JsonRpcProvider(process.env.INFURA_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const htlc = new ethers.Contract(swap.contract, abi, wallet);

  const swapId = ethers.keccak256(ethers.solidityPacked([
    "address","address","address","uint256","bytes32","uint256"
  ], [swap.initiator, swap.recipient, swap.token, swap.amount, "0x"+process.env.HASH_HEX, swap.timelock]));

  const tx = await htlc.claim(swapId, "0x" + Buffer.from(preimageBytes).toString("hex"));
  console.log("[ethClaim] sent:", tx.hash);
  await tx.wait();
  console.log("[ethClaim] confirmed!");
}