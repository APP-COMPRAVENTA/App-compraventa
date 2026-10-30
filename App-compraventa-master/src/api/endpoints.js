// frontend/src/api/endpoints.js
import apiClient from './client.js';

/**
 * Endpoints de la API organizados por módulo
 */
export const transactionAPI = {
  getAll: () => apiClient.get('/transactions'),
  getById: (id) => apiClient.get(`/transactions/${id}`),
  create: (data) => apiClient.post('/transactions', data),
  update: (id, data) => apiClient.put(`/transactions/${id}`, data),
  delete: (id) => apiClient.delete(`/transactions/${id}`),
  revert: (id) => apiClient.post(`/transactions/${id}/revert`),
};

export const inventoryAPI = {
  getAll: () => apiClient.get('/inventory'),
  getById: (id) => apiClient.get(`/inventory/${id}`),
  create: (data) => apiClient.post('/inventory', data),
  update: (id, data) => apiClient.put(`/inventory/${id}`, data),
  delete: (id) => apiClient.delete(`/inventory/${id}`),
  updateStatus: (id, status) => apiClient.patch(`/inventory/${id}/status`, { status }),
};

export const debtAPI = {
  getAll: () => apiClient.get('/debts'),
  getById: (id) => apiClient.get(`/debts/${id}`),
  create: (data) => apiClient.post('/debts', data),
  update: (id, data) => apiClient.put(`/debts/${id}`, data),
  addPayment: (id, data) => apiClient.post(`/debts/${id}/payments`, data),
  getPayments: (id) => apiClient.get(`/debts/${id}/payments`),
};

export const clientAPI = {
  getAll: () => apiClient.get('/clients'),
  getById: (id) => apiClient.get(`/clients/${id}`),
  create: (data) => apiClient.post('/clients', data),
  update: (id, data) => apiClient.put(`/clients/${id}`, data),
  delete: (id) => apiClient.delete(`/clients/${id}`),
  getHistory: (id) => apiClient.get(`/clients/${id}/history`),
};

export const providerAPI = {
  getAll: () => apiClient.get('/providers'),
  getById: (id) => apiClient.get(`/providers/${id}`),
  create: (data) => apiClient.post('/providers', data),
  update: (id, data) => apiClient.put(`/providers/${id}`, data),
  delete: (id) => apiClient.delete(`/providers/${id}`),
  getHistory: (id) => apiClient.get(`/providers/${id}/history`),
};

export const transferAPI = {
  getAll: () => apiClient.get('/transfers'),
  getById: (id) => apiClient.get(`/transfers/${id}`),
  create: (data) => apiClient.post('/transfers', data),
  update: (id, data) => apiClient.put(`/transfers/${id}`, data),
  addExpense: (id, data) => apiClient.post(`/transfers/${id}/expenses`, data),
  complete: (id) => apiClient.post(`/transfers/${id}/complete`),
};

export const soatAPI = {
  getClasses: () => apiClient.get('/soat/classes'),
  getCcRanges: (classId) => apiClient.get(`/soat/cc-ranges/${classId}`),
  getPrices: () => apiClient.get('/soat/prices'),
  create: (data) => apiClient.post('/soat', data),
};

export const savingsAPI = {
  getAll: () => apiClient.get('/savings'),
  getById: (id) => apiClient.get(`/savings/${id}`),
  create: (data) => apiClient.post('/savings', data),
  update: (id, data) => apiClient.put(`/savings/${id}`, data),
  delete: (id) => apiClient.delete(`/savings/${id}`),
  addTransaction: (id, data) => apiClient.post(`/savings/${id}/transactions`, data),
};

export const tenantAPI = {
  getCurrent: () => apiClient.get('/tenants/me'),
  getConfig: () => apiClient.get('/tenants/me/config'),
  updateConfig: (data) => apiClient.put('/tenants/me/config', data),
};

