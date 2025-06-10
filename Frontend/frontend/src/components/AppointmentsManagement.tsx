import React, { useState, useEffect } from 'react';
import { appointmentsApi, appointmentTypesApi, residentsApi } from '../api/client';

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
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - today.getDay() + 1); // Get Monday
    setSelectedWeek(monday.toISOString().split('T')[0]);
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
      if (appointmentForm.isRecurring) {
        // Create recurring appointments
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
        // Create single appointment
        const startDateTime = new Date(`${appointmentForm.startDate}T${appointmentForm.startTime}:00`);
        const endDateTime = new Date(`${appointmentForm.startDate}T${appointmentForm.endTime}:00`);

        if (editingAppointment) {
          await appointmentsApi.update(editingAppointment.id, {
            residentId: parseInt(appointmentForm.residentId),
            appointmentTypeId: parseInt(appointmentForm.appointmentTypeId),
            title: appointmentForm.title,
            startDateTime: startDateTime.toISOString(),
            endDateTime: endDateTime.toISOString(),
            notes: appointmentForm.notes
          });
        } else {
          await appointmentsApi.create({
            residentId: parseInt(appointmentForm.residentId),
            appointmentTypeId: parseInt(appointmentForm.appointmentTypeId),
            title: appointmentForm.title,
            startDateTime: startDateTime.toISOString(),
            endDateTime: endDateTime.toISOString(),
            notes: appointmentForm.notes
          });
        }
      }
      
      await fetchAppointments();
      resetForm();
      setError('');
    } catch (error: any) {
      setError(error.message || 'Failed to save appointment');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this appointment?')) {
      return;
    }

    try {
      await appointmentsApi.delete(id);
      await fetchAppointments();
    } catch (error: any) {
      setError(error.message || 'Failed to delete appointment');
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
    const startDate = new Date(appointment.startDateTime);
    const endDate = new Date(appointment.endDateTime);
    
    setEditingAppointment(appointment);
    setAppointmentForm({
      residentId: appointment.residentId.toString(),
      appointmentTypeId: appointment.appointmentTypeId.toString(),
      title: appointment.title,
      startDate: startDate.toISOString().split('T')[0],
      startTime: startDate.toTimeString().slice(0, 5),
      endTime: endDate.toTimeString().slice(0, 5),
      isRecurring: false, // Don't support editing recurring appointments
      recurringDays: [false, false, false, false, false, false, false],
      recurringEndDate: '',
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
    const dateStr = date.toISOString().split('T')[0];
    return appointments.filter(apt => {
      const aptDate = new Date(apt.startDateTime).toISOString().split('T')[0];
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
      hour12: true 
    });
  };

  const changeWeek = (direction: number) => {
    const currentWeek = new Date(selectedWeek);
    currentWeek.setDate(currentWeek.getDate() + (direction * 7));
    setSelectedWeek(currentWeek.toISOString().split('T')[0]);
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
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
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

              {!editingAppointment && (
                <>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={appointmentForm.isRecurring}
                      onChange={(e) => setAppointmentForm({...appointmentForm, isRecurring: e.target.checked})}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-700">Recurring Appointment</span>
                  </div>

                  {appointmentForm.isRecurring && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Repeat on Days
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
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          End Date for Recurring *
                        </label>
                        <input
                          type="date"
                          value={appointmentForm.recurringEndDate}
                          onChange={(e) => setAppointmentForm({...appointmentForm, recurringEndDate: e.target.value})}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
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
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(appointment.id)}
                              className="text-red-600 hover:text-red-900 text-xs"
                            >
                              Delete
                            </button>
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
        </ul>
      </div>
    </div>
  );
};

export default AppointmentsManagement;