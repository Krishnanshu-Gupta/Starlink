import { useState, useEffect } from "react";
import axios from "axios";

export default function ClaimXlm() {
  const [done, setDone] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimResult, setClaimResult] = useState(null);
  const [error, setError] = useState(null);

  // Get swap ID from URL or localStorage
  const getSwapId = () => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('swapId') || localStorage.getItem('currentSwapId');
  };

  async function claim() {
    const swapId = getSwapId();
    if (!swapId) {
      setError("No swap ID found. Please initiate a swap first.");
      return;
    }

    setClaiming(true);
    setError(null);

    try {
      // Get the secret from localStorage (set during swap initiation)
      const secret = localStorage.getItem('swapSecret');
      if (!secret) {
        throw new Error("No secret found. Please initiate a swap first.");
      }

      console.log(`🔓 Claiming XLM for swap: ${swapId}`);
      console.log(`🔑 Using secret: ${secret.slice(0, 10)}...`);

      const response = await axios.post("http://localhost:3001/api/swap/claim-xlm", {
        swapId,
        secret
      });

      console.log("Claim response:", response.data);

      setClaimResult(response.data);
      setDone(true);

      // Show detailed results
      if (response.data.summary) {
        console.log(`📊 Claim Summary:`);
        console.log(`   Total Resolvers: ${response.data.summary.totalResolvers}`);
        console.log(`   Successful Claims: ${response.data.summary.successfulClaims}`);
        console.log(`   Failed Claims: ${response.data.summary.failedClaims}`);
        console.log(`   Total XLM Claimed: ${response.data.totalClaimed}`);
      }

      if (response.data.claimResults) {
        console.log("📋 Individual Claim Results:");
        response.data.claimResults.forEach((result, index) => {
          if (result.status === "claimed") {
            console.log(`   ✅ Resolver ${result.resolverId}: ${result.amount} XLM (${result.txHash})`);
          } else {
            console.log(`   ❌ Resolver ${result.resolverId}: ${result.amount} XLM (${result.error})`);
          }
        });
      }

    } catch (error) {
      console.error("Claim error:", error);
      setError(error.response?.data?.error || error.message || "Failed to claim XLM");
    } finally {
      setClaiming(false);
    }
  }

  // Get swap status on component mount
  useEffect(() => {
    const checkSwapStatus = async () => {
      const swapId = getSwapId();
      if (swapId) {
        try {
          const response = await axios.get(`http://localhost:3001/api/swap/status/${swapId}`);
          console.log("Current swap status:", response.data);
        } catch (error) {
          console.error("Error checking swap status:", error);
        }
      }
    };

    checkSwapStatus();
  }, []);

  return (
    <div className="space-y-6 p-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Claim XLM</h2>
        <p className="text-gray-600">
          Claim your XLM from all resolver contracts using the secret
        </p>
      </div>

      {!done ? (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-2">🔢 10-Contract System</h3>
            <p className="text-blue-800 text-sm">
              Your locked ETH has been split into 10 separate HTLC contracts.
              Each resolver can claim specific contracts based on their fill percentage.
            </p>
          </div>

          <button
            onClick={claim}
            disabled={claiming}
            className={`w-full btn ${claiming ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {claiming ? (
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Claiming XLM...
              </div>
            ) : (
              "Claim XLM from All Resolvers"
            )}
          </button>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <h3 className="font-semibold text-green-900 mb-2">✅ XLM Claimed Successfully!</h3>
            <p className="text-green-800 text-sm">
              Your XLM has been claimed from all resolver contracts.
            </p>
          </div>

          {claimResult && (
            <div className="space-y-4">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 mb-2">📊 Claim Summary</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium">Total XLM Claimed:</span>
                    <span className="ml-2 text-green-600 font-bold">
                      {claimResult.totalClaimed} XLM
                    </span>
                  </div>
                  {claimResult.summary && (
                    <>
                      <div>
                        <span className="font-medium">Total Resolvers:</span>
                        <span className="ml-2">{claimResult.summary.totalResolvers}</span>
                      </div>
                      <div>
                        <span className="font-medium">Successful Claims:</span>
                        <span className="ml-2 text-green-600">
                          {claimResult.summary.successfulClaims}
                        </span>
                      </div>
                      <div>
                        <span className="font-medium">Failed Claims:</span>
                        <span className="ml-2 text-red-600">
                          {claimResult.summary.failedClaims}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {claimResult.claimResults && claimResult.claimResults.length > 0 && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-2">📋 Individual Results</h4>
                  <div className="space-y-2">
                    {claimResult.claimResults.map((result, index) => (
                      <div
                        key={index}
                        className={`p-3 rounded-lg border ${
                          result.status === "claimed"
                            ? "bg-green-50 border-green-200"
                            : "bg-red-50 border-red-200"
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-medium">
                            Resolver {result.resolverId}
                          </span>
                          <span className={`text-sm ${
                            result.status === "claimed" ? "text-green-600" : "text-red-600"
                          }`}>
                            {result.status === "claimed" ? "✅" : "❌"}
                          </span>
                        </div>
                        <div className="text-sm text-gray-600 mt-1">
                          Amount: {result.amount} XLM
                        </div>
                        {result.txHash && (
                          <div className="text-xs text-gray-500 mt-1">
                            TX: {result.txHash.slice(0, 10)}...
                          </div>
                        )}
                        {result.error && (
                          <div className="text-xs text-red-600 mt-1">
                            Error: {result.error}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="text-center">
            <p className="text-gray-600 text-sm">
              Check your Stellar wallet for the received XLM.
              You can also view the transactions on the Stellar explorer.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}