import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

const ResolverAuction = ({ swapId, onBidSubmitted }) => {
  const queryClient = useQueryClient();

  // Fetch auction status
  const { data: auctionStatus, isLoading: auctionLoading } = useQuery({
    queryKey: ['auction', swapId],
    queryFn: async () => {
      const response = await fetch(`http://localhost:3001/api/swap/auction/${swapId}`);
      if (!response.ok) throw new Error('Failed to fetch auction status');
      return response.json();
    },
    refetchInterval: 2000, // Poll every 2 seconds
    enabled: !!swapId
  });

  // Fetch resolver statistics
  const { data: resolverStats, isLoading: statsLoading } = useQuery({
    queryKey: ['resolver-stats'],
    queryFn: async () => {
      const response = await fetch('http://localhost:3001/api/swap/resolver-stats');
      if (!response.ok) throw new Error('Failed to fetch resolver stats');
      return response.json();
    },
    refetchInterval: 3000, // Poll every 3 seconds
    enabled: !!swapId
  });

  const formatTime = (ms) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  if (auctionLoading || statsLoading) {
    return <div className="text-center py-4 text-gray-400">Loading auction...</div>;
  }

  // Show resolver stats even when no active auction
  if (!auctionStatus?.active) {
    return (
      <div className="bg-gray-700/50 backdrop-blur-sm border border-gray-600 rounded-lg p-6">
        <h3 className="text-xl font-semibold text-white mb-4">🛒 Dutch Auction</h3>

        <div className="text-center py-4 text-gray-500 mb-4">
          No active auction for this swap
        </div>

        {/* Resolver Statistics - Show even when idle */}
        {resolverStats && (
          <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-600">
            <h4 className="text-lg font-medium text-white mb-4">🤖 Resolver Status</h4>
            <div className="space-y-3">
              {Object.entries(resolverStats).map(([resolverId, stats]) => (
                <div key={resolverId} className="bg-gray-700/50 rounded-lg p-3 border border-gray-600">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-white font-medium">{stats.name}</span>
                    <span className={`font-bold ${stats.status === 'idle' ? 'text-gray-400' : 'text-green-400'}`}>
                      {stats.status === 'idle' ? 'Idle' : `${stats.percentage}%`}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-gray-400">Filled:</span>
                      <span className="ml-2 text-white">{stats.totalFilled} XLM</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Avg Price:</span>
                      <span className="ml-2 text-blue-400">{stats.averagePrice} XLM</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Bids:</span>
                      <span className="ml-2 text-purple-400">{stats.bidCount}</span>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 mt-2">
                    Success Rate: {(stats.successRate * 100).toFixed(0)}% • Response: {stats.avgResponseTime}ms
                  </div>
                </div>
              ))}
            </div>
            <div className="text-xs text-gray-500 mt-3">
              🤖 Resolvers will automatically bid when an auction starts
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-gray-700/50 backdrop-blur-sm border border-gray-600 rounded-lg p-6">
      <h3 className="text-xl font-semibold text-white mb-4">🛒 Dutch Auction</h3>

      {/* Auction Status */}
      <div className="mb-6 p-4 bg-gray-800/50 rounded-lg border border-gray-600">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-medium text-gray-300">Current Price:</span>
            <span className="ml-2 text-green-400 font-bold">
              {auctionStatus.currentPrice?.toFixed(2)} XLM
            </span>
          </div>
          <div>
            <span className="font-medium text-gray-300">Time Remaining:</span>
            <span className="ml-2 text-orange-400 font-bold">
              {formatTime(auctionStatus.timeRemaining)}
            </span>
          </div>
          <div>
            <span className="font-medium text-gray-300">Filled Amount:</span>
            <span className="ml-2 text-white">
              {auctionStatus.filledAmount} / {auctionStatus.totalAmount} XLM
            </span>
          </div>
          <div>
            <span className="font-medium text-gray-300">Remaining:</span>
            <span className="ml-2 text-blue-400">
              {auctionStatus.remainingAmount} XLM
            </span>
          </div>
        </div>
      </div>

      {/* Resolver Statistics */}
      <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-600">
        <h4 className="text-lg font-medium text-white mb-4">🤖 Automated Resolver Activity</h4>
        <div className="space-y-3">
          {resolverStats && Object.entries(resolverStats).map(([resolverId, stats]) => (
            <div key={resolverId} className="bg-gray-700/50 rounded-lg p-3 border border-gray-600">
              <div className="flex justify-between items-center mb-2">
                <span className="text-white font-medium">{stats.name}</span>
                <span className="text-green-400 font-bold">{stats.percentage}%</span>
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-gray-400">Filled:</span>
                  <span className="ml-2 text-white">{stats.totalFilled} XLM</span>
                </div>
                <div>
                  <span className="text-gray-400">Avg Price:</span>
                  <span className="ml-2 text-blue-400">{stats.averagePrice} XLM</span>
                </div>
                <div>
                  <span className="text-gray-400">Bids:</span>
                  <span className="ml-2 text-purple-400">{stats.bidCount}</span>
                </div>
              </div>
              <div className="text-xs text-gray-500 mt-2">
                Success Rate: {(stats.successRate * 100).toFixed(0)}% • Response: {stats.avgResponseTime}ms
              </div>
            </div>
          ))}
        </div>
        <div className="text-xs text-gray-500 mt-3">
          🤖 Resolvers automatically bid based on smart auction parameters
        </div>
      </div>

      {/* Recent Activity */}
      {auctionStatus.bids && auctionStatus.bids.length > 0 && (
        <div className="mt-6">
          <h4 className="text-lg font-medium text-white mb-3">📊 Recent Activity</h4>
          <div className="space-y-2">
            {auctionStatus.bids.slice(-5).map((bid, index) => (
              <div key={index} className="bg-gray-700/50 rounded-lg p-3 border border-gray-600">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-300">{bid.resolverName}</span>
                  <span className="text-green-400 font-medium">{bid.amount} XLM</span>
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  Price: {bid.price} XLM • {new Date(bid.timestamp).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ResolverAuction;