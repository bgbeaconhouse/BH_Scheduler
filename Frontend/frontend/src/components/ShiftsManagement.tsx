import React, { useState, useEffect } from 'react';
import { departmentsApi, shiftsApi, qualificationsApi } from '../api/client';

interface Department {
  id: number;
  name: string;
  description?: string;
  priority: number;
  shifts?: Shift[];
}

interface Shift {
  id: number;
  departmentId: number;
  name: string;
  description?: string;
  startTime: string;
  endTime: string;
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
  minTenureMonths: number;
  blocksAllAppointments: boolean;
  blocksCounselingOnly: boolean;
  allowsTemporaryLeave: boolean;
  department?: Department;
  roles: ShiftRole[];
}

interface ShiftRole {
  id: number;
  qualificationId?: number;
  roleTitle: string;
  requiredCount: number;
  qualification?: {
    id: number;
    name: string;
    category: string;
  };
}

interface Qualification {
  id: number;
  name: string;
  category: string;
}

interface ShiftForm {
  departmentId: string;
  name: string;
  description: string;
  startTime: string;
  endTime: string;
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
  minTenureMonths: number;
  blocksAllAppointments: boolean;
  blocksCounselingOnly: boolean;
  allowsTemporaryLeave: boolean;
  roles: Array<{
    qualificationId: string;
    roleTitle: string;
    requiredCount: number;
  }>;
}

