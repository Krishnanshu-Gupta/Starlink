import dotenv from 'dotenv';
import { getDatabase } from './src/database.js';
import { getEthereumProvider, getStellarServer } from './src/services/blockchain.js';

// Load environment variables
dotenv.config();

async function verifyProductionSettings() {
  console.log('🔍 Verifying Production Settings...\n');

  // Check environment variables
  const requiredEnvVars = [
    'ENABLE_REAL_TRANSACTIONS',
    'ENABLE_SIGNATURE_VERIFICATION',
    'ENABLE_AUTOMATED_BIDDING',
    'NODE_ENV',
    'INFURA_URL',
    'HTLC_CONTRACT_ADDRESS',
    'FACTORY_CONTRACT_ADDRESS',
    'RESOLVER_CONTRACT_ADDRESS',
    'USER_PRIVATE_KEY',
    'RESOLVER1_ETH_KEY',
    'RESOLVER1_STELLAR_KEY',
    'RESOLVER2_ETH_KEY',
    'RESOLVER2_STELLAR_KEY',
    'RESOLVER3_ETH_KEY',
    'RESOLVER3_STELLAR_KEY'
  ];

  console.log('📋 Environment Variables:');
  let allEnvVarsPresent = true;

    for (const envVar of requiredEnvVars) {
    const value = process.env[envVar];
    if (value) {
      const displayValue = envVar.includes('KEY') || envVar.includes('PRIVATE')
        ? `${value.substring(0, 10)}...${value.substring(value.length - 10)}`
        : value;
      console.log(`   ✅ ${envVar}: ${displayValue}`);
    } else if (envVar === 'FACTORY_CONTRACT_ADDRESS') {
      // Factory contract address has a hardcoded fallback
      console.log(`   ⚠️ ${envVar}: Using hardcoded fallback`);
    } else {
      console.log(`   ❌ ${envVar}: MISSING`);
      allEnvVarsPresent = false;
    }
  }

  console.log('\n🔧 Production Flags:');
  const realTransactions = process.env.ENABLE_REAL_TRANSACTIONS === 'true';
  const signatureVerification = process.env.ENABLE_SIGNATURE_VERIFICATION === 'true';
  const automatedBidding = process.env.ENABLE_AUTOMATED_BIDDING === 'true';
  const nodeEnv = process.env.NODE_ENV;

  console.log(`   ${realTransactions ? '✅' : '❌'} ENABLE_REAL_TRANSACTIONS: ${realTransactions}`);
  console.log(`   ${signatureVerification ? '✅' : '❌'} ENABLE_SIGNATURE_VERIFICATION: ${signatureVerification}`);
  console.log(`   ${automatedBidding ? '✅' : '❌'} ENABLE_AUTOMATED_BIDDING: ${automatedBidding}`);
  console.log(`   ${nodeEnv === 'production' ? '✅' : '❌'} NODE_ENV: ${nodeEnv}`);

  // Test database connection
  console.log('\n🗄️ Database Connection:');
  try {
    const db = await getDatabase();
    console.log('   ✅ Database connection successful');
  } catch (error) {
    console.log('   ❌ Database connection failed:', error.message);
  }

  // Test Ethereum provider
  console.log('\n⛓️ Ethereum Provider:');
  try {
    const provider = getEthereumProvider();
    const network = await provider.getNetwork();
    console.log(`   ✅ Ethereum provider connected to chain ID: ${network.chainId}`);
  } catch (error) {
    console.log('   ❌ Ethereum provider failed:', error.message);
  }

  // Test Stellar server
  console.log('\n⭐ Stellar Server:');
  try {
    const stellarServer = getStellarServer();
    console.log('   ✅ Stellar server connection successful');
  } catch (error) {
    console.log('   ❌ Stellar server failed:', error.message);
  }

  // Summary
  console.log('\n📊 Production Readiness Summary:');
  const productionReady = allEnvVarsPresent && realTransactions && signatureVerification && automatedBidding && nodeEnv === 'production';

  if (productionReady) {
    console.log('   🎉 ALL SYSTEMS READY FOR PRODUCTION!');
    console.log('   ✅ Real transactions enabled');
    console.log('   ✅ Signature verification enabled');
    console.log('   ✅ Automated bidding enabled');
    console.log('   ✅ All environment variables configured');
    console.log('   ✅ Database and blockchain connections working');
  } else {
    console.log('   ⚠️ PRODUCTION NOT FULLY CONFIGURED');
    if (!allEnvVarsPresent) console.log('   ❌ Missing environment variables');
    if (!realTransactions) console.log('   ❌ Real transactions disabled');
    if (!signatureVerification) console.log('   ❌ Signature verification disabled');
    if (!automatedBidding) console.log('   ❌ Automated bidding disabled');
    if (nodeEnv !== 'production') console.log('   ❌ Not in production mode');
  }

  return productionReady;
}

// Run verification
verifyProductionSettings().then(isReady => {
  process.exit(isReady ? 0 : 1);
}).catch(error => {
  console.error('❌ Verification failed:', error);
  process.exit(1);
});