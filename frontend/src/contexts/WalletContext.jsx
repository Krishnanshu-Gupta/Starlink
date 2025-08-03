import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { ethers } from "ethers";
import { getPublicKey, signTransaction, isConnected } from "@stellar/freighter-api";

const WalletContext = createContext();

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
}

export function WalletProvider({ children }) {
  // Check if Stellar was previously connected
  const stellarInitiallyConnected =
    typeof window !== "undefined" &&
    localStorage.getItem("stellarConnected") === "true";

  const [ethWallet, setEthWallet] = useState({
    address: "",
    signer: null,
    provider: null,
    balance: "0",
    isConnected: false,
    chainId: null
  });

  const [stellarWallet, setStellarWallet] = useState({
    address: "",
    balance: "0",
    isConnected: false
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  // Refs for managing intervals and timeouts
  const freighterCheckInterval = useRef(null);
  const freighterConnectionTimeout = useRef(null);

  // — Ethereum (MetaMask) —
  const connectEthWallet = async () => {
    setIsLoading(true);
    setError("");
    try {
      if (!window.ethereum) {
        throw new Error(
          "MetaMask is not installed. Please install MetaMask to continue."
        );
      }
      const eth = window.ethereum;
      let metamaskProvider = null;
      if (Array.isArray(eth.providers)) {
        metamaskProvider = eth.providers.find(p => p.isMetaMask) || null;
      }
      metamaskProvider =
        metamaskProvider || (eth.isMetaMask ? eth : null);
      if (!metamaskProvider) {
        throw new Error(
          "MetaMask provider not found. Please enable MetaMask."
        );
      }
      const provider = new ethers.BrowserProvider(metamaskProvider);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      const network = await provider.getNetwork();
      const balanceBig = await provider.getBalance(address);
      const balance = ethers.formatEther(balanceBig);
      setEthWallet({
        address,
        signer,
        provider,
        balance,
        isConnected: true,
        chainId: network.chainId
      });
      metamaskProvider.on("accountsChanged", handleEthAccountChange);
      metamaskProvider.on("chainChanged", handleEthChainChange);
    } catch (err) {
      console.error("Error connecting to Ethereum wallet:", err);
      setError(err.message || String(err));
    } finally {
      setIsLoading(false);
    }
  };

  const disconnectEthWallet = () => {
    if (ethWallet.provider) {
      const p = ethWallet.provider.provider;
      p.removeListener("accountsChanged", handleEthAccountChange);
      p.removeListener("chainChanged", handleEthChainChange);
    }
    setEthWallet({
      address: "",
      signer: null,
      provider: null,
      balance: "0",
      isConnected: false,
      chainId: null
    });
  };

  const handleEthAccountChange = async accounts => {
    if (!accounts.length) {
      disconnectEthWallet();
    } else {
      await connectEthWallet();
    }
  };

  const handleEthChainChange = () => {
    window.location.reload();
  };

  const signEthTransaction = async tx => {
    if (!ethWallet.isConnected || !ethWallet.signer) {
      throw new Error("Ethereum wallet not connected");
    }
    const sent = await ethWallet.signer.sendTransaction(tx);
    return sent.wait();
  };

  // Sign message for swap authorization
  const signSwapMessage = async (swapId, amount, token = "ETH") => {
    if (!ethWallet.isConnected || !ethWallet.signer) {
        throw new Error("Ethereum wallet not connected");
      }

    const message = `Lock ${token} for swap ${swapId}: ${amount} ${token}`;
    const signature = await ethWallet.signer.signMessage(message);
    return { signature, message };
  };

  // Lock ETH in HTLC contract directly through MetaMask
  const lockEthInHTLC = async (swapId, amount, recipient, hash, timelock) => {
    if (!ethWallet.isConnected || !ethWallet.signer) {
      throw new Error("Ethereum wallet not connected");
      }

    try {
      // HTLC contract address and ABI
      const HTLC_ADDRESS = "0x6c91739cbC4c9e4F1907Cc11AC8431ca1a55d0C6";
      const HTLC_ABI = [
        "function lockETH(address recipient, bytes32 hash, uint256 timelock) external payable returns (bytes32)"
      ];

      // Create contract instance
      const contract = new ethers.Contract(HTLC_ADDRESS, HTLC_ABI, ethWallet.signer);

      // Convert amount to wei
      const amountInWei = ethers.parseEther(amount.toString());

      // Call lockETH function
      const tx = await contract.lockETH(recipient, hash, timelock, {
        value: amountInWei
      });

      console.log("Transaction sent:", tx.hash);

      // Wait for confirmation
      const receipt = await tx.wait();
      console.log("Transaction confirmed:", receipt.hash);

      return {
        hash: receipt.hash,
        status: receipt.status
      };
    } catch (error) {
      console.error("Error locking ETH in HTLC:", error);
      throw error;
    }
  };

  // — Stellar (Freighter) —

  // Check if Freighter is available
  const isFreighterAvailable = async () => {
    try {
      return await isConnected();
    } catch (error) {
      return false;
    }
  };

  // Enhanced Freighter connection with better error handling and retry logic
  const connectStellarWallet = async (retryCount = 0) => {
    setIsLoading(true);
    setError("");

    try {
      // Clear any existing timeout
      if (freighterConnectionTimeout.current) {
        clearTimeout(freighterConnectionTimeout.current);
      }

      const installed = await isFreighterAvailable();
      if (!installed) {
        throw new Error("Freighter extension not available. Please install Freighter from https://www.freighter.app/");
      }

      // Set a timeout for the connection attempt
      const connectionPromise = new Promise(async (resolve, reject) => {
        try {
          const address = await getPublicKey();
          if (!address) {
            throw new Error("Failed to get Stellar address from Freighter. Please make sure Freighter is unlocked.");
          }

          const resp = await fetch(
            `http://localhost:3001/api/wallet/xlm/balance/${address}`
          );
          if (!resp.ok) {
            let errMsg;
            try {
              const errData = await resp.json();
              errMsg = errData.error;
            } catch {
              errMsg = await resp.text();
            }
            throw new Error(errMsg || "Failed to fetch Stellar balance");
          }
          const data = await resp.json();
          setStellarWallet({ address, balance: data.balance, isConnected: true });
          localStorage.setItem("stellarConnected", "true");
          resolve();
        } catch (error) {
          reject(error);
        }
      });

      // Set timeout for connection attempt
      freighterConnectionTimeout.current = setTimeout(() => {
        throw new Error("Freighter connection timed out. Please try again.");
      }, 10000); // 10 second timeout

      await connectionPromise;

      // Clear timeout on successful connection
      if (freighterConnectionTimeout.current) {
        clearTimeout(freighterConnectionTimeout.current);
        freighterConnectionTimeout.current = null;
      }

      // Start periodic connection check
      startFreighterConnectionCheck();

    } catch (err) {
      console.error("Error connecting to Stellar wallet:", err);

      // Retry logic for certain errors
      if (retryCount < 2 && (
        err.message.includes("Freighter extension not available") ||
        err.message.includes("Failed to get Stellar address") ||
        err.message.includes("timed out")
      )) {
        setTimeout(() => connectStellarWallet(retryCount + 1), 1000);
        return;
      }

      setError(err.message || String(err));
    } finally {
      setIsLoading(false);
    }
  };

  const disconnectStellarWallet = () => {
    localStorage.removeItem("stellarConnected");
    setStellarWallet({ address: "", balance: "0", isConnected: false });

    // Stop periodic connection check
    if (freighterCheckInterval.current) {
      clearInterval(freighterCheckInterval.current);
      freighterCheckInterval.current = null;
    }
  };

  const signStellarTransaction = async xdr => {
    if (!stellarWallet.isConnected) {
      throw new Error("Stellar wallet not connected");
    }
    return await signTransaction(xdr, { network: "TESTNET" });
  };

  // Periodic connection check for Freighter
  const startFreighterConnectionCheck = () => {
    // Clear any existing interval
    if (freighterCheckInterval.current) {
      clearInterval(freighterCheckInterval.current);
    }

    // Check connection every 5 seconds
    freighterCheckInterval.current = setInterval(async () => {
      if (stellarWallet.isConnected) {
        try {
          const isStillConnected = await isFreighterAvailable();
          if (!isStillConnected) {
            disconnectStellarWallet();
          }
        } catch (error) {
          disconnectStellarWallet();
        }
      }
    }, 5000);
  };

  // Auto-reconnect Freighter when it becomes available
  const attemptFreighterReconnect = async () => {
    if (stellarInitiallyConnected && !stellarWallet.isConnected && !isLoading) {
      try {
        const isAvailable = await isFreighterAvailable();
        if (isAvailable) {
          await connectStellarWallet();
        }
      } catch (error) {
        // Silently fail, will retry on next interval
      }
    }
  };

  // Manual Freighter status check
  const checkFreighterStatus = async () => {
    try {
      const isAvailable = await isFreighterAvailable();
      return isAvailable;
    } catch (error) {
      return false;
    }
  };

  // — Utilities —
  const refreshBalances = async () => {
    try {
      if (ethWallet.isConnected && ethWallet.provider) {
        const bal = await ethWallet.provider.getBalance(
          ethWallet.address
        );
        setEthWallet(prev => ({
          ...prev,
          balance: ethers.formatEther(bal)
        }));
      }
      if (stellarWallet.isConnected) {
        const resp = await fetch(
          `http://localhost:3001/api/wallet/xlm/balance/${stellarWallet.address}`
        );
        if (resp.ok) {
          const data = await resp.json();
          setStellarWallet(prev => ({ ...prev, balance: data.balance }));
        }
      }
    } catch (err) {
      console.error("Error refreshing balances:", err);
    }
  };

  const checkWalletAvailability = () => ({
    hasMetaMask: !!window.ethereum,
    hasFreighter: typeof window.freighterApi !== "undefined"
  });

  // Auto-connect on mount
  useEffect(() => {
    // Ethereum auto-connect
    if (window.ethereum && window.ethereum.selectedAddress) {
      connectEthWallet();
    }

    // Stellar auto-connect with enhanced logic
    if (stellarInitiallyConnected) {
      const initStellarConnection = async () => {
        try {
          const isAvailable = await isFreighterAvailable();
          if (isAvailable) {
            await connectStellarWallet();
          } else {
            // Clear localStorage if Freighter is not available
            localStorage.removeItem("stellarConnected");
          }
        } catch (error) {
          console.error("Initial Freighter connection check failed:", error);
          localStorage.removeItem("stellarConnected");
        }
      };

      initStellarConnection();
    }

    // Set up periodic Freighter availability check for auto-reconnect
    const freighterAvailabilityInterval = setInterval(attemptFreighterReconnect, 3000);

    // Cleanup on unmount
    return () => {
      if (freighterCheckInterval.current) {
        clearInterval(freighterCheckInterval.current);
      }
      if (freighterConnectionTimeout.current) {
        clearTimeout(freighterConnectionTimeout.current);
      }
      clearInterval(freighterAvailabilityInterval);
    };
  }, []);

  return (
    <WalletContext.Provider
      value={{
        ethWallet,
        stellarWallet,
        isLoading,
        error,
        connectEthWallet,
        disconnectEthWallet,
        connectStellarWallet,
        disconnectStellarWallet,
        signEthTransaction,
        signStellarTransaction,
        signSwapMessage,
        lockEthInHTLC,
        refreshBalances,
        checkWalletAvailability,
        checkFreighterStatus
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}
