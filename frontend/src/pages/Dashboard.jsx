import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useWallet } from "../contexts/WalletContext.jsx";

export default function Dashboard() {
  const { ethWallet, stellarWallet, refreshBalances } = useWallet();

  // Get swap history for Ethereum wallet
  const ethHistory = useQuery({
    queryKey: ['swap-history', ethWallet.address],
    queryFn: async () => {
      if (!ethWallet.address) return { swaps: [], total: 0, completed: 0, pending: 0 };
      const response = await fetch(`http://localhost:3001/api/swap/history/${ethWallet.address}`);
      if (!response.ok) throw new Error('Failed to fetch ETH swap history');
      return response.json();
    },
    enabled: !!ethWallet.address,
    refetchInterval: 10000 // Poll every 10 seconds
  });

  // Get swap history for Stellar wallet
  const stellarHistory = useQuery({
    queryKey: ['swap-history', stellarWallet.address],
    queryFn: async () => {
      if (!stellarWallet.address) return { swaps: [], total: 0, completed: 0, pending: 0 };
      const response = await fetch(`http://localhost:3001/api/swap/history/${stellarWallet.address}`);
      if (!response.ok) throw new Error('Failed to fetch Stellar swap history');
      return response.json();
    },
    enabled: !!stellarWallet.address,
    refetchInterval: 10000 // Poll every 10 seconds
  });

  // Combine swap data from both wallets
  const combinedSwaps = [
    ...(ethHistory.data?.swaps || []),
    ...(stellarHistory.data?.swaps || [])
  ].filter((swap, index, self) =>
    index === self.findIndex(s => s.id === swap.id)
  );

  const formatAddress = (address) => {
    if (!address) return "Not Connected";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatAmount = (amount, decimals = 18) => {
    if (!amount) return "0";
    return (parseFloat(amount) / Math.pow(10, decimals)).toFixed(6);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "completed": return "text-green-400";
      case "failed": return "text-red-400";
      case "refunded": return "text-yellow-400";
      default: return "text-blue-400";
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case "completed": return "✓";
      case "failed": return "✗";
      case "refunded": return "↺";
      default: return "⏳";
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
      {/* Welcome Section */}
      <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-blue-500/30 rounded-xl p-6">
        <h1 className="text-3xl font-bold text-white mb-2">Welcome to Starlink</h1>
        <p className="text-gray-300 text-lg">
          The first trustless atomic swap between Ethereum and Stellar
        </p>
        <div className="mt-4 flex space-x-4">
          <Link
            to="/swap"
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-6 py-3 rounded-lg font-medium transition-all duration-200"
          >
            Start New Swap
          </Link>
          <button
            onClick={refreshBalances}
            className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
          >
            Refresh Balances
          </button>
        </div>
      </div>

      {/* Wallet Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Ethereum Wallet */}
        <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white">Ethereum Wallet</h2>
            <div className={`w-3 h-3 rounded-full ${ethWallet.isConnected ? 'bg-green-400' : 'bg-red-400'}`}></div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-sm text-gray-400">Address</label>
              <p className="text-white font-mono text-sm">{formatAddress(ethWallet.address)}</p>
            </div>

            <div>
              <label className="text-sm text-gray-400">Balance</label>
              <p className="text-2xl font-bold text-white">
                {parseFloat(ethWallet.balance || 0).toFixed(4)} ETH
              </p>
            </div>

            <div>
              <label className="text-sm text-gray-400">Network</label>
              <p className="text-white text-sm">
                {ethWallet.chainId === 11155111 ? "Sepolia Testnet" :
                 ethWallet.chainId === 1 ? "Ethereum Mainnet" :
                 ethWallet.chainId ? `Chain ID: ${ethWallet.chainId}` : "Not Connected"}
              </p>
            </div>
          </div>
        </div>

        {/* Stellar Wallet */}
        <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white">Stellar Wallet</h2>
            <div className={`w-3 h-3 rounded-full ${stellarWallet.isConnected ? 'bg-green-400' : 'bg-red-400'}`}></div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-sm text-gray-400">Address</label>
              <p className="text-white font-mono text-sm">{formatAddress(stellarWallet.address)}</p>
            </div>

            <div>
              <label className="text-sm text-gray-400">Balance</label>
              <p className="text-2xl font-bold text-white">
                {parseFloat(stellarWallet.balance || 0).toFixed(2)} XLM
              </p>
            </div>

            <div>
              <label className="text-sm text-gray-400">Network</label>
              <p className="text-white text-sm">Stellar Testnet</p>
            </div>
          </div>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-lg p-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-white">
              {combinedSwaps.length}
            </p>
            <p className="text-sm text-gray-400">Total Swaps</p>
          </div>
        </div>

        <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-lg p-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-green-400">
              {combinedSwaps.filter(s => s.status === "completed").length}
            </p>
            <p className="text-sm text-gray-400">Completed</p>
          </div>
        </div>

        <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-lg p-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-yellow-400">
              {combinedSwaps.filter(s => ["pending", "locked_eth", "locked_stellar"].includes(s.status)).length}
            </p>
            <p className="text-sm text-gray-400">Pending</p>
          </div>
        </div>

        <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-white">
            {ethWallet.isConnected && stellarWallet.isConnected ? "✅" : "⛔"}
          </p>
          <p className="text-sm text-gray-400">
            {ethWallet.isConnected && stellarWallet.isConnected
              ? "Ready to Swap"
              : "Connect Both Wallets"}
          </p>
        </div>
      </div>

      {/* Recent Swaps */}
      <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Recent Swaps</h2>
          <Link
            to="/history"
            className="text-blue-400 hover:text-blue-300 text-sm font-medium"
          >
            View All →
          </Link>
        </div>

        {ethHistory.isLoading || stellarHistory.isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="ml-2 text-gray-300">Loading swaps...</span>
          </div>
        ) : combinedSwaps.length > 0 ? (
          <div className="space-y-3">
            {combinedSwaps.slice(0, 5).map((swap, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-700/30 rounded-lg">
                <div className="flex items-center space-x-3">
                  <span className={`text-lg ${getStatusColor(swap.status)}`}>
                    {getStatusIcon(swap.status)}
                  </span>
                  <div>
                    <p className="text-white font-medium">
                      {formatAmount(swap.eth_amount)} ETH ↔ {formatAmount(swap.xlm_amount, 7)} XLM
                    </p>
                    <p className="text-sm text-gray-400">
                      {new Date(swap.created_at * 1000).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`text-sm font-medium ${getStatusColor(swap.status)}`}>
                    {swap.status.replace("_", " ").toUpperCase()}
                  </span>
                  <p className="text-xs text-gray-400">
                    ID: {swap.id.slice(0, 8)}...
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-gray-400 mb-4">No swaps yet</p>
            <Link
              to="/swap"
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Start Your First Swap
            </Link>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          to="/swap"
          className="bg-gradient-to-r from-blue-600/20 to-blue-800/20 border border-blue-500/30 rounded-lg p-6 hover:from-blue-600/30 hover:to-blue-800/30 transition-all duration-200"
        >
          <div className="text-center">
            <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center mx-auto mb-3">
              <span className="text-white text-xl">↔</span>
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">New Swap</h3>
            <p className="text-gray-400 text-sm">Start a new atomic swap between ETH and XLM</p>
          </div>
        </Link>

        <Link
          to="/history"
          className="bg-gradient-to-r from-purple-600/20 to-purple-800/20 border border-purple-500/30 rounded-lg p-6 hover:from-purple-600/30 hover:to-purple-800/30 transition-all duration-200"
        >
          <div className="text-center">
            <div className="w-12 h-12 bg-purple-600 rounded-lg flex items-center justify-center mx-auto mb-3">
              <span className="text-white text-xl">📊</span>
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Swap History</h3>
            <p className="text-gray-400 text-sm">View all your past and current swaps</p>
          </div>
        </Link>

        <div className="bg-gradient-to-r from-green-600/20 to-green-800/20 border border-green-500/30 rounded-lg p-6">
          <div className="text-center">
            <div className="w-12 h-12 bg-green-600 rounded-lg flex items-center justify-center mx-auto mb-3">
              <span className="text-white text-xl">🔗</span>
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Connect Wallets</h3>
            <p className="text-gray-400 text-sm">Connect your MetaMask and Freighter wallets</p>
          </div>
        </div>
      </div>
    </div>
  );
}