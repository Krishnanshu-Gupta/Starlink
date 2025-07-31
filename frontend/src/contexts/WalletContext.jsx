import React, { createContext, useContext, useState, useEffect } from "react";
import { ethers } from "ethers";
import { publicKeyAsync, signTransaction } from "@stellar/freighter-api";

const WalletContext = createContext();

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
}

export function WalletProvider({ children }) {
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

  // Connect to Ethereum wallet (MetaMask)
  const connectEthWallet = async () => {
    setIsLoading(true);
    setError("");

    try {
      if (!window.ethereum) {
        throw new Error("MetaMask is not installed. Please install MetaMask to continue.");
      }

      const provider = new ethers.BrowserProvider(window.ethereum);

      // Request account access
      await provider.send("eth_requestAccounts", []);

      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      const network = await provider.getNetwork();

      // Get balance
      const balance = await provider.getBalance(address);
      const balanceEth = ethers.formatEther(balance);

      setEthWallet({
        address,
        signer,
        provider,
        balance: balanceEth,
        isConnected: true,
        chainId: network.chainId
      });

      // Listen for account changes
      window.ethereum.on("accountsChanged", handleEthAccountChange);
      window.ethereum.on("chainChanged", handleEthChainChange);

    } catch (err) {
      setError(err.message);
      console.error("Error connecting to Ethereum wallet:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Connect to Stellar wallet (Freighter)
  const connectStellarWallet = async () => {
    setIsLoading(true);
    setError("");

    try {
      const address = await publicKeyAsync();

      if (!address) {
        throw new Error("Failed to get Stellar address from Freighter");
      }

      // Get balance from API
      const response = await fetch(`http://localhost:3001/api/wallet/xlm/balance/${address}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to get Stellar balance");
      }

      setStellarWallet({
        address,
        balance: data.balance,
        isConnected: true
      });

    } catch (err) {
      setError(err.message);
      console.error("Error connecting to Stellar wallet:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Disconnect Ethereum wallet
  const disconnectEthWallet = () => {
    setEthWallet({
      address: "",
      signer: null,
      provider: null,
      balance: "0",
      isConnected: false,
      chainId: null
    });

    if (window.ethereum) {
      window.ethereum.removeListener("accountsChanged", handleEthAccountChange);
      window.ethereum.removeListener("chainChanged", handleEthChainChange);
    }
  };

  // Disconnect Stellar wallet
  const disconnectStellarWallet = () => {
    setStellarWallet({
      address: "",
      balance: "0",
      isConnected: false
    });
  };

  // Handle Ethereum account changes
  const handleEthAccountChange = async (accounts) => {
    if (accounts.length === 0) {
      disconnectEthWallet();
    } else {
      // Reconnect with new account
      await connectEthWallet();
    }
  };

  // Handle Ethereum chain changes
  const handleEthChainChange = async () => {
    // Reload the page to handle chain change
    window.location.reload();
  };

  // Refresh balances
  const refreshBalances = async () => {
    try {
      if (ethWallet.isConnected && ethWallet.provider) {
        const balance = await ethWallet.provider.getBalance(ethWallet.address);
        const balanceEth = ethers.formatEther(balance);
        setEthWallet(prev => ({ ...prev, balance: balanceEth }));
      }

      if (stellarWallet.isConnected) {
        const response = await fetch(`http://localhost:3001/api/wallet/xlm/balance/${stellarWallet.address}`);
        const data = await response.json();

        if (response.ok) {
          setStellarWallet(prev => ({ ...prev, balance: data.balance }));
        }
      }
    } catch (err) {
      console.error("Error refreshing balances:", err);
    }
  };

  // Sign Ethereum transaction
  const signEthTransaction = async (transaction) => {
    if (!ethWallet.isConnected || !ethWallet.signer) {
      throw new Error("Ethereum wallet not connected");
    }

    try {
      const tx = await ethWallet.signer.sendTransaction(transaction);
      return await tx.wait();
    } catch (err) {
      throw new Error(`Transaction failed: ${err.message}`);
    }
  };

  // Sign Stellar transaction
  const signStellarTransaction = async (xdr) => {
    if (!stellarWallet.isConnected) {
      throw new Error("Stellar wallet not connected");
    }

    try {
      const signedXdr = await signTransaction(xdr, { network: "TESTNET" });
      return signedXdr;
    } catch (err) {
      throw new Error(`Stellar transaction failed: ${err.message}`);
    }
  };

  // Check if wallets are available
  const checkWalletAvailability = () => {
    const hasMetaMask = !!window.ethereum;
    const hasFreighter = typeof window !== "undefined" && window.freighterApi;

    return { hasMetaMask, hasFreighter };
  };

  // Auto-connect on mount if previously connected
  useEffect(() => {
    const checkConnection = async () => {
      if (window.ethereum && window.ethereum.selectedAddress) {
        await connectEthWallet();
      }
    };

    checkConnection();
  }, []);

  const value = {
    ethWallet,
    stellarWallet,
    isLoading,
    error,
    connectEthWallet,
    connectStellarWallet,
    disconnectEthWallet,
    disconnectStellarWallet,
    refreshBalances,
    signEthTransaction,
    signStellarTransaction,
    checkWalletAvailability
  };

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
}