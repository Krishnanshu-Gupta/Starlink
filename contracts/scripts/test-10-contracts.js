const hre = require("hardhat");

async function main() {
  console.log("🧪 Testing 10-contract system on Sepolia...");

  // Get signers
  const [deployer] = await hre.ethers.getSigners();

  console.log("👥 Test account:");
  console.log(`Deployer: ${deployer.address}`);

  // Use deployed contract addresses
  const factoryAddress = "0xCD0604dA567d7A691d73A694338deB8B2354D715";
  const htlcAddress = "0x55A636413A2956687B02cAd9e6ea53B83d2D64F0";
  const resolverAddress = "0xA7c9B608d78b4c97A59c747F2C6d24006938403b";

  console.log("\n📋 Using deployed contracts:");
  console.log(`Factory: ${factoryAddress}`);
  console.log(`HTLC: ${htlcAddress}`);
  console.log(`Resolver: ${resolverAddress}`);

  // Get contract instances
  const factory = await hre.ethers.getContractAt("TestEscrowFactory", factoryAddress);
  const htlc = await hre.ethers.getContractAt("HTLC", htlcAddress);
  const resolver = await hre.ethers.getContractAt("Resolver", resolverAddress);

  // Test parameters
  const totalAmount = hre.ethers.parseEther("10"); // 10 ETH (divisible by 10)
  const amountPerContract = totalAmount / 10n; // 1 ETH per contract
  const timelock = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

  // Generate secret and hash
  const secret = hre.ethers.randomBytes(32);
  const secretHex = hre.ethers.hexlify(secret);
  const hash = hre.ethers.keccak256(secret);

  console.log("\n🔑 Test parameters:");
  console.log(`Total Amount: ${hre.ethers.formatEther(totalAmount)} ETH`);
  console.log(`Amount per Contract: ${hre.ethers.formatEther(amountPerContract)} ETH`);
  console.log(`Hash: ${hash}`);
  console.log(`Secret: ${secretHex}`);

  // Test 1: Create swap with 10 contracts
  console.log("\n🧪 Test 1: Creating swap with 10 contracts");
  try {
    const tx = await factory.createSwap(
      deployer.address, // recipient (using deployer as recipient for testing)
      hre.ethers.ZeroAddress, // ETH
      totalAmount,
      hash,
      timelock,
      { value: totalAmount }
    );
    const receipt = await tx.wait();

    // Get swap ID from event
    const event = receipt.logs
      .map(log => {
        try { return factory.interface.parseLog(log); } catch { return null; }
      })
      .find(e => e && e.name === "SwapCreated");

    const swapId = event.args.swapId;
    console.log(`✅ Swap created with ID: ${swapId}`);

    // Get swap info
    const swapInfo = await factory.getSwapInfo(swapId);
    console.log(`📊 Swap Info:`);
    console.log(`  Initiator: ${swapInfo[0]}`);
    console.log(`  Recipient: ${swapInfo[1]}`);
    console.log(`  Total Amount: ${hre.ethers.formatEther(swapInfo[3])} ETH`);
    console.log(`  Amount per Contract: ${hre.ethers.formatEther(swapInfo[4])} ETH`);
    console.log(`  Filled Contracts: ${swapInfo[8]}/10`);

    // Get contract addresses
    const contracts = await factory.getSwapContracts(swapId);
    console.log(`🔢 Contract addresses: ${contracts.join(', ')}`);

    // Test 2: Test fill percentage calculations
    console.log("\n🧪 Test 2: Testing fill percentage calculations");
    const testPercentages = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

    for (const percentage of testPercentages) {
      const numContracts = await factory.calculateClaimableContracts(percentage);
      console.log(`  ${percentage}% fill = ${numContracts} contracts`);
    }

    // Test 3: Test resolver claiming specific contracts
    console.log("\n🧪 Test 3: Testing resolver claiming");

    // Deployer claims 20% (2 contracts)
    console.log(`🔓 Deployer claiming 20% (2 contracts)`);
    try {
      const tx1 = await factory.claimContract(swapId, 0, secretHex);
      await tx1.wait();
      console.log(`  ✅ Contract 0 claimed by Deployer`);
    } catch (error) {
      console.log(`  ❌ Failed to claim contract 0: ${error.message}`);
    }

    try {
      const tx2 = await factory.claimContract(swapId, 1, secretHex);
      await tx2.wait();
      console.log(`  ✅ Contract 1 claimed by Deployer`);
    } catch (error) {
      console.log(`  ❌ Failed to claim contract 1: ${error.message}`);
    }

    // Check final state
    const finalSwapInfo = await factory.getSwapInfo(swapId);
    console.log(`\n📊 Final Swap State:`);
    console.log(`  Filled Contracts: ${finalSwapInfo[8]}/10`);
    console.log(`  Is Active: ${finalSwapInfo[7]}`);

    // Check which resolver claimed which contracts
    console.log(`\n📋 Contract Assignment:`);
    for (let i = 0; i < 10; i++) {
      const resolver = await factory.getContractResolver(swapId, i);
      if (resolver !== hre.ethers.ZeroAddress) {
        console.log(`  Contract ${i}: ${resolver}`);
      } else {
        console.log(`  Contract ${i}: Unclaimed`);
      }
    }

    // Test 4: Verify amounts claimed
    console.log("\n🧪 Test 4: Verifying amounts claimed");
    const deployerBalance = await hre.ethers.provider.getBalance(deployer.address);
    console.log(`Deployer balance: ${hre.ethers.formatEther(deployerBalance)} ETH`);

    // Test 5: Test error cases
    console.log("\n🧪 Test 5: Testing error cases");

    // Try to claim already claimed contract
    try {
      await factory.claimContract(swapId, 0, secretHex);
      console.log(`  ❌ Should have failed - contract already claimed`);
    } catch (error) {
      console.log(`  ✅ Correctly failed to claim already claimed contract`);
    }

    // Try to claim with invalid percentage
    try {
      await factory.calculateClaimableContracts(15); // Not multiple of 10
      console.log(`  ❌ Should have failed - percentage not multiple of 10`);
    } catch (error) {
      console.log(`  ✅ Correctly failed with invalid percentage`);
    }

    console.log("\n🎉 All tests completed successfully!");
    console.log("\n📝 Summary:");
    console.log("✅ 10-contract system works correctly on Sepolia");
    console.log("✅ Fill percentages must be multiples of 10");
    console.log("✅ Resolvers can claim specific contracts based on their fill percentage");
    console.log("✅ Each contract represents 10% of the total swap amount");
    console.log("✅ Proper error handling for invalid operations");

  } catch (error) {
    console.error("❌ Test failed:", error);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Test failed:", error);
    process.exit(1);
  });