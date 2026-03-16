'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import DrawerPanel from '@/components/DrawerPanel';

interface Merchant {
  id: string;
  name: string;
  category: string;
  is_active: boolean;
  is_verified: boolean;
  is_featured: boolean;
  created_at: string;
}

interface MerchantDetail extends Merchant {
  description: string | null;
  website: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  gift_card_count: number;
  total_revenue: number;
}

export default function MerchantsPage() {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState<MerchantDetail | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const limit = 20;

  const load = () => {
    const params: Record<string, string | number> = { page, limit };
    if (search) params.search = search;
    if (status) params.status = status;
    api.get('/v1/admin/merchants', { params }).then((r) => {
      setMerchants(r.data.merchants);
      setTotal(r.data.total);
    });
  };

  useEffect(() => { load(); }, [page, search, status]); // eslint-disable-line react-hooks/exhaustive-deps

  const openMerchant = async (id: string) => {
    const r = await api.get(`/v1/admin/merchants/${id}`);
    setSelected(r.data.merchant);
    setDrawerOpen(true);
  };

  const action = async (id: string, act: string) => {
    await api.patch(`/v1/admin/merchants/${id}`, { action: act });
    load();
    if (selected?.id === id) {
      const r = await api.get(`/v1/admin/merchants/${id}`);
      setSelected(r.data.merchant);
    }
  };

  const deleteMerchant = async (id: string) => {
    if (!confirm('Delete this merchant? This cannot be undone.')) return;
    await api.delete(`/v1/admin/merchants/${id}`);
    setDrawerOpen(false);
    load();
  };

  const pages = Math.ceil(total / limit);

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold text-gray-800">Merchants</h1>

      <div className="flex gap-3">
        <input
          type="text"
          placeholder="Search merchants…"
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
          <option value="pending">Pending</option>
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              {['Name', 'Category', 'Verified', 'Active', 'Featured', 'Joined', ''].map((h) => (
                <th key={h} className="px-5 py-3 text-left font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {merchants.map((m) => (
              <tr key={m.id} className="hover:bg-gray-50">
                <td className="px-5 py-3 font-medium">{m.name}</td>
                <td className="px-5 py-3 text-gray-500">{m.category ?? '—'}</td>
                <td className="px-5 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    m.is_verified ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                  }`}>{m.is_verified ? 'Verified' : 'Pending'}</span>
                </td>
                <td className="px-5 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    m.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                  }`}>{m.is_active ? 'Active' : 'Inactive'}</span>
                </td>
                <td className="px-5 py-3">{m.is_featured ? '⭐' : '—'}</td>
                <td className="px-5 py-3 text-gray-400">{new Date(m.created_at).toLocaleDateString()}</td>
                <td className="px-5 py-3">
                  <button onClick={() => openMerchant(m.id)} className="text-brand-600 hover:underline text-xs">View</button>
                </td>
              </tr>
            ))}
            {merchants.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-gray-400">No merchants found</td></tr>
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
        title={selected?.name ?? ''}
      >
        {selected && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {[
                ['Category', selected.category ?? '—'],
                ['Website', selected.website ?? '—'],
                ['Contact Email', selected.contact_email ?? '—'],
                ['Contact Phone', selected.contact_phone ?? '—'],
                ['Gift Cards', selected.gift_card_count?.toString() ?? '0'],
                ['Total Revenue', selected.total_revenue != null ? `$${(selected.total_revenue / 100).toFixed(2)}` : '—'],
                ['Verified', selected.is_verified ? 'Yes' : 'No'],
                ['Active', selected.is_active ? 'Yes' : 'No'],
                ['Featured', selected.is_featured ? 'Yes' : 'No'],
                ['Joined', new Date(selected.created_at).toLocaleDateString()],
              ].map(([label, val]) => (
                <div key={label}>
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</p>
                  <p className="text-sm text-gray-800 mt-0.5">{val}</p>
                </div>
              ))}
            </div>

            {selected.description && (
              <div>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Description</p>
                <p className="text-sm text-gray-700 mt-1">{selected.description}</p>
              </div>
            )}

            <div className="pt-4 border-t border-gray-100 flex flex-wrap gap-2">
              {!selected.is_verified && (
                <button onClick={() => action(selected.id, 'verify')}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white">
                  Verify
                </button>
              )}
              <button onClick={() => action(selected.id, selected.is_active ? 'toggle_active' : 'toggle_active')}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${
                  selected.is_active ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-green-600 hover:bg-green-700 text-white'
                }`}>
                {selected.is_active ? 'Deactivate' : 'Activate'}
              </button>
              <button onClick={() => action(selected.id, 'toggle_featured')}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-yellow-500 hover:bg-yellow-600 text-white">
                {selected.is_featured ? 'Unfeature' : 'Feature ⭐'}
              </button>
              <button onClick={() => deleteMerchant(selected.id)}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-200 hover:bg-gray-300 text-gray-700">
                Delete
              </button>
            </div>
          </div>
        )}
      </DrawerPanel>
    </div>
  );
}
