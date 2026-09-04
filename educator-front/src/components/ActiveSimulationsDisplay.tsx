import React from 'react';
import { useActiveSimulations } from '../hooks/useActiveSimulations';

export const ActiveSimulationsDisplay: React.FC = () => {
  const { activeCount, totalCount, activeSimulations, loading, error } =
    useActiveSimulations();

  if (loading) {
    return (
      <div className="p-6 bg-blue-50 rounded-lg">
        <p className="text-blue-700">Loading simulations...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 rounded-lg">
        <p className="text-red-700">Error: {error}</p>
      </div>
    );
  }

  const percentageActive = totalCount > 0 ? ((activeCount / totalCount) * 100).toFixed(2) : 0;

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg border border-blue-200">
          <div className="text-sm font-semibold text-blue-900">Active Simulations</div>
          <div className="text-3xl font-bold text-blue-600 mt-2">{activeCount}</div>
        </div>
        <div className="p-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg border border-gray-200">
          <div className="text-sm font-semibold text-gray-900">Total Simulations</div>
          <div className="text-3xl font-bold text-gray-600 mt-2">{totalCount}</div>
        </div>
      </div>

      <div className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border border-green-200">
        <div className="text-sm font-semibold text-green-900">Active Rate</div>
        <div className="text-2xl font-bold text-green-600 mt-2">{percentageActive}%</div>
      </div>

      {/* Active Simulations List */}
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-gray-100 px-6 py-3 border-b">
          <h3 className="font-semibold text-gray-800">Active Simulations</h3>
        </div>
        <div className="divide-y max-h-96 overflow-y-auto">
          {activeSimulations.length > 0 ? (
            activeSimulations.map((sim, index) => (
              <div key={sim.id} className="p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">
                      {index + 1}. {sim.title}
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      ID: {sim.id} | Status:{' '}
                      <span className="inline-block px-2 py-0.5 bg-green-100 text-green-800 rounded text-xs font-semibold">
                        {sim.status}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="p-4 text-center text-gray-500">
              No active simulations found
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ActiveSimulationsDisplay;
