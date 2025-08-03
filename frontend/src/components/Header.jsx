import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useWallet } from "../contexts/WalletContext.jsx";

export default function Header() {
  const location = useLocation();
  const [showDebug, setShowDebug] = useState(false);
  const {
    ethWallet,
    stellarWallet,
    connectEthWallet,
    connectStellarWallet,
    disconnectEthWallet,
    disconnectStellarWallet,
    checkFreighterStatus,
    isLoading,
    error,
  } = useWallet();

  const isActive = (path) => location.pathname === path;

  const handleDebugFreighter = async () => {
    const isAvailable = await checkFreighterStatus();

    if (!isAvailable) {
      setError("Freighter is not available. Please check if it's installed and unlocked.");
    } else {
      setError("Freighter is available. Try connecting again.");
    }
  };

  return (
    <header className="bg-gray-800/50 backdrop-blur-sm border-b border-gray-700 rounded-lg">
      <div className="max-w-6xl mx-auto px-4 py-4 relative">
        <div className="flex items-center justify-between">
          {/* Left: Logo */}
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">SL</span>
            </div>
            <span className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              Starlink
            </span>
          </div>

          {/* Center: Navigation (absolute center) */}
          <nav className="absolute left-1/2 -translate-x-1/2 flex items-center space-x-6">
            {["/dashboard", "/swap", "/history"].map((path) => (
              <Link
                key={path}
                to={path}
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive(path)
                    ? "bg-blue-600 text-white"
                    : "text-gray-300 hover:text-white hover:bg-gray-700"
                }`}
              >
                {path.replace("/", "").charAt(0).toUpperCase() + path.slice(2)}
              </Link>
            ))}
          </nav>

          {/* Right: Wallets */}
          <div className="flex items-center gap-3 text-xs">
            {/* ETH */}
            {ethWallet.isConnected ? (
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-green-400" />
                <span className="text-gray-300">ETH</span>
                <span className="font-mono text-gray-100">
                  {ethWallet.address.slice(0, 4)}...{ethWallet.address.slice(-2)}
                </span>
                <button
                  onClick={disconnectEthWallet}
                  className="text-red-400 hover:text-red-300"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                onClick={connectEthWallet}
                disabled={isLoading}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-md transition-colors"
              >
                {isLoading ? "Connecting..." : "Connect ETH"}
              </button>
            )}

            {/* XLM */}
            {stellarWallet.isConnected ? (
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-green-400" />
                <span className="text-gray-300">XLM</span>
                <span className="font-mono text-gray-100">
                  {stellarWallet.address.slice(0, 4)}...{stellarWallet.address.slice(-2)}
                </span>
                <button
                  onClick={disconnectStellarWallet}
                  className="text-red-400 hover:text-red-300"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <button
                  onClick={connectStellarWallet}
                  disabled={isLoading}
                  className="px-3 py-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white rounded-md transition-colors"
                >
                  {isLoading ? "Connecting..." : "Connect XLM"}
                </button>
                <button
                  onClick={handleDebugFreighter}
                  className="px-2 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded-md text-xs"
                  title="Debug Freighter connection"
                >
                  🐛
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Mobile nav fallback (optional) */}
        <div className="md:hidden mt-4 pt-4 border-t border-gray-700">
          <nav className="flex items-center space-x-4 justify-center">
            {["/dashboard", "/swap", "/history"].map((path) => (
              <Link
                key={path}
                to={path}
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive(path)
                    ? "bg-blue-600 text-white"
                    : "text-gray-300 hover:text-white hover:bg-gray-700"
                }`}
              >
                {path.replace("/", "").charAt(0).toUpperCase() + path.slice(2)}
              </Link>
            ))}
          </nav>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mt-4 p-3 bg-red-900/50 border border-red-700 rounded-md">
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}
      </div>
    </header>
  );
}
