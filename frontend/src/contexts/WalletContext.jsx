import React, { createContext, useContext, useState, useEffect } from "react";
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

  // — Stellar (Freighter) —
  const connectStellarWallet = async () => {
    setIsLoading(true);
    setError("");
    try {
      const installed = await isConnected();
      if (!installed) {
        throw new Error("Freighter extension not available.");
      }
      const address = await getPublicKey();
      if (!address) {
        throw new Error("Failed to get Stellar address from Freighter.");
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
    } catch (err) {
      console.error("Error connecting to Stellar wallet:", err);
      setError(err.message || String(err));
    } finally {
      setIsLoading(false);
    }
  };

  const disconnectStellarWallet = () => {
    localStorage.removeItem("stellarConnected");
    setStellarWallet({ address: "", balance: "0", isConnected: false });
  };

  const signStellarTransaction = async xdr => {
    if (!stellarWallet.isConnected) {
      throw new Error("Stellar wallet not connected");
    }
    return await signTransaction(xdr, { network: "TESTNET" });
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
    hasFreighter:
      typeof window.freighterApi !== "undefined"
  });

  // Auto-connect on mount
  useEffect(() => {
    if (window.ethereum && window.ethereum.selectedAddress) {
      connectEthWallet();
    }
    if (stellarInitiallyConnected) {
      connectStellarWallet();
    }
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
        refreshBalances,
        checkWalletAvailability
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}
