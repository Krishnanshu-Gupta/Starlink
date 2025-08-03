// contracts/hardhat.config.js
require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  paths: {
    sources: "./src"
  },
  networks: {
    sepolia: {
      url: process.env.INFURA_URL,
      accounts: [process.env.PRIVATE_KEY],
      chainId: 11155111,
      gasPrice: 20000000000, // 20 gwei
      gas: 3000000
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337
    }
  },
  mocha: {
    timeout: 40000
  }
};
