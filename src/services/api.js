import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
  timeout: 15000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error.response?.status === 401
      && String(error.config?.url || '').startsWith('/admin/catalog')
    ) {
      window.dispatchEvent(new Event('leemark:admin-session-expired'));
    }

    return Promise.reject(error);
  },
);

export default api;
