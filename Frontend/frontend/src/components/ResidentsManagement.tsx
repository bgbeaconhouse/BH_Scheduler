import React, { useState, useEffect } from 'react';
import { residentsApi } from '../api/client';

interface Resident {
  id: number;
  firstName: string;
  lastName: string;
  admissionDate: string;
  notes?: string;
  isActive: boolean;
}

interface ResidentForm {
  firstName: string;
  lastName: string;
  admissionDate: string;
  notes: string;
}

const ResidentsManagement: React.FC = () => {
  const [residents, setResidents] = useState<Resident[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingResident, setEditingResident] = useState<Resident | null>(null);
  const [formData, setFormData] = useState<ResidentForm>({
    firstName: '',
    lastName: '',
    admissionDate: '',
    notes: ''
  });
  const [error, setError] = useState<string>('');

  useEffect(() => {
    fetchResidents();
  }, []);

  const fetchResidents = async () => {
    try {
      const response = await residentsApi.getAll();
      setResidents(response.data);
    } catch (error) {
      console.error('Failed to fetch residents:', error);
      setError('Failed to load residents');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.firstName || !formData.lastName || !formData.admissionDate) {
      setError('Please fill in all required fields');
      return;
    }

    try {
      if (editingResident) {
        // Update existing resident
        await residentsApi.update(editingResident.id, formData);
      } else {
        // Create new resident
        await residentsApi.create(formData);
      }
      
      await fetchResidents();
      resetForm();
      setError('');
    } catch (error) {
      console.error('Failed to save resident:', error);
      setError('Failed to save resident');
    }
  };

  const handleEdit = (resident: Resident) => {
    setEditingResident(resident);
    setFormData({
      firstName: resident.firstName,
      lastName: resident.lastName,
      admissionDate: resident.admissionDate.split('T')[0], // Format for date input
      notes: resident.notes || ''
    });
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to remove this resident?')) {
      return;
    }

    try {
      await residentsApi.delete(id);
      await fetchResidents();
    } catch (error) {
      console.error('Failed to delete resident:', error);
      setError('Failed to remove resident');
    }
  };

  const resetForm = () => {
    setFormData({
      firstName: '',
      lastName: '',
      admissionDate: '',
      notes: ''
    });
    setEditingResident(null);
    setShowForm(false);
    setError('');
  };

  const calculateTenure = (admissionDate: string): number => {
    const admission = new Date(admissionDate);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - admission.getTime());
    const diffMonths = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 30.44));
    return diffMonths;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">Loading residents...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Residents Management</h2>
        <button
          onClick={() => setShowForm(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          Add New Resident
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Add/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">
              {editingResident ? 'Edit Resident' : 'Add New Resident'}
            </h3>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  First Name *
                </label>
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => setFormData({...formData, firstName: e.target.value})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Last Name *
                </label>
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => setFormData({...formData, lastName: e.target.value})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Admission Date *
                </label>
                <input
                  type="date"
                  value={formData.admissionDate}
                  onChange={(e) => setFormData({...formData, admissionDate: e.target.value})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Any special considerations, restrictions, etc."
                />
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  {editingResident ? 'Update' : 'Add'} Resident
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

      {/* Residents List */}
      <div className="bg-white rounded-lg shadow">
        {residents.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p className="text-lg">No residents found</p>
            <p className="text-sm">Add your first resident to get started</p>
          </div>
        ) : (
          <div className="overflow-hidden">
            {/* Desktop View */}
            <div className="hidden md:block">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Admission Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Tenure
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Notes
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {residents.map((resident) => (
                    <tr key={resident.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-medium text-gray-900">
                          {resident.firstName} {resident.lastName}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(resident.admissionDate).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          calculateTenure(resident.admissionDate) >= 6 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {calculateTenure(resident.admissionDate)} months
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                        {resident.notes || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                        <button
                          onClick={() => handleEdit(resident)}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(resident.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile View */}
            <div className="md:hidden divide-y divide-gray-200">
              {residents.map((resident) => (
                <div key={resident.id} className="p-4">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">
                        {resident.firstName} {resident.lastName}
                      </div>
                      <div className="text-sm text-gray-500 mt-1">
                        Admitted: {new Date(resident.admissionDate).toLocaleDateString()}
                      </div>
                      <div className="mt-2">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          calculateTenure(resident.admissionDate) >= 6 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {calculateTenure(resident.admissionDate)} months tenure
                        </span>
                      </div>
                      {resident.notes && (
                        <div className="text-sm text-gray-600 mt-2">
                          {resident.notes}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col space-y-1 ml-4">
                      <button
                        onClick={() => handleEdit(resident)}
                        className="text-blue-600 hover:text-blue-900 text-sm"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(resident.id)}
                        className="text-red-600 hover:text-red-900 text-sm"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Summary Stats */}
      {residents.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Summary</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {residents.length}
              </div>
              <div className="text-sm text-gray-500">Total Residents</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {residents.filter(r => calculateTenure(r.admissionDate) >= 6).length}
              </div>
              <div className="text-sm text-gray-500">Thrift Store Eligible</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">
                {residents.filter(r => calculateTenure(r.admissionDate) < 6).length}
              </div>
              <div className="text-sm text-gray-500">New Residents</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-600">
                {residents.filter(r => r.isActive).length}
              </div>
              <div className="text-sm text-gray-500">Active</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResidentsManagement;