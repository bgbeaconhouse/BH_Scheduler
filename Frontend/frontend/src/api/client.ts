import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor to include auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor for better error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
      return Promise.reject(new Error('Session expired. Please log in again.'));
    }
    
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

// Appointment Types API calls
export const appointmentTypesApi = {
  getAll: () => api.get('/appointment-types'),
  create: (data: {
    name: string;
    description?: string;
    priority?: number;
  }) => api.post('/appointment-types', data),
};

// Appointments API calls
export const appointmentsApi = {
  getAll: (params?: {
    residentId?: number;
    startDate?: string;
    endDate?: string;
  }) => api.get('/appointments', { params }),
  create: (data: {
    residentId: number;
    appointmentTypeId: number;
    title: string;
    startDateTime: string;
    endDateTime: string;
    isRecurring?: boolean;
    recurringPattern?: string;
    notes?: string;
  }) => api.post('/appointments', data),
  update: (id: number, data: {
    residentId: number;
    appointmentTypeId: number;
    title: string;
    startDateTime: string;
    endDateTime: string;
    isRecurring?: boolean;
    recurringPattern?: string;
    notes?: string;
  }) => api.put(`/appointments/${id}`, data),
  delete: (id: number) => api.delete(`/appointments/${id}`),
  createRecurring: (data: {
    residentId: number;
    appointmentTypeId: number;
    title: string;
    startTime: string;
    endTime: string;
    daysOfWeek: number[];
    startDate: string;
    endDate: string;
    notes?: string;
  }) => api.post('/appointments/bulk-recurring', data),
  
  // NEW: Update entire recurring series
  updateRecurringSeries: (data: {
    recurringPattern: string;
    residentId: number;
    appointmentTypeId?: number;
    title?: string;
    startTime: string;
    endTime: string;
    notes?: string;
    updateFutureOnly?: boolean;
  }) => api.put('/appointments/recurring-series', data),
  
  // NEW: Delete entire recurring series - DEBUG VERSION
  deleteRecurringSeries: async (recurringPattern: string, residentId: number) => {
    console.log('=== API CLIENT DELETE SERIES ===');
    console.log('Pattern:', recurringPattern);
    console.log('Resident ID:', residentId);
    console.log('API Base URL:', API_BASE_URL);
    
    const requestData = { recurringPattern, residentId };
    console.log('Request data:', requestData);
    
    try {
      // Use axios for the request
      const response = await api.delete('/appointments/recurring-series', {
        data: requestData
      });
      
      console.log('Axios response:', response);
      return response;
      
    } catch (axiosError: any) {
      console.error('Axios error:', axiosError);
      console.error('Axios error response:', axiosError.response);
      console.error('Axios error request:', axiosError.request);
      console.error('Axios error config:', axiosError.config);
      
      if (axiosError.response) {
        console.error('Response data:', axiosError.response.data);
        console.error('Response status:', axiosError.response.status);
        console.error('Response headers:', axiosError.response.headers);
      }
      
      throw axiosError;
    }
  }
};

// Schedule API calls
export const scheduleApi = {
  getPeriods: () => api.get('/schedule-periods'),
  createPeriod: (data: {
    name: string;
    startDate: string;
    endDate: string;
  }) => api.post('/schedule-periods', data),
  generateSchedule: (data: {
    schedulePeriodId: number;
    startDate: string;
    endDate: string;
  }) => api.post('/generate-schedule', data),
  getAssignments: (periodId: number) => api.get(`/schedule-periods/${periodId}/assignments`),
  getConflicts: (periodId: number, startDate: string, endDate: string) => 
    api.get(`/schedule-periods/${periodId}/conflicts?startDate=${startDate}&endDate=${endDate}`),
  updateAssignment: (id: number, data: {
    residentId?: number;
    roleTitle?: string;
    notes?: string;
    status?: string;
  }) => api.put(`/shift-assignments/${id}`, data),
  deleteAssignment: (id: number) => api.delete(`/shift-assignments/${id}`),
};

// Health check
export const healthCheck = () => api.get('/health');