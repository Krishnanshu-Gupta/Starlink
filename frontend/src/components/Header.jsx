import React from "react";
import { Link, useLocation } from "react-router-dom";
import { useWallet } from "../contexts/WalletContext.jsx";

export default function Header() {
  const location = useLocation();
  const {
    ethWallet,
    stellarWallet,
    connectEthWallet,
    connectStellarWallet,
    disconnectEthWallet,
    disconnectStellarWallet,
    isLoading,
    error
  } = useWallet();

  const isActive = (path) => location.pathname === path;

  return (
    <header className="bg-gray-800/50 backdrop-blur-sm border-b border-gray-700 rounded-lg">
      <div className="max-w-6xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          {/* Logo and Navigation */}
          <div className="flex items-center space-x-8">
            <Link to="/dashboard" className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">FC</span>
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                Fusion-Cross
              </span>
            </Link>

            <nav className="hidden md:flex items-center space-x-6">
              <Link
                to="/dashboard"
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive("/dashboard")
                    ? "bg-blue-600 text-white"
                    : "text-gray-300 hover:text-white hover:bg-gray-700"
                }`}
              >
                Dashboard
              </Link>
              <Link
                to="/swap"
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive("/swap")
                    ? "bg-blue-600 text-white"
                    : "text-gray-300 hover:text-white hover:bg-gray-700"
                }`}
              >
                Swap
              </Link>
              <Link
                to="/history"
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive("/history")
                    ? "bg-blue-600 text-white"
                    : "text-gray-300 hover:text-white hover:bg-gray-700"
                }`}
              >
                History
              </Link>
            </nav>
          </div>

          {/* Wallet Connections */}
          <div className="flex items-center space-x-4">
            {/* Ethereum Wallet */}
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${ethWallet.isConnected ? 'bg-green-400' : 'bg-gray-500'}`}></div>
              {ethWallet.isConnected ? (
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-gray-400">ETH</span>
                  <span className="text-sm font-mono text-gray-300">
                    {ethWallet.address.slice(0, 6)}...{ethWallet.address.slice(-4)}
                  </span>
                  <span className="text-xs text-green-400">
                    {parseFloat(ethWallet.balance).toFixed(4)} ETH
                  </span>
                  <button
                    onClick={disconnectEthWallet}
                    className="text-xs text-red-400 hover:text-red-300 transition-colors"
                  >
                    Disconnect
                  </button>
                </div>
              ) : (
                <button
                  onClick={connectEthWallet}
                  disabled={isLoading}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white text-xs font-medium rounded-md transition-colors"
                >
                  {isLoading ? "Connecting..." : "Connect ETH"}
                </button>
              )}
            </div>

            {/* Stellar Wallet */}
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${stellarWallet.isConnected ? 'bg-green-400' : 'bg-gray-500'}`}></div>
              {stellarWallet.isConnected ? (
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-gray-400">XLM</span>
                  <span className="text-sm font-mono text-gray-300">
                    {stellarWallet.address.slice(0, 6)}...{stellarWallet.address.slice(-4)}
                  </span>
                  <span className="text-xs text-green-400">
                    {parseFloat(stellarWallet.balance).toFixed(2)} XLM
                  </span>
                  <button
                    onClick={disconnectStellarWallet}
                    className="text-xs text-red-400 hover:text-red-300 transition-colors"
                  >
                    Disconnect
                  </button>
                </div>
              ) : (
                <button
                  onClick={connectStellarWallet}
                  disabled={isLoading}
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white text-xs font-medium rounded-md transition-colors"
                >
                  {isLoading ? "Connecting..." : "Connect XLM"}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        <div className="md:hidden mt-4 pt-4 border-t border-gray-700">
          <nav className="flex items-center space-x-4">
            <Link
              to="/dashboard"
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive("/dashboard")
                  ? "bg-blue-600 text-white"
                  : "text-gray-300 hover:text-white hover:bg-gray-700"
              }`}
            >
              Dashboard
            </Link>
            <Link
              to="/swap"
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive("/swap")
                  ? "bg-blue-600 text-white"
                  : "text-gray-300 hover:text-white hover:bg-gray-700"
              }`}
            >
              Swap
            </Link>
            <Link
              to="/history"
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive("/history")
                  ? "bg-blue-600 text-white"
                  : "text-gray-300 hover:text-white hover:bg-gray-700"
              }`}
            >
              History
            </Link>
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