'use client';

import { useState, useEffect } from 'react';
import { Plus, Check, X } from 'lucide-react';
import api from '@/lib/api';
import Header from '@/components/Header';
import { getAdmin } from '@/lib/auth';

interface Admin {
  id: string; email: string; first_name: string; last_name: string;
  role: string; is_active: boolean; last_login_at: string | null; created_at: string;
}

interface NewAdminForm { email: string; password: string; first_name: string; last_name: string; role: string; }
const EMPTY_FORM: NewAdminForm = { email: '', password: '', first_name: '', last_name: '', role: 'admin' };

export default function SettingsPage() {
  const [admins, setAdmins]   = useState<Admin[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState<NewAdminForm>(EMPTY_FORM);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState('');
  const currentAdmin            = getAdmin();

  const load = () => {
    api.get('/admins').then(res => setAdmins(res.data.data.admins));
  };

  useEffect(() => { load(); }, []);

  async function createAdmin() {
    setError(''); setSuccess('');
    setSaving(true);
    try {
      await api.post('/admins', form);
      setSuccess('Admin user created');
      setShowForm(false);
      setForm(EMPTY_FORM);
      load();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message || 'Failed to create admin');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <Header title="Settings" subtitle="Manage CMS admin users and app configuration" />

      {/* Admin Users */}
      <div className="card mb-6">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Admin Users</h3>
          {currentAdmin?.role === 'superadmin' && (
            <button className="btn-primary text-sm" onClick={() => setShowForm(true)}>
              <Plus size={15} /> Add Admin
            </button>
          )}
        </div>

        {showForm && (
          <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
            {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <input className="input" placeholder="First name" value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} />
              <input className="input" placeholder="Last name" value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} />
              <input className="input" type="email" placeholder="Email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              <input className="input" type="password" placeholder="Password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
              <select className="input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                <option value="admin">Admin</option>
                <option value="superadmin">Super Admin</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button className="btn-primary text-sm" onClick={createAdmin} disabled={saving}>
                <Check size={14} /> {saving ? 'Creating…' : 'Create'}
              </button>
              <button className="btn-secondary text-sm" onClick={() => { setShowForm(false); setError(''); }}>
                <X size={14} /> Cancel
              </button>
            </div>
          </div>
        )}

        {success && (
          <div className="mx-5 mt-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
            {success}
          </div>
        )}

        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide border-b border-gray-100">
              <th className="px-5 py-3 text-left font-medium">Admin</th>
              <th className="px-5 py-3 text-left font-medium">Role</th>
              <th className="px-5 py-3 text-left font-medium">Status</th>
              <th className="px-5 py-3 text-left font-medium">Last Login</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {admins.map(a => (
              <tr key={a.id} className="hover:bg-gray-50">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-600 font-bold text-sm">
                      {a.first_name?.[0] ?? a.email[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{a.first_name} {a.last_name}</p>
                      <p className="text-gray-400 text-xs">{a.email}</p>
                    </div>
                    {a.id === currentAdmin?.id && (
                      <span className="badge-blue text-xs">You</span>
                    )}
                  </div>
                </td>
                <td className="px-5 py-3">
                  <span className={a.role === 'superadmin' ? 'badge-blue' : 'badge-gray'}>
                    {a.role}
                  </span>
                </td>
                <td className="px-5 py-3">
                  {a.is_active ? <span className="badge-green">Active</span> : <span className="badge-red">Inactive</span>}
                </td>
                <td className="px-5 py-3 text-gray-500 text-xs">
                  {a.last_login_at
                    ? new Date(a.last_login_at).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })
                    : 'Never'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* App Info */}
      <div className="card p-6">
        <h3 className="font-semibold text-gray-900 mb-4">API Configuration</h3>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <span className="text-gray-600">API Base URL</span>
            <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">
              {process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}
            </span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <span className="text-gray-600">CMS Version</span>
            <span className="badge-blue">1.0.0</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-gray-600">Environment</span>
            <span className="badge-green">{process.env.NODE_ENV}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
