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
    const colors: Record<string, { bg: string, border: string, text: string }> = {
      'kitchen': { bg: '#fff7ed', border: '#fb923c', text: '#7c2d12' },
      'shelter_runs': { bg: '#eff6ff', border: '#60a5fa', text: '#1e3a8a' },
      'thrift_stores': { bg: '#f0fdf4', border: '#4ade80', text: '#14532d' },
      'maintenance': { bg: '#faf5ff', border: '#a78bfa', text: '#581c87' }
    };
    return colors[departmentName] || { bg: '#f9fafb', border: '#9ca3af', text: '#1f2937' };
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, { bg: string, text: string }> = {
      'scheduled': { bg: '#dbeafe', text: '#1e40af' },
      'completed': { bg: '#dcfce7', text: '#166534' },
      'no_show': { bg: '#fee2e2', text: '#dc2626' },
      'covered': { bg: '#fef3c7', text: '#d97706' }
    };
    return colors[status] || { bg: '#f3f4f6', text: '#1f2937' };
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

  // FIXED Calendar View with inline styles
  const CalendarView = () => (
    <div style={{
      backgroundColor: 'white',
      borderRadius: '8px',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
      overflow: 'hidden'
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gap: '1px',
        backgroundColor: '#e5e7eb',
        padding: '4px'
      }}>
        {getWeekDates(selectedPeriod!.startDate, selectedPeriod!.endDate).map(date => {
          const dayAssignments = getAssignmentsForDate(date);
          const dayConflicts = getConflictsForDate(date);
          const departmentGroups = groupAssignmentsByDepartment(dayAssignments);
          
          return (
            <div key={date.toISOString()} style={{
              backgroundColor: 'white',
              borderRadius: '4px',
              minHeight: '384px'
            }}>
              {/* Day Header */}
              <div style={{
                padding: '12px',
                borderBottom: '1px solid #e5e7eb',
                background: 'linear-gradient(to right, #eff6ff, #e0e7ff)'
              }}>
                <div style={{
                  fontWeight: 'bold',
                  color: '#1f2937',
                  fontSize: '18px'
                }}>
                  {date.toLocaleDateString('en-US', { weekday: 'short' })}
                </div>
                <div style={{
                  fontSize: '14px',
                  color: '#6b7280'
                }}>
                  {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: '8px'
                }}>
                  <span style={{
                    fontSize: '12px',
                    backgroundColor: '#dbeafe',
                    color: '#1e40af',
                    padding: '2px 8px',
                    borderRadius: '12px'
                  }}>
                    {dayAssignments.length} staff
                  </span>
                  {dayConflicts.length > 0 && (
                    <span style={{
                      fontSize: '12px',
                      backgroundColor: '#fee2e2',
                      color: '#dc2626',
                      padding: '2px 8px',
                      borderRadius: '12px'
                    }}>
                      {dayConflicts.length} conflicts
                    </span>
                  )}
                </div>
              </div>
              
              {/* Day Content */}
              <div style={{
                padding: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}>
                {Object.keys(departmentGroups).length === 0 ? (
                  <div style={{
                    fontSize: '12px',
                    color: '#9ca3af',
                    fontStyle: 'italic',
                    textAlign: 'center',
                    paddingTop: '32px',
                    paddingBottom: '32px'
                  }}>
                    No assignments
                  </div>
                ) : (
                  Object.entries(departmentGroups).map(([deptName, deptAssignments]) => (
                    <div key={deptName} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        marginBottom: '8px'
                      }}>
                        <span style={{ fontSize: '14px' }}>{getDepartmentIcon(deptName)}</span>
                        <span style={{
                          fontSize: '12px',
                          fontWeight: '600',
                          color: '#374151',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em'
                        }}>
                          {deptName.replace('_', ' ')}
                        </span>
                      </div>
                      
                      {deptAssignments.map(assignment => {
                        const deptColors = getDepartmentColor(deptName);
                        return (
                          <div
                            key={assignment.id}
                            style={{
                              fontSize: '12px',
                              padding: '8px',
                              borderRadius: '6px',
                              borderLeft: `4px solid ${deptColors.border}`,
                              backgroundColor: deptColors.bg,
                              color: deptColors.text,
                              cursor: 'pointer',
                              transition: 'box-shadow 0.2s'
                            }}
                            onClick={() => handleEditAssignment(assignment)}
                            onMouseOver={(e) => {
                              e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
                            }}
                            onMouseOut={(e) => {
                              e.currentTarget.style.boxShadow = 'none';
                            }}
                          >
                            <div style={{
                              fontWeight: '500',
                              marginBottom: '2px'
                            }}>
                              {assignment.shift.name}
                            </div>
                            <div style={{
                              opacity: 0.8,
                              marginBottom: '4px'
                            }}>
                              {formatTime(assignment.shift.startTime)} - {formatTime(assignment.shift.endTime)}
                            </div>
                            <div style={{
                              fontWeight: '600',
                              marginBottom: '2px'
                            }}>
                              {assignment.resident.firstName} {assignment.resident.lastName}
                            </div>
                            <div style={{
                              opacity: 0.7,
                              textTransform: 'capitalize'
                            }}>
                              {assignment.roleTitle.replace('_', ' ')}
                            </div>
                            {assignment.status !== 'scheduled' && (
                              <div style={{
                                fontSize: '11px',
                                marginTop: '4px',
                                fontWeight: '500',
                                color: assignment.status === 'completed' ? '#16a34a' :
                                       assignment.status === 'no_show' ? '#dc2626' : '#d97706'
                              }}>
                                {assignment.status.replace('_', ' ').toUpperCase()}
                              </div>
                            )}
                          </div>
                        );
                      })}
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

  // Edit View with fixed styles
  const EditView = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {assignments.map(assignment => (
        <div key={assignment.id} style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          padding: '16px'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <h4 style={{
                fontWeight: '500',
                color: '#1f2937',
                margin: 0
              }}>
                {assignment.shift.department.name.replace('_', ' ')} - {assignment.shift.name}
              </h4>
              <p style={{
                fontSize: '14px',
                color: '#6b7280',
                margin: '4px 0'
              }}>
                {formatTime(assignment.shift.startTime)} - {formatTime(assignment.shift.endTime)} • {assignment.roleTitle.replace('_', ' ')}
              </p>
              <p style={{
                fontSize: '14px',
                fontWeight: '500',
                color: '#1f2937',
                margin: '4px 0'
              }}>
                {assignment.resident.firstName} {assignment.resident.lastName}
              </p>
              <p style={{
                fontSize: '12px',
                color: '#6b7280',
                margin: 0
              }}>
                {new Date(assignment.assignedDate).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
              </p>
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              {(() => {
                const statusColors = getStatusColor(assignment.status);
                return (
                  <span style={{
                    padding: '4px 8px',
                    fontSize: '12px',
                    borderRadius: '12px',
                    fontWeight: '500',
                    backgroundColor: statusColors.bg,
                    color: statusColors.text
                  }}>
                    {assignment.status.replace('_', ' ')}
                  </span>
                );
              })()}
              <button
                onClick={() => handleEditAssignment(assignment)}
                style={{
                  color: '#2563eb',
                  fontSize: '14px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  textDecoration: 'underline'
                }}
              >
                Edit
              </button>
              <button
                onClick={() => handleDeleteAssignment(assignment.id)}
                style={{
                  color: '#dc2626',
                  fontSize: '14px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  textDecoration: 'underline'
                }}
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
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '256px'
      }}>
        <div style={{ fontSize: '18px' }}>Loading schedules...</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <h2 style={{
          fontSize: '24px',
          fontWeight: 'bold',
          color: '#1f2937',
          margin: 0
        }}>Work Schedule</h2>
        <button
          onClick={() => setShowNewPeriodForm(true)}
          style={{
            backgroundColor: '#16a34a',
            color: 'white',
            padding: '8px 16px',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '14px',
            transition: 'background-color 0.2s'
          }}
        >
          Create New Period
        </button>
      </div>

      {error && (
        <div style={{
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          color: '#dc2626',
          padding: '12px 16px',
          borderRadius: '8px'
        }}>
          {error}
        </div>
      )}

      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        padding: '24px'
      }}>
        <h3 style={{
          fontSize: '18px',
          fontWeight: '600',
          marginBottom: '16px',
          color: '#1f2937'
        }}>Select Schedule Period</h3>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '16px'
        }}>
          {periods.map(period => (
            <div
              key={period.id}
              onClick={() => setSelectedPeriod(period)}
              style={{
                padding: '16px',
                border: `2px solid ${selectedPeriod?.id === period.id ? '#3b82f6' : '#e5e7eb'}`,
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                backgroundColor: selectedPeriod?.id === period.id ? '#eff6ff' : 'white'
              }}
            >
              <div style={{ fontWeight: '500' }}>{period.name}</div>
              <div style={{
                fontSize: '14px',
                color: '#6b7280',
                marginTop: '4px'
              }}>
                {new Date(period.startDate).toLocaleDateString()} - {new Date(period.endDate).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      </div>

      {selectedPeriod && (
        <div style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          padding: '24px'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <h3 style={{
                fontSize: '18px',
                fontWeight: '600',
                margin: 0
              }}>{selectedPeriod.name}</h3>
              <p style={{
                fontSize: '14px',
                color: '#6b7280',
                margin: '4px 0 0 0'
              }}>
                {assignments.length} assignments • {conflicts.filter(c => c.severity === 'error').length} conflicts
              </p>
            </div>
            <div style={{ display: 'flex', gap: '16px' }}>
              <div style={{
                display: 'flex',
                backgroundColor: '#f3f4f6',
                borderRadius: '8px',
                padding: '4px'
              }}>
                <button
                  onClick={() => setViewMode('calendar')}
                  style={{
                    padding: '8px 12px',
                    fontSize: '14px',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    backgroundColor: viewMode === 'calendar' ? 'white' : 'transparent',
                    color: viewMode === 'calendar' ? '#2563eb' : '#6b7280',
                    boxShadow: viewMode === 'calendar' ? '0 1px 2px rgba(0, 0, 0, 0.1)' : 'none'
                  }}
                >
                  📅 Calendar
                </button>
                <button
                  onClick={() => setViewMode('edit')}
                  style={{
                    padding: '8px 12px',
                    fontSize: '14px',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    backgroundColor: viewMode === 'edit' ? 'white' : 'transparent',
                    color: viewMode === 'edit' ? '#2563eb' : '#6b7280',
                    boxShadow: viewMode === 'edit' ? '0 1px 2px rgba(0, 0, 0, 0.1)' : 'none'
                  }}
                >
                  ✏️ Edit
                </button>
              </div>
              <button
                onClick={handleGenerateSchedule}
                disabled={generating}
                style={{
                  backgroundColor: generating ? '#9ca3af' : '#7c3aed',
                  color: 'white',
                  padding: '8px 24px',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: generating ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  transition: 'background-color 0.2s'
                }}
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
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '24px',
            width: '100%',
            maxWidth: '448px',
            margin: '16px'
          }}>
            <h3 style={{
              fontSize: '18px',
              fontWeight: '600',
              marginBottom: '16px'
            }}>
              Edit Assignment - {editingAssignment.shift.name}
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{
                backgroundColor: '#f9fafb',
                padding: '12px',
                borderRadius: '6px'
              }}>
                <div style={{ fontSize: '14px', color: '#6b7280' }}>
                  <strong>Date:</strong> {new Date(editingAssignment.assignedDate).toLocaleDateString()}
                </div>
                <div style={{ fontSize: '14px', color: '#6b7280' }}>
                  <strong>Time:</strong> {formatTime(editingAssignment.shift.startTime)} - {formatTime(editingAssignment.shift.endTime)}
                </div>
                <div style={{ fontSize: '14px', color: '#6b7280' }}>
                  <strong>Role:</strong> {editingAssignment.roleTitle.replace('_', ' ')}
                </div>
              </div>

              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '4px'
                }}>
                  Assigned Resident
                </label>
                <select
                  value={newResidentId}
                  onChange={(e) => setNewResidentId(e.target.value)}
                  style={{
                    width: '100%',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '14px'
                  }}
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
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '4px'
                }}>
                  Status
                </label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  style={{
                    width: '100%',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '14px'
                  }}
                >
                  <option value="scheduled">Scheduled</option>
                  <option value="completed">Completed</option>
                  <option value="no_show">No Show</option>
                  <option value="covered">Covered</option>
                </select>
              </div>

              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '4px'
                }}>
                  Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add notes..."
                  rows={3}
                  style={{
                    width: '100%',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '14px',
                    resize: 'vertical'
                  }}
                />
              </div>

              <div style={{
                display: 'flex',
                gap: '12px',
                paddingTop: '16px'
              }}>
                <button
                  onClick={handleSaveEdit}
                  style={{
                    flex: 1,
                    backgroundColor: '#2563eb',
                    color: 'white',
                    padding: '8px 16px',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    transition: 'background-color 0.2s'
                  }}
                >
                  Save Changes
                </button>
                <button
                  onClick={() => setEditingAssignment(null)}
                  style={{
                    flex: 1,
                    backgroundColor: '#d1d5db',
                    color: '#374151',
                    padding: '8px 16px',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    transition: 'background-color 0.2s'
                  }}
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
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '24px',
            width: '100%',
            maxWidth: '448px',
            margin: '16px'
          }}>
            <h3 style={{
              fontSize: '18px',
              fontWeight: '600',
              marginBottom: '16px'
            }}>Create Schedule Period</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '4px'
                }}>
                  Period Name *
                </label>
                <input
                  type="text"
                  value={newPeriod.name}
                  onChange={(e) => setNewPeriod({...newPeriod, name: e.target.value})}
                  placeholder="e.g., Week of June 9, 2025"
                  style={{
                    width: '100%',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '14px'
                  }}
                />
              </div>

              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '4px'
                }}>
                  Start Date *
                </label>
                <input
                  type="date"
                  value={newPeriod.startDate}
                  onChange={(e) => setNewPeriod({...newPeriod, startDate: e.target.value})}
                  style={{
                    width: '100%',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '14px'
                  }}
                />
              </div>

              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '4px'
                }}>
                  End Date *
                </label>
                <input
                  type="date"
                  value={newPeriod.endDate}
                  onChange={(e) => setNewPeriod({...newPeriod, endDate: e.target.value})}
                  style={{
                    width: '100%',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '14px'
                  }}
                />
              </div>

              <div style={{
                display: 'flex',
                gap: '12px',
                paddingTop: '16px'
              }}>
                <button
                  onClick={handleCreatePeriod}
                  style={{
                    flex: 1,
                    backgroundColor: '#2563eb',
                    color: 'white',
                    padding: '8px 16px',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    transition: 'background-color 0.2s'
                  }}
                >
                  Create Period
                </button>
                <button
                  onClick={() => setShowNewPeriodForm(false)}
                  style={{
                    flex: 1,
                    backgroundColor: '#d1d5db',
                    color: '#374151',
                    padding: '8px 16px',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    transition: 'background-color 0.2s'
                  }}
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