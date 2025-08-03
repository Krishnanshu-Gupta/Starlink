import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
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

  // Sync swapStep with backend status when currentSwap changes
  useEffect(() => {
    if (currentSwap?.id) {
      const syncSwapStatus = async () => {
        try {
          const response = await fetch(`${API_BASE}/swap/status/${currentSwap.id}`);
          if (response.ok) {
            const data = await response.json();
            // Map backend status to frontend step
            const statusToStep = {
              "pending": "initiated",
              "locked_eth": "locked_eth",
              "locked_stellar": "locked_stellar",
              "claimed_xlm": "claimed_xlm",
              "claimed_eth": "claimed_eth",
              "completed": "completed"
            };
            setSwapStep(statusToStep[data.status] || "initiated");
          }
        } catch (error) {
          console.error("Failed to sync swap status:", error);
        }
      };

      // Initial sync
      syncSwapStatus();

      // Poll every 5 seconds for status updates
      const interval = setInterval(syncSwapStatus, 5000);

      return () => clearInterval(interval);
    }
  }, [currentSwap?.id]);

  // Initiate ETH to XLM swap
  const initiateEthToXlmSwap = useMutation({
    mutationFn: async (swapData) => {
      const response = await fetch(`${API_BASE}/swap/initiate-eth`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          initiatorAddress: ethWallet.address,
          recipientAddress: stellarWallet.address,
          ethAmount: swapData.ethAmount,
          xlmAmount: swapData.xlmAmount,
          timelockMinutes: swapData.timelockMinutes || 30,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to initiate ETH to XLM swap");
      }

      return response.json();
    },
    onSuccess: (data) => {
      setCurrentSwap({
        ...data,
        id: data.swapId, // Map swapId to id for consistency
        swapId: data.swapId
      });
      setSwapStep("initiated");
      queryClient.invalidateQueries(["swaps"]);
    },
    onError: (error) => {
      console.error("Error initiating ETH to XLM swap:", error);
    },
  });

  // Initiate XLM to ETH swap
  const initiateXlmToEthSwap = useMutation({
    mutationFn: async (swapData) => {
      const response = await fetch(`${API_BASE}/swap/initiate-xlm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          initiatorAddress: stellarWallet.address,
          recipientAddress: ethWallet.address,
          xlmAmount: swapData.xlmAmount,
          ethAmount: swapData.ethAmount,
          timelockMinutes: swapData.timelockMinutes || 30,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to initiate XLM to ETH swap");
      }

      return response.json();
    },
    onSuccess: (data) => {
      setCurrentSwap({
        ...data,
        id: data.swapId, // Map swapId to id for consistency
        swapId: data.swapId
      });
      setSwapStep("initiated");
      queryClient.invalidateQueries(["swaps"]);
    },
    onError: (error) => {
      console.error("Error initiating XLM to ETH swap:", error);
    },
  });

  // Lock ETH
  const lockEthMutation = useMutation({
    mutationFn: async ({ swapId }) => {
      // Use the real lockEth function from WalletContext
      const { lockEth } = useWallet();
      return await lockEth(swapId);
    },
    onSuccess: (data) => {
      setSwapStep("locked_eth");
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
      setSwapStep("locked_stellar");
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

  // Claim XLM
  const claimXlmMutation = useMutation({
    mutationFn: async ({ swapId, secret }) => {
      const response = await fetch(`${API_BASE}/swap/claim-xlm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ swapId, secret }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to claim XLM");
      }

      return response.json();
    },
    onSuccess: (data) => {
      setSwapStep("claimed_xlm");
      queryClient.invalidateQueries(["swap", currentSwap?.swapId]);
    },
    onError: (error) => {
      console.error("Error claiming XLM:", error);
    },
  });

  // Claim ETH (called by relayer)
  const claimEthMutation = useMutation({
    mutationFn: async ({ swapId, secret }) => {
      const response = await fetch(`${API_BASE}/swap/claim-eth`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ swapId, secret }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to claim ETH");
      }

      return response.json();
    },
    onSuccess: (data) => {
      setSwapStep("completed");
      queryClient.invalidateQueries(["swap", currentSwap?.swapId]);
    },
    onError: (error) => {
      console.error("Error claiming ETH:", error);
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
  const validateSwapParams = useCallback((direction, amount, timelockMinutes) => {
    const errors = [];

    // Check wallet connections
    if (!ethWallet.isConnected) {
      errors.push("Ethereum wallet not connected");
    }
    if (!stellarWallet.isConnected) {
      errors.push("Stellar wallet not connected");
    }

    // Check amount
    if (!amount || parseFloat(amount) <= 0) {
      errors.push("Amount must be greater than 0");
    }

    // Check balances
    if (direction === "ETH_TO_XLM") {
      const ethBalance = parseFloat(ethWallet.balance || 0);
      const ethAmount = parseFloat(amount);
      if (ethAmount > ethBalance) {
        errors.push(`Insufficient ETH balance. You have ${ethBalance.toFixed(4)} ETH`);
      }
    } else {
      const xlmBalance = parseFloat(stellarWallet.balance || 0);
      const xlmAmount = parseFloat(amount);
      if (xlmAmount > xlmBalance) {
        errors.push(`Insufficient XLM balance. You have ${xlmBalance.toFixed(2)} XLM`);
      }
    }

    // Check timelock
    if (timelockMinutes < 5 || timelockMinutes > 1440) {
      errors.push("Timelock must be between 5 and 1440 minutes");
    }

    return errors;
  }, [ethWallet, stellarWallet]);

  // Reset swap state
  const resetSwap = useCallback(() => {
    setCurrentSwap(null);
    setSwapStep("init");
  }, []);

  // Get swap step description
  const getSwapStepDescription = useCallback((step) => {
    const descriptions = {
      init: "Initialize swap",
      initiated: "Swap initiated",
      locked_eth: "ETH locked, waiting for XLM lock",
      locked_stellar: "XLM locked, ready to claim",
      ready_to_claim: "Ready to claim funds",
      completed: "Swap completed successfully",
      refunded: "Swap refunded",
      failed: "Swap failed"
    };
    return descriptions[step] || "Unknown step";
  }, []);

  return (
    <SwapContext.Provider
      value={{
        currentSwap,
        swapStep,
        setSwapStep,
        initiateEthToXlmSwap,
        initiateXlmToEthSwap,
        lockEthMutation,
        lockXlmMutation,
        claimXlmMutation,
        claimEthMutation,
        refundMutation,
        getSwapStatus,
        getSwapHistory,
        validateSwapParams,
        resetSwap,
      }}
    >
      {children}
    </SwapContext.Provider>
  );
}