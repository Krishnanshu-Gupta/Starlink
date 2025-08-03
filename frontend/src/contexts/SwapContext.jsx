import React, { createContext, useContext, useState, useCallback } from "react";
import { useWallet } from "./WalletContext.jsx";
import { useMutation } from "@tanstack/react-query";

const SwapContext = createContext();

export function useSwap() {
  const context = useContext(SwapContext);
  if (!context) {
    throw new Error("useSwap must be used within a SwapProvider");
  }
  return context;
}

export function SwapProvider({ children }) {
  const { ethWallet, stellarWallet, signSwapMessage, lockEthInHTLC } = useWallet();

  const [currentSwap, setCurrentSwap] = useState(null);
  const [swapStep, setSwapStep] = useState("idle");

  // Initiate ETH to XLM swap
  const initiateEthToXlmSwap = useMutation({
    mutationFn: async ({ ethAmount, xlmAmount, timelockMinutes }) => {
      if (!ethWallet.isConnected) {
        throw new Error("Ethereum wallet not connected");
      }

      const response = await fetch("http://localhost:3001/api/swap/initiate-eth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ethAmount,
          xlmAmount,
          timelockMinutes,
          initiatorAddress: ethWallet.address,
          recipientAddress: stellarWallet.address || "G" + "0".repeat(55) // Placeholder if Stellar not connected
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to initiate swap");
      }

      const data = await response.json();
      return data;
    },
    onSuccess: (data) => {
      setCurrentSwap({
        swapId: data.swapId,
        direction: "ETH_TO_XLM",
        status: "initiated",
        ethAmount: data.ethAmount,
        xlmAmount: data.xlmAmount,
        timelock: data.timelock,
        secret: data.secret,
        hash: data.hash
      });
      setSwapStep("initiated");
    }
  });

  // Initiate XLM to ETH swap
  const initiateXlmToEthSwap = useMutation({
    mutationFn: async ({ xlmAmount, ethAmount, timelockMinutes }) => {
      if (!stellarWallet.isConnected) {
        throw new Error("Stellar wallet not connected");
      }

      const response = await fetch("http://localhost:3001/api/swap/initiate-xlm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          xlmAmount,
          ethAmount,
          timelockMinutes,
          initiatorAddress: stellarWallet.address,
          recipientAddress: ethWallet.address || "0x" + "0".repeat(40) // Placeholder if ETH not connected
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to initiate swap");
      }

      const data = await response.json();
      return data;
    },
    onSuccess: (data) => {
      setCurrentSwap({
        swapId: data.swapId,
        direction: "XLM_TO_ETH",
        status: "initiated",
        ethAmount: data.ethAmount,
        xlmAmount: data.xlmAmount,
        timelock: data.timelock,
        secret: data.secret,
        hash: data.hash
      });
      setSwapStep("initiated");
    }
  });

  // Lock ETH using real MetaMask integration
  const lockEthMutation = useMutation({
    mutationFn: async ({ swapId, amount }) => {
      if (!ethWallet.isConnected) {
        throw new Error("Ethereum wallet not connected");
      }

      // Get swap details from backend
      const swapResponse = await fetch(`http://localhost:3001/api/swap/status/${swapId}`);
      const swapData = await swapResponse.json();

      if (!swapData.swap) {
        throw new Error("Swap not found");
      }

      // Sign message for authorization
      const { signature, message } = await signSwapMessage(swapId, amount, "ETH");

      // Lock ETH directly through MetaMask
      const lockResult = await lockEthInHTLC(
        swapId,
        amount,
        swapData.swap.initiator_address,
        swapData.swap.hash,
        swapData.swap.timelock
      );

      // Update backend with signature verification
      const response = await fetch("http://localhost:3001/api/swap/lock-eth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          swapId,
          signature,
          userAddress: ethWallet.address
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update swap status");
      }

      // Update backend with transaction hash
      const txResponse = await fetch("http://localhost:3001/api/swap/update-eth-tx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          swapId,
          txHash: lockResult.hash
        })
      });

      if (!txResponse.ok) {
        const error = await txResponse.json();
        throw new Error(error.error || "Failed to update transaction hash");
      }

      return await response.json();
    },
    onSuccess: (data) => {
      setCurrentSwap(prev => ({ ...prev, status: "locked_eth" }));
      setSwapStep("locked_eth");
    }
  });

  // Lock XLM
  const lockXlmMutation = useMutation({
    mutationFn: async ({ swapId, stellarAddress, xlmAmount }) => {
      if (!stellarWallet.isConnected) {
        throw new Error("Stellar wallet not connected");
      }

      const response = await fetch("http://localhost:3001/api/swap/lock-xlm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          swapId,
          resolverId: "resolver1", // For now, use first resolver
          amount: xlmAmount
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to lock XLM");
      }

      return await response.json();
    },
    onSuccess: (data) => {
      setCurrentSwap(prev => ({ ...prev, status: "locked_stellar" }));
      setSwapStep("locked_stellar");
    }
  });

  // Claim XLM
  const claimXlmMutation = useMutation({
    mutationFn: async ({ swapId, secret }) => {
      const response = await fetch("http://localhost:3001/api/swap/claim-xlm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          swapId,
          secret
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to claim XLM");
      }

      return await response.json();
    },
    onSuccess: (data) => {
      setCurrentSwap(prev => ({ ...prev, status: "claimed_xlm" }));
      setSwapStep("claimed_xlm");
    }
  });

  // Claim ETH
  const claimEthMutation = useMutation({
    mutationFn: async ({ swapId, secret }) => {
      const response = await fetch("http://localhost:3001/api/swap/claim-eth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          swapId,
          secret,
          resolverId: "resolver1"
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to claim ETH");
      }

      return await response.json();
    },
    onSuccess: (data) => {
      setCurrentSwap(prev => ({ ...prev, status: "completed" }));
      setSwapStep("completed");
    }
  });

  // Validate swap parameters
  const validateSwapParams = useCallback((direction, amount, timelockMinutes) => {
    const errors = [];

    if (!amount || parseFloat(amount) <= 0) {
      errors.push("Amount must be greater than 0");
    }

    if (direction === "ETH_TO_XLM" && ethWallet.isConnected) {
      const balance = parseFloat(ethWallet.balance || 0);
      const amountNum = parseFloat(amount);
      if (amountNum > balance) {
        errors.push(`Insufficient ETH balance. You have ${balance.toFixed(4)} ETH`);
      }
    }

    if (direction === "XLM_TO_ETH" && stellarWallet.isConnected) {
      const balance = parseFloat(stellarWallet.balance || 0);
      const amountNum = parseFloat(amount);
      if (amountNum > balance) {
        errors.push(`Insufficient XLM balance. You have ${balance.toFixed(2)} XLM`);
      }
    }

    if (!timelockMinutes || timelockMinutes < 5 || timelockMinutes > 1440) {
      errors.push("Timelock must be between 5 and 1440 minutes");
    }

    if (direction === "ETH_TO_XLM" && !ethWallet.isConnected) {
      errors.push("Please connect your Ethereum wallet");
    }

    if (direction === "XLM_TO_ETH" && !stellarWallet.isConnected) {
      errors.push("Please connect your Stellar wallet");
    }

    return errors;
  }, [ethWallet, stellarWallet]);

  // Reset swap state
  const resetSwap = useCallback(() => {
    setCurrentSwap(null);
    setSwapStep("idle");
  }, []);

  return (
    <SwapContext.Provider
      value={{
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
      }}
    >
      {children}
    </SwapContext.Provider>
  );
}