'use client';

import { useEffect, useState, useCallback } from 'react';
import { Search, UserX, UserCheck, Eye, Mail, Phone, Globe, Calendar, Gift, ShoppingBag } from 'lucide-react';
import { format } from 'date-fns';
import api from '@/lib/api';
import Pagination from '@/components/Pagination';
import DrawerPanel from '@/components/DrawerPanel';

interface User {
  id: string; email: string; first_name: string; last_name: string; phone: string;
  country_code: string; is_email_verified: boolean; auth_provider: string;
  last_login_at: string; created_at: string; deleted_at: string | null;
}
interface UserDetail {
  user: User & { currency_code: string; is_phone_verified: boolean; profile_picture_url: string; updated_at: string; };
  recent_gifts: { id: string; recipient_name: string; theme: string; payment_status: string; sent_at: string }[];
  recent_purchases: { id: string; total_amount: number; currency_code: string; payment_status: string; purchased_at: string }[];
}
interface PaginationData { total: number; page: number; limit: number; pages: number; }

export default function UsersPage() {
  const [users, setUsers]       = useState<User[]>([]);
  const [pagination, setPag]    = useState<PaginationData>({ total: 0, page: 1, limit: 20, pages: 0 });
  const [search, setSearch]     = useState('');
  const [status, setStatus]     = useState('');
  const [page, setPage]         = useState(1);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState<UserDetail | null>(null);
  const [drawerOpen, setDrawer] = useState(false);

  const fetchUsers = useCallback(() => {
    setLoading(true);
    api.get('/users', { params: { search: search || undefined, status: status || undefined, page, limit: 20 } })
      .then(r => { setUsers(r.data.data.users); setPag(r.data.data.pagination); })
      .finally(() => setLoading(false));
  }, [search, status, page]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  async function openUser(id: string) {
    setSelected(null); setDrawer(true);
    const r = await api.get(`/users/${id}`);
    setSelected(r.data.data);
  }

  async function toggleUser(id: string, isDeleted: boolean) {
    await api.patch(`/users/${id}`, { action: isDeleted ? 'reactivate' : 'deactivate' });
    fetchUsers();
    if (selected?.user.id === id) {
      const r = await api.get(`/users/${id}`);
      setSelected(r.data.data);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-sm text-gray-500 mt-0.5">{pagination.total.toLocaleString()} total users</p>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-9" placeholder="Search by name, email, phone…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <select className="input w-40" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All users</option>
          <option value="active">Active</option>
          <option value="deleted">Deleted</option>
        </select>
      </div>

      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 text-gray-500 text-xs uppercase border-b border-gray-100">
              <th className="px-5 py-3 text-left">User</th><th className="px-5 py-3 text-left">Phone</th>
              <th className="px-5 py-3 text-left">Country</th><th className="px-5 py-3 text-left">Verified</th>
              <th className="px-5 py-3 text-left">Provider</th><th className="px-5 py-3 text-left">Last Login</th>
              <th className="px-5 py-3 text-left">Joined</th><th className="px-5 py-3 text-left">Status</th>
              <th className="px-5 py-3 text-left">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={9} className="px-5 py-10 text-center text-gray-400">Loading…</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={9} className="px-5 py-10 text-center text-gray-400">No users found</td></tr>
              ) : users.map(u => (
                <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3">
                    <p className="font-medium text-gray-900">{u.first_name || u.last_name ? `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() : '—'}</p>
                    <p className="text-gray-400 text-xs">{u.email}</p>
                  </td>
                  <td className="px-5 py-3 text-gray-600">{u.phone || '—'}</td>
                  <td className="px-5 py-3 text-gray-600">{u.country_code}</td>
                  <td className="px-5 py-3">{u.is_email_verified ? <span className="badge-green">✓ Yes</span> : <span className="badge-yellow">No</span>}</td>
                  <td className="px-5 py-3"><span className="badge-blue capitalize">{u.auth_provider || 'email'}</span></td>
                  <td className="px-5 py-3 text-gray-500 text-xs">{u.last_login_at ? format(new Date(u.last_login_at), 'MMM d, yyyy') : '—'}</td>
                  <td className="px-5 py-3 text-gray-500 text-xs">{format(new Date(u.created_at), 'MMM d, yyyy')}</td>
                  <td className="px-5 py-3">{u.deleted_at ? <span className="badge-red">Deleted</span> : <span className="badge-green">Active</span>}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openUser(u.id)} className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded" title="View"><Eye size={15} /></button>
                      <button onClick={() => toggleUser(u.id, !!u.deleted_at)} className={`p-1.5 rounded transition-colors ${u.deleted_at ? 'text-gray-400 hover:text-green-600 hover:bg-green-50' : 'text-gray-400 hover:text-red-600 hover:bg-red-50'}`} title={u.deleted_at ? 'Reactivate' : 'Deactivate'}>
                        {u.deleted_at ? <UserCheck size={15} /> : <UserX size={15} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pagination.pages > 1 && <div className="px-4 py-3 border-t border-gray-100"><Pagination {...pagination} onPage={setPage} /></div>}
      </div>

      {/* Detail Drawer */}
      <DrawerPanel open={drawerOpen} onClose={() => setDrawer(false)} title={selected ? `${selected.user.first_name ?? ''} ${selected.user.last_name ?? ''}`.trim() || selected.user.email : 'Loading…'} subtitle={selected?.user.email}>
        {!selected ? (
          <div className="flex justify-center py-10"><div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <div className="space-y-6">
            {/* Status actions */}
            <div className="flex items-center gap-2">
              {selected.user.deleted_at ? <span className="badge-red">Deleted</span> : <span className="badge-green">Active</span>}
              {selected.user.is_email_verified && <span className="badge-blue">Email Verified</span>}
              <button onClick={() => toggleUser(selected.user.id, !!selected.user.deleted_at)} className={`ml-auto text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${selected.user.deleted_at ? 'border-green-200 text-green-700 hover:bg-green-50' : 'border-red-200 text-red-700 hover:bg-red-50'}`}>
                {selected.user.deleted_at ? 'Reactivate' : 'Deactivate'}
              </button>
            </div>

            {/* Info */}
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-gray-600"><Mail size={14} className="text-gray-400 shrink-0" />{selected.user.email}</div>
              {selected.user.phone && <div className="flex items-center gap-2 text-gray-600"><Phone size={14} className="text-gray-400 shrink-0" />{selected.user.phone}</div>}
              <div className="flex items-center gap-2 text-gray-600"><Globe size={14} className="text-gray-400 shrink-0" />{selected.user.country_code} · {selected.user.currency_code}</div>
              <div className="flex items-center gap-2 text-gray-600"><Calendar size={14} className="text-gray-400 shrink-0" />Joined {format(new Date(selected.user.created_at), 'MMM d, yyyy')}</div>
              {selected.user.last_login_at && <p className="text-gray-400 text-xs">Last login: {format(new Date(selected.user.last_login_at), 'MMM d, yyyy HH:mm')}</p>}
            </div>

            {/* Recent Gifts */}
            <div>
              <div className="flex items-center gap-2 mb-3"><Gift size={15} className="text-brand-600" /><h4 className="font-semibold text-gray-900 text-sm">Recent Gifts Sent</h4></div>
              {selected.recent_gifts.length === 0 ? <p className="text-gray-400 text-sm">No gifts sent yet</p> : (
                <div className="space-y-2">
                  {selected.recent_gifts.map(g => (
                    <div key={g.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                      <div><p className="font-medium text-gray-900">To: {g.recipient_name || '—'}</p><p className="text-gray-400 text-xs capitalize">{g.theme?.replace(/_/g, ' ')}</p></div>
                      <div className="text-right"><span className={g.payment_status === 'paid' ? 'badge-green' : g.payment_status === 'pending' ? 'badge-yellow' : 'badge-red'}>{g.payment_status}</span><p className="text-gray-400 text-xs mt-1">{format(new Date(g.sent_at), 'MMM d')}</p></div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Purchases */}
            <div>
              <div className="flex items-center gap-2 mb-3"><ShoppingBag size={15} className="text-brand-600" /><h4 className="font-semibold text-gray-900 text-sm">Recent Purchases</h4></div>
              {selected.recent_purchases.length === 0 ? <p className="text-gray-400 text-sm">No purchases yet</p> : (
                <div className="space-y-2">
                  {selected.recent_purchases.map(p => (
                    <div key={p.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                      <div><p className="font-medium text-gray-900">{p.total_amount} {p.currency_code}</p><p className="text-gray-400 text-xs">{format(new Date(p.purchased_at), 'MMM d, yyyy')}</p></div>
                      <span className={p.payment_status === 'succeeded' ? 'badge-green' : p.payment_status === 'pending' ? 'badge-yellow' : 'badge-red'}>{p.payment_status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DrawerPanel>
    </div>
  );
}
