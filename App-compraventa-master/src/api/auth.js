// frontend/src/api/auth.js
import apiClient from './client.js';

/**
 * API de autenticación
 */
export const authAPI = {
  /**
   * Registra un nuevo usuario
   */
  async register(tenantId, userData) {
    const response = await apiClient.post('/auth/register', {
      tenantId,
      ...userData,
    });
    return response.data;
  },

  /**
   * Inicia sesión
   */
  async login(tenantId, email, password) {
    const response = await apiClient.post('/auth/login', {
      tenantId,
      email,
      password,
    });
    
    // Guardar token y datos del usuario
    if (response.data.success && response.data.data.token) {
      localStorage.setItem('authToken', response.data.data.token);
      localStorage.setItem('tenantId', tenantId);
      localStorage.setItem('user', JSON.stringify(response.data.data.user));
    }
    
    return response.data;
  },

  /**
   * Cierra sesión
   */
  logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('tenantId');
    localStorage.removeItem('user');
    window.location.href = '/login';
  },

  /**
   * Obtiene el perfil del usuario actual
   */
  async getProfile() {
    const response = await apiClient.get('/auth/me');
    return response.data;
  },

  /**
   * Cambia la contraseña
   */
  async changePassword(oldPassword, newPassword) {
    const response = await apiClient.post('/auth/change-password', {
      oldPassword,
      newPassword,
    });
    return response.data;
  },

  /**
   * Verifica si hay una sesión activa
   */
  isAuthenticated() {
    return !!localStorage.getItem('authToken');
  },

  /**
   * Obtiene el usuario actual desde localStorage
   */
  getCurrentUser() {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  },

  /**
   * Obtiene el tenantId actual
   */
  getCurrentTenantId() {
    return localStorage.getItem('tenantId');
  },
};

