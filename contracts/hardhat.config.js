/** @type import('hardhat/config').HardhatUserConfig */

require("@nomicfoundation/hardhat-toolbox");

module.exports = {
  solidity: "0.8.20",
  networks: {
  sepolia: {
    url: "https://sepolia.infura.io/v3/04944e1b094c4f93ad909a10bcff6803",
    accounts: ["aaa27dbba6cc8ae54797318f141670cd40f37a50282d32499d889b4cd5546441"]
  }
}
};
