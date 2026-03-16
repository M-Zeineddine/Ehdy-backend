'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import DrawerPanel from '@/components/DrawerPanel';

interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  is_email_verified: boolean;
  deleted_at: string | null;
  created_at: string;
  country_code: string;
}

interface UserDetail extends User {
  gift_count: number;
  wallet_balance: number;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState<UserDetail | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const limit = 20;

  const load = () => {
    const params: Record<string, string | number> = { page, limit };
    if (search) params.search = search;
    if (status) params.status = status;
    api.get('/v1/admin/users', { params }).then((r) => {
      setUsers(r.data.users);
      setTotal(r.data.total);
    });
  };

  useEffect(() => { load(); }, [page, search, status]); // eslint-disable-line react-hooks/exhaustive-deps

  const openUser = async (id: string) => {
    const r = await api.get(`/v1/admin/users/${id}`);
    setSelected(r.data.user);
    setDrawerOpen(true);
  };

  const toggleActive = async (id: string, isDeleted: boolean) => {
    await api.patch(`/v1/admin/users/${id}`, { action: isDeleted ? 'reactivate' : 'deactivate' });
    load();
    if (selected?.id === id) {
      const r = await api.get(`/v1/admin/users/${id}`);
      setSelected(r.data.user);
    }
  };

  const pages = Math.ceil(total / limit);

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold text-gray-800">Users</h1>

      <div className="flex gap-3">
        <input
          type="text"
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">All</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              {['Name', 'Email', 'Country', 'Verified', 'Status', 'Joined', ''].map((h) => (
                <th key={h} className="px-5 py-3 text-left font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-5 py-3 font-medium">{u.first_name} {u.last_name}</td>
                <td className="px-5 py-3 text-gray-500">{u.email}</td>
                <td className="px-5 py-3 text-gray-500">{u.country_code ?? '—'}</td>
                <td className="px-5 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    u.is_email_verified ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>{u.is_email_verified ? 'Yes' : 'No'}</span>
                </td>
                <td className="px-5 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    u.deleted_at ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'
                  }`}>{u.deleted_at ? 'Inactive' : 'Active'}</span>
                </td>
                <td className="px-5 py-3 text-gray-400">{new Date(u.created_at).toLocaleDateString()}</td>
                <td className="px-5 py-3">
                  <button
                    onClick={() => openUser(u.id)}
                    className="text-brand-600 hover:underline text-xs"
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-gray-400">No users found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex gap-2 justify-end">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
            className="px-3 py-1 text-sm border rounded disabled:opacity-40">Prev</button>
          <span className="px-3 py-1 text-sm text-gray-500">{page} / {pages}</span>
          <button disabled={page === pages} onClick={() => setPage(p => p + 1)}
            className="px-3 py-1 text-sm border rounded disabled:opacity-40">Next</button>
        </div>
      )}

      <DrawerPanel
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected ? `${selected.first_name} ${selected.last_name}` : ''}
      >
        {selected && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {[
                ['Email', selected.email],
                ['Country', selected.country_code ?? '—'],
                ['Email Verified', selected.is_email_verified ? 'Yes' : 'No'],
                ['Status', selected.deleted_at ? 'Inactive' : 'Active'],
                ['Gifts Sent', selected.gift_count?.toString() ?? '0'],
                ['Wallet Balance', selected.wallet_balance != null ? `$${(selected.wallet_balance / 100).toFixed(2)}` : '—'],
                ['Joined', new Date(selected.created_at).toLocaleDateString()],
              ].map(([label, val]) => (
                <div key={label}>
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</p>
                  <p className="text-sm text-gray-800 mt-0.5">{val}</p>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-gray-100 flex gap-3">
              <button
                onClick={() => toggleActive(selected.id, !!selected.deleted_at)}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${
                  selected.deleted_at
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'bg-red-600 hover:bg-red-700 text-white'
                }`}
              >
                {selected.deleted_at ? 'Reactivate' : 'Deactivate'}
              </button>
            </div>
          </div>
        )}
      </DrawerPanel>
    </div>
  );
}
