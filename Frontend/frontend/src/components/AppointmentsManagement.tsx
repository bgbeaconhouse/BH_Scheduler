import React, { useState, useEffect } from 'react';
import { appointmentsApi, appointmentTypesApi, residentsApi } from '../api/client';
import { DateUtils } from '../utils/timeHelpers';

interface Appointment {
  id: number;
  residentId: number;
  appointmentTypeId: number;
  title: string;
  startDateTime: string;
  endDateTime: string;
  isRecurring: boolean;
  recurringPattern?: string;
  notes?: string;
  resident: {
    id: number;
    firstName: string;
    lastName: string;
  };
  appointmentType: {
    id: number;
    name: string;
    priority: number;
  };
}

interface AppointmentType {
  id: number;
  name: string;
  description?: string;
  priority: number;
}

interface Resident {
  id: number;
  firstName: string;
  lastName: string;
}

interface AppointmentForm {
  residentId: string;
  appointmentTypeId: string;
  title: string;
  startDate: string;
  startTime: string;
  endTime: string;
  isRecurring: boolean;
  recurringDays: boolean[];
  recurringEndDate: string;
  notes: string;
}

const AppointmentsManagement: React.FC = () => {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [appointmentTypes, setAppointmentTypes] = useState<AppointmentType[]>([]);
  const [residents, setResidents] = useState<Resident[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [error, setError] = useState<string>('');
  const [selectedWeek, setSelectedWeek] = useState<string>('');

  const [appointmentForm, setAppointmentForm] = useState<AppointmentForm>({
    residentId: '',
    appointmentTypeId: '',
    title: '',
    startDate: '',
    startTime: '10:00',
    endTime: '11:00',
    isRecurring: false,
    recurringDays: [false, false, false, false, false, false, false], // Sun-Sat
    recurringEndDate: '',
    notes: ''
  });

  useEffect(() => {
    fetchData();
    setCurrentWeek();
  }, []);

  useEffect(() => {
    if (selectedWeek) {
      fetchAppointments();
    }
  }, [selectedWeek]);

  const setCurrentWeek = () => {
    const today = DateUtils.today();
    const weekDates = DateUtils.getWeekDates(today);
    setSelectedWeek(DateUtils.formatLocalDate(weekDates[0])); // Monday
  };

  const fetchData = async () => {
    try {
      const [typesResponse, residentsResponse] = await Promise.all([
        appointmentTypesApi.getAll(),
        residentsApi.getAll()
      ]);
      setAppointmentTypes(typesResponse.data);
      setResidents(residentsResponse.data);
    } catch (error: any) {
      console.error('Failed to fetch data:', error);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const fetchAppointments = async () => {
    if (!selectedWeek) return;

    try {
      const weekStart = new Date(selectedWeek);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);

      const response = await appointmentsApi.getAll({
        startDate: weekStart.toISOString(),
        endDate: weekEnd.toISOString()
      });
      setAppointments(response.data);
    } catch (error: any) {
      console.error('Failed to fetch appointments:', error);
      setError('Failed to load appointments');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!appointmentForm.residentId || !appointmentForm.appointmentTypeId || !appointmentForm.title || !appointmentForm.startDate) {
      setError('Please fill in all required fields');
      return;
    }

    try {
      if (editingAppointment) {
        // EDITING EXISTING APPOINTMENT
        if (editingAppointment.isRecurring && editingAppointment.recurringPattern) {
          // This is a recurring appointment - check if recurring days changed
          const selectedDays = appointmentForm.recurringDays
            .map((selected, index) => selected ? index : -1)
            .filter(day => day !== -1);

          const hasRecurringChanges = selectedDays.length > 0 && appointmentForm.recurringEndDate;
          
          if (hasRecurringChanges) {
            // User is changing the recurring pattern
            const updateChoice = window.confirm(
              `This is part of a recurring series and you've changed the recurring pattern.\n\nOK = Delete old series and create new one with new pattern\nCancel = Update only times/details (keep same days)`
            );
            
            console.log('=== RECURRING PATTERN UPDATE ===');
            console.log('Update choice:', updateChoice);
            console.log('Selected days:', selectedDays);
            console.log('Recurring end date:', appointmentForm.recurringEndDate);
            
            if (updateChoice) {
              // Delete old series and create new one
              try {
                console.log('Deleting old series...');
                console.log('Pattern:', editingAppointment.recurringPattern);
                console.log('Resident ID:', editingAppointment.residentId);
                
                // Use direct fetch instead of API client
                const response = await fetch('/api/appointments/recurring-series', {
                  method: 'DELETE',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                  },
                  body: JSON.stringify({
                    recurringPattern: editingAppointment.recurringPattern,
                    residentId: editingAppointment.residentId
                  })
                });
                
                if (!response.ok) {
                  const errorText = await response.text();
                  console.error('Delete response error:', errorText);
                  throw new Error(`Failed to delete series: ${response.status} ${errorText}`);
                }
                
                // Check if response has content before parsing JSON
                const responseText = await response.text();
                console.log('Delete response text:', responseText);
                
                let deleteResponse;
                try {
                  deleteResponse = responseText ? JSON.parse(responseText) : {};
                } catch (parseError) {
                  console.error('JSON parse error:', parseError);
                  console.log('Raw response:', responseText);
                  // If JSON parsing fails but request was successful, continue anyway
                  deleteResponse = { deletedCount: 'unknown' };
                }
                
                console.log('Delete response:', deleteResponse);

                // Then create new recurring series starting from today
                const today = new Date();
                const todayStr = today.toISOString().split('T')[0];
                
                console.log('Creating new series...');
                const createData = {
                  residentId: parseInt(appointmentForm.residentId),
                  appointmentTypeId: parseInt(appointmentForm.appointmentTypeId),
                  title: appointmentForm.title,
                  startTime: appointmentForm.startTime,
                  endTime: appointmentForm.endTime,
                  daysOfWeek: selectedDays,
                  startDate: todayStr,
                  endDate: appointmentForm.recurringEndDate,
                  notes: appointmentForm.notes
                };
                console.log('Create data:', createData);
                
                const createResponse = await appointmentsApi.createRecurring(createData);
                console.log('Create response:', createResponse);

                // Close form and refresh appointments
                console.log('Refreshing appointments...');
                await fetchAppointments();
                console.log('Resetting form...');
                resetForm();
                setError(`✅ Updated recurring series with new pattern. Old series deleted, new series created.`);
                setTimeout(() => setError(''), 5000);
                return; // Exit the function early
              } catch (error: any) {
                console.error('Error in pattern update:', error);
                throw new Error(error.message || 'Failed to update recurring pattern');
              }
            } else {
              // Just update times/details without changing pattern
              try {
                console.log('Updating series without pattern change...');
                const updateData = {
                  recurringPattern: editingAppointment.recurringPattern,
                  residentId: editingAppointment.residentId,
                  appointmentTypeId: parseInt(appointmentForm.appointmentTypeId),
                  title: appointmentForm.title,
                  startTime: appointmentForm.startTime,
                  endTime: appointmentForm.endTime,
                  notes: appointmentForm.notes,
                  updateFutureOnly: true
                };
                console.log('Update data:', updateData);
                
                const response = await fetch('/api/appointments/recurring-series', {
                  method: 'PUT',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                  },
                  body: JSON.stringify(updateData)
                });
                
                if (!response.ok) {
                  const errorText = await response.text();
                  console.error('Update response error:', errorText);
                  throw new Error(`Failed to update series: ${response.status} ${errorText}`);
                }
                
                const result = await response.json();
                console.log('Update response:', result);
                
                // Close form and refresh appointments
                console.log('Refreshing appointments...');
                await fetchAppointments();
                console.log('Resetting form...');
                resetForm();
                setError(`✅ Updated ${result.updatedCount} appointments in recurring series (times/details only)`);
                setTimeout(() => setError(''), 4000);
                return; // Exit the function early
              } catch (error: any) {
                console.error('Error in series update:', error);
                throw new Error(error.message || 'Failed to update recurring series');
              }
            }
          } else {
            // No recurring pattern changes, just update the series normally
            console.log('=== STANDARD SERIES UPDATE ===');
            const updateSeries = window.confirm(
              `This is part of a recurring series.\n\nOK = Update ALL future appointments in series\nCancel = Update only this single appointment`
            );
            
            console.log('Update series choice:', updateSeries);
            
            if (updateSeries) {
              // Update entire recurring series
              try {
                console.log('Updating entire series...');
                const updateData = {
                  recurringPattern: editingAppointment.recurringPattern,
                  residentId: editingAppointment.residentId,
                  appointmentTypeId: parseInt(appointmentForm.appointmentTypeId),
                  title: appointmentForm.title,
                  startTime: appointmentForm.startTime,
                  endTime: appointmentForm.endTime,
                  notes: appointmentForm.notes,
                  updateFutureOnly: true
                };
                console.log('Update data:', updateData);
                
                const response = await fetch('/api/appointments/recurring-series', {
                  method: 'PUT',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                  },
                  body: JSON.stringify(updateData)
                });
                
                if (!response.ok) {
                  const errorText = await response.text();
                  console.error('Update response error:', errorText);
                  throw new Error(`Failed to update series: ${response.status} ${errorText}`);
                }
                
                const result = await response.json();
                console.log('Series update response:', result);
                
                // Close form and refresh appointments
                console.log('Refreshing appointments...');
                await fetchAppointments();
                console.log('Resetting form...');
                resetForm();
                setError(`✅ Updated ${result.updatedCount} appointments in recurring series`);
                setTimeout(() => setError(''), 4000);
                return; // Exit the function early
              } catch (error: any) {
                console.error('Error updating series:', error);
                throw new Error(error.message || 'Failed to update recurring series');
              }
            } else {
              // Update just this single appointment (existing logic)
              console.log('Updating single appointment...');
              const startDateTime = DateUtils.createLocalDateTime(appointmentForm.startDate, appointmentForm.startTime);
              const endDateTime = DateUtils.createLocalDateTime(appointmentForm.startDate, appointmentForm.endTime);
              const startUTC = new Date(startDateTime.getTime() - (startDateTime.getTimezoneOffset() * 60000));
              const endUTC = new Date(endDateTime.getTime() - (endDateTime.getTimezoneOffset() * 60000));

              await appointmentsApi.update(editingAppointment.id, {
                residentId: parseInt(appointmentForm.residentId),
                appointmentTypeId: parseInt(appointmentForm.appointmentTypeId),
                title: appointmentForm.title,
                startDateTime: startUTC.toISOString(),
                endDateTime: endUTC.toISOString(),
                notes: appointmentForm.notes
              });
              
              // Close form and refresh appointments
              console.log('Refreshing appointments after single update...');
              await fetchAppointments();
              console.log('Resetting form after single update...');
              resetForm();
              return; // Exit the function early
            }
          }
        } else {
          // Regular single appointment update (existing logic)
          const startDateTime = DateUtils.createLocalDateTime(appointmentForm.startDate, appointmentForm.startTime);
          const endDateTime = DateUtils.createLocalDateTime(appointmentForm.startDate, appointmentForm.endTime);
          const startUTC = new Date(startDateTime.getTime() - (startDateTime.getTimezoneOffset() * 60000));
          const endUTC = new Date(endDateTime.getTime() - (endDateTime.getTimezoneOffset() * 60000));

          await appointmentsApi.update(editingAppointment.id, {
            residentId: parseInt(appointmentForm.residentId),
            appointmentTypeId: parseInt(appointmentForm.appointmentTypeId),
            title: appointmentForm.title,
            startDateTime: startUTC.toISOString(),
            endDateTime: endUTC.toISOString(),
            notes: appointmentForm.notes
          });
        }
      } else {
        // CREATING NEW APPOINTMENT (existing logic)
        if (appointmentForm.isRecurring) {
          const selectedDays = appointmentForm.recurringDays
            .map((selected, index) => selected ? index : -1)
            .filter(day => day !== -1);

          if (selectedDays.length === 0) {
            setError('Please select at least one day for recurring appointments');
            return;
          }

          if (!appointmentForm.recurringEndDate) {
            setError('Please select an end date for recurring appointments');
            return;
          }

          await appointmentsApi.createRecurring({
            residentId: parseInt(appointmentForm.residentId),
            appointmentTypeId: parseInt(appointmentForm.appointmentTypeId),
            title: appointmentForm.title,
            startTime: appointmentForm.startTime,
            endTime: appointmentForm.endTime,
            daysOfWeek: selectedDays,
            startDate: appointmentForm.startDate,
            endDate: appointmentForm.recurringEndDate,
            notes: appointmentForm.notes
          });
        } else {
          const startDateTime = DateUtils.createLocalDateTime(appointmentForm.startDate, appointmentForm.startTime);
          const endDateTime = DateUtils.createLocalDateTime(appointmentForm.startDate, appointmentForm.endTime);
          const startUTC = new Date(startDateTime.getTime() - (startDateTime.getTimezoneOffset() * 60000));
          const endUTC = new Date(endDateTime.getTime() - (endDateTime.getTimezoneOffset() * 60000));

          await appointmentsApi.create({
            residentId: parseInt(appointmentForm.residentId),
            appointmentTypeId: parseInt(appointmentForm.appointmentTypeId),
            title: appointmentForm.title,
            startDateTime: startUTC.toISOString(),
            endDateTime: endUTC.toISOString(),
            notes: appointmentForm.notes
          });
        }
      }
      
      // Only reach this point for non-recurring edits or new appointments
      await fetchAppointments();
      resetForm();
      if (!error.startsWith('✅')) {
        setError('');
      }
    } catch (error: any) {
      setError(error.message || 'Failed to save appointment');
    }
  };

 
