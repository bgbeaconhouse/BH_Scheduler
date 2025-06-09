import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add response interceptor for better error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.data?.error) {
      // Return the server error message
      return Promise.reject(new Error(error.response.data.error));
    }
    return Promise.reject(error);
  }
);

// Resident API calls
export const residentsApi = {
  getAll: () => api.get('/residents'),
  getById: (id: number) => api.get(`/residents/${id}`),
  create: (data: { 
    firstName: string; 
    lastName: string; 
    admissionDate: string; 
    notes?: string 
  }) => api.post('/residents', data),
  update: (id: number, data: { 
    firstName: string; 
    lastName: string; 
    admissionDate: string; 
    notes?: string 
  }) => api.put(`/residents/${id}`, data),
  delete: (id: number) => api.delete(`/residents/${id}`),
  getWithQualifications: () => api.get('/residents-with-qualifications'),
};

// Qualification API calls
export const qualificationsApi = {
  getAll: () => api.get('/qualifications'),
  create: (data: {
    name: string;
    description?: string;
    category: string;
  }) => api.post('/qualifications', data),
  update: (id: number, data: {
    name: string;
    description?: string;
    category: string;
  }) => api.put(`/qualifications/${id}`, data),
  delete: (id: number) => api.delete(`/qualifications/${id}`),
};

// Resident Qualification API calls
export const residentQualificationsApi = {
  getByResident: (residentId: number) => api.get(`/residents/${residentId}/qualifications`),
  assign: (residentId: number, data: {
    qualificationId: number;
    notes?: string;
  }) => api.post(`/residents/${residentId}/qualifications`, data),
  remove: (residentId: number, qualificationId: number) => 
    api.delete(`/residents/${residentId}/qualifications/${qualificationId}`),
};

// Departments API calls
export const departmentsApi = {
  getAll: () => api.get('/departments'),
  create: (data: {
    name: string;
    description?: string;
    priority?: number;
  }) => api.post('/departments', data),
  update: (id: number, data: {
    name: string;
    description?: string;
    priority?: number;
  }) => api.put(`/departments/${id}`, data),
  delete: (id: number) => api.delete(`/departments/${id}`),
};

// Shifts API calls
export const shiftsApi = {
  getAll: () => api.get('/shifts'),
  getById: (id: number) => api.get(`/shifts/${id}`),
  create: (data: {
    departmentId: number;
    name: string;
    description?: string;
    startTime: string;
    endTime: string;
    monday?: boolean;
    tuesday?: boolean;
    wednesday?: boolean;
    thursday?: boolean;
    friday?: boolean;
    saturday?: boolean;
    sunday?: boolean;
    minTenureMonths?: number;
    blocksAllAppointments?: boolean;
    blocksCounselingOnly?: boolean;
    allowsTemporaryLeave?: boolean;
    roles?: Array<{
      qualificationId?: number;
      roleTitle: string;
      requiredCount: number;
    }>;
  }) => api.post('/shifts', data),
  update: (id: number, data: {
    departmentId: number;
    name: string;
    description?: string;
    startTime: string;
    endTime: string;
    monday?: boolean;
    tuesday?: boolean;
    wednesday?: boolean;
    thursday?: boolean;
    friday?: boolean;
    saturday?: boolean;
    sunday?: boolean;
    minTenureMonths?: number;
    blocksAllAppointments?: boolean;
    blocksCounselingOnly?: boolean;
    allowsTemporaryLeave?: boolean;
    roles?: Array<{
      qualificationId?: number;
      roleTitle: string;
      requiredCount: number;
    }>;
  }) => api.put(`/shifts/${id}`, data),
  delete: (id: number) => api.delete(`/shifts/${id}`),
};

// Health check
export const healthCheck = () => api.get('/health');