import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useWallet } from "../contexts/WalletContext.jsx";
import { useSwap } from "../contexts/SwapContext.jsx";

export default function SwapHistory() {
  const { ethWallet, stellarWallet } = useWallet();
  const { getSwapHistory } = useSwap();

  const [filter, setFilter] = useState("all");
  const [sortBy, setSortBy] = useState("created_at");

  // Get swap history for both wallets
  const ethHistory = getSwapHistory(ethWallet.address);
  const stellarHistory = getSwapHistory(stellarWallet.address);

  // Combine and deduplicate swaps
  const allSwaps = [
    ...(ethHistory.data?.swaps || []),
    ...(stellarHistory.data?.swaps || [])
  ].filter((swap, index, self) =>
    index === self.findIndex(s => s.id === swap.id)
  );

  // Filter swaps
  const filteredSwaps = allSwaps.filter(swap => {
    if (filter === "all") return true;
    if (filter === "completed") return swap.status === "completed";
    if (filter === "pending") return ["pending", "locked_eth", "locked_stellar"].includes(swap.status);
    if (filter === "failed") return ["failed", "refunded"].includes(swap.status);
    return true;
  });

  // Sort swaps
  const sortedSwaps = [...filteredSwaps].sort((a, b) => {
    switch (sortBy) {
      case "created_at":
        return new Date(b.created_at) - new Date(a.created_at);
      case "amount":
        return parseFloat(b.amount) - parseFloat(a.amount);
      case "status":
        return a.status.localeCompare(b.status);
      default:
        return 0;
    }
  });

  const formatAddress = (address) => {
    if (!address) return "N/A";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatAmount = (amount, decimals = 18) => {
    if (!amount) return "0";
    return (parseFloat(amount) / Math.pow(10, decimals)).toFixed(6);
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return "N/A";
    return new Date(timestamp * 1000).toLocaleString();
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "completed": return "bg-green-900/50 text-green-300 border-green-600";
      case "failed": return "bg-red-900/50 text-red-300 border-red-600";
      case "refunded": return "bg-yellow-900/50 text-yellow-300 border-yellow-600";
      case "pending": return "bg-blue-900/50 text-blue-300 border-blue-600";
      case "locked_eth": return "bg-purple-900/50 text-purple-300 border-purple-600";
      case "locked_stellar": return "bg-indigo-900/50 text-indigo-300 border-indigo-600";
      default: return "bg-gray-900/50 text-gray-300 border-gray-600";
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case "completed": return "✓";
      case "failed": return "✗";
      case "refunded": return "↺";
      case "pending": return "⏳";
      case "locked_eth": return "🔒";
      case "locked_stellar": return "🔒";
      default: return "?";
    }
  };

  const getStatusDescription = (status) => {
    switch (status) {
      case "completed": return "Swap completed successfully";
      case "failed": return "Swap failed";
      case "refunded": return "Funds refunded";
      case "pending": return "Waiting to begin";
      case "locked_eth": return "ETH locked, waiting for XLM";
      case "locked_stellar": return "XLM locked, ready to claim";
      default: return "Unknown status";
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Swap History</h1>
          <p className="text-gray-400 mt-1">
            View all your atomic swaps between Ethereum and Stellar
          </p>
        </div>
        <Link
          to="/swap"
          className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-6 py-3 rounded-lg font-medium transition-all duration-200"
        >
          New Swap
        </Link>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-lg p-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-white">{allSwaps.length}</p>
            <p className="text-sm text-gray-400">Total Swaps</p>
          </div>
        </div>

        <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-lg p-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-green-400">
              {allSwaps.filter(s => s.status === "completed").length}
            </p>
            <p className="text-sm text-gray-400">Completed</p>
          </div>
        </div>

        <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-lg p-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-yellow-400">
              {allSwaps.filter(s => ["pending", "locked_eth", "locked_stellar"].includes(s.status)).length}
            </p>
            <p className="text-sm text-gray-400">Pending</p>
          </div>
        </div>

        <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-lg p-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-red-400">
              {allSwaps.filter(s => ["failed", "refunded"].includes(s.status)).length}
            </p>
            <p className="text-sm text-gray-400">Failed/Refunded</p>
          </div>
        </div>
      </div>

      {/* Filters and Sorting */}
      <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-lg p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
          <div className="flex items-center space-x-4">
            <label className="text-sm font-medium text-gray-300">Filter:</label>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:border-blue-500 outline-none"
            >
              <option value="all">All Swaps</option>
              <option value="completed">Completed</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed/Refunded</option>
            </select>
          </div>

          <div className="flex items-center space-x-4">
            <label className="text-sm font-medium text-gray-300">Sort by:</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:border-blue-500 outline-none"
            >
              <option value="created_at">Date Created</option>
              <option value="amount">Amount</option>
              <option value="status">Status</option>
            </select>
          </div>
        </div>
      </div>

      {/* Swaps List */}
      <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-lg overflow-hidden">
        {ethHistory.isLoading || stellarHistory.isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="ml-3 text-gray-300">Loading swap history...</span>
          </div>
        ) : sortedSwaps.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-700/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Initiator
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Recipient
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {sortedSwaps.map((swap, index) => (
                  <tr key={swap.id} className="hover:bg-gray-700/30 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <span className="text-lg">{getStatusIcon(swap.status)}</span>
                        <div className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(swap.status)}`}>
                          {swap.status.replace("_", " ").toUpperCase()}
                        </div>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        {getStatusDescription(swap.status)}
                      </p>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-white">
                        <p className="font-medium">
                          {formatAmount(swap.amount)} ETH
                        </p>
                        <p className="text-gray-400">
                          ↔ {formatAmount(swap.amount, 7)} XLM
                        </p>
                      </div>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm">
                        <p className="text-white font-mono">{formatAddress(swap.initiator_address)}</p>
                        <p className="text-gray-400">Initiator</p>
                      </div>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm">
                        <p className="text-white font-mono">{formatAddress(swap.recipient_address)}</p>
                        <p className="text-gray-400">Recipient</p>
                      </div>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm">
                        <p className="text-white">{formatTimestamp(swap.created_at)}</p>
                        <p className="text-gray-400">
                          {Math.floor((Date.now() - new Date(swap.created_at * 1000)) / (1000 * 60 * 60 * 24))} days ago
                        </p>
                      </div>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap">
                      <Link
                        to={`/swap/${swap.id}`}
                        className="text-blue-400 hover:text-blue-300 text-sm font-medium"
                      >
                        View Details →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-gray-400 text-2xl">📊</span>
            </div>
            <h3 className="text-lg font-medium text-gray-300 mb-2">No swaps found</h3>
            <p className="text-gray-400 mb-4">
              {filter === "all"
                ? "You haven't performed any atomic swaps yet."
                : `No swaps match the "${filter}" filter.`
              }
            </p>
            <Link
              to="/swap"
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Start Your First Swap
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}