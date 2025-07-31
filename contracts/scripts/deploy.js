const hre = require("hardhat");
const fs  = require("fs");

async function main() {
  const HTLC = await hre.ethers.getContractFactory("HTLC");
  const htlc = await HTLC.deploy();                // returns Contract (not yet mined)

  await htlc.waitForDeployment();                  // v6 replacement for .deployed()
  const addr = await htlc.getAddress();            // v6 replacement for .address
  console.log("HTLC deployed to:", addr);

  // Persist ABI & address for relayer / lock script
  const abi = (await hre.artifacts.readArtifact("HTLC")).abi;
  fs.writeFileSync("../htlc_abi.json", JSON.stringify(abi, null, 2));
  fs.writeFileSync("../htlc_address.txt", addr);
}

main().catch((err) => { console.error(err); process.exit(1); });
