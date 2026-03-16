import Cookies from 'js-cookie';
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

export interface AdminUser {
  id: string; email: string; first_name: string; last_name: string; role: string;
}

export async function login(email: string, password: string): Promise<AdminUser> {
  const res = await axios.post(`${API_URL}/v1/admin/login`, { email, password });
  const { token, admin } = res.data.data;
  Cookies.set('kado_admin_token', token, { expires: 1, sameSite: 'strict' });
  localStorage.setItem('kado_admin', JSON.stringify(admin));
  return admin;
}

export function logout() {
  Cookies.remove('kado_admin_token');
  localStorage.removeItem('kado_admin');
}

export function getAdmin(): AdminUser | null {
  if (typeof window === 'undefined') return null;
  try { return JSON.parse(localStorage.getItem('kado_admin') ?? 'null'); } catch { return null; }
}

export function isAuthenticated(): boolean {
  if (typeof window === 'undefined') return false;
  return !!Cookies.get('kado_admin_token');
}
