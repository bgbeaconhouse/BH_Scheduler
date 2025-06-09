import React, { useState, useEffect } from 'react';
import { qualificationsApi, residentQualificationsApi, residentsApi } from '../api/client';

interface Qualification {
  id: number;
  name: string;
  description?: string;
  category: string;
  residents?: {
    resident: {
      id: number;
      firstName: string;
      lastName: string;
    };
  }[];
}

interface Resident {
  id: number;
  firstName: string;
  lastName: string;
  qualifications: {
    qualification: Qualification;
    dateEarned: string;
    notes?: string;
  }[];
}

interface QualificationForm {
  name: string;
  description: string;
  category: string;
}

const QualificationsManagement: React.FC = () => {
  const [qualifications, setQualifications] = useState<Qualification[]>([]);
  const [residents, setResidents] = useState<Resident[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'manage' | 'assign'>('manage');
  const [showQualForm, setShowQualForm] = useState(false);
  const [editingQual, setEditingQual] = useState<Qualification | null>(null);
  const [qualForm, setQualForm] = useState<QualificationForm>({
    name: '',
    description: '',
    category: 'kitchen'
  });
  const [error, setError] = useState<string>('');

  // Assignment state
  const [selectedResident, setSelectedResident] = useState<number | null>(null);
  const [selectedQualification, setSelectedQualification] = useState<number | null>(null);
  const [assignmentNotes, setAssignmentNotes] = useState('');

  const categories = [
    { value: 'kitchen', label: 'Kitchen' },
    { value: 'driving', label: 'Driving' },
    { value: 'management', label: 'Management' },
    { value: 'general', label: 'General' }
  ];

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [qualResponse, residentsResponse] = await Promise.all([
        qualificationsApi.getAll(),
        residentsApi.getWithQualifications()
      ]);
      setQualifications(qualResponse.data);
      setResidents(residentsResponse.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleQualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!qualForm.name || !qualForm.category) {
      setError('Name and category are required');
      return;
    }

    try {
      if (editingQual) {
        await qualificationsApi.update(editingQual.id, qualForm);
      } else {
        await qualificationsApi.create(qualForm);
      }
      
      await fetchData();
      resetQualForm();
      setError('');
    } catch (error: any) {
      setError(error.message || 'Failed to save qualification');
    }
  };

  const handleDeleteQual = async (id: number) => {
    if (!confirm('Are you sure you want to delete this qualification?')) {
      return;
    }

    try {
      await qualificationsApi.delete(id);
      await fetchData();
    } catch (error: any) {
      setError(error.message || 'Failed to delete qualification');
    }
  };

  const handleAssignQualification = async () => {
    if (!selectedResident || !selectedQualification) {
      setError('Please select both a resident and qualification');
      return;
    }

    try {
      await residentQualificationsApi.assign(selectedResident, {
        qualificationId: selectedQualification,
        notes: assignmentNotes
      });
      
      await fetchData();
      setSelectedResident(null);
      setSelectedQualification(null);
      setAssignmentNotes('');
      setError('');
    } catch (error: any) {
      setError(error.message || 'Failed to assign qualification');
    }
  };

  const handleRemoveQualification = async (residentId: number, qualificationId: number) => {
    if (!confirm('Are you sure you want to remove this qualification?')) {
      return;
    }

    try {
      await residentQualificationsApi.remove(residentId, qualificationId);
      await fetchData();
    } catch (error: any) {
      setError(error.message || 'Failed to remove qualification');
    }
  };

  const resetQualForm = () => {
    setQualForm({
      name: '',
      description: '',
      category: 'kitchen'
    });
    setEditingQual(null);
    setShowQualForm(false);
    setError('');
  };

  const handleEditQual = (qual: Qualification) => {
    setEditingQual(qual);
    setQualForm({
      name: qual.name,
      description: qual.description || '',
      category: qual.category
    });
    setShowQualForm(true);
  };

  const getQualificationsByCategory = () => {
    return categories.map(category => ({
      ...category,
      qualifications: qualifications.filter(q => q.category === category.value)
    }));
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">Loading qualifications...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Qualifications Management</h2>
        <div className="flex space-x-4">
          <button
            onClick={() => setActiveTab('manage')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'manage'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Manage Qualifications
          </button>
          <button
            onClick={() => setActiveTab('assign')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'assign'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Assign to Residents
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Manage Qualifications Tab */}
      {activeTab === 'manage' && (
        <>
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Available Qualifications</h3>
            <button
              onClick={() => setShowQualForm(true)}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
            >
              Add New Qualification
            </button>
          </div>

          {/* Qualification Form Modal */}
          {showQualForm && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
                <h3 className="text-lg font-semibold mb-4">
                  {editingQual ? 'Edit Qualification' : 'Add New Qualification'}
                </h3>
                
                <form onSubmit={handleQualSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Name *
                    </label>
                    <input
                      type="text"
                      value={qualForm.name}
                      onChange={(e) => setQualForm({...qualForm, name: e.target.value})}
                      placeholder="e.g., prep_lead, driver_shelter_run"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Category *
                    </label>
                    <select
                      value={qualForm.category}
                      onChange={(e) => setQualForm({...qualForm, category: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      {categories.map(cat => (
                        <option key={cat.value} value={cat.value}>{cat.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description
                    </label>
                    <textarea
                      value={qualForm.description}
                      onChange={(e) => setQualForm({...qualForm, description: e.target.value})}
                      rows={3}
                      placeholder="Optional description of requirements or responsibilities"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="flex space-x-3 pt-4">
                    <button
                      type="submit"
                      className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      {editingQual ? 'Update' : 'Create'} Qualification
                    </button>
                    <button
                      type="button"
                      onClick={resetQualForm}
                      className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Qualifications by Category */}
          <div className="space-y-6">
            {getQualificationsByCategory().map(category => (
              <div key={category.value} className="bg-white rounded-lg shadow">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h4 className="text-lg font-medium text-gray-900 capitalize">
                    {category.label} Qualifications
                  </h4>
                </div>
                
                {category.qualifications.length === 0 ? (
                  <div className="px-6 py-8 text-center text-gray-500">
                    No {category.label.toLowerCase()} qualifications defined
                  </div>
                ) : (
                  <div className="divide-y divide-gray-200">
                    {category.qualifications.map(qual => (
                      <div key={qual.id} className="px-6 py-4">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="font-medium text-gray-900">{qual.name}</div>
                            {qual.description && (
                              <div className="text-sm text-gray-600 mt-1">{qual.description}</div>
                            )}
                            <div className="text-sm text-gray-500 mt-2">
                              Assigned to: {qual.residents?.length || 0} residents
                            </div>
                          </div>
                          <div className="flex space-x-2 ml-4">
                            <button
                              onClick={() => handleEditQual(qual)}
                              className="text-blue-600 hover:text-blue-900 text-sm"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteQual(qual.id)}
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
            ))}
          </div>
        </>
      )}

      {/* Assign Qualifications Tab */}
      {activeTab === 'assign' && (
        <>
          {/* Quick Assignment */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">Assign Qualification</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Select Resident
                </label>
                <select
                  value={selectedResident || ''}
                  onChange={(e) => setSelectedResident(e.target.value ? parseInt(e.target.value) : null)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Choose a resident...</option>
                  {residents.map(resident => (
                    <option key={resident.id} value={resident.id}>
                      {resident.firstName} {resident.lastName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Select Qualification
                </label>
                <select
                  value={selectedQualification || ''}
                  onChange={(e) => setSelectedQualification(e.target.value ? parseInt(e.target.value) : null)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Choose a qualification...</option>
                  {qualifications.map(qual => (
                    <option key={qual.id} value={qual.id}>
                      {qual.name} ({qual.category})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes (Optional)
              </label>
              <input
                type="text"
                value={assignmentNotes}
                onChange={(e) => setAssignmentNotes(e.target.value)}
                placeholder="How they earned this qualification, any conditions, etc."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              onClick={handleAssignQualification}
              disabled={!selectedResident || !selectedQualification}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Assign Qualification
            </button>
          </div>

          {/* Current Assignments */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold">Current Assignments</h3>
            </div>
            
            {residents.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-500">
                No residents found
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {residents.map(resident => (
                  <div key={resident.id} className="px-6 py-4">
                    <div className="font-medium text-gray-900 mb-2">
                      {resident.firstName} {resident.lastName}
                    </div>
                    
                    {resident.qualifications.length === 0 ? (
                      <div className="text-sm text-gray-500">No qualifications assigned</div>
                    ) : (
                      <div className="space-y-2">
                        {resident.qualifications.map(rq => (
                          <div key={`${resident.id}-${rq.qualification.id}`} 
                               className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                            <div>
                              <span className="font-medium text-sm">{rq.qualification.name}</span>
                              <span className="text-xs text-gray-500 ml-2">({rq.qualification.category})</span>
                              {rq.notes && (
                                <div className="text-xs text-gray-600 mt-1">{rq.notes}</div>
                              )}
                            </div>
                            <button
                              onClick={() => handleRemoveQualification(resident.id, rq.qualification.id)}
                              className="text-red-600 hover:text-red-900 text-sm"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default QualificationsManagement;