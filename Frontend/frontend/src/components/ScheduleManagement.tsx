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
  const [viewMode, setViewMode] = useState<'calendar' | 'daily' | 'edit'>('calendar');
  const [showNewPeriodForm, setShowNewPeriodForm] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<ShiftAssignment | null>(null);
  const [newResidentId, setNewResidentId] = useState<string>('');
  const [newStatus, setNewStatus] = useState<string>('scheduled');
  const [notes, setNotes] = useState<string>('');
  
  const [newPeriod, setNewPeriod] = useState({
    name: '',
    startDate: '',
    endDate: ''
  });

  useEffect(() => {
    fetchData();
    fetchResidents();
  }, []);

  useEffect(() => {
    if (selectedPeriod) {
      fetchAssignments();
      fetchConflicts();
    }
  }, [selectedPeriod]);

  const fetchData = async () => {
    try {
      const periodsResponse = await scheduleApi.getPeriods();
      setPeriods(periodsResponse.data);
    } catch (error: any) {
      console.error('Failed to fetch data:', error);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const fetchResidents = async () => {
    try {
      const response = await residentsApi.getAll();
      setResidents(response.data);
    } catch (error: any) {
      console.error('Failed to fetch residents:', error);
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

  const handleCreatePeriod = async () => {
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
      
      const stats = response.data.stats;
      alert(`Schedule generated!\n✅ ${stats.assignmentsCreated} assignments created\n⚠️ ${stats.conflictsFound} conflicts found`);
    } catch (error: any) {
      setError(error.message || 'Failed to generate schedule');
    } finally {
      setGenerating(false);
    }
  };

  const handleEditAssignment = (assignment: ShiftAssignment) => {
    setEditingAssignment(assignment);
    setNewResidentId(assignment.residentId.toString());
    setNewStatus(assignment.status);
    setNotes(assignment.notes || '');
    setError('');
  };

  const handleSaveEdit = async () => {
    if (!editingAssignment) return;

    try {
      await scheduleApi.updateAssignment(editingAssignment.id, {
        residentId: newResidentId ? parseInt(newResidentId) : undefined,
        status: newStatus,
        notes: notes.trim() || undefined
      });

      setEditingAssignment(null);
      await fetchAssignments();
      setError('');
    } catch (error: any) {
      setError(error.message || 'Failed to update assignment');
    }
  };

  const handleDeleteAssignment = async (assignmentId: number) => {
    if (!confirm('Are you sure you want to delete this assignment?')) return;

    try {
      await scheduleApi.deleteAssignment(assignmentId);
      await fetchAssignments();
      setError('');
    } catch (error: any) {
      setError(error.message || 'Failed to delete assignment');
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

  const getConflictsForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    return conflicts.filter(c => c.conflictDate.split('T')[0] === dateStr);
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const getDepartmentColor = (departmentName: string) => {
    const colors: Record<string, string> = {
      'kitchen': 'bg-orange-100 border-orange-300 text-orange-800',
      'shelter_runs': 'bg-blue-100 border-blue-300 text-blue-800',
      'thrift_stores': 'bg-green-100 border-green-300 text-green-800',
      'maintenance': 'bg-purple-100 border-purple-300 text-purple-800'
    };
    return colors[departmentName] || 'bg-gray-100 border-gray-300 text-gray-800';
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'scheduled': 'bg-blue-100 text-blue-800',
      'completed': 'bg-green-100 text-green-800',
      'no_show': 'bg-red-100 text-red-800',
      'covered': 'bg-yellow-100 text-yellow-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getDepartmentIcon = (departmentName: string) => {
    const icons: Record<string, string> = {
      'kitchen': '🍳',
      'shelter_runs': '🚐',
      'thrift_stores': '🏪',
      'maintenance': '🔧'
    };
    return icons[departmentName] || '📋';
  };

  const groupAssignmentsByDepartment = (dayAssignments: ShiftAssignment[]) => {
    const groups: Record<string, ShiftAssignment[]> = {};
    
    dayAssignments.forEach(assignment => {
      const dept = assignment.shift.department.name;
      if (!groups[dept]) groups[dept] = [];
      groups[dept].push(assignment);
    });
    
    const sortedDepts = Object.keys(groups).sort((a, b) => {
      const priorityA = dayAssignments.find(a2 => a2.shift.department.name === a)?.shift.department.priority || 0;
      const priorityB = dayAssignments.find(a2 => a2.shift.department.name === b)?.shift.department.priority || 0;
      return priorityB - priorityA;
    });
    
    const sortedGroups: Record<string, ShiftAssignment[]> = {};
    sortedDepts.forEach(dept => {
      sortedGroups[dept] = groups[dept].sort((a, b) => a.shift.startTime.localeCompare(b.shift.startTime));
    });
    
    return sortedGroups;
  };

  // Calendar View
  const CalendarView = () => (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="grid grid-cols-1 md:grid-cols-7 gap-1 bg-gray-200 p-1">
        {getWeekDates(selectedPeriod!.startDate, selectedPeriod!.endDate).map(date => {
          const dayAssignments = getAssignmentsForDate(date);
          const dayConflicts = getConflictsForDate(date);
          const departmentGroups = groupAssignmentsByDepartment(dayAssignments);
          
          return (
            <div key={date.toISOString()} className="bg-white rounded min-h-96">
              <div className="p-3 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
                <div className="font-bold text-gray-900 text-lg">
                  {date.toLocaleDateString('en-US', { weekday: 'short' })}
                </div>
                <div className="text-sm text-gray-600">
                  {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </div>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                    {dayAssignments.length} staff
                  </span>
                  {dayConflicts.length > 0 && (
                    <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded-full">
                      {dayConflicts.length} conflicts
                    </span>
                  )}
                </div>
              </div>
              
              <div className="p-2 space-y-3">
                {Object.keys(departmentGroups).length === 0 ? (
                  <div className="text-xs text-gray-400 italic text-center py-8">
                    No assignments
                  </div>
                ) : (
                  Object.entries(departmentGroups).map(([deptName, deptAssignments]) => (
                    <div key={deptName} className="space-y-1">
                      <div className="flex items-center space-x-1 mb-2">
                        <span className="text-sm">{getDepartmentIcon(deptName)}</span>
                        <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                          {deptName.replace('_', ' ')}
                        </span>
                      </div>
                      
                      {deptAssignments.map(assignment => (
                        <div
                          key={assignment.id}
                          className={`text-xs p-2 rounded-lg border-l-3 ${getDepartmentColor(deptName)}`}
                        >
                          <div className="font-medium">
                            {assignment.shift.name}
                          </div>
                          <div className="text-gray-600 mt-1">
                            {formatTime(assignment.shift.startTime)} - {formatTime(assignment.shift.endTime)}
                          </div>
                          <div className="font-semibold mt-1">
                            {assignment.resident.firstName} {assignment.resident.lastName}
                          </div>
                          <div className="text-gray-500 capitalize">
                            {assignment.roleTitle.replace('_', ' ')}
                          </div>
                          {assignment.status !== 'scheduled' && (
                            <div className={`text-xs mt-1 font-medium ${
                              assignment.status === 'completed' ? 'text-green-600' :
                              assignment.status === 'no_show' ? 'text-red-600' :
                              'text-yellow-600'
                            }`}>
                              {assignment.status.replace('_', ' ').toUpperCase()}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // Edit View
  const EditView = () => (
    <div className="space-y-4">
      {assignments.map(assignment => (
        <div key={assignment.id} className="bg-white rounded-lg shadow p-4">
          <div className="flex justify-between items-center">
            <div>
              <h4 className="font-medium text-gray-900">
                {assignment.shift.department.name.replace('_', ' ')} - {assignment.shift.name}
              </h4>
              <p className="text-sm text-gray-600">
                {formatTime(assignment.shift.startTime)} - {formatTime(assignment.shift.endTime)} • {assignment.roleTitle.replace('_', ' ')}
              </p>
              <p className="text-sm font-medium text-gray-900">
                {assignment.resident.firstName} {assignment.resident.lastName}
              </p>
              <p className="text-xs text-gray-500">
                {new Date(assignment.assignedDate).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <span className={`px-2 py-1 text-xs rounded-full font-medium ${getStatusColor(assignment.status)}`}>
                {assignment.status.replace('_', ' ')}
              </span>
              <button
                onClick={() => handleEditAssignment(assignment)}
                className="text-blue-600 hover:text-blue-900 text-sm"
              >
                Edit
              </button>
              <button
                onClick={() => handleDeleteAssignment(assignment.id)}
                className="text-red-600 hover:text-red-900 text-sm"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">Loading schedules...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Work Schedule</h2>
        <button
          onClick={() => setShowNewPeriodForm(true)}
          className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
        >
          Create New Period
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Select Schedule Period</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {periods.map(period => (
            <div
              key={period.id}
              onClick={() => setSelectedPeriod(period)}
              className={`p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                selectedPeriod?.id === period.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div className="font-medium">{period.name}</div>
              <div className="text-sm text-gray-500 mt-1">
                {new Date(period.startDate).toLocaleDateString()} - {new Date(period.endDate).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      </div>

      {selectedPeriod && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold">{selectedPeriod.name}</h3>
              <p className="text-sm text-gray-600">
                {assignments.length} assignments • {conflicts.filter(c => c.severity === 'error').length} conflicts
              </p>
            </div>
            <div className="flex space-x-4">
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('calendar')}
                  className={`px-3 py-1 text-sm rounded ${
                    viewMode === 'calendar' ? 'bg-white shadow text-blue-600' : 'text-gray-600'
                  }`}
                >
                  📅 Calendar
                </button>
                <button
                  onClick={() => setViewMode('edit')}
                  className={`px-3 py-1 text-sm rounded ${
                    viewMode === 'edit' ? 'bg-white shadow text-blue-600' : 'text-gray-600'
                  }`}
                >
                  ✏️ Edit
                </button>
              </div>
              <button
                onClick={handleGenerateSchedule}
                disabled={generating}
                className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 transition-colors disabled:bg-gray-400"
              >
                {generating ? 'Generating...' : 'Generate Schedule'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedPeriod && (
        viewMode === 'calendar' ? <CalendarView /> : <EditView />
      )}

      {/* Edit Modal */}
      {editingAssignment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">
              Edit Assignment - {editingAssignment.shift.name}
            </h3>

            <div className="space-y-4">
              <div className="bg-gray-50 p-3 rounded">
                <div className="text-sm text-gray-600">
                  <strong>Date:</strong> {new Date(editingAssignment.assignedDate).toLocaleDateString()}
                </div>
                <div className="text-sm text-gray-600">
                  <strong>Time:</strong> {formatTime(editingAssignment.shift.startTime)} - {formatTime(editingAssignment.shift.endTime)}
                </div>
                <div className="text-sm text-gray-600">
                  <strong>Role:</strong> {editingAssignment.roleTitle.replace('_', ' ')}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Assigned Resident
                </label>
                <select
                  value={newResidentId}
                  onChange={(e) => setNewResidentId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- No Assignment --</option>
                  {residents.map(resident => (
                    <option key={resident.id} value={resident.id}>
                      {resident.firstName} {resident.lastName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="scheduled">Scheduled</option>
                  <option value="completed">Completed</option>
                  <option value="no_show">No Show</option>
                  <option value="covered">Covered</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add notes..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                />
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  onClick={handleSaveEdit}
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Save Changes
                </button>
                <button
                  onClick={() => setEditingAssignment(null)}
                  className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Period Form Modal */}
      {showNewPeriodForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">Create Schedule Period</h3>
            
            <div className="space-y-4">
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
                />
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  onClick={handleCreatePeriod}
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Create Period
                </button>
                <button
                  onClick={() => setShowNewPeriodForm(false)}
                  className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScheduleManagement;