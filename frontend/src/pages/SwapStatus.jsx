import React from "react";
import { useParams } from "react-router-dom";
import { useSwap } from "../contexts/SwapContext.jsx";
import { useWallet } from "../contexts/WalletContext.jsx";
import { Link } from "react-router-dom";

export default function SwapStatus() {
  const { swapId } = useParams();
  const { getSwapStatus, claimMutation, refundMutation } = useSwap();
  const { ethWallet, stellarWallet } = useWallet();

  const { data: swapData, isLoading, error } = getSwapStatus(swapId);

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-xl p-6">
          <div className="flex items-center justify-center space-x-2">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-gray-300">Loading swap status...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error || !swapData) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-xl p-6">
          <div className="text-center">
            <h2 className="text-xl font-bold text-red-400 mb-2">Swap Not Found</h2>
            <p className="text-gray-400 mb-4">The swap you're looking for doesn't exist or has been removed.</p>
            <Link
              to="/swap"
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Start New Swap
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { swap, transactions, status, canClaim, canRefund } = swapData;

  const getStepStatus = (step) => {
    const stepOrder = ["pending", "locked_eth", "locked_stellar", "claimed_stellar", "claimed_eth", "completed"];
    const currentIndex = stepOrder.indexOf(status);
    const stepIndex = stepOrder.indexOf(step);

    if (stepIndex < currentIndex) return "completed";
    if (stepIndex === currentIndex) return "current";
    return "pending";
  };

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

  const handleClaim = async () => {
    try {
      await claimMutation.mutateAsync({
        swapId: swap.id,
        secretHex: swap.secret_hex,
        chain: "stellar"
      });
    } catch (error) {
      console.error("Failed to claim:", error);
    }
  };

  const handleRefund = async () => {
    try {
      await refundMutation.mutateAsync({
        swapId: swap.id,
        chain: "ethereum"
      });
    } catch (error) {
      console.error("Failed to refund:", error);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-xl p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Swap Status</h1>
            <p className="text-gray-400">ID: {swap.id}</p>
          </div>
          <div className={`px-3 py-1 rounded-full text-sm font-medium ${
            status === "completed" ? "bg-green-900/50 text-green-300" :
            status === "failed" ? "bg-red-900/50 text-red-300" :
            "bg-yellow-900/50 text-yellow-300"
          }`}>
            {status.replace("_", " ").toUpperCase()}
          </div>
        </div>

        {/* Progress Timeline */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-4">Swap Progress</h2>
          <div className="space-y-4">
            {[
              { step: "pending", label: "Swap Initiated", description: "Swap created and ready to begin" },
              { step: "locked_eth", label: "ETH Locked", description: "Ethereum funds locked in HTLC" },
              { step: "locked_stellar", label: "XLM Locked", description: "Stellar funds locked in escrow" },
              { step: "claimed_stellar", label: "XLM Claimed", description: "Stellar funds claimed successfully" },
              { step: "claimed_eth", label: "ETH Claimed", description: "Ethereum funds claimed automatically" },
              { step: "completed", label: "Swap Completed", description: "Atomic swap completed successfully" }
            ].map((item, index) => {
              const stepStatus = getStepStatus(item.step);
              return (
                <div key={item.step} className="flex items-center space-x-4">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    stepStatus === "completed" ? "bg-green-600" :
                    stepStatus === "current" ? "bg-blue-600" :
                    "bg-gray-600"
                  }`}>
                    {stepStatus === "completed" ? (
                      <span className="text-white text-sm">✓</span>
                    ) : stepStatus === "current" ? (
                      <div className="w-3 h-3 bg-white rounded-full animate-pulse"></div>
                    ) : (
                      <span className="text-gray-400 text-sm">{index + 1}</span>
                    )}
                  </div>
                  <div className="flex-1">
                    <h3 className={`font-medium ${
                      stepStatus === "completed" ? "text-green-400" :
                      stepStatus === "current" ? "text-blue-400" :
                      "text-gray-400"
                    }`}>
                      {item.label}
                    </h3>
                    <p className="text-sm text-gray-500">{item.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Swap Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-gray-700/50 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-white mb-3">Swap Details</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Initiator:</span>
                <span className="text-white font-mono">{formatAddress(swap.initiator_address)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Recipient:</span>
                <span className="text-white font-mono">{formatAddress(swap.recipient_address)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">ETH Amount:</span>
                <span className="text-white">{formatAmount(swap.amount)} ETH</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Timelock:</span>
                <span className="text-white">{formatTimestamp(swap.timelock)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Created:</span>
                <span className="text-white">{formatTimestamp(swap.created_at)}</span>
              </div>
            </div>
          </div>

          <div className="bg-gray-700/50 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-white mb-3">Transaction Hashes</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">ETH Lock:</span>
                <span className="text-white font-mono">{formatAddress(swap.ethereum_tx_hash)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">XLM Lock:</span>
                <span className="text-white font-mono">{formatAddress(swap.stellar_tx_hash)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">XLM Claim:</span>
                <span className="text-white font-mono">{formatAddress(swap.claim_tx_hash)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">ETH Claim:</span>
                <span className="text-white font-mono">{formatAddress(swap.ethereum_swap_id)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Transaction History */}
        {transactions && transactions.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-white mb-4">Transaction History</h2>
            <div className="bg-gray-700/50 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-600/50">
                  <tr>
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-300">Chain</th>
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-300">Type</th>
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-300">Status</th>
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-300">Hash</th>
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-300">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx, index) => (
                    <tr key={index} className="border-t border-gray-600">
                      <td className="px-4 py-2 text-sm text-white">{tx.chain}</td>
                      <td className="px-4 py-2 text-sm text-white">{tx.tx_type}</td>
                      <td className="px-4 py-2">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          tx.status === "confirmed" ? "bg-green-900/50 text-green-300" :
                          tx.status === "failed" ? "bg-red-900/50 text-red-300" :
                          "bg-yellow-900/50 text-yellow-300"
                        }`}>
                          {tx.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-sm font-mono text-gray-300">{formatAddress(tx.tx_hash)}</td>
                      <td className="px-4 py-2 text-sm text-gray-300">{formatTimestamp(tx.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-between">
          <Link
            to="/swap"
            className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            New Swap
          </Link>

          <div className="flex space-x-3">
            {canClaim && (
              <button
                onClick={handleClaim}
                disabled={claimMutation.isPending}
                className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors"
              >
                {claimMutation.isPending ? "Claiming..." : "Claim XLM"}
              </button>
            )}

            {canRefund && (
              <button
                onClick={handleRefund}
                disabled={refundMutation.isPending}
                className="bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors"
              >
                {refundMutation.isPending ? "Refunding..." : "Refund ETH"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}