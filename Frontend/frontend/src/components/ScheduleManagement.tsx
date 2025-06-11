import React, { useState, useEffect } from 'react';
import { scheduleApi, residentsApi } from '../api/client';
import './ScheduleManagement.css'; // We'll create this CSS file

// Keep your existing interfaces exactly as they are
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
  const [viewMode, setViewMode] = useState<'calendar' | 'edit'>('calendar');
  const [showNewPeriodForm, setShowNewPeriodForm] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<ShiftAssignment | null>(null);
  const [newResidentId, setNewResidentId] = useState<string>('');
  const [newStatus, setNewStatus] = useState<string>('scheduled');
  const [notes, setNotes] = useState<string>('');
  
  // Calendar-specific state
  const [selectedWeek, setSelectedWeek] = useState<Date>(new Date());
  
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
      setSelectedWeek(new Date(selectedPeriod.startDate));
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

  // Calendar helper functions
  const getWeekStart = (date: Date): Date => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  };

  const getWeekDates = (startDate: Date): Date[] => {
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      dates.push(date);
    }
    return dates;
  };

  const getAssignmentsForDate = (date: Date): ShiftAssignment[] => {
    const dateStr = date.toISOString().split('T')[0];
    return assignments.filter(a => a.assignedDate.split('T')[0] === dateStr);
  };

  const groupAssignmentsByTime = (dayAssignments: ShiftAssignment[]) => {
    const timeSlots: { [key: string]: ShiftAssignment[] } = {};
    
    dayAssignments.forEach(assignment => {
      const startTime = assignment.shift.startTime;
      if (!timeSlots[startTime]) {
        timeSlots[startTime] = [];
      }
      timeSlots[startTime].push(assignment);
    });

    const sortedSlots = Object.keys(timeSlots)
      .sort()
      .reduce((result: { [key: string]: ShiftAssignment[] }, key) => {
        result[key] = timeSlots[key].sort((a, b) => 
          b.shift.department.priority - a.shift.department.priority
        );
        return result;
      }, {});

    return sortedSlots;
  };

  const getDepartmentClass = (departmentName: string): string => {
    const classes: { [key: string]: string } = {
      'kitchen': 'department-kitchen',
      'shelter_runs': 'department-shelter',
      'thrift_stores': 'department-thrift',
      'maintenance': 'department-maintenance'
    };
    return classes[departmentName] || 'department-default';
  };

  const getStatusClass = (status: string): string => {
    const classes: { [key: string]: string } = {
      'scheduled': 'status-scheduled',
      'completed': 'status-completed',
      'no_show': 'status-no-show',
      'covered': 'status-covered'
    };
    return classes[status] || 'status-default';
  };

  const formatTime = (time: string): string => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const navigateWeek = (direction: number) => {
    if (!selectedPeriod) return;
    
    const newDate = new Date(selectedWeek);
    newDate.setDate(newDate.getDate() + (direction * 7));
    
    const periodStart = new Date(selectedPeriod.startDate);
    const periodEnd = new Date(selectedPeriod.endDate);
    
    if (newDate >= periodStart && newDate <= periodEnd) {
      setSelectedWeek(newDate);
    }
  };

  // Enhanced Calendar View Component
  const CalendarView = () => {
    const weekDates = getWeekDates(getWeekStart(selectedWeek));

    return (
      <div className="calendar-container">
        {/* Calendar Header */}
        <div className="calendar-header">
          <div className="calendar-header-content">
            <div className="calendar-title">
              <h3>{selectedPeriod?.name}</h3>
              <p className="calendar-subtitle">
                Week of {getWeekStart(selectedWeek).toLocaleDateString('en-US', { 
                  month: 'long', 
                  day: 'numeric',
                  year: 'numeric' 
                })}
              </p>
            </div>
            
            <div className="calendar-controls">
              {/* Week Navigation */}
              <div className="week-navigation">
                <button
                  onClick={() => navigateWeek(-1)}
                  className="nav-button"
                  title="Previous Week"
                >
                  ‹
                </button>
                
                <button
                  onClick={() => setSelectedWeek(new Date())}
                  className="today-button"
                >
                  Today
                </button>
                
                <button
                  onClick={() => navigateWeek(1)}
                  className="nav-button"
                  title="Next Week"
                >
                  ›
                </button>
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="quick-stats">
            <div className="stat-item">
              <div className="stat-number">{assignments.length}</div>
              <div className="stat-label">Total Assignments</div>
            </div>
            <div className="stat-item">
              <div className="stat-number">
                {assignments.filter(a => a.status === 'completed').length}
              </div>
              <div className="stat-label">Completed</div>
            </div>
            <div className="stat-item">
              <div className="stat-number">
                {assignments.filter(a => a.status === 'scheduled').length}
              </div>
              <div className="stat-label">Scheduled</div>
            </div>
            <div className="stat-item">
              <div className="stat-number">
                {new Set(assignments.map(a => a.residentId)).size}
              </div>
              <div className="stat-label">Residents</div>
            </div>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="calendar-grid">
          {weekDates.map((date) => {
            const dayAssignments = getAssignmentsForDate(date);
            const timeSlots = groupAssignmentsByTime(dayAssignments);
            const isToday = date.toDateString() === new Date().toDateString();
            const isWeekend = date.getDay() === 0 || date.getDay() === 6;

            return (
              <div 
                key={date.toISOString()} 
                className={`calendar-day ${isWeekend ? 'weekend' : ''}`}
              >
                {/* Day Header */}
                <div className={`day-header ${isToday ? 'today' : ''}`}>
                  <div className="day-name">
                    {date.toLocaleDateString('en-US', { weekday: 'short' })}
                  </div>
                  <div className="day-date">
                    {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                  {dayAssignments.length > 0 && (
                    <div className="day-count">
                      <span className="count-badge">
                        {dayAssignments.length} shifts
                      </span>
                    </div>
                  )}
                </div>

                {/* Day Content */}
                <div className="day-content">
                  {Object.keys(timeSlots).length === 0 ? (
                    <div className="no-shifts">
                      <div className="no-shifts-icon">📅</div>
                      <div>No shifts</div>
                    </div>
                  ) : (
                    Object.entries(timeSlots).map(([timeSlot, slotAssignments]) => (
                      <div key={timeSlot} className="time-slot">
                        <div className="time-slot-header">
                          {formatTime(timeSlot)}
                        </div>
                        {slotAssignments.map(assignment => (
                          <div
                            key={assignment.id}
                            className={`assignment-card ${getDepartmentClass(assignment.shift.department.name)}`}
                            onClick={() => handleEditAssignment(assignment)}
                          >
                            <div className="assignment-title">{assignment.shift.name}</div>
                            <div className="assignment-time">
                              {formatTime(assignment.shift.startTime)} - {formatTime(assignment.shift.endTime)}
                            </div>
                            <div className="assignment-resident">
                              {assignment.resident.firstName} {assignment.resident.lastName}
                            </div>
                            <div className="assignment-role">
                              {assignment.roleTitle.replace('_', ' ')}
                            </div>
                            {assignment.status !== 'scheduled' && (
                              <div className={`status-badge ${getStatusClass(assignment.status)}`}>
                                {assignment.status.replace('_', ' ').toUpperCase()}
                              </div>
                            )}
                            {assignment.notes && (
                              <div className="assignment-notes">
                                📝 {assignment.notes}
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

        {/* Department Legend */}
        <div className="calendar-legend">
          <div className="legend-content">
            <div className="legend-title">Departments:</div>
            <div className="legend-items">
              <div className="legend-item">
                <div className="legend-color department-kitchen"></div>
                <span>Kitchen</span>
              </div>
              <div className="legend-item">
                <div className="legend-color department-shelter"></div>
                <span>Shelter Runs</span>
              </div>
              <div className="legend-item">
                <div className="legend-color department-thrift"></div>
                <span>Thrift Stores</span>
              </div>
              <div className="legend-item">
                <div className="legend-color department-maintenance"></div>
                <span>Maintenance</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Edit View (your existing list view)
  const EditView = () => (
    <div className="edit-view">
      {assignments.length === 0 ? (
        <div className="no-assignments">
          <div className="no-assignments-icon">📋</div>
          <h3>No assignments yet</h3>
          <p>Generate a schedule to see assignments here.</p>
          <button
            onClick={handleGenerateSchedule}
            disabled={generating}
            className="generate-button"
          >
            Generate First Schedule
          </button>
        </div>
      ) : (
        assignments.map(assignment => (
          <div key={assignment.id} className="assignment-item">
            <div className="assignment-content">
              <div className="assignment-header">
                <h4>
                  {assignment.shift.department.name.replace('_', ' ')} - {assignment.shift.name}
                </h4>
                <span className={`status-badge ${getStatusClass(assignment.status)}`}>
                  {assignment.status.replace('_', ' ')}
                </span>
              </div>
              <div className="assignment-details">
                <div className="detail-item">
                  <span className="detail-label">Date:</span><br />
                  {new Date(assignment.assignedDate).toLocaleDateString('en-US', { 
                    weekday: 'short', 
                    month: 'short', 
                    day: 'numeric' 
                  })}
                </div>
                <div className="detail-item">
                  <span className="detail-label">Time:</span><br />
                  {formatTime(assignment.shift.startTime)} - {formatTime(assignment.shift.endTime)}
                </div>
                <div className="detail-item">
                  <span className="detail-label">Resident:</span><br />
                  {assignment.resident.firstName} {assignment.resident.lastName}
                </div>
                <div className="detail-item">
                  <span className="detail-label">Role:</span><br />
                  {assignment.roleTitle.replace('_', ' ')}
                </div>
              </div>
              {assignment.notes && (
                <div className="assignment-notes-edit">
                  <span className="detail-label">Notes:</span> {assignment.notes}
                </div>
              )}
            </div>
            <div className="assignment-actions">
              <button
                onClick={() => handleEditAssignment(assignment)}
                className="edit-button"
              >
                Edit
              </button>
              <button
                onClick={() => handleDeleteAssignment(assignment.id)}
                className="delete-button"
              >
                Delete
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="loading-container">
        <div>Loading schedules...</div>
      </div>
    );
  }

  return (
    <div className="schedule-management">
      <div className="page-header">
        <div className="page-title">
          <h2>Work Schedule</h2>
          <p>Manage and view work assignments</p>
        </div>
        <button
          onClick={() => setShowNewPeriodForm(true)}
          className="create-period-button"
        >
          Create New Period
        </button>
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {/* Period Selection */}
      <div className="period-selection">
        <h3>Select Schedule Period</h3>
        <div className="periods-grid">
          {periods.map(period => (
            <div
              key={period.id}
              onClick={() => setSelectedPeriod(period)}
              className={`period-card ${selectedPeriod?.id === period.id ? 'selected' : ''}`}
            >
              <div className="period-name">{period.name}</div>
              <div className="period-dates">
                {new Date(period.startDate).toLocaleDateString()} - {new Date(period.endDate).toLocaleDateString()}
              </div>
              {selectedPeriod?.id === period.id && (
                <div className="period-selected">✓ Selected</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {selectedPeriod && (
        <>
          {/* Control Bar */}
          <div className="control-bar">
            <div className="control-info">
              <h3>{selectedPeriod.name}</h3>
              <p>
                {assignments.length} assignments • {conflicts.filter(c => c.severity === 'error').length} unresolved conflicts
              </p>
            </div>
            <div className="control-actions">
              <div className="view-toggle">
                <button
                  onClick={() => setViewMode('calendar')}
                  className={`toggle-button ${viewMode === 'calendar' ? 'active' : ''}`}
                >
                  📅 Calendar View
                </button>
                <button
                  onClick={() => setViewMode('edit')}
                  className={`toggle-button ${viewMode === 'edit' ? 'active' : ''}`}
                >
                  ✏️ Edit Mode
                </button>
              </div>
              <button
                onClick={handleGenerateSchedule}
                disabled={generating}
                className="generate-schedule-button"
              >
                {generating ? (
                  <span>🔄 Generating...</span>
                ) : (
                  '🔄 Generate Schedule'
                )}
              </button>
            </div>
          </div>

          {/* Main Content */}
          {viewMode === 'calendar' ? <CalendarView /> : <EditView />}
        </>
      )}

      {/* Edit Assignment Modal */}
      {editingAssignment && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Edit Assignment - {editingAssignment.shift.name}</h3>

            <div className="modal-form">
              <div className="assignment-info">
                <div><strong>Date:</strong> {new Date(editingAssignment.assignedDate).toLocaleDateString()}</div>
                <div><strong>Time:</strong> {editingAssignment.shift.startTime} - {editingAssignment.shift.endTime}</div>
                <div><strong>Role:</strong> {editingAssignment.roleTitle.replace('_', ' ')}</div>
              </div>

              <div className="form-field">
                <label>Assigned Resident</label>
                <select
                  value={newResidentId}
                  onChange={(e) => setNewResidentId(e.target.value)}
                >
                  <option value="">-- No Assignment --</option>
                  {residents.map(resident => (
                    <option key={resident.id} value={resident.id}>
                      {resident.firstName} {resident.lastName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label>Status</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                >
                  <option value="scheduled">Scheduled</option>
                  <option value="completed">Completed</option>
                  <option value="no_show">No Show</option>
                  <option value="covered">Covered</option>
                </select>
              </div>

              <div className="form-field">
                <label>Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add notes..."
                  rows={3}
                />
              </div>

              <div className="modal-actions">
                <button onClick={handleSaveEdit} className="save-button">
                  Save Changes
                </button>
                <button onClick={() => setEditingAssignment(null)} className="cancel-button">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Period Form Modal */}
      {showNewPeriodForm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Create Schedule Period</h3>
            
            <div className="modal-form">
              <div className="form-field">
                <label>Period Name *</label>
                <input
                  type="text"
                  value={newPeriod.name}
                  onChange={(e) => setNewPeriod({...newPeriod, name: e.target.value})}
                  placeholder="e.g., Week of June 9, 2025"
                />
              </div>

              <div className="form-field">
                <label>Start Date *</label>
                <input
                  type="date"
                  value={newPeriod.startDate}
                  onChange={(e) => setNewPeriod({...newPeriod, startDate: e.target.value})}
                />
              </div>

              <div className="form-field">
                <label>End Date *</label>
                <input
                  type="date"
                  value={newPeriod.endDate}
                  onChange={(e) => setNewPeriod({...newPeriod, endDate: e.target.value})}
                />
              </div>

              <div className="modal-actions">
                <button onClick={handleCreatePeriod} className="save-button">
                  Create Period
                </button>
                <button onClick={() => setShowNewPeriodForm(false)} className="cancel-button">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Conflicts Display */}
      {conflicts.length > 0 && (
        <div className="conflicts-section">
          <h3 className="conflicts-title">
            ⚠️ Schedule Conflicts ({conflicts.length})
          </h3>
          <div className="conflicts-list">
            {conflicts.slice(0, 5).map(conflict => (
              <div key={conflict.id} className={`conflict-item ${conflict.severity}`}>
                <div className="conflict-type">{conflict.conflictType.replace('_', ' ')}</div>
                <div className="conflict-description">{conflict.description}</div>
                <div className="conflict-date">
                  {new Date(conflict.conflictDate).toLocaleDateString()}
                </div>
              </div>
            ))}
            {conflicts.length > 5 && (
              <div className="conflicts-more">
                ... and {conflicts.length - 5} more conflicts
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ScheduleManagement;