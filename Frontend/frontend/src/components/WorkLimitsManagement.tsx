import React, { useState, useEffect } from 'react';
import { residentsApi } from '../api/client';

interface WorkLimit {
  id: number;
  residentId?: number;
  limitType: string;
  maxValue: number;
  isActive: boolean;
  reason?: string;
  resident?: {
    firstName: string;
    lastName: string;
  };
}

interface Resident {
  id: number;
  firstName: string;
  lastName: string;
}

const WorkLimitsManagement: React.FC = () => {
  const [workLimits, setWorkLimits] = useState<WorkLimit[]>([]);
  const [residents, setResidents] = useState<Resident[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingLimit, setEditingLimit] = useState<WorkLimit | null>(null);
  const [error, setError] = useState<string>('');

  const [limitForm, setLimitForm] = useState({
    residentId: '',
    limitType: 'weekly_days',
    maxValue: 3,
    reason: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [limitsResponse, residentsResponse] = await Promise.all([
        fetch('/api/work-limits'),
        residentsApi.getAll()
      ]);
      
      if (limitsResponse.ok) {
        const limitsData = await limitsResponse.json();
        setWorkLimits(limitsData);
      }
      
      setResidents(residentsResponse.data);
    } catch (error: any) {
      console.error('Failed to fetch data:', error);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const submitData = {
        residentId: limitForm.residentId ? parseInt(limitForm.residentId) : null,
        limitType: limitForm.limitType,
        maxValue: limitForm.maxValue,
        reason: limitForm.reason || null
      };

      const response = await fetch('/api/work-limits', {
        method: editingLimit ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify(editingLimit ? { ...submitData, id: editingLimit.id } : submitData)
      });

      if (!response.ok) {
        throw new Error('Failed to save work limit');
      }
      
      await fetchData();
      resetForm();
      setError('');
    } catch (error: any) {
      setError(error.message || 'Failed to save work limit');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this work limit?')) {
      return;
    }

    try {
      const response = await fetch(`/api/work-limits/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to delete work limit');
      }

      await fetchData();
    } catch (error: any) {
      setError(error.message || 'Failed to delete work limit');
    }
  };

  const resetForm = () => {
    setLimitForm({
      residentId: '',
      limitType: 'weekly_days',
      maxValue: 3,
      reason: ''
    });
    setEditingLimit(null);
    setShowForm(false);
  };

  const handleEdit = (limit: WorkLimit) => {
    setEditingLimit(limit);
    setLimitForm({
      residentId: limit.residentId?.toString() || '',
      limitType: limit.limitType,
      maxValue: limit.maxValue,
      reason: limit.reason || ''
    });
    setShowForm(true);
  };

  const limitTypes = [
    { value: 'weekly_days', label: 'Weekly Days Limit', description: 'Maximum days per week' },
    { value: 'daily_hours', label: 'Daily Hours Limit', description: 'Maximum hours per day' },
    { value: 'monthly_days', label: 'Monthly Days Limit', description: 'Maximum days per month' }
  ];

  const globalLimits = workLimits.filter(limit => !limit.residentId);
  const individualLimits = workLimits.filter(limit => limit.residentId);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">Loading work limits...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Work Limits Management</h2>
          <p className="text-sm text-gray-600 mt-1">
            Set global and individual work limits to ensure fair scheduling
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
        >
          Add Work Limit
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Current 3-Day Limit Notice */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-medium text-blue-900 mb-2">📋 Current System Settings</h4>
        <p className="text-sm text-blue-800">
          The scheduling system is currently configured with a <strong>3-day maximum work limit per week</strong> for all residents. 
          This is enforced automatically during schedule generation to ensure fair work distribution.
        </p>
      </div>

      {/* Global Limits */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold">Global Work Limits</h3>
          <p className="text-sm text-gray-600 mt-1">
            Default limits that apply to all residents unless overridden
          </p>
        </div>
        
        {globalLimits.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-500">
            <p>No global work limits set</p>
            <p className="text-sm mt-1">System uses built-in 3-day weekly limit</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {globalLimits.map(limit => (
              <div key={limit.id} className="px-6 py-4">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium text-gray-900">
                      {limitTypes.find(t => t.value === limit.limitType)?.label}
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      Maximum: {limit.maxValue} {limit.limitType.includes('days') ? 'days' : 'hours'}
                    </div>
                    {limit.reason && (
                      <div className="text-sm text-gray-500 mt-1">
                        Reason: {limit.reason}
                      </div>
                    )}
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleEdit(limit)}
                      className="text-blue-600 hover:text-blue-900 text-sm"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(limit.id)}
                      className="text-red-600 hover:text-red-900 text-sm"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Individual Limits */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold">Individual Work Limits</h3>
          <p className="text-sm text-gray-600 mt-1">
            Custom limits for specific residents that override global defaults
          </p>
        </div>
        
        {individualLimits.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-500">
            <p>No individual work limits set</p>
            <p className="text-sm mt-1">All residents use the global 3-day weekly limit</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {individualLimits.map(limit => (
              <div key={limit.id} className="px-6 py-4">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium text-gray-900">
                      {limit.resident?.firstName} {limit.resident?.lastName}
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      {limitTypes.find(t => t.value === limit.limitType)?.label}: {limit.maxValue} {limit.limitType.includes('days') ? 'days' : 'hours'}
                    </div>
                    {limit.reason && (
                      <div className="text-sm text-gray-500 mt-1">
                        Reason: {limit.reason}
                      </div>
                    )}
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleEdit(limit)}
                      className="text-blue-600 hover:text-blue-900 text-sm"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(limit.id)}
                      className="text-red-600 hover:text-red-900 text-sm"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Work Limit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">
              {editingLimit ? 'Edit Work Limit' : 'Add Work Limit'}
            </h3>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Apply To
                </label>
                <select
                  value={limitForm.residentId}
                  onChange={(e) => setLimitForm({...limitForm, residentId: e.target.value})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Residents (Global)</option>
                  {residents.map(resident => (
                    <option key={resident.id} value={resident.id}>
                      {resident.firstName} {resident.lastName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Limit Type
                </label>
                <select
                  value={limitForm.limitType}
                  onChange={(e) => setLimitForm({...limitForm, limitType: e.target.value})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {limitTypes.map(type => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  {limitTypes.find(t => t.value === limitForm.limitType)?.description}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Maximum Value
                </label>
                <input
                  type="number"
                  value={limitForm.maxValue}
                  onChange={(e) => setLimitForm({...limitForm, maxValue: parseInt(e.target.value) || 1})}
                  min="1"
                  max="7"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  {limitForm.limitType.includes('days') ? 'days' : 'hours'} per {limitForm.limitType.split('_')[0]}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason (Optional)
                </label>
                <textarea
                  value={limitForm.reason}
                  onChange={(e) => setLimitForm({...limitForm, reason: e.target.value})}
                  rows={3}
                  placeholder="Why this limit is needed..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  {editingLimit ? 'Update' : 'Create'} Limit
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h4 className="font-medium text-gray-900 mb-2">💡 How Work Limits Work</h4>
        <ul className="text-sm text-gray-700 space-y-1">
          <li>• <strong>Global limits</strong> apply to all residents by default</li>
          <li>• <strong>Individual limits</strong> override global limits for specific residents</li>
          <li>• The schedule generator automatically respects these limits</li>
          <li>• <strong>Weekly days limit</strong> is most commonly used (currently 3 days max)</li>
          <li>• Limits help ensure fair work distribution and prevent overworking</li>
          <li>• You can set lower limits for residents with special needs or restrictions</li>
        </ul>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={() => {
              setLimitForm({
                residentId: '',
                limitType: 'weekly_days',
                maxValue: 2,
                reason: 'Reduced capacity due to health or other constraints'
              });
              setShowForm(true);
            }}
            className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-left"
          >
            <div className="font-medium text-gray-900">Set 2-Day Global Limit</div>
            <div className="text-sm text-gray-600 mt-1">
              Reduce all residents to max 2 days per week
            </div>
          </button>
          
          <button
            onClick={() => {
              setLimitForm({
                residentId: '',
                limitType: 'weekly_days',
                maxValue: 4,
                reason: 'Increased capacity for residents who can handle more work'
              });
              setShowForm(true);
            }}
            className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-left"
          >
            <div className="font-medium text-gray-900">Set 4-Day Global Limit</div>
            <div className="text-sm text-gray-600 mt-1">
              Allow up to 4 days per week for all residents
            </div>
          </button>
          
          <button
            onClick={() => {
              setLimitForm({
                residentId: '',
                limitType: 'daily_hours',
                maxValue: 8,
                reason: 'Standard 8-hour daily work limit'
              });
              setShowForm(true);
            }}
            className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-left"
          >
            <div className="font-medium text-gray-900">Set 8-Hour Daily Limit</div>
            <div className="text-sm text-gray-600 mt-1">
              Limit daily work hours to 8 hours maximum
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

export default WorkLimitsManagement;