import axios from 'axios';
import { toast } from 'react-toastify';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
    headers: {
        'Content-Type': 'application/json',
    },
    timeout: 30000,
});

// Request interceptor
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('token');
            window.location.href = '/login';
            toast.error('Session expired. Please login again.');
        } else if (error.response?.status === 429) {
            toast.error('Too many requests. Please wait a moment.');
        } else if (error.response?.status >= 500) {
            toast.error('Server error. Please try again later.');
        }
        return Promise.reject(error);
    }
);

// API service methods
export const auth = {
    login: (data) => api.post('/auth/login', data),
    register: (data) => api.post('/auth/register', data),
    logout: () => api.post('/auth/logout'),
    getProfile: () => api.get('/auth/profile'),
    changePassword: (data) => api.put('/auth/change-password', data),
};

export const campaigns = {
    create: (data) => api.post('/campaigns', data),
    getAll: (params) => api.get('/campaigns', { params }),
    getById: (id) => api.get(`/campaigns/${id}`),
    cancel: (id) => api.post(`/campaigns/${id}/cancel`),
    retry: (id, emailIds) => api.post(`/campaigns/${id}/retry`, { email_ids: emailIds }),
    export: (id, format = 'csv') => api.get(`/campaigns/${id}/export`, { 
        params: { format },
        responseType: 'blob'
    }),
    getDashboardStats: () => api.get('/campaigns/dashboard/stats'),
};

export const contacts = {
    add: (data) => api.post('/contacts', data),
    getAll: (params) => api.get('/contacts', { params }),
    delete: (id) => api.delete(`/contacts/${id}`),
    import: (file) => {
        const formData = new FormData();
        formData.append('file', file);
        return api.post('/contacts/import', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
    },
    createGroup: (data) => api.post('/contacts/groups', data),
    getGroups: () => api.get('/contacts/groups'),
};

export const reports = {
    getEmails: (params) => api.get('/reports/emails', { params }),
    exportFull: (params) => api.get('/reports/export', { 
        params,
        responseType: 'blob'
    }),
    getAnalytics: () => api.get('/reports/analytics'),
};

export default api;