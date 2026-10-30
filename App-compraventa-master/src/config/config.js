// frontend/src/config/config.js

export const config = {
  apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1',
  apiTimeout: 30000, // 30 segundos
};

