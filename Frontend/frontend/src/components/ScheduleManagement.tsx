import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { scheduleApi, residentsApi } from '../api/client';
import './ScheduleManagement.css';

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
  const [exporting, setExporting] = useState(false);
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

  // Excel Export Functions
  const handleExportToExcel = async () => {
    if (!selectedPeriod) return;

    setExporting(true);
    try {
      const workbook = XLSX.utils.book_new();
      
      // Create different worksheets
      await createCalendarSheet(workbook);
      await createAssignmentsSheet(workbook);
      await createConflictsSheet(workbook);
      await createSummarySheet(workbook);

      // Generate file name
      const fileName = `Beacon_House_Schedule_${selectedPeriod.name.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;
      
      // Save the file
      XLSX.writeFile(workbook, fileName);
      
    } catch (error: any) {
      setError('Failed to export to Excel: ' + error.message);
    } finally {
      setExporting(false);
    }
  };

// Reverted createCalendarSheet function - back to original version

const createCalendarSheet = async (workbook: any) => {
  const dates = getWeekDates(selectedPeriod!.startDate, selectedPeriod!.endDate);
  const calendarData: any[][] = [];

  // Create title row
  const periodName = selectedPeriod!.name;
  calendarData.push([periodName]);
  calendarData.push([]); // Empty row for spacing

  // Create date header row
  const dateHeaderRow: any[] = ['Shift/Time'];
  dates.forEach(date => {
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    dateHeaderRow.push(`${dayName}, ${dateStr}`);
  });
  calendarData.push(dateHeaderRow);

  // Create a comprehensive list of all unique shift+time+role combinations
  const allShiftCombinations = new Set<string>();
  
  assignments.forEach((assignment: any) => {
    if (assignment.shift && assignment.shift.department) {
      // Skip shelter run midday and evening shifts
      if (assignment.shift.name === 'Shelter Run Midday' || assignment.shift.name === 'Shelter Run Evening') {
        return;
      }
      
      const key = `${assignment.shift.department.name}|${assignment.shift.name}|${assignment.shift.startTime}-${assignment.shift.endTime}|${assignment.roleTitle}`;
      allShiftCombinations.add(key);
    }
  });

  // Sort combinations by department priority, then time, then role
  const sortedCombinations = Array.from(allShiftCombinations).sort((a, b) => {
    const [aDept, aShift, aTime, aRole] = a.split('|');
    const [bDept, bShift, bTime, bRole] = b.split('|');
    
    const departmentPriority: { [key: string]: number } = { 
      'kitchen': 4, 
      'shelter_runs': 3, 
      'thrift_stores': 2, 
      'maintenance': 1 
    };
    
    const rolePriority: { [key: string]: number } = {
      'manager': 1,
      'prep_lead': 2, 
      'kitchen_helper': 3,
      'driver': 4,
      'assistant': 5, // Assistant now comes right after driver
      'prep_worker': 6,
      'janitor': 7,
      'worker': 8,
      'dishwasher': 9
    };
    
    // Sort by department first
    const aDeptPriority = departmentPriority[aDept] || 0;
    const bDeptPriority = departmentPriority[bDept] || 0;
    if (aDeptPriority !== bDeptPriority) {
      return bDeptPriority - aDeptPriority;
    }
    
    // Then by time
    if (aTime !== bTime) {
      return aTime.localeCompare(bTime);
    }
    
    // Then by shift name
    if (aShift !== bShift) {
      return aShift.localeCompare(bShift);
    }
    
    // Finally by role priority
    const aRolePriority = rolePriority[aRole] || 10;
    const bRolePriority = rolePriority[bRole] || 10;
    return aRolePriority - bRolePriority;
  });

  let currentDept = '';
  
  // Create rows for each shift+role combination
  sortedCombinations.forEach(combination => {
    const [deptName, shiftName, timeSlot, roleTitle] = combination.split('|');
    
    // Add department header when we encounter a new department
    if (deptName !== currentDept) {
      currentDept = deptName;
      const deptDisplayName = deptName.replace('_', ' ').toUpperCase();
      calendarData.push([deptDisplayName]);
    }
    
    const roleDisplay = roleTitle.replace('_', ' ');
    
    // Get all assignments for this specific combination (excluding midday and evening shelter runs)
    const combinationAssignments = assignments.filter((a: any) => 
      a.shift?.department?.name === deptName &&
      a.shift?.name === shiftName &&
      `${a.shift?.startTime}-${a.shift?.endTime}` === timeSlot &&
      a.roleTitle === roleTitle &&
      a.shift?.name !== 'Shelter Run Midday' &&
      a.shift?.name !== 'Shelter Run Evening'
    );

    // Find the maximum number of people with this role on any single day
    let maxPeopleForThisRole = 0;
    dates.forEach(date => {
      const dateStr = date.toISOString().split('T')[0];
      const dayAssignments = combinationAssignments.filter((a: any) => 
        a.assignedDate && a.assignedDate.split('T')[0] === dateStr
      );
      if (dayAssignments.length > maxPeopleForThisRole) {
        maxPeopleForThisRole = dayAssignments.length;
      }
    });

    // Create separate rows for each person in this role
    for (let personIndex = 0; personIndex < Math.max(1, maxPeopleForThisRole); personIndex++) {
      const row: any[] = [];
      
      // First column: shift info (only show on first row of each role)
      if (personIndex === 0) {
        // Clean up shift name for display
        let displayShiftName = shiftName;
        if (shiftName === 'Shelter Run Morning') {
          displayShiftName = 'Shelter Run';
        }
        
        if (roleTitle === 'manager' || roleTitle === 'driver' || roleTitle === 'prep_lead' || roleTitle === 'kitchen_helper') {
          row.push(`${displayShiftName} - ${roleDisplay}`);
        } else {
          row.push(`${displayShiftName}`);
        }
      } else {
        row.push(''); // Empty for subsequent rows
      }
      
      // For each date, get the person at this index for this specific role
      dates.forEach(date => {
        const dateStr = date.toISOString().split('T')[0];
        const dayAssignments = combinationAssignments.filter((a: any) => 
          a.assignedDate && a.assignedDate.split('T')[0] === dateStr
        );
        
        // Sort to ensure consistent ordering
        dayAssignments.sort((a: any, b: any) => {
          const aName = `${a.resident?.firstName || ''} ${a.resident?.lastName || ''}`;
          const bName = `${b.resident?.firstName || ''} ${b.resident?.lastName || ''}`;
          return aName.localeCompare(bName);
        });
        
        if (personIndex < dayAssignments.length) {
          const assignment = dayAssignments[personIndex];
          const resident = assignment?.resident;
          
          if (resident && resident.firstName && resident.lastName) {
            row.push(`${resident.firstName} ${resident.lastName}`);
          } else {
            row.push('');
          }
        } else {
          row.push(''); // Empty cell if no person at this index
        }
      });
      
      calendarData.push(row);
    }
  });

  const calendarSheet = XLSX.utils.aoa_to_sheet(calendarData);
  
  // Set column widths
  calendarSheet['!cols'] = [
    { wch: 30 }, // Shift/time column
    ...dates.map(() => ({ wch: 20 })) // Date columns
  ];

  // Apply styling
  if (calendarSheet['!ref']) {
    const range = XLSX.utils.decode_range(calendarSheet['!ref']);
    
    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        if (!calendarSheet[cellAddress]) continue;
        
        const cell = calendarSheet[cellAddress];
        
        // Title row styling
        if (R === 0) {
          cell.s = {
            font: { bold: true, size: 14 },
            alignment: { horizontal: 'center' },
            fill: { fgColor: { rgb: 'D0D0D0' } }
          };
        }
        // Date header row styling
        else if (R === 2) {
          cell.s = {
            font: { bold: true },
            alignment: { horizontal: 'center' },
            fill: { fgColor: { rgb: 'E0E0E0' } },
            border: {
              top: { style: 'thin' },
              bottom: { style: 'thin' },
              left: { style: 'thin' },
              right: { style: 'thin' }
            }
          };
        }
        // Department header styling
        else if (cell.v && typeof cell.v === 'string' && 
                 (cell.v.includes('KITCHEN') || cell.v.includes('SHELTER') || 
                  cell.v.includes('THRIFT') || cell.v.includes('MAINTENANCE'))) {
          cell.s = {
            font: { bold: true },
            fill: { fgColor: { rgb: 'C0C0C0' } },
            border: {
              top: { style: 'medium' },
              bottom: { style: 'thin' },
              left: { style: 'thin' },
              right: { style: 'thin' }
            }
          };
        }
        // Shift/time column styling
        else if (C === 0 && cell.v && typeof cell.v === 'string' && cell.v.includes('\n')) {
          cell.s = {
            font: { bold: true },
            fill: { fgColor: { rgb: 'F0F0F0' } },
            alignment: { vertical: 'top', wrapText: true },
            border: {
              top: { style: 'thin' },
              bottom: { style: 'thin' },
              left: { style: 'thin' },
              right: { style: 'thin' }
            }
          };
        }
        // Data cell styling
        else if (C > 0 && R > 2) {
          cell.s = {
            alignment: { vertical: 'center', horizontal: 'center' },
            border: {
              top: { style: 'thin' },
              bottom: { style: 'thin' },
              left: { style: 'thin' },
              right: { style: 'thin' }
            }
          };
        }
      }
    }
  }

  XLSX.utils.book_append_sheet(workbook, calendarSheet, 'Weekly Schedule');
};



  const createAssignmentsSheet = async (workbook: any) => {
    const assignmentsData = [
      ['Date', 'Day', 'Department', 'Shift Name', 'Start Time', 'End Time', 'Resident', 'Role', 'Status', 'Notes']
    ];

    assignments
      .sort((a, b) => new Date(a.assignedDate).getTime() - new Date(b.assignedDate).getTime())
      .forEach(assignment => {
        const date = new Date(assignment.assignedDate);
        assignmentsData.push([
          date.toLocaleDateString('en-US'),
          date.toLocaleDateString('en-US', { weekday: 'long' }),
          assignment.shift.department.name.replace('_', ' ').toUpperCase(),
          assignment.shift.name,
          formatTime(assignment.shift.startTime),
          formatTime(assignment.shift.endTime),
          `${assignment.resident.firstName} ${assignment.resident.lastName}`,
          assignment.roleTitle.replace('_', ' '),
          assignment.status.replace('_', ' ').toUpperCase(),
          assignment.notes || ''
        ]);
      });

    const assignmentsSheet = XLSX.utils.aoa_to_sheet(assignmentsData);
    
    // Set column widths
    assignmentsSheet['!cols'] = [
      { wch: 12 }, // Date
      { wch: 12 }, // Day
      { wch: 15 }, // Department
      { wch: 20 }, // Shift Name
      { wch: 10 }, // Start Time
      { wch: 10 }, // End Time
      { wch: 20 }, // Resident
      { wch: 15 }, // Role
      { wch: 12 }, // Status
      { wch: 30 }  // Notes
    ];

    XLSX.utils.book_append_sheet(workbook, assignmentsSheet, 'All Assignments');
  };

  const createConflictsSheet = async (workbook: any) => {
    const conflictsData = [
      ['Date', 'Day', 'Conflict Type', 'Severity', 'Description']
    ];

    conflicts
      .sort((a, b) => new Date(a.conflictDate).getTime() - new Date(b.conflictDate).getTime())
      .forEach(conflict => {
        const date = new Date(conflict.conflictDate);
        conflictsData.push([
          date.toLocaleDateString('en-US'),
          date.toLocaleDateString('en-US', { weekday: 'long' }),
          conflict.conflictType.replace('_', ' ').toUpperCase(),
          conflict.severity.toUpperCase(),
          conflict.description
        ]);
      });

    const conflictsSheet = XLSX.utils.aoa_to_sheet(conflictsData);
    
    // Set column widths
    conflictsSheet['!cols'] = [
      { wch: 12 }, // Date
      { wch: 12 }, // Day
      { wch: 20 }, // Type
      { wch: 10 }, // Severity
      { wch: 50 }  // Description
    ];

    XLSX.utils.book_append_sheet(workbook, conflictsSheet, 'Conflicts');
  };

  const createSummarySheet = async (workbook: any) => {
    const dates = getWeekDates(selectedPeriod!.startDate, selectedPeriod!.endDate);
    
    const summaryData = [
      ['BEACON HOUSE WORK SCHEDULE SUMMARY'],
      [''],
      ['Period:', selectedPeriod!.name],
      ['Date Range:', `${new Date(selectedPeriod!.startDate).toLocaleDateString()} - ${new Date(selectedPeriod!.endDate).toLocaleDateString()}`],
      ['Generated:', new Date().toLocaleDateString()],
      [''],
      ['STATISTICS'],
      ['Total Assignments:', assignments.length],
      ['Total Conflicts:', conflicts.length],
      ['High Priority Conflicts:', conflicts.filter(c => c.severity === 'error').length],
      [''],
      ['DAILY BREAKDOWN'],
      ['Date', 'Day', 'Total Assignments', 'Conflicts', 'Staff Count']
    ];

    dates.forEach(date => {
      const dateStr = date.toISOString().split('T')[0];
      const dayAssignments = assignments.filter(a => a.assignedDate.split('T')[0] === dateStr);
      const dayConflicts = conflicts.filter(c => c.conflictDate.split('T')[0] === dateStr);
      const uniqueStaff = new Set(dayAssignments.map(a => a.residentId)).size;

      summaryData.push([
        date.toLocaleDateString('en-US'),
        date.toLocaleDateString('en-US', { weekday: 'long' }),
        dayAssignments.length,
        dayConflicts.length,
        uniqueStaff
      ]);
    });

    summaryData.push(['']);
    summaryData.push(['DEPARTMENT BREAKDOWN']);
    summaryData.push(['Department', 'Total Assignments', 'Unique Staff']);

    const departments = [...new Set(assignments.map(a => a.shift.department.name))];
    departments.forEach(dept => {
      const deptAssignments = assignments.filter(a => a.shift.department.name === dept);
      const uniqueStaff = new Set(deptAssignments.map(a => a.residentId)).size;
      
      summaryData.push([
        dept.replace('_', ' ').toUpperCase(),
        deptAssignments.length,
        uniqueStaff
      ]);
    });

    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    
    // Set column widths
    summarySheet['!cols'] = [
      { wch: 25 },
      { wch: 15 },
      { wch: 15 },
      { wch: 10 },
      { wch: 10 }
    ];

    // Style the header
    summarySheet['A1'].s = {
      font: { bold: true, size: 16 },
      alignment: { horizontal: 'center' }
    };

    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');
  };

  // const formatTimeRange = (timeSlot: string) => {
  //   const [start, end] = timeSlot.split('-');
  //   return `${formatTime(start)} - ${formatTime(end)}`;
  // };

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

  // Calendar View with CSS classes
  const CalendarView = () => (
    <div className="calendar-container">
      {/* Calendar Header */}
      <div className="calendar-header">
        <h1 className="calendar-title">Beacon House Work Schedule</h1>
        <h2 className="calendar-subtitle">{selectedPeriod?.name}</h2>
        <p className="calendar-date">
          Generated on {new Date().toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          })}
        </p>
      </div>

      {/* Calendar Grid */}
      <div className="calendar-grid">
        {getWeekDates(selectedPeriod!.startDate, selectedPeriod!.endDate).map(date => {
          const dayAssignments = getAssignmentsForDate(date);
          const dayConflicts = getConflictsForDate(date);
          const departmentGroups = groupAssignmentsByDepartment(dayAssignments);
          
          return (
            <div key={date.toISOString()} className="calendar-day">
              {/* Day Header */}
              <div className="day-header">
                <div className="day-name">
                  {date.toLocaleDateString('en-US', { weekday: 'short' })}
                </div>
                <div className="day-date">
                  {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </div>
                <div className="day-stats">
                  <span className="staff-count">
                    {dayAssignments.length} staff
                  </span>
                  {dayConflicts.length > 0 && (
                    <span className="conflicts-count">
                      {dayConflicts.length} conflicts
                    </span>
                  )}
                </div>
              </div>
              
              {/* Day Content */}
              <div className="day-content">
                {Object.keys(departmentGroups).length === 0 ? (
                  <div className="no-assignments">
                    No assignments
                  </div>
                ) : (
                  Object.entries(departmentGroups).map(([deptName, deptAssignments]) => (
                    <div key={deptName} className="department-section">
                      <div className="department-header">
                        <span className="department-icon">{getDepartmentIcon(deptName)}</span>
                        <span className="department-name">
                          {deptName.replace('_', ' ')}
                        </span>
                      </div>
                      
                      {deptAssignments.map(assignment => (
                        <div
                          key={assignment.id}
                          className={`assignment-card ${deptName}`}
                          onClick={() => handleEditAssignment(assignment)}
                        >
                          <div className="assignment-title">
                            {assignment.shift.name}
                          </div>
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
                            <div className={`assignment-status ${assignment.status}`}>
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

      {/* Legend */}
      <div className="legend">
        <div className="legend-title">Departments:</div>
        <div className="legend-items">
          <div className="legend-item">
            <div className="legend-color kitchen"></div>
            <span className="legend-label">Kitchen</span>
          </div>
          <div className="legend-item">
            <div className="legend-color shelter"></div>
            <span className="legend-label">Shelter Runs</span>
          </div>
          <div className="legend-item">
            <div className="legend-color thrift"></div>
            <span className="legend-label">Thrift Stores</span>
          </div>
          <div className="legend-item">
            <div className="legend-color maintenance"></div>
            <span className="legend-label">Maintenance</span>
          </div>
        </div>
      </div>
    </div>
  );

  // Edit View (keeping the same as before for brevity)
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
              <span style={{
                padding: '4px 8px',
                fontSize: '12px',
                borderRadius: '12px',
                fontWeight: '500',
                backgroundColor: assignment.status === 'scheduled' ? '#dbeafe' :
                               assignment.status === 'completed' ? '#dcfce7' :
                               assignment.status === 'no_show' ? '#fee2e2' : '#fef3c7',
                color: assignment.status === 'scheduled' ? '#1e40af' :
                       assignment.status === 'completed' ? '#166534' :
                       assignment.status === 'no_show' ? '#dc2626' : '#d97706'
              }}>
                {assignment.status.replace('_', ' ')}
              </span>
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
    <div className="schedule-container">
      <div className="schedule-header">
        <h2 className="schedule-title">Work Schedule</h2>
        <div className="header-buttons">
          <button 
            onClick={handleExportToExcel} 
            disabled={exporting || !selectedPeriod}
            className="print-button"
            style={{ backgroundColor: '#059669' }}
          >
            {exporting ? '📊 Exporting...' : '📊 Export to Excel'}
          </button>
          <button onClick={() => setShowNewPeriodForm(true)} className="create-period-button">
            Create New Period
          </button>
        </div>
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      <div className="period-selection">
        <h3>Select Schedule Period</h3>
        <div className="periods-grid">
          {periods.map(period => (
            <div
              key={period.id}
              onClick={() => setSelectedPeriod(period)}
              className={`period-card ${selectedPeriod?.id === period.id ? 'selected' : ''}`}
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
        <div className="control-bar">
          <div className="control-content">
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
            <div className="control-actions">
              <div className="view-toggle">
                <button
                  onClick={() => setViewMode('calendar')}
                  className={`toggle-button ${viewMode === 'calendar' ? 'active' : ''}`}
                >
                  📅 Calendar
                </button>
                <button
                  onClick={() => setViewMode('edit')}
                  className={`toggle-button ${viewMode === 'edit' ? 'active' : ''}`}
                >
                  ✏️ Edit
                </button>
              </div>
              <button
                onClick={handleGenerateSchedule}
                disabled={generating}
                className="generate-button"
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
                    fontSize: '14px'
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
                    fontSize: '14px'
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
                    fontSize: '14px'
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
                    fontSize: '14px'
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Excel Export Instructions */}
      {selectedPeriod && (
        <div className="print-instructions">
          <h4>📊 Excel Export Features</h4>
          <ul>
            <li><strong>Calendar View:</strong> Weekly calendar layout with all assignments organized by day and time</li>
            <li><strong>All Assignments:</strong> Complete list of assignments with details like resident, role, status, and notes</li>
            <li><strong>Conflicts:</strong> All scheduling conflicts with severity levels and descriptions</li>
            <li><strong>Summary:</strong> Statistics, daily breakdown, and department analysis</li>
            <li>Perfect for sharing with staff, archiving records, or further analysis in Excel</li>
          </ul>
        </div>
      )}
    </div>
  );
};

export default ScheduleManagement;