// Replace your handleDelete function with this:
const handleDelete = async (appointment: Appointment) => {
  console.log('=== HANDLE DELETE ===');
  console.log('Appointment:', {
    id: appointment.id,
    isRecurring: appointment.isRecurring,
    recurringPattern: appointment.recurringPattern,
    title: appointment.title
  });
  
  if (appointment.isRecurring && appointment.recurringPattern) {
    // For recurring appointments, offer series delete option
    const deleteType = window.confirm(
      `This is part of a recurring series.\n\nOK = Delete ENTIRE series (all future appointments)\nCancel = Delete only this one appointment`
    );
    
    console.log('Delete type choice:', deleteType ? 'Series' : 'Single');
    
    if (deleteType) {
      // Delete entire series using the API client
      await handleDeleteRecurringSeriesNew(appointment);
    } else {
      // Delete just this one appointment
      if (window.confirm('Delete only this single appointment?')) {
        try {
          console.log('Deleting single appointment:', appointment.id);
          await appointmentsApi.delete(appointment.id);
          await fetchAppointments();
          setError('✅ Single appointment deleted');
          setTimeout(() => setError(''), 3000);
        } catch (error: any) {
          console.error('Error deleting single appointment:', error);
          setError(`❌ Failed to delete appointment: ${error.message}`);
        }
      }
    }
  } else {
    // Regular single appointment
    if (window.confirm('Are you sure you want to delete this appointment?')) {
      try {
        console.log('Deleting regular appointment:', appointment.id);
        await appointmentsApi.delete(appointment.id);
        await fetchAppointments();
        setError('✅ Appointment deleted');
        setTimeout(() => setError(''), 3000);
      } catch (error: any) {
        console.error('Error deleting regular appointment:', error);
        setError(`❌ Failed to delete appointment: ${error.message}`);
      }
    }
  }
};

