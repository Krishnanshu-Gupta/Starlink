import React, { useState, useEffect } from "react";
import { useWallet } from "../contexts/WalletContext.jsx";
import { useSwap } from "../contexts/SwapContext.jsx";
import SwapStatus from "./SwapStatus.jsx";

export default function SwapInterface() {
  const { ethWallet, stellarWallet } = useWallet();
  const {
    currentSwap,
    swapStep,
    initiateSwapMutation,
    lockEthMutation,
    lockXlmMutation,
    claimMutation,
    validateSwapParams,
    calculateExchangeRate,
    resetSwap
  } = useSwap();

  const [formData, setFormData] = useState({
    ethAmount: "",
    xlmAmount: "",
    timelockMinutes: 30
  });

  const [errors, setErrors] = useState([]);
  const [exchangeRate, setExchangeRate] = useState(null);

  // Calculate exchange rate when amounts change
  useEffect(() => {
    if (formData.ethAmount && formData.xlmAmount) {
      const rate = calculateExchangeRate(formData.ethAmount, formData.xlmAmount);
      setExchangeRate(rate);
    } else {
      setExchangeRate(null);
    }
  }, [formData.ethAmount, formData.xlmAmount, calculateExchangeRate]);

  // Validate form data
  useEffect(() => {
    const validationErrors = validateSwapParams(
      formData.ethAmount,
      formData.xlmAmount,
      formData.timelockMinutes
    );
    setErrors(validationErrors);
  }, [formData, validateSwapParams]);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleInitiateSwap = async () => {
    if (errors.length > 0) return;

    try {
      await initiateSwapMutation.mutateAsync({
        ethAmount: formData.ethAmount,
        xlmAmount: formData.xlmAmount,
        timelockMinutes: formData.timelockMinutes
      });
    } catch (error) {
      console.error("Failed to initiate swap:", error);
    }
  };

  const handleLockEth = async () => {
    if (!currentSwap) return;

    try {
      // Create a message to sign
      const message = `Lock ETH for swap ${currentSwap.swapId}: ${formData.ethAmount} ETH to ${stellarWallet.address}`;

      // Sign the message
      const signature = await ethWallet.signer.signMessage(message);

      await lockEthMutation.mutateAsync({
        swapId: currentSwap.swapId,
        signature
      });
    } catch (error) {
      console.error("Failed to lock ETH:", error);
    }
  };

  const handleLockXlm = async () => {
    if (!currentSwap) return;

    try {
      await lockXlmMutation.mutateAsync({
        swapId: currentSwap.swapId,
        stellarAddress: stellarWallet.address,
        xlmAmount: formData.xlmAmount
      });
    } catch (error) {
      console.error("Failed to lock XLM:", error);
    }
  };

  const handleClaim = async () => {
    if (!currentSwap) return;

    try {
      await claimMutation.mutateAsync({
        swapId: currentSwap.swapId,
        secretHex: currentSwap.secretHex,
        chain: "stellar"
      });
    } catch (error) {
      console.error("Failed to claim:", error);
    }
  };

  const handleReset = () => {
    resetSwap();
    setFormData({
      ethAmount: "",
      xlmAmount: "",
      timelockMinutes: 30
    });
  };

  // If there's an active swap, show the status
  if (currentSwap && swapStep !== "init") {
    return <SwapStatus swapId={currentSwap.swapId} />;
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white">Atomic Swap</h1>
          <div className="text-sm text-gray-400">
            ETH ↔ XLM
          </div>
        </div>

        {/* Swap Form */}
        <div className="space-y-6">
          {/* ETH Input */}
          <div className="bg-gray-700/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-300">You Send</label>
              <div className="text-xs text-gray-400">
                Balance: {parseFloat(ethWallet.balance || 0).toFixed(4)} ETH
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <input
                type="number"
                value={formData.ethAmount}
                onChange={(e) => handleInputChange("ethAmount", e.target.value)}
                placeholder="0.0"
                className="flex-1 bg-transparent text-white text-lg font-mono outline-none"
                disabled={!ethWallet.isConnected}
              />
              <div className="flex items-center space-x-2 bg-blue-600 px-3 py-1 rounded-md">
                <div className="w-5 h-5 bg-white rounded-full"></div>
                <span className="text-white font-medium">ETH</span>
              </div>
            </div>
          </div>

          {/* Exchange Rate */}
          {exchangeRate && (
            <div className="flex items-center justify-center">
              <div className="bg-gray-700/50 rounded-lg px-4 py-2">
                <span className="text-sm text-gray-400">
                  1 ETH = {exchangeRate} XLM
                </span>
              </div>
            </div>
          )}

          {/* XLM Input */}
          <div className="bg-gray-700/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-300">You Receive</label>
              <div className="text-xs text-gray-400">
                Balance: {parseFloat(stellarWallet.balance || 0).toFixed(2)} XLM
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <input
                type="number"
                value={formData.xlmAmount}
                onChange={(e) => handleInputChange("xlmAmount", e.target.value)}
                placeholder="0.0"
                className="flex-1 bg-transparent text-white text-lg font-mono outline-none"
                disabled={!stellarWallet.isConnected}
              />
              <div className="flex items-center space-x-2 bg-purple-600 px-3 py-1 rounded-md">
                <div className="w-5 h-5 bg-white rounded-full"></div>
                <span className="text-white font-medium">XLM</span>
              </div>
            </div>
          </div>

          {/* Timelock Setting */}
          <div className="bg-gray-700/50 rounded-lg p-4">
            <label className="text-sm font-medium text-gray-300 mb-2 block">
              Timelock (minutes)
            </label>
            <input
              type="number"
              value={formData.timelockMinutes}
              onChange={(e) => handleInputChange("timelockMinutes", parseInt(e.target.value))}
              min="5"
              max="1440"
              className="w-full bg-transparent text-white border border-gray-600 rounded-md px-3 py-2 outline-none focus:border-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              Time before funds can be refunded (5-1440 minutes)
            </p>
          </div>

          {/* Error Display */}
          {errors.length > 0 && (
            <div className="bg-red-900/50 border border-red-700 rounded-lg p-4">
              <ul className="text-red-300 text-sm space-y-1">
                {errors.map((error, index) => (
                  <li key={index}>• {error}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Action Button */}
          <button
            onClick={handleInitiateSwap}
            disabled={errors.length > 0 || !ethWallet.isConnected || !stellarWallet.isConnected || initiateSwapMutation.isPending}
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-600 text-white font-medium py-3 px-4 rounded-lg transition-all duration-200 disabled:cursor-not-allowed"
          >
            {initiateSwapMutation.isPending ? (
              <div className="flex items-center justify-center space-x-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Initiating Swap...</span>
              </div>
            ) : (
              "Initiate Atomic Swap"
            )}
          </button>

          {/* Wallet Connection Status */}
          <div className="grid grid-cols-2 gap-4">
            <div className={`p-3 rounded-lg border ${
              ethWallet.isConnected
                ? 'bg-green-900/20 border-green-600'
                : 'bg-red-900/20 border-red-600'
            }`}>
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${
                  ethWallet.isConnected ? 'bg-green-400' : 'bg-red-400'
                }`}></div>
                <span className="text-sm font-medium">
                  {ethWallet.isConnected ? 'Ethereum Connected' : 'Ethereum Disconnected'}
                </span>
              </div>
            </div>

            <div className={`p-3 rounded-lg border ${
              stellarWallet.isConnected
                ? 'bg-green-900/20 border-green-600'
                : 'bg-red-900/20 border-red-600'
            }`}>
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${
                  stellarWallet.isConnected ? 'bg-green-400' : 'bg-red-400'
                }`}></div>
                <span className="text-sm font-medium">
                  {stellarWallet.isConnected ? 'Stellar Connected' : 'Stellar Disconnected'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Info Section */}
        <div className="mt-6 p-4 bg-blue-900/20 border border-blue-700 rounded-lg">
          <h3 className="text-sm font-medium text-blue-300 mb-2">How it works</h3>
          <ul className="text-xs text-gray-400 space-y-1">
            <li>• 1. Lock your ETH on Ethereum with a secret hash</li>
            <li>• 2. Lock your XLM on Stellar with the same hash</li>
            <li>• 3. Reveal the secret to claim funds on both chains</li>
            <li>• 4. If either party doesn't complete, funds are refunded after timelock</li>
          </ul>
        </div>
      </div>
    </div>
  );
}