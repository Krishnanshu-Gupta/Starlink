// contracts/scripts/deploy.js  (CommonJS)

const hre = require("hardhat");

async function main() {
  console.log("🚀 Deploying contracts...");

  // Deploy HTLC contract
  console.log("📋 Deploying HTLC contract...");
  const HTLC = await hre.ethers.getContractFactory("HTLC");
  const htlc = await HTLC.deploy();
  await htlc.waitForDeployment();
  const htlcAddress = await htlc.getAddress();
  console.log(`✅ HTLC deployed to: ${htlcAddress}`);

  // Deploy Resolver contract
  console.log("📋 Deploying Resolver contract...");
  const Resolver = await hre.ethers.getContractFactory("Resolver");
  const resolver = await Resolver.deploy();
  await resolver.waitForDeployment();
  const resolverAddress = await resolver.getAddress();
  console.log(`✅ Resolver deployed to: ${resolverAddress}`);

  // Deploy TestEscrowFactory contract
  console.log("📋 Deploying TestEscrowFactory contract...");
  const TestEscrowFactory = await hre.ethers.getContractFactory("TestEscrowFactory");
  const factory = await TestEscrowFactory.deploy();
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log(`✅ TestEscrowFactory deployed to: ${factoryAddress}`);

  console.log("\n📊 Deployment Summary:");
  console.log(`HTLC Contract: ${htlcAddress}`);
  console.log(`Resolver Contract: ${resolverAddress}`);
  console.log(`TestEscrowFactory Contract: ${factoryAddress}`);

  // Save deployment addresses to a file
  const fs = require('fs');
  const deploymentInfo = {
    network: hre.network.name,
    contracts: {
      HTLC: htlcAddress,
      Resolver: resolverAddress,
      TestEscrowFactory: factoryAddress
    },
    deploymentTime: new Date().toISOString()
  };

  fs.writeFileSync(
    'deployment-info.json',
    JSON.stringify(deploymentInfo, null, 2)
  );

  console.log("\n💾 Deployment info saved to deployment-info.json");

  // Verify contracts on Etherscan (if not on local network)
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    console.log("\n🔍 Verifying contracts on Etherscan...");

    try {
      await hre.run("verify:verify", {
        address: htlcAddress,
        constructorArguments: [],
      });
      console.log("✅ HTLC contract verified");
    } catch (error) {
      console.log("⚠️ HTLC verification failed:", error.message);
    }

    try {
      await hre.run("verify:verify", {
        address: resolverAddress,
        constructorArguments: [],
      });
      console.log("✅ Resolver contract verified");
    } catch (error) {
      console.log("⚠️ Resolver verification failed:", error.message);
    }

    try {
      await hre.run("verify:verify", {
        address: factoryAddress,
        constructorArguments: [],
      });
      console.log("✅ TestEscrowFactory contract verified");
    } catch (error) {
      console.log("⚠️ TestEscrowFactory verification failed:", error.message);
    }
  }

  console.log("\n🎉 Deployment completed successfully!");
  console.log("\n📝 Next steps:");
  console.log("1. Update your backend environment variables with the new contract addresses");
  console.log("2. Test the 10-contract system with a small amount");
  console.log("3. Verify that resolvers can claim specific contracts based on their fill percentage");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