// Replace your handleDeleteRecurringSeries function with this NEW one:
const handleDeleteRecurringSeriesNew = async (appointment: Appointment) => {
  console.log('=== API CLIENT DELETE SERIES ===');
  console.log('Appointment:', appointment);
  
  if (!appointment.recurringPattern) {
    setError('❌ No recurring pattern found for this appointment');
    return;
  }
  
  if (window.confirm(`Delete ALL future appointments in this recurring series?\n\nThis will affect ${appointment.resident.firstName} ${appointment.resident.lastName}'s recurring ${appointment.appointmentType.name} appointments.\n\nPattern: ${appointment.recurringPattern}`)) {
    try {
      console.log('Calling API client deleteRecurringSeries...');
      console.log('Pattern:', appointment.recurringPattern);
      console.log('Resident ID:', appointment.residentId);
      
      // Use the API client which has all the debug logging
      const response = await appointmentsApi.deleteRecurringSeries(
        appointment.recurringPattern,
        appointment.residentId
      );
      
      console.log('API client response received:', response);
      console.log('Response data:', response.data);
      
      // Refresh appointments
      await fetchAppointments();
      
      // Show success message
      const deletedCount = response.data?.deletedCount || 'unknown number of';
      setError(`✅ Deleted ${deletedCount} appointments from recurring series`);
      setTimeout(() => setError(''), 4000);
      
    } catch (error: any) {
      console.error('=== DELETE SERIES ERROR ===');
      console.error('Error:', error);
      
      setError(`❌ Failed to delete recurring series: ${error.message}`);
      setTimeout(() => setError(''), 6000);
    }
  }
};
  const resetForm = () => {
    setAppointmentForm({
      residentId: '',
      appointmentTypeId: '',
      title: '',
      startDate: '',
      startTime: '10:00',
      endTime: '11:00',
      isRecurring: false,
      recurringDays: [false, false, false, false, false, false, false],
      recurringEndDate: '',
      notes: ''
    });
    setEditingAppointment(null);
    setShowForm(false);
    setError('');
  };

  const handleEdit = (appointment: Appointment) => {
    // Use proper UTC to local conversion - this is the correct approach!
    const startDate = new Date(appointment.startDateTime);
    const endDate = new Date(appointment.endDateTime);
    
    // Convert to local date and time strings for form inputs
    const formatDateForInput = (date: Date) => {
      // Get local date in YYYY-MM-DD format
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    
    const formatTimeForInput = (date: Date) => {
      // Get local time in HH:MM format
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${hours}:${minutes}`;
    };

    // If this is a recurring appointment, try to extract the current days from the pattern
    let currentRecurringDays = [false, false, false, false, false, false, false];
    if (appointment.isRecurring && appointment.recurringPattern) {
      // Try to find all appointments in this series to determine which days are used
      const seriesAppointments = appointments.filter(apt => 
        apt.recurringPattern === appointment.recurringPattern && 
        apt.residentId === appointment.residentId
      );
      
      // Extract the days of week from the existing appointments
      const usedDays = new Set<number>();
      seriesAppointments.forEach(apt => {
        const aptDate = new Date(apt.startDateTime);
        usedDays.add(aptDate.getDay());
      });
      
      // Set the recurring days based on what we found
      usedDays.forEach(dayIndex => {
        currentRecurringDays[dayIndex] = true;
      });
    }

    // Calculate an appropriate end date for recurring series (3 months from now)
    const futureEndDate = new Date();
    futureEndDate.setMonth(futureEndDate.getMonth() + 3);
    const defaultEndDate = formatDateForInput(futureEndDate);
    
    console.log('=== EDIT SUCCESS ===');
    console.log('Stored UTC time:', appointment.startDateTime);
    console.log('Converted to local:', startDate.toString());
    console.log('Form date field:', formatDateForInput(startDate));
    console.log('Form time field:', formatTimeForInput(startDate));
    console.log('Recurring days detected:', currentRecurringDays);
    console.log('====================');
    
    setEditingAppointment(appointment);
    setAppointmentForm({
      residentId: appointment.residentId.toString(),
      appointmentTypeId: appointment.appointmentTypeId.toString(),
      title: appointment.title,
      startDate: formatDateForInput(startDate),
      startTime: formatTimeForInput(startDate),
      endTime: formatTimeForInput(endDate),
      isRecurring: appointment.isRecurring,
      recurringDays: currentRecurringDays,
      recurringEndDate: defaultEndDate,
      notes: appointment.notes || ''
    });
    setShowForm(true);
  };

  const getWeekDates = () => {
    if (!selectedWeek) return [];
    
    const monday = new Date(selectedWeek);
    const dates = [];
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      dates.push(date);
    }
    
    return dates;
  };

  const getAppointmentsForDate = (date: Date) => {
    const dateStr = date.toLocaleDateString('en-CA'); // YYYY-MM-DD format
    return appointments.filter(apt => {
      const aptDate = new Date(apt.startDateTime).toLocaleDateString('en-CA');
      return aptDate === dateStr;
    });
  };

  const getDayName = (date: Date) => {
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    });
  };

  const changeWeek = (direction: number) => {
    const currentWeek = DateUtils.createLocalDateTime(selectedWeek, '00:00');
    currentWeek.setDate(currentWeek.getDate() + (direction * 7));
    setSelectedWeek(DateUtils.formatLocalDate(currentWeek));
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">Loading appointments...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Appointments & Counseling</h2>
        <button
          onClick={() => setShowForm(true)}
          className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
        >
          Schedule Appointment
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className={`${error.startsWith('✅') ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'} border px-4 py-3 rounded-lg`}>
          {error}
        </div>
      )}

      {/* Week Navigation */}
      <div className="flex justify-between items-center bg-white rounded-lg shadow p-4">
        <button
          onClick={() => changeWeek(-1)}
          className="text-blue-600 hover:text-blue-900"
        >
          ← Previous Week
        </button>
        <h3 className="text-lg font-semibold">
          Week of {selectedWeek ? new Date(selectedWeek).toLocaleDateString('en-US', { 
            month: 'long', 
            day: 'numeric',
            year: 'numeric' 
          }) : ''}
        </h3>
        <button
          onClick={() => changeWeek(1)}
          className="text-blue-600 hover:text-blue-900"
        >
          Next Week →
        </button>
      </div>

      {/* Appointment Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl mx-4 my-8 max-h-screen overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">
              {editingAppointment ? 'Edit Appointment' : 'Schedule New Appointment'}
            </h3>
            
            {/* Warning banner for recurring appointments */}
            {editingAppointment?.isRecurring && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                <div className="flex items-center space-x-2">
                  <span className="text-yellow-600">⚠️</span>
                  <span className="text-sm font-medium text-yellow-800">Editing Recurring Series</span>
                </div>
                <p className="text-sm text-yellow-700 mt-1">
                  You can update times, details, and even change which days this series repeats on. 
                  When you save, you'll be asked whether to update all future appointments in this series or just this single appointment.
                </p>
                <p className="text-xs text-yellow-600 mt-1">
                  💡 Tip: Changing the recurring days will delete the old series and create a new one with the new pattern.
                </p>
              </div>
            )}
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Resident *
                  </label>
                  <select
                    value={appointmentForm.residentId}
                    onChange={(e) => setAppointmentForm({...appointmentForm, residentId: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">Select resident...</option>
                    {residents.map(resident => (
                      <option key={resident.id} value={resident.id}>
                        {resident.firstName} {resident.lastName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Appointment Type *
                  </label>
                  <select
                    value={appointmentForm.appointmentTypeId}
                    onChange={(e) => setAppointmentForm({...appointmentForm, appointmentTypeId: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">Select type...</option>
                    {appointmentTypes.map(type => (
                      <option key={type.id} value={type.id}>
                        {type.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  value={appointmentForm.title}
                  onChange={(e) => setAppointmentForm({...appointmentForm, title: e.target.value})}
                  placeholder="e.g., Weekly Counseling Session"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Date *
                  </label>
                  <input
                    type="date"
                    value={appointmentForm.startDate}
                    onChange={(e) => setAppointmentForm({...appointmentForm, startDate: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Time *
                  </label>
                  <input
                    type="time"
                    value={appointmentForm.startTime}
                    onChange={(e) => setAppointmentForm({...appointmentForm, startTime: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    End Time *
                  </label>
                  <input
                    type="time"
                    value={appointmentForm.endTime}
                    onChange={(e) => setAppointmentForm({...appointmentForm, endTime: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>

              {(!editingAppointment || editingAppointment.isRecurring) && (
                <>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={appointmentForm.isRecurring}
                      onChange={(e) => setAppointmentForm({...appointmentForm, isRecurring: e.target.checked})}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      disabled={!!editingAppointment} // Disable if editing existing appointment
                    />
                    <span className="text-sm font-medium text-gray-700">
                      {editingAppointment ? 'Recurring Appointment (edit series)' : 'Recurring Appointment'}
                    </span>
                  </div>

                  {appointmentForm.isRecurring && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          {editingAppointment ? 'Change Recurring Days' : 'Repeat on Days'}
                        </label>
                        <div className="grid grid-cols-7 gap-2">
                          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => (
                            <label key={day} className="flex items-center space-x-1">
                              <input
                                type="checkbox"
                                checked={appointmentForm.recurringDays[index]}
                                onChange={(e) => {
                                  const newDays = [...appointmentForm.recurringDays];
                                  newDays[index] = e.target.checked;
                                  setAppointmentForm({...appointmentForm, recurringDays: newDays});
                                }}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                              <span className="text-sm">{day}</span>
                            </label>
                          ))}
                        </div>
                        {editingAppointment && (
                          <p className="text-xs text-gray-500 mt-1">
                            Current pattern: {appointmentForm.recurringDays.map((checked, i) => 
                              checked ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i] : null
                            ).filter(Boolean).join(', ') || 'None selected'}
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {editingAppointment ? 'Extend Series Until *' : 'End Date for Recurring *'}
                        </label>
                        <input
                          type="date"
                          value={appointmentForm.recurringEndDate}
                          onChange={(e) => setAppointmentForm({...appointmentForm, recurringEndDate: e.target.value})}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {editingAppointment && (
                          <p className="text-xs text-gray-500 mt-1">
                            This will create new appointments until this date with the new pattern
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  value={appointmentForm.notes}
                  onChange={(e) => setAppointmentForm({...appointmentForm, notes: e.target.value})}
                  rows={3}
                  placeholder="Additional notes or special instructions"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  {editingAppointment ? 'Update' : 'Schedule'} Appointment
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

      {/* Weekly Calendar View */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-7 gap-px bg-gray-200">
          {getWeekDates().map(date => {
            const dayAppointments = getAppointmentsForDate(date);
            
            return (
              <div key={date.toISOString()} className="bg-white min-h-64">
                {/* Day Header */}
                <div className="p-3 border-b border-gray-200 bg-gray-50">
                  <div className="font-medium text-gray-900">{getDayName(date)}</div>
                  <div className="text-sm text-gray-500">{formatDate(date)}</div>
                  <div className="text-xs text-gray-400 mt-1">
                    {dayAppointments.length} appointments
                  </div>
                </div>
                
                {/* Day Content */}
                <div className="p-2 space-y-1">
                  {dayAppointments.length === 0 ? (
                    <div className="text-xs text-gray-400 italic">No appointments</div>
                  ) : (
                    dayAppointments
                      .sort((a, b) => new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime())
                      .map(appointment => (
                        <div
                          key={appointment.id}
                          className={`text-xs p-2 rounded border-l-2 ${
                            appointment.appointmentType.name === 'counseling' 
                              ? 'border-purple-400 bg-purple-50' 
                              : appointment.appointmentType.name === 'medical'
                              ? 'border-red-400 bg-red-50'
                              : 'border-blue-400 bg-blue-50'
                          }`}
                        >
                          <div className="font-medium text-gray-900">
                            {appointment.title}
                          </div>
                          <div className="text-gray-600">
                            {formatTime(appointment.startDateTime)} - {formatTime(appointment.endDateTime)}
                          </div>
                          <div className={`font-medium ${
                            appointment.appointmentType.name === 'counseling' 
                              ? 'text-purple-700' 
                              : appointment.appointmentType.name === 'medical'
                              ? 'text-red-700'
                              : 'text-blue-700'
                          }`}>
                            {appointment.resident.firstName} {appointment.resident.lastName}
                          </div>
                          <div className="text-gray-500 capitalize">
                            {appointment.appointmentType.name}
                          </div>
                          {appointment.isRecurring && (
                            <div className="text-xs text-green-600 mt-1">
                              🔄 Recurring
                            </div>
                          )}
                          <div className="flex space-x-1 mt-1">
                            <button
                              onClick={() => handleEdit(appointment)}
                              className="text-blue-600 hover:text-blue-900 text-xs"
                            >
                              {appointment.isRecurring ? 'Edit Series' : 'Edit'}
                            </button>
                            <button
                              onClick={() => handleDelete(appointment)}
                              className="text-red-600 hover:text-red-900 text-xs"
                            >
                              Delete
                            </button>
                            {appointment.isRecurring && appointment.recurringPattern && (
                              <button
                                onClick={() => handleDeleteRecurringSeriesNew(appointment)}
                                className="text-red-500 hover:text-red-700 text-xs underline"
                                title="Delete entire recurring series"
                              >
                                Series
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">This Week's Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {appointments.length}
            </div>
            <div className="text-sm text-gray-500">Total Appointments</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">
              {appointments.filter(a => a.appointmentType.name === 'counseling').length}
            </div>
            <div className="text-sm text-gray-500">Counseling Sessions</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">
              {appointments.filter(a => a.appointmentType.name === 'medical').length}
            </div>
            <div className="text-sm text-gray-500">Medical Appointments</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {appointments.filter(a => a.isRecurring).length}
            </div>
            <div className="text-sm text-gray-500">Recurring</div>
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-medium text-blue-900 mb-2">💡 Scheduling Tips</h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• <strong>Counseling sessions</strong> will block residents from working thrift store shifts</li>
          <li>• <strong>Medical appointments</strong> allow temporary leave from most shifts</li>
          <li>• Use <strong>recurring appointments</strong> for regular counseling sessions</li>
          <li>• The schedule generator automatically respects these appointment conflicts</li>
          <li>• <strong>Edit Series</strong> button updates all future appointments in a recurring series</li>
          <li>• <strong>Series</strong> button quickly deletes all future appointments in a recurring series</li>
        </ul>
      </div>
    </div>
  );
};

export default AppointmentsManagement;