const ShiftsManagement: React.FC = () => {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [qualifications, setQualifications] = useState<Qualification[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'departments' | 'shifts'>('departments');
  const [showShiftForm, setShowShiftForm] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [error, setError] = useState<string>('');

  const [shiftForm, setShiftForm] = useState<ShiftForm>({
    departmentId: '',
    name: '',
    description: '',
    startTime: '08:00',
    endTime: '16:00',
    monday: true,
    tuesday: true,
    wednesday: true,
    thursday: true,
    friday: true,
    saturday: true,
    sunday: true,
    minTenureMonths: 0,
    blocksAllAppointments: false,
    blocksCounselingOnly: false,
    allowsTemporaryLeave: false,
    roles: []
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [deptResponse, shiftsResponse, qualResponse] = await Promise.all([
        departmentsApi.getAll(),
        shiftsApi.getAll(),
        qualificationsApi.getAll()
      ]);
      setDepartments(deptResponse.data);
      setShifts(shiftsResponse.data);
      setQualifications(qualResponse.data);
    } catch (error: any) {
      console.error('Failed to fetch data:', error);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleShiftSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!shiftForm.departmentId || !shiftForm.name || !shiftForm.startTime || !shiftForm.endTime) {
      setError('Department, name, start time, and end time are required');
      return;
    }

    if (shiftForm.roles.length === 0) {
      setError('At least one role is required');
      return;
    }

    try {
      const submitData = {
        departmentId: parseInt(shiftForm.departmentId),
        name: shiftForm.name,
        description: shiftForm.description,
        startTime: shiftForm.startTime,
        endTime: shiftForm.endTime,
        monday: shiftForm.monday,
        tuesday: shiftForm.tuesday,
        wednesday: shiftForm.wednesday,
        thursday: shiftForm.thursday,
        friday: shiftForm.friday,
        saturday: shiftForm.saturday,
        sunday: shiftForm.sunday,
        minTenureMonths: shiftForm.minTenureMonths,
        blocksAllAppointments: shiftForm.blocksAllAppointments,
        blocksCounselingOnly: shiftForm.blocksCounselingOnly,
        allowsTemporaryLeave: shiftForm.allowsTemporaryLeave,
        roles: shiftForm.roles.map(role => ({
          qualificationId: role.qualificationId ? parseInt(role.qualificationId) : undefined,
          roleTitle: role.roleTitle,
          requiredCount: role.requiredCount
        }))
      };

      if (editingShift) {
        await shiftsApi.update(editingShift.id, submitData);
      } else {
        await shiftsApi.create(submitData);
      }
      
      await fetchData();
      resetShiftForm();
      setError('');
    } catch (error: any) {
      setError(error.message || 'Failed to save shift');
    }
  };

  const handleDeleteShift = async (id: number) => {
    if (!confirm('Are you sure you want to delete this shift?')) {
      return;
    }

    try {
      await shiftsApi.delete(id);
      await fetchData();
    } catch (error: any) {
      setError(error.message || 'Failed to delete shift');
    }
  };

  const resetShiftForm = () => {
    setShiftForm({
      departmentId: '',
      name: '',
      description: '',
      startTime: '08:00',
      endTime: '16:00',
      monday: true,
      tuesday: true,
      wednesday: true,
      thursday: true,
      friday: true,
      saturday: true,
      sunday: true,
      minTenureMonths: 0,
      blocksAllAppointments: false,
      blocksCounselingOnly: false,
      allowsTemporaryLeave: false,
      roles: []
    });
    setEditingShift(null);
    setShowShiftForm(false);
    setError('');
  };

  const handleEditShift = (shift: Shift) => {
    setEditingShift(shift);
    setShiftForm({
      departmentId: shift.departmentId.toString(),
      name: shift.name,
      description: shift.description || '',
      startTime: shift.startTime,
      endTime: shift.endTime,
      monday: shift.monday,
      tuesday: shift.tuesday,
      wednesday: shift.wednesday,
      thursday: shift.thursday,
      friday: shift.friday,
      saturday: shift.saturday,
      sunday: shift.sunday,
      minTenureMonths: shift.minTenureMonths,
      blocksAllAppointments: shift.blocksAllAppointments,
      blocksCounselingOnly: shift.blocksCounselingOnly,
      allowsTemporaryLeave: shift.allowsTemporaryLeave,
      roles: shift.roles.map(role => ({
        qualificationId: role.qualificationId?.toString() || '',
        roleTitle: role.roleTitle,
        requiredCount: role.requiredCount
      }))
    });
    setShowShiftForm(true);
  };

  const addRole = () => {
    setShiftForm({
      ...shiftForm,
      roles: [...shiftForm.roles, { qualificationId: '', roleTitle: '', requiredCount: 1 }]
    });
  };

  const updateRole = (index: number, field: string, value: any) => {
    const updatedRoles = [...shiftForm.roles];
    updatedRoles[index] = { ...updatedRoles[index], [field]: value };
    setShiftForm({ ...shiftForm, roles: updatedRoles });
  };

  const removeRole = (index: number) => {
    setShiftForm({
      ...shiftForm,
      roles: shiftForm.roles.filter((_, i) => i !== index)
    });
  };

  const getDaysString = (shift: Shift) => {
    const days = [];
    if (shift.monday) days.push('Mon');
    if (shift.tuesday) days.push('Tue');
    if (shift.wednesday) days.push('Wed');
    if (shift.thursday) days.push('Thu');
    if (shift.friday) days.push('Fri');
    if (shift.saturday) days.push('Sat');
    if (shift.sunday) days.push('Sun');
    return days.join(', ');
  };

  const getTotalStaffNeeded = (shift: Shift) => {
    return shift.roles.reduce((total, role) => total + role.requiredCount, 0);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">Loading shifts...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Shifts Configuration</h2>
        <div className="flex space-x-4">
          <button
            onClick={() => setActiveTab('departments')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'departments'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Departments
          </button>
          <button
            onClick={() => setActiveTab('shifts')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'shifts'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Work Shifts
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Departments Tab */}
      {activeTab === 'departments' && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold">Work Departments</h3>
            <p className="text-sm text-gray-600 mt-1">
              Departments organize shifts by priority. Kitchen has highest priority.
            </p>
          </div>
          
          {departments.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-500">
              No departments found. Create departments first to organize your shifts.
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {departments.map(dept => (
                <div key={dept.id} className="px-6 py-4">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        <h4 className="font-medium text-gray-900 capitalize">{dept.name}</h4>
                        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                          Priority: {dept.priority}
                        </span>
                      </div>
                      {dept.description && (
                        <p className="text-sm text-gray-600 mt-1">{dept.description}</p>
                      )}
                      <p className="text-sm text-gray-500 mt-2">
                        {dept.shifts?.length || 0} shifts configured
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Shifts Tab */}
      {activeTab === 'shifts' && (
        <>
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Work Shifts</h3>
            <button
              onClick={() => setShowShiftForm(true)}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
            >
              Add New Shift
            </button>
          </div>

          {/* Shift Form Modal */}
          {showShiftForm && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
              <div className="bg-white rounded-lg p-6 w-full max-w-2xl mx-4 my-8 max-h-screen overflow-y-auto">
                <h3 className="text-lg font-semibold mb-4">
                  {editingShift ? 'Edit Shift' : 'Add New Shift'}
                </h3>
                
                <form onSubmit={handleShiftSubmit} className="space-y-4">
                  {/* Basic Info */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Department *
                      </label>
                      <select
                        value={shiftForm.departmentId}
                        onChange={(e) => setShiftForm({...shiftForm, departmentId: e.target.value})}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      >
                        <option value="">Select department...</option>
                        {departments.map(dept => (
                          <option key={dept.id} value={dept.id}>{dept.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Shift Name *
                      </label>
                      <input
                        type="text"
                        value={shiftForm.name}
                        onChange={(e) => setShiftForm({...shiftForm, name: e.target.value})}
                        placeholder="e.g., Prep Team, Morning Dishwasher"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description
                    </label>
                    <textarea
                      value={shiftForm.description}
                      onChange={(e) => setShiftForm({...shiftForm, description: e.target.value})}
                      rows={2}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Schedule */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Start Time *
                      </label>
                      <input
                        type="time"
                        value={shiftForm.startTime}
                        onChange={(e) => setShiftForm({...shiftForm, startTime: e.target.value})}
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
                        value={shiftForm.endTime}
                        onChange={(e) => setShiftForm({...shiftForm, endTime: e.target.value})}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      />
                    </div>
                  </div>

                  {/* Days of Week */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Days of Week
                    </label>
                    <div className="grid grid-cols-4 md:grid-cols-7 gap-2">
                      {[
                        { key: 'monday', label: 'Mon' },
                        { key: 'tuesday', label: 'Tue' },
                        { key: 'wednesday', label: 'Wed' },
                        { key: 'thursday', label: 'Thu' },
                        { key: 'friday', label: 'Fri' },
                        { key: 'saturday', label: 'Sat' },
                        { key: 'sunday', label: 'Sun' }
                      ].map(day => (
                        <label key={day.key} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={shiftForm[day.key as keyof typeof shiftForm] as boolean}
                            onChange={(e) => setShiftForm({...shiftForm, [day.key]: e.target.checked})}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm">{day.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Requirements */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Min Tenure (Months)
                      </label>
                      <input
                        type="number"
                        value={shiftForm.minTenureMonths}
                        onChange={(e) => setShiftForm({...shiftForm, minTenureMonths: parseInt(e.target.value) || 0})}
                        min="0"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={shiftForm.blocksCounselingOnly}
                        onChange={(e) => setShiftForm({...shiftForm, blocksCounselingOnly: e.target.checked})}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm">Blocks Counseling</span>
                    </div>

                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={shiftForm.allowsTemporaryLeave}
                        onChange={(e) => setShiftForm({...shiftForm, allowsTemporaryLeave: e.target.checked})}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm">Allows Temp Leave</span>
                    </div>
                  </div>

                  {/* Roles */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Required Roles *
                      </label>
                      <button
                        type="button"
                        onClick={addRole}
                        className="text-blue-600 hover:text-blue-900 text-sm"
                      >
                        + Add Role
                      </button>
                    </div>
                    
                    {shiftForm.roles.map((role, index) => (
                      <div key={index} className="grid grid-cols-12 gap-2 mb-2">
                        <div className="col-span-4">
                          <input
                            type="text"
                            value={role.roleTitle}
                            onChange={(e) => updateRole(index, 'roleTitle', e.target.value)}
                            placeholder="Role title (e.g., prep_worker)"
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div className="col-span-4">
                          <select
                            value={role.qualificationId}
                            onChange={(e) => updateRole(index, 'qualificationId', e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">No qualification required</option>
                            {qualifications.map(qual => (
                              <option key={qual.id} value={qual.id}>
                                {qual.name} ({qual.category})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="col-span-2">
                          <input
                            type="number"
                            value={role.requiredCount}
                            onChange={(e) => updateRole(index, 'requiredCount', parseInt(e.target.value) || 1)}
                            min="1"
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div className="col-span-2">
                          <button
                            type="button"
                            onClick={() => removeRole(index)}
                            className="w-full text-red-600 hover:text-red-900 text-sm"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                    
                    {shiftForm.roles.length === 0 && (
                      <div className="text-sm text-gray-500 italic">
                        Click "Add Role" to define staffing requirements
                      </div>
                    )}
                  </div>

                  <div className="flex space-x-3 pt-4">
                    <button
                      type="submit"
                      className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      {editingShift ? 'Update' : 'Create'} Shift
                    </button>
                    <button
                      type="button"
                      onClick={resetShiftForm}
                      className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Shifts List */}
          <div className="space-y-4">
            {departments.map(dept => {
              const deptShifts = shifts.filter(shift => shift.departmentId === dept.id);
              if (deptShifts.length === 0) return null;

              return (
                <div key={dept.id} className="bg-white rounded-lg shadow">
                  <div className="px-6 py-4 border-b border-gray-200">
                    <h4 className="text-lg font-medium text-gray-900 capitalize">
                      {dept.name} Shifts
                    </h4>
                  </div>
                  
                  <div className="divide-y divide-gray-200">
                    {deptShifts.map(shift => (
                      <div key={shift.id} className="px-6 py-4">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center space-x-3 mb-2">
                              <h5 className="font-medium text-gray-900">{shift.name}</h5>
                              <span className="text-sm text-gray-500">
                                {shift.startTime} - {shift.endTime}
                              </span>
                              <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                                {getTotalStaffNeeded(shift)} staff
                              </span>
                            </div>
                            
                            {shift.description && (
                              <p className="text-sm text-gray-600 mb-2">{shift.description}</p>
                            )}
                            
                            <div className="text-sm text-gray-500 space-y-1">
                              <div>Days: {getDaysString(shift)}</div>
                              {shift.minTenureMonths > 0 && (
                                <div>Min tenure: {shift.minTenureMonths} months</div>
                              )}
                              {shift.blocksCounselingOnly && (
                                <div className="text-orange-600">Blocks counseling sessions</div>
                              )}
                              {shift.allowsTemporaryLeave && (
                                <div className="text-blue-600">Allows temporary leave for appointments</div>
                              )}
                            </div>
                            
                            <div className="mt-3">
                              <div className="text-sm font-medium text-gray-700 mb-1">Required roles:</div>
                              <div className="space-y-1">
                                {shift.roles.map(role => (
                                  <div key={role.id} className="text-sm text-gray-600">
                                    • {role.requiredCount}x {role.roleTitle}
                                    {role.qualification && (
                                      <span className="text-blue-600 ml-1">
                                        (requires {role.qualification.name})
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex space-x-2 ml-4">
                            <button
                              onClick={() => handleEditShift(shift)}
                              className="text-blue-600 hover:text-blue-900 text-sm"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteShift(shift.id)}
                              className="text-red-600 hover:text-red-900 text-sm"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            
            {shifts.length === 0 && (
              <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
                <p className="text-lg">No shifts configured yet</p>
                <p className="text-sm">Add your first shift to get started with scheduling</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default ShiftsManagement;