import React, { useState, useEffect } from 'react';
import { scheduleApi, residentsApi } from '../api/client';

interface SchedulePeriod {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  assignments?: ShiftAssignment[];
}

interface ShiftAssignment {
  id: number;
  shiftId: number;
  residentId: number;
  assignedDate: string;
  roleTitle: string;
  status: string;
  notes?: string;
  shift: {
    id: number;
    name: string;
    startTime: string;
    endTime: string;
    department: {
      name: string;
      priority: number;
    };
  };
  resident: {
    id: number;
    firstName: string;
    lastName: string;
  };
}

interface Conflict {
  id: number;
  conflictDate: string;
  conflictType: string;
  description: string;
  severity: string;
}

interface Resident {
  id: number;
  firstName: string;
  lastName: string;
}

const ScheduleManagement: React.FC = () => {
  const [periods, setPeriods] = useState<SchedulePeriod[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<SchedulePeriod | null>(null);
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [residents, setResidents] = useState<Resident[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'periods' | 'schedule' | 'conflicts'>('periods');
  const [showNewPeriodForm, setShowNewPeriodForm] = useState(false);
  
  const [newPeriod, setNewPeriod] = useState({
    name: '',
    startDate: '',
    endDate: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (selectedPeriod) {
      fetchAssignments();
      fetchConflicts();
    }
  }, [selectedPeriod]);

  const fetchData = async () => {
    try {
      const [periodsResponse, residentsResponse] = await Promise.all([
        scheduleApi.getPeriods(),
        residentsApi.getAll()
      ]);
      setPeriods(periodsResponse.data);
      setResidents(residentsResponse.data);
    } catch (error: any) {
      console.error('Failed to fetch data:', error);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const fetchAssignments = async () => {
    if (!selectedPeriod) return;
    
    try {
      const response = await scheduleApi.getAssignments(selectedPeriod.id);
      setAssignments(response.data);
    } catch (error: any) {
      console.error('Failed to fetch assignments:', error);
      setError('Failed to load assignments');
    }
  };

  const fetchConflicts = async () => {
    if (!selectedPeriod) return;
    
    try {
      const response = await scheduleApi.getConflicts(
        selectedPeriod.id,
        selectedPeriod.startDate,
        selectedPeriod.endDate
      );
      setConflicts(response.data);
    } catch (error: any) {
      console.error('Failed to fetch conflicts:', error);
      setError('Failed to load conflicts');
    }
  };

  const handleCreatePeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newPeriod.name || !newPeriod.startDate || !newPeriod.endDate) {
      setError('All fields are required');
      return;
    }

    try {
      await scheduleApi.createPeriod(newPeriod);
      await fetchData();
      setNewPeriod({ name: '', startDate: '', endDate: '' });
      setShowNewPeriodForm(false);
      setError('');
    } catch (error: any) {
      setError(error.message || 'Failed to create schedule period');
    }
  };

  const handleGenerateSchedule = async () => {
    if (!selectedPeriod) return;
    
    const confirmed = confirm(
      'This will clear any existing assignments and generate a new schedule. Continue?'
    );
    
    if (!confirmed) return;

    setGenerating(true);
    try {
      const response = await scheduleApi.generateSchedule({
        schedulePeriodId: selectedPeriod.id,
        startDate: selectedPeriod.startDate,
        endDate: selectedPeriod.endDate
      });
      
      await fetchAssignments();
      await fetchConflicts();
      
      alert(`Schedule generated! ${response.data.stats.assignmentsCreated} assignments created, ${response.data.stats.conflictsFound} conflicts found.`);
    } catch (error: any) {
      setError(error.message || 'Failed to generate schedule');
    } finally {
      setGenerating(false);
    }
  };

  const getWeekDates = (startDate: string, endDate: string) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const dates = [];
    
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dates.push(new Date(d));
    }
    
    return dates;
  };

  const getAssignmentsForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    return assignments.filter(a => a.assignedDate.split('T')[0] === dateStr);
  };

  const getDayName = (date: Date) => {
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getConflictsForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    return conflicts.filter(c => c.conflictDate.split('T')[0] === dateStr);
  };

  const getTotalStaffAssigned = () => {
    return assignments.length;
  };

  const getTotalConflicts = () => {
    return conflicts.filter(c => c.severity === 'error').length;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">Loading schedules...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Schedule Generator</h2>
        <div className="flex space-x-4">
          <button
            onClick={() => setActiveTab('periods')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'periods'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Schedule Periods
          </button>
          <button
            onClick={() => setActiveTab('schedule')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'schedule'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
            disabled={!selectedPeriod}
          >
            Weekly Schedule
          </button>
          <button
            onClick={() => setActiveTab('conflicts')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'conflicts'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
            disabled={!selectedPeriod}
          >
            Conflicts ({getTotalConflicts()})
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Schedule Periods Tab */}
      {activeTab === 'periods' && (
        <>
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Schedule Periods</h3>
            <button
              onClick={() => setShowNewPeriodForm(true)}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
            >
              Create New Period
            </button>
          </div>

          {/* New Period Form Modal */}
          {showNewPeriodForm && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
                <h3 className="text-lg font-semibold mb-4">Create Schedule Period</h3>
                
                <form onSubmit={handleCreatePeriod} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Period Name *
                    </label>
                    <input
                      type="text"
                      value={newPeriod.name}
                      onChange={(e) => setNewPeriod({...newPeriod, name: e.target.value})}
                      placeholder="e.g., Week of June 9, 2025"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Start Date *
                    </label>
                    <input
                      type="date"
                      value={newPeriod.startDate}
                      onChange={(e) => setNewPeriod({...newPeriod, startDate: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      End Date *
                    </label>
                    <input
                      type="date"
                      value={newPeriod.endDate}
                      onChange={(e) => setNewPeriod({...newPeriod, endDate: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>

                  <div className="flex space-x-3 pt-4">
                    <button
                      type="submit"
                      className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Create Period
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowNewPeriodForm(false)}
                      className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Periods List */}
          <div className="bg-white rounded-lg shadow">
            {periods.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-500">
                <p className="text-lg">No schedule periods created yet</p>
                <p className="text-sm">Create your first schedule period to start generating work schedules</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {periods.map(period => (
                  <div key={period.id} className="px-6 py-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <h4 className="font-medium text-gray-900">{period.name}</h4>
                        <p className="text-sm text-gray-500 mt-1">
                          {new Date(period.startDate).toLocaleDateString()} - {new Date(period.endDate).toLocaleDateString()}
                        </p>
                        <p className="text-sm text-gray-500 mt-1">
                          {period.assignments?.length || 0} assignments
                        </p>
                      </div>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => {
                            setSelectedPeriod(period);
                            setActiveTab('schedule');
                          }}
                          className="text-blue-600 hover:text-blue-900 text-sm"
                        >
                          View Schedule
                        </button>
                        <button
                          onClick={() => setSelectedPeriod(period)}
                          className={`px-3 py-1 text-sm rounded ${
                            selectedPeriod?.id === period.id
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          Select
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Weekly Schedule Tab */}
      {activeTab === 'schedule' && selectedPeriod && (
        <>
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold">{selectedPeriod.name}</h3>
              <p className="text-sm text-gray-600">
                {getTotalStaffAssigned()} total assignments • {getTotalConflicts()} conflicts
              </p>
            </div>
            <button
              onClick={handleGenerateSchedule}
              disabled={generating}
              className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 transition-colors disabled:bg-gray-400"
            >
              {generating ? 'Generating...' : 'Generate Schedule'}
            </button>
          </div>

          {/* Weekly Calendar View */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="grid grid-cols-1 md:grid-cols-7 gap-px bg-gray-200">
              {getWeekDates(selectedPeriod.startDate, selectedPeriod.endDate).map(date => {
                const dayAssignments = getAssignmentsForDate(date);
                const dayConflicts = getConflictsForDate(date);
                
                return (
                  <div key={date.toISOString()} className="bg-white min-h-96">
                    {/* Day Header */}
                    <div className="p-3 border-b border-gray-200 bg-gray-50">
                      <div className="font-medium text-gray-900">{getDayName(date)}</div>
                      <div className="text-sm text-gray-500">{formatDate(date)}</div>
                      {dayConflicts.length > 0 && (
                        <div className="text-xs text-red-600 mt-1">
                          {dayConflicts.length} conflicts
                        </div>
                      )}
                    </div>
                    
                    {/* Day Content */}
                    <div className="p-2 space-y-1">
                      {dayAssignments.length === 0 ? (
                        <div className="text-xs text-gray-400 italic">No assignments</div>
                      ) : (
                        dayAssignments
                          .sort((a, b) => a.shift.startTime.localeCompare(b.shift.startTime))
                          .map(assignment => (
                            <div
                              key={assignment.id}
                              className="text-xs p-2 rounded border-l-2 border-blue-400 bg-blue-50"
                            >
                              <div className="font-medium text-gray-900">
                                {assignment.shift.name}
                              </div>
                              <div className="text-gray-600">
                                {assignment.shift.startTime} - {assignment.shift.endTime}
                              </div>
                              <div className="text-blue-700 font-medium">
                                {assignment.resident.firstName} {assignment.resident.lastName}
                              </div>
                              <div className="text-gray-500">
                                {assignment.roleTitle}
                              </div>
                              {assignment.status !== 'scheduled' && (
                                <div className={`text-xs mt-1 ${
                                  assignment.status === 'completed' ? 'text-green-600' :
                                  assignment.status === 'no_show' ? 'text-red-600' :
                                  'text-yellow-600'
                                }`}>
                                  {assignment.status.replace('_', ' ')}
                                </div>
                              )}
                            </div>
                          ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Daily Summary */}
          <div className="bg-white rounded-lg shadow p-6">
            <h4 className="text-lg font-semibold mb-4">Schedule Summary</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {getTotalStaffAssigned()}
                </div>
                <div className="text-sm text-gray-500">Total Assignments</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {assignments.filter(a => a.status === 'scheduled').length}
                </div>
                <div className="text-sm text-gray-500">Scheduled</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">
                  {getTotalConflicts()}
                </div>
                <div className="text-sm text-gray-500">Conflicts</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">
                  {assignments.filter(a => a.status === 'completed').length}
                </div>
                <div className="text-sm text-gray-500">Completed</div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Conflicts Tab */}
      {activeTab === 'conflicts' && selectedPeriod && (
        <>
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Schedule Conflicts</h3>
            <div className="text-sm text-gray-600">
              {conflicts.length} total conflicts found
            </div>
          </div>

          <div className="bg-white rounded-lg shadow">
            {conflicts.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-500">
                <div className="text-green-600 text-lg">🎉 No conflicts found!</div>
                <p className="text-sm">All shifts have been successfully assigned.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {conflicts.map(conflict => (
                  <div key={conflict.id} className="px-6 py-4">
                    <div className="flex items-start space-x-3">
                      <div className={`flex-shrink-0 w-3 h-3 rounded-full mt-1 ${
                        conflict.severity === 'error' ? 'bg-red-400' :
                        conflict.severity === 'warning' ? 'bg-yellow-400' :
                        'bg-blue-400'
                      }`}></div>
                      <div className="flex-1">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-medium text-gray-900">
                              {conflict.conflictType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </div>
                            <div className="text-sm text-gray-600 mt-1">
                              {conflict.description}
                            </div>
                            <div className="text-sm text-gray-500 mt-1">
                              {new Date(conflict.conflictDate).toLocaleDateString('en-US', {
                                weekday: 'long',
                                month: 'short',
                                day: 'numeric'
                              })}
                            </div>
                          </div>
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            conflict.severity === 'error' ? 'bg-red-100 text-red-800' :
                            conflict.severity === 'warning' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-blue-100 text-blue-800'
                          }`}>
                            {conflict.severity}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Conflict Resolution Tips */}
          {conflicts.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-900 mb-2">💡 Conflict Resolution Tips</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Check if more residents need the required qualifications</li>
                <li>• Review resident availability patterns</li>
                <li>• Consider adjusting shift requirements or schedules</li>
                <li>• Look for appointment scheduling conflicts</li>
                <li>• Verify tenure requirements (6+ months for thrift stores)</li>
              </ul>
            </div>
          )}
        </>
      )}

      {/* Instructions */}
      {!selectedPeriod && activeTab !== 'periods' && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex">
            <div className="text-yellow-600">⚠️</div>
            <div className="ml-3">
              <h4 className="text-sm font-medium text-yellow-800">No Schedule Period Selected</h4>
              <p className="text-sm text-yellow-700 mt-1">
                Please select a schedule period from the "Schedule Periods" tab to view schedules and conflicts.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScheduleManagement;