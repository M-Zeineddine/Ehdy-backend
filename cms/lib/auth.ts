import Cookies from 'js-cookie';
import api from './api';

export interface AdminUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
}

export async function login(email: string, password: string): Promise<void> {
  const { data } = await api.post('/v1/admin/login', { email, password });
  const { token, admin } = data.data;
  Cookies.set('kado_admin_token', token, { expires: 7 });
  localStorage.setItem('kado_admin', JSON.stringify(admin));
}

export function logout(): void {
  Cookies.remove('kado_admin_token');
  localStorage.removeItem('kado_admin');
}

export function isAuthenticated(): boolean {
  if (typeof window === 'undefined') return false;
  return !!Cookies.get('kado_admin_token');
}

export function getAdmin(): AdminUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('kado_admin');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
