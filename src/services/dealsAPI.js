import axios from 'axios';

const API_URL = (import.meta.env.PROD ? '/api' : (import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000/api')).replace('localhost', '127.0.0.1');

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Deals API
export const dealsAPI = {
  // Create new deal
  create: (dealData) => api.post('/deals', dealData),

  // Get all deals with filters
  list: (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.status) params.append('status', filters.status);
    if (filters.document_type) params.append('document_type', filters.document_type);
    if (filters.agent_id) params.append('agent_id', filters.agent_id);
    return api.get(`/deals?${params.toString()}`);
  },

  // Get deal by ID
  getById: (dealId) => api.get(`/deals/${dealId}`),

  // Update deal
  update: (dealId, updates) => api.put(`/deals/${dealId}`, updates),

  // Delete deal
  delete: (dealId) => api.delete(`/deals/${dealId}`),

  // Get deal participants
  getParticipants: (dealId) => api.get(`/deals/${dealId}/participants`),

  // Get deal activities
  getActivities: (dealId, options = {}) => {
    const params = new URLSearchParams();
    if (options.limit) params.append('limit', options.limit);
    if (options.offset) params.append('offset', options.offset);
    return api.get(`/deals/${dealId}/activities?${params.toString()}`);
  },

  // Get financial summary
  getFinancialSummary: (dealId) => api.get(`/deals/${dealId}/financial-summary`),
};

// Participants API
export const participantsAPI = {
  // Add participant
  create: (participantData) => api.post('/participants', participantData),

  // Get participants by deal
  getByDeal: (dealId) => api.get(`/participants/deal/${dealId}`),

  // Get participant by ID
  getById: (participantId) => api.get(`/participants/${participantId}`),

  // Update participant
  update: (participantId, updates) => api.put(`/participants/${participantId}`, updates),

  // Delete participant
  delete: (participantId) => api.delete(`/participants/${participantId}`),

  // Get participants by type
  getByType: (dealId, type) => api.get(`/participants/deal/${dealId}/type/${type}`),
};

// Commissions API
export const commissionsAPI = {
  // Create commission
  create: (commissionData) => api.post('/commissions', commissionData),

  // Get commissions by deal
  getByDeal: (dealId) => api.get(`/commissions/deal/${dealId}`),

  // Get commission by ID
  getById: (commissionId) => api.get(`/commissions/${commissionId}`),

  // Update commission
  update: (commissionId, updates) => api.put(`/commissions/${commissionId}`, updates),

  // Delete commission
  delete: (commissionId) => api.delete(`/commissions/${commissionId}`),

  // Calculate commissions
  calculate: (dealId, data) => api.post(`/commissions/calculate/${dealId}`, data),

  // Get commission summary
  getSummary: (dealId) => api.get(`/commissions/deal/${dealId}/summary`),
};

// Commission Rules API
export const commissionRulesAPI = {
  // Create rule
  create: (ruleData) => api.post('/commission-rules', ruleData),

  // List rules
  list: (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.is_active !== undefined) params.append('is_active', filters.is_active);
    return api.get(`/commission-rules?${params.toString()}`);
  },

  // Update rule
  update: (ruleId, updates) => api.put(`/commission-rules/${ruleId}`, updates),

  // Delete rule
  delete: (ruleId) => api.delete(`/commission-rules/${ruleId}`),

  // Match rule
  match: (data) => api.post('/commission-rules/match', data),
};

// Documents API
export const documentsAPI = {
  // Upload document
  create: (documentData) => api.post('/documents', documentData),

  // Get documents by deal
  getByDeal: (dealId) => api.get(`/documents/deal/${dealId}`),

  // Get document by ID
  getById: (documentId) => api.get(`/documents/${documentId}`),

  // Update document
  update: (documentId, updates) => api.put(`/documents/${documentId}`, updates),

  // Delete document
  delete: (documentId) => api.delete(`/documents/${documentId}`),

  // Get documents by type
  getByType: (dealId, type) => api.get(`/documents/deal/${dealId}/type/${type}`),
};

// Payments API
export const paymentsAPI = {
  // Record payment
  create: (paymentData) => api.post('/payments', paymentData),

  // Get payments by deal
  getByDeal: (dealId) => api.get(`/payments/deal/${dealId}`),

  // Get payment by ID
  getById: (paymentId) => api.get(`/payments/${paymentId}`),

  // Update payment
  update: (paymentId, updates) => api.put(`/payments/${paymentId}`, updates),

  // Delete payment
  delete: (paymentId) => api.delete(`/payments/${paymentId}`),

  // Get payment totals
  getTotals: (dealId) => api.get(`/payments/deal/${dealId}/totals`),

  // Get payments by date range
  getByDateRange: (startDate, endDate, filters = {}) => {
    const params = new URLSearchParams();
    params.append('start_date', startDate);
    params.append('end_date', endDate);
    if (filters.payment_type) params.append('payment_type', filters.payment_type);
    if (filters.payment_method) params.append('payment_method', filters.payment_method);
    return api.get(`/payments/reports/date-range?${params.toString()}`);
  },
};

// Activities API
export const activitiesAPI = {
  // Create activity
  create: (activityData) => api.post('/activities', activityData),

  // Get activities by deal
  getByDeal: (dealId, options = {}) => {
    const params = new URLSearchParams();
    if (options.limit) params.append('limit', options.limit);
    if (options.offset) params.append('offset', options.offset);
    return api.get(`/activities/deal/${dealId}?${params.toString()}`);
  },

  // Get activity by ID
  getById: (activityId) => api.get(`/activities/${activityId}`),

  // Get activities by type
  getByType: (dealId, type) => api.get(`/activities/deal/${dealId}/type/${type}`),

  // Get activity summary
  getSummary: (dealId) => api.get(`/activities/deal/${dealId}/summary`),

  // Get activities by date range
  getByDateRange: (startDate, endDate, filters = {}) => {
    const params = new URLSearchParams();
    params.append('start_date', startDate);
    params.append('end_date', endDate);
    if (filters.activity_type) params.append('activity_type', filters.activity_type);
    if (filters.performed_by) params.append('performed_by', filters.performed_by);
    return api.get(`/activities/reports/date-range?${params.toString()}`);
  },

  // Delete activity
  delete: (activityId) => api.delete(`/activities/${activityId}`),
};

export default api;
