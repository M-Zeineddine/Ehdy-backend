'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { getAdmin } from '@/lib/auth';

interface AdminUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export default function SettingsPage() {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [form, setForm] = useState({ email: '', first_name: '', last_name: '', password: '', role: 'admin' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const me = getAdmin();

  const load = () => api.get('/v1/admin/admins').then((r) => setAdmins(r.data.admins));

  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api.post('/v1/admin/admins', form);
      setForm({ email: '', first_name: '', last_name: '', password: '', role: 'admin' });
      load();
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to create admin'
      );
    } finally {
      setSaving(false);
    }
  };

  const isSuperAdmin = me?.role === 'superadmin' || me?.role === 'owner';

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Settings</h1>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Admin Users</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              {['Name', 'Email', 'Role', 'Active', 'Joined'].map((h) => (
                <th key={h} className="px-6 py-3 text-left font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {admins.map((a) => (
              <tr key={a.id} className="hover:bg-gray-50">
                <td className="px-6 py-3 font-medium">{a.first_name} {a.last_name}</td>
                <td className="px-6 py-3 text-gray-500">{a.email}</td>
                <td className="px-6 py-3">
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700 capitalize">
                    {a.role}
                  </span>
                </td>
                <td className="px-6 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    a.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>{a.is_active ? 'Yes' : 'No'}</span>
                </td>
                <td className="px-6 py-3 text-gray-400">{new Date(a.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isSuperAdmin && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Create Admin User</h2>
          <form onSubmit={create} className="grid grid-cols-2 gap-4">
            <input required placeholder="First name" value={form.first_name}
              onChange={(e) => setForm({ ...form, first_name: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <input required placeholder="Last name" value={form.last_name}
              onChange={(e) => setForm({ ...form, last_name: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <input required type="email" placeholder="Email" value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <input required type="password" placeholder="Password" value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="admin">Admin</option>
              <option value="superadmin">Superadmin</option>
            </select>

            {error && <p className="col-span-2 text-sm text-red-500">{error}</p>}

            <div className="col-span-2">
              <button type="submit" disabled={saving}
                className="px-6 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm rounded-lg disabled:opacity-50">
                {saving ? 'Creating…' : 'Create Admin'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
