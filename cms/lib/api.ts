import axios from 'axios';
import Cookies from 'js-cookie';

// Empty string = same origin (works on deployed backend and local dev when proxied)
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

export const api = axios.create({
  baseURL: `${API_URL}/v1/admin`,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = Cookies.get('kado_admin_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      Cookies.remove('kado_admin_token');
      window.location.href = '/cms/login';
    }
    return Promise.reject(error);
  }
);

export default api;
