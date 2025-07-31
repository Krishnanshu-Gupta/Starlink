import React, { createContext, useContext, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "./WalletContext.jsx";

const SwapContext = createContext();

export function useSwap() {
  const context = useContext(SwapContext);
  if (!context) {
    throw new Error("useSwap must be used within a SwapProvider");
  }
  return context;
}

export function SwapProvider({ children }) {
  const [currentSwap, setCurrentSwap] = useState(null);
  const [swapStep, setSwapStep] = useState("init");
  const { ethWallet, stellarWallet } = useWallet();
  const queryClient = useQueryClient();

  // API base URL
  const API_BASE = "http://localhost:3001/api";

  // Initiate a new swap
  const initiateSwapMutation = useMutation({
    mutationFn: async (swapData) => {
      const response = await fetch(`${API_BASE}/swap/initiate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          initiatorAddress: ethWallet.address,
          recipientAddress: stellarWallet.address,
          amount: swapData.ethAmount,
          stellarAmount: swapData.xlmAmount,
          timelockMinutes: swapData.timelockMinutes || 30,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to initiate swap");
      }

      return response.json();
    },
    onSuccess: (data) => {
      setCurrentSwap(data);
      setSwapStep("locked_eth");
      queryClient.invalidateQueries(["swaps"]);
    },
    onError: (error) => {
      console.error("Error initiating swap:", error);
    },
  });

  // Lock ETH
  const lockEthMutation = useMutation({
    mutationFn: async ({ swapId, signature }) => {
      const response = await fetch(`${API_BASE}/swap/lock-eth`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ swapId, signature }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to lock ETH");
      }

      return response.json();
    },
    onSuccess: (data) => {
      setSwapStep("locked_stellar");
      queryClient.invalidateQueries(["swap", currentSwap?.swapId]);
    },
    onError: (error) => {
      console.error("Error locking ETH:", error);
    },
  });

  // Lock XLM
  const lockXlmMutation = useMutation({
    mutationFn: async ({ swapId, stellarAddress, xlmAmount }) => {
      const response = await fetch(`${API_BASE}/swap/lock-stellar`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ swapId, stellarAddress, xlmAmount }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to lock XLM");
      }

      return response.json();
    },
    onSuccess: (data) => {
      setSwapStep("ready_to_claim");
      queryClient.invalidateQueries(["swap", currentSwap?.swapId]);
    },
    onError: (error) => {
      console.error("Error locking XLM:", error);
    },
  });

  // Claim funds
  const claimMutation = useMutation({
    mutationFn: async ({ swapId, secretHex, chain }) => {
      const response = await fetch(`${API_BASE}/swap/claim`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ swapId, secretHex, chain }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to claim funds");
      }

      return response.json();
    },
    onSuccess: (data) => {
      setSwapStep("completed");
      queryClient.invalidateQueries(["swap", currentSwap?.swapId]);
      queryClient.invalidateQueries(["swaps"]);
    },
    onError: (error) => {
      console.error("Error claiming funds:", error);
    },
  });

  // Get swap status
  const getSwapStatus = useCallback((swapId) => {
    return useQuery({
      queryKey: ["swap", swapId],
      queryFn: async () => {
        const response = await fetch(`${API_BASE}/swap/status/${swapId}`);
        if (!response.ok) {
          throw new Error("Failed to fetch swap status");
        }
        return response.json();
      },
      enabled: !!swapId,
      refetchInterval: 5000, // Poll every 5 seconds
    });
  }, []);

  // Get user's swap history
  const getSwapHistory = useCallback((address) => {
    return useQuery({
      queryKey: ["swaps", address],
      queryFn: async () => {
        const response = await fetch(`${API_BASE}/swap/history/${address}`);
        if (!response.ok) {
          throw new Error("Failed to fetch swap history");
        }
        return response.json();
      },
      enabled: !!address,
    });
  }, []);

  // Get all swaps (for admin/dashboard)
  const getAllSwaps = useQuery({
    queryKey: ["swaps"],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/swap/history/all`);
      if (!response.ok) {
        throw new Error("Failed to fetch swaps");
      }
      return response.json();
    },
    refetchInterval: 10000, // Poll every 10 seconds
  });

  // Refund a swap
  const refundMutation = useMutation({
    mutationFn: async ({ swapId, chain }) => {
      const response = await fetch(`${API_BASE}/swap/refund`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ swapId, chain }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to refund swap");
      }

      return response.json();
    },
    onSuccess: (data) => {
      setSwapStep("refunded");
      queryClient.invalidateQueries(["swap", currentSwap?.swapId]);
      queryClient.invalidateQueries(["swaps"]);
    },
    onError: (error) => {
      console.error("Error refunding swap:", error);
    },
  });

  // Calculate exchange rate (mock - in real app this would come from an oracle)
  const calculateExchangeRate = useCallback((ethAmount, xlmAmount) => {
    if (!ethAmount || !xlmAmount) return null;
    return (parseFloat(xlmAmount) / parseFloat(ethAmount)).toFixed(2);
  }, []);

  // Validate swap parameters
  const validateSwapParams = useCallback((ethAmount, xlmAmount, timelockMinutes) => {
    const errors = [];

    if (!ethAmount || parseFloat(ethAmount) <= 0) {
      errors.push("ETH amount must be greater than 0");
    }

    if (!xlmAmount || parseFloat(xlmAmount) <= 0) {
      errors.push("XLM amount must be greater than 0");
    }

    if (timelockMinutes && (timelockMinutes < 5 || timelockMinutes > 1440)) {
      errors.push("Timelock must be between 5 minutes and 24 hours");
    }

    if (!ethWallet.isConnected) {
      errors.push("Ethereum wallet must be connected");
    }

    if (!stellarWallet.isConnected) {
      errors.push("Stellar wallet must be connected");
    }

    return errors;
  }, [ethWallet.isConnected, stellarWallet.isConnected]);

  // Reset swap state
  const resetSwap = useCallback(() => {
    setCurrentSwap(null);
    setSwapStep("init");
  }, []);

  // Get swap step description
  const getSwapStepDescription = useCallback((step) => {
    const descriptions = {
      init: "Initialize swap",
      locked_eth: "ETH locked, waiting for XLM lock",
      locked_stellar: "XLM locked, ready to claim",
      ready_to_claim: "Ready to claim funds",
      completed: "Swap completed successfully",
      refunded: "Swap refunded",
      failed: "Swap failed"
    };
    return descriptions[step] || "Unknown step";
  }, []);

  const value = {
    currentSwap,
    swapStep,
    setSwapStep,
    initiateSwapMutation,
    lockEthMutation,
    lockXlmMutation,
    claimMutation,
    refundMutation,
    getSwapStatus,
    getSwapHistory,
    getAllSwaps,
    calculateExchangeRate,
    validateSwapParams,
    resetSwap,
    getSwapStepDescription,
  };

  return (
    <SwapContext.Provider value={value}>
      {children}
    </SwapContext.Provider>
  );
}