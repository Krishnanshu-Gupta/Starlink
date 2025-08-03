import React, { useState, useEffect } from "react";
import { useWallet } from "../contexts/WalletContext.jsx";
import { useSwap } from "../contexts/SwapContext.jsx";
import ResolverAuction from "../components/ResolverAuction";
import SwapStatus from "./SwapStatus.jsx";

export default function SwapInterface() {
  const { ethWallet, stellarWallet } = useWallet();
  const {
    currentSwap,
    swapStep,
    initiateEthToXlmSwap,
    initiateXlmToEthSwap,
    lockEthMutation,
    lockXlmMutation,
    claimXlmMutation,
    claimEthMutation,
    validateSwapParams,
    resetSwap
  } = useSwap();

  const [swapDirection, setSwapDirection] = useState("ETH_TO_XLM");
  const [formData, setFormData] = useState({
    amount: "",
    timelockMinutes: 30
  });

  const [errors, setErrors] = useState([]);
  const [exchangeRate, setExchangeRate] = useState(null);
  const [rateLoading, setRateLoading] = useState(false);
  const [showAuction, setShowAuction] = useState(false);

  // Calculate exchange rate based on direction
  useEffect(() => {
    const fetchExchangeRate = async () => {
      if (!formData.amount) {
        setExchangeRate(null);
        setRateLoading(false);
        return;
      }

      setRateLoading(true);
      try {
        // Fetch real-time rates from CoinGecko
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum,stellar&vs_currencies=usd');

        if (!response.ok) {
          throw new Error(`CoinGecko API error: ${response.status}`);
        }

        const data = await response.json();

        const ethPrice = data.ethereum.usd;
        const xlmPrice = data.stellar.usd;

        // Calculate cross-rate
        const rate = swapDirection === "ETH_TO_XLM"
          ? ethPrice / xlmPrice  // How many XLM per 1 ETH (ETH price / XLM price)
          : xlmPrice / ethPrice; // How many ETH per 1 XLM (XLM price / ETH price)

        setExchangeRate(rate);
      } catch (error) {
        console.error("Failed to fetch exchange rate:", error);
        // Fallback to hardcoded rates if API fails
        const fallbackRate = swapDirection === "ETH_TO_XLM" ? 9250 : 0.000108; // 1 ETH = 9250 XLM
        setExchangeRate(fallbackRate);
      } finally {
        setRateLoading(false);
      }
    };

    fetchExchangeRate();
  }, [formData.amount, swapDirection]);

  // Validate form data
  useEffect(() => {
    const validationErrors = validateSwapParams(
      swapDirection,
      formData.amount,
      formData.timelockMinutes
    );
    setErrors(validationErrors);
  }, [formData, swapDirection, validateSwapParams]);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleInitiateSwap = async () => {
    if (errors.length > 0) return;

    try {
      if (swapDirection === "ETH_TO_XLM") {
        await initiateEthToXlmSwap.mutateAsync({
          ethAmount: formData.amount,
          xlmAmount: (parseFloat(formData.amount) * exchangeRate).toFixed(2),
          timelockMinutes: formData.timelockMinutes
        });

        // Auto-lock ETH after initiation
        setTimeout(async () => {
          try {
            await handleLockEth();
          } catch (error) {
            console.error("Auto-lock failed:", error);
          }
        }, 1000); // Small delay to ensure swap is created
      } else {
        await initiateXlmToEthSwap.mutateAsync({
          xlmAmount: formData.amount,
          ethAmount: (parseFloat(formData.amount) * exchangeRate).toFixed(6),
          timelockMinutes: formData.timelockMinutes
        });
      }
      setShowAuction(true);
    } catch (error) {
      console.error("Failed to initiate swap:", error);
    }
  };

  const handleLockEth = async () => {
    if (!currentSwap) return;

    try {
      await lockEthMutation.mutateAsync({
        swapId: currentSwap.swapId,
        amount: formData.amount
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
        xlmAmount: formData.amount
      });
    } catch (error) {
      console.error("Failed to lock XLM:", error);
    }
  };

  const handleClaimXlm = async () => {
    if (!currentSwap) return;

    try {
      await claimXlmMutation.mutateAsync({
        swapId: currentSwap.swapId,
        secret: currentSwap.secret
      });
    } catch (error) {
      console.error("Failed to claim XLM:", error);
    }
  };

  const handleReset = () => {
    resetSwap();
    setFormData({ amount: "", timelockMinutes: 30 });
    setErrors([]);
    setShowAuction(false);
  };

  const getExpectedAmount = () => {
    if (!formData.amount || !exchangeRate) return "0";
    const inputAmount = parseFloat(formData.amount);
    const expectedAmount = swapDirection === "ETH_TO_XLM"
      ? (inputAmount * exchangeRate).toFixed(2)
      : (inputAmount * exchangeRate).toFixed(6);
    return expectedAmount;
  };

  const getInputLabel = () => {
    return swapDirection === "ETH_TO_XLM" ? "ETH Amount" : "XLM Amount";
  };

  const getOutputLabel = () => {
    return swapDirection === "ETH_TO_XLM" ? "XLM Amount" : "ETH Amount";
  };

  const getInputSymbol = () => {
    return swapDirection === "ETH_TO_XLM" ? "ETH" : "XLM";
  };

  const getOutputSymbol = () => {
    return swapDirection === "ETH_TO_XLM" ? "XLM" : "ETH";
  };

  const handleBidSubmitted = (data) => {
    console.log('Bid submitted:', data);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-white mb-2">Atomic Swap</h1>
        <p className="text-gray-400">
          Swap between Ethereum and Stellar networks securely
        </p>
      </div>

      {/* Main Swap Interface - Single Column */}
      <div className="space-y-6">
        {/* Swap Direction Selection */}
        <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-white mb-4">Swap Direction</h2>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => setSwapDirection("ETH_TO_XLM")}
              className={`p-4 rounded-lg border-2 transition-all ${
                swapDirection === "ETH_TO_XLM"
                  ? "border-blue-500 bg-blue-500/10 text-blue-400"
                  : "border-gray-600 text-gray-400 hover:border-gray-500"
              }`}
            >
              <div className="text-center">
                <div className="text-2xl mb-2">ETH → XLM</div>
                <div className="text-sm">Send ETH, receive XLM</div>
              </div>
            </button>
            <button
              onClick={() => setSwapDirection("XLM_TO_ETH")}
              className={`p-4 rounded-lg border-2 transition-all ${
                swapDirection === "XLM_TO_ETH"
                  ? "border-purple-500 bg-purple-500/10 text-purple-400"
                  : "border-gray-600 text-gray-400 hover:border-gray-500"
              }`}
            >
              <div className="text-center">
                <div className="text-2xl mb-2">XLM → ETH</div>
                <div className="text-sm">Send XLM, receive ETH</div>
              </div>
            </button>
          </div>
        </div>

        {/* Swap Form */}
        <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-white mb-4">Swap Details</h2>

          <div className="space-y-4">
            {/* Input Amount */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                {getInputLabel()}
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={formData.amount}
                  onChange={(e) => handleInputChange("amount", e.target.value)}
                  placeholder={`Enter ${getInputSymbol()} amount`}
                  className="w-full bg-gray-700 border border-gray-600 text-white px-4 py-3 rounded-lg focus:border-blue-500 outline-none pr-20 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
                  step="any"
                  onWheel={(e) => e.target.blur()}
                />
                <div className="absolute right-3 top-3 flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => {
                      const maxBalance = swapDirection === "ETH_TO_XLM"
                        ? parseFloat(ethWallet.balance || 0)
                        : parseFloat(stellarWallet.balance || 0);
                      handleInputChange("amount", maxBalance.toString());
                    }}
                    className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded transition-colors"
                  >
                    Max
                  </button>
                  <span className="text-gray-400">{getInputSymbol()}</span>
                </div>
              </div>
              {/* Balance Display */}
              <div className="flex justify-between items-center mt-2 text-sm">
                <span className="text-gray-400">Available Balance:</span>
                <span className="text-white font-mono">
                  {swapDirection === "ETH_TO_XLM"
                    ? `${parseFloat(ethWallet.balance || 0).toFixed(4)} ETH`
                    : `${parseFloat(stellarWallet.balance || 0).toFixed(2)} XLM`
                  }
                </span>
              </div>
            </div>

            {/* Exchange Rate Display */}
            {formData.amount && (
              <div className="bg-gray-700/50 rounded-lg p-4">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-400">Exchange Rate:</span>
                  {rateLoading ? (
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-gray-400">Loading...</span>
                    </div>
                  ) : (
                    <span className="text-white">
                      1 {getInputSymbol()} = {exchangeRate ? exchangeRate.toFixed(6) : "0"} {getOutputSymbol()}
                    </span>
                  )}
                </div>
                <div className="flex justify-between items-center text-sm mt-2">
                  <span className="text-gray-400">You'll receive:</span>
                  {rateLoading ? (
                    <span className="text-gray-400">Calculating...</span>
                  ) : (
                    <span className="text-green-400 font-medium">
                      {getExpectedAmount()} {getOutputSymbol()}
                    </span>
                  )}
                </div>
                <div className="flex justify-between items-center text-sm mt-2">
                  <span className="text-gray-400">Fee Range:</span>
                  <span className="text-yellow-400 font-medium">
                    0.1% - 1.5% (Dutch Auction)
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm mt-2">
                  <span className="text-gray-400">Estimated Range:</span>
                  <span className="text-blue-400 font-medium">
                    {(parseFloat(getExpectedAmount()) * 0.985).toFixed(2)} - {getExpectedAmount()} {getOutputSymbol()}
                  </span>
                </div>
                {exchangeRate && (
                  <div className="text-xs text-gray-500 mt-2">
                    Rates from CoinGecko • Dutch auction may affect final amount
                  </div>
                )}
              </div>
            )}

            {/* Timelock */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Timelock (minutes)
              </label>
              <input
                type="number"
                value={formData.timelockMinutes}
                onChange={(e) => handleInputChange("timelockMinutes", parseInt(e.target.value))}
                min="5"
                max="1440"
                className="w-full bg-gray-700 border border-gray-600 text-white px-4 py-3 rounded-lg focus:border-blue-500 outline-none"
              />
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

            {/* Action Buttons */}
            <div className="flex space-x-4">
              <button
                onClick={handleInitiateSwap}
                disabled={errors.length > 0 || !formData.amount}
                className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-600 text-white px-6 py-3 rounded-lg font-medium transition-all duration-200"
              >
                Initiate Swap
              </button>
              <button
                onClick={handleReset}
                className="px-6 py-3 border border-gray-600 text-gray-300 hover:border-gray-500 rounded-lg transition-colors"
              >
                Reset
              </button>
            </div>
          </div>
        </div>

        {/* Resolver Auction - Appears after swap initiation */}
        {showAuction && currentSwap?.swapId && (
          <ResolverAuction
            swapId={currentSwap.swapId}
            onBidSubmitted={handleBidSubmitted}
          />
        )}

        {/* Current Swap Status */}
        {currentSwap && (
          <SwapStatus swap={currentSwap} />
        )}

        {/* Action Buttons for Current Swap */}
        {currentSwap && (
          <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Swap Actions</h3>
            <div className="flex flex-wrap gap-4">
              {swapStep === "initiated" && (
                <>
                  {swapDirection === "ETH_TO_XLM" ? (
                    <button
                      onClick={handleLockEth}
                      disabled={lockEthMutation.isLoading}
                      className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors"
                    >
                      {lockEthMutation.isLoading ? "Locking..." : "Lock ETH"}
                    </button>
                  ) : (
                    <button
                      onClick={handleLockXlm}
                      disabled={lockXlmMutation.isLoading}
                      className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors"
                    >
                      {lockXlmMutation.isLoading ? "Locking..." : "Lock XLM"}
                    </button>
                  )}
                </>
              )}

              {swapStep === "locked_eth" && swapDirection === "ETH_TO_XLM" && (
                <button
                  onClick={handleClaimXlm}
                  disabled={claimXlmMutation.isLoading}
                  className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  {claimXlmMutation.isLoading ? "Claiming..." : "Claim XLM"}
                </button>
              )}

              {swapStep === "locked_stellar" && swapDirection === "XLM_TO_ETH" && (
                <button
                  onClick={handleClaimXlm}
                  disabled={claimXlmMutation.isLoading}
                  className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  {claimXlmMutation.isLoading ? "Claiming..." : "Claim XLM"}
                </button>
              )}

              {swapStep === "claimed_xlm" && (
                <div className="text-green-400 font-medium">
                  ✅ XLM claimed successfully! Swap completed.
                </div>
              )}

              {swapStep === "completed" && (
                <div className="text-green-400 font-medium">
                  ✅ Swap completed successfully!
                </div>
              )}
            </div>
          </div>
        )}

        {/* Swap Information */}
        {currentSwap && (
          <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-lg p-6">
            <h3 className="text-xl font-semibold text-white mb-4">📋 Swap Details</h3>
            <div className="space-y-2 text-sm text-gray-300">
              <div><span className="font-medium text-white">Swap ID:</span> {currentSwap.swapId}</div>
              <div><span className="font-medium text-white">Direction:</span> {currentSwap.direction}</div>
              <div><span className="font-medium text-white">Status:</span> {currentSwap.status}</div>
              <div><span className="font-medium text-white">ETH Amount:</span> {currentSwap.ethAmount}</div>
              <div><span className="font-medium text-white">XLM Amount:</span> {currentSwap.xlmAmount}</div>
              <div><span className="font-medium text-white">Timelock:</span> {new Date(currentSwap.timelock * 1000).toLocaleString()}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}