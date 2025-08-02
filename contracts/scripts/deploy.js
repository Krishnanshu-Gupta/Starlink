// contracts/scripts/deploy.js  (CommonJS)

const fs = require("fs");
const hre = require("hardhat");

async function main() {
  const HTLC     = await hre.ethers.getContractFactory("HTLC");
  const Factory  = await hre.ethers.getContractFactory("TestEscrowFactory");
  const Resolver = await hre.ethers.getContractFactory("Resolver");

  const htlc     = await HTLC.deploy();
  const factory  = await Factory.deploy();
  const resolver = await Resolver.deploy();

  await Promise.all([htlc.waitForDeployment(), factory.waitForDeployment(), resolver.waitForDeployment()]);

  console.log("HTLC     :", htlc.target);
  console.log("Factory  :", factory.target);
  console.log("Resolver :", resolver.target);

  fs.writeFileSync("../htlc_address.txt",     htlc.target);
  fs.writeFileSync("../resolver_address.txt", resolver.target);
}

main().catch((e) => { console.error(e); process.exit(1); });
