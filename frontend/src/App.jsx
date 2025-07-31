import React from "react";
import { Route, Routes, Navigate } from "react-router-dom";
import Dashboard from "./pages/Dashboard.jsx";
import SwapInterface from "./pages/SwapInterface.jsx";
import SwapHistory from "./pages/SwapHistory.jsx";
import SwapStatus from "./pages/SwapStatus.jsx";
import Header from "./components/Header.jsx";
import { WalletProvider } from "./contexts/WalletContext.jsx";
import { SwapProvider } from "./contexts/SwapContext.jsx";

function App() {
  return (
    <WalletProvider>
      <SwapProvider>
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 text-gray-100">
          <div className="max-w-6xl mx-auto px-4 py-8">
            <Header />
            <main className="mt-8">
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/swap" element={<SwapInterface />} />
                <Route path="/history" element={<SwapHistory />} />
                <Route path="/swap/:swapId" element={<SwapStatus />} />
              </Routes>
            </main>
          </div>
        </div>
      </SwapProvider>
    </WalletProvider>
  );
}

export default App;