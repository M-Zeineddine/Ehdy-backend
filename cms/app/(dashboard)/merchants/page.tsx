'use client';

import { useEffect, useState, useCallback } from 'react';
import { Search, Eye, CheckCircle, ToggleLeft, Trash2, Plus, Star, Mail, Phone, Globe, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import api from '@/lib/api';
import Pagination from '@/components/Pagination';
import DrawerPanel from '@/components/DrawerPanel';

interface Merchant { id: string; name: string; slug: string; logo_url: string | null; is_active: boolean; is_verified: boolean; is_featured: boolean; contact_email: string; rating: number | null; review_count: number; created_at: string; category_name: string | null; branch_count: string; gift_instance_count: string; }
interface MerchantDetail { merchant: Merchant & { description: string | null; website_url: string | null; verified_at: string | null; contact_email: string | null; contact_phone: string | null; }; branches: { id: string; name: string; address: string; city: string; is_active: boolean }[]; items: { id: string; name: string; price: number; currency_code: string; is_active: boolean }[]; staff: { id: string; email: string; first_name: string; last_name: string; role: string; is_active: boolean }[]; recent_redemptions: { id: string; redemption_code: string; redeemed_amount: number; currency_code: string; redeemed_at: string }[]; }
interface PaginationData { total: number; page: number; limit: number; pages: number; }

export default function MerchantsPage() {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [pagination, setPag]      = useState<PaginationData>({ total: 0, page: 1, limit: 20, pages: 0 });
  const [search, setSearch]       = useState('');
  const [status, setStatus]       = useState('');
  const [verified, setVerified]   = useState('');
  const [page, setPage]           = useState(1);
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState<MerchantDetail | null>(null);
  const [drawerOpen, setDrawer]   = useState(false);
  const [detailTab, setDetailTab] = useState<'branches' | 'items' | 'staff' | 'redemptions'>('branches');

  const fetchMerchants = useCallback(() => {
    setLoading(true);
    api.get('/merchants', { params: { search: search || undefined, status: status || undefined, verified: verified || undefined, page, limit: 20 } })
      .then(r => { setMerchants(r.data.data.merchants); setPag(r.data.data.pagination); })
      .finally(() => setLoading(false));
  }, [search, status, verified, page]);

  useEffect(() => { fetchMerchants(); }, [fetchMerchants]);

  async function openMerchant(id: string) {
    setSelected(null); setDrawer(true); setDetailTab('branches');
    const r = await api.get(`/merchants/${id}`);
    setSelected(r.data.data);
  }

  async function doAction(id: string, action: string) {
    await api.patch(`/merchants/${id}`, { action });
    fetchMerchants();
    if (selected?.merchant.id === id) { const r = await api.get(`/merchants/${id}`); setSelected(r.data.data); }
  }

  async function deleteMerchant(id: string, name: string) {
    if (!confirm(`Delete merchant "${name}"?`)) return;
    await api.delete(`/merchants/${id}`); fetchMerchants(); setDrawer(false);
  }

  const m = selected?.merchant;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-2xl font-bold text-gray-900">Merchants</h1><p className="text-sm text-gray-500 mt-0.5">{pagination.total.toLocaleString()} total merchants</p></div>
        <button className="btn-primary" onClick={() => alert('Use Supabase or the API to add merchants for now.')}><Plus size={16} /> Add Merchant</button>
      </div>

      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="relative flex-1 max-w-sm"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input className="input pl-9" placeholder="Search…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /></div>
        <select className="input w-36" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="">All status</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
        <select className="input w-40" value={verified} onChange={e => { setVerified(e.target.value); setPage(1); }}><option value="">All verified</option><option value="true">Verified</option><option value="false">Unverified</option></select>
      </div>

      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 text-gray-500 text-xs uppercase border-b border-gray-100">
              <th className="px-5 py-3 text-left">Merchant</th><th className="px-5 py-3 text-left">Category</th>
              <th className="px-5 py-3 text-left">Branches</th><th className="px-5 py-3 text-left">Redemptions</th>
              <th className="px-5 py-3 text-left">Status</th><th className="px-5 py-3 text-left">Featured</th>
              <th className="px-5 py-3 text-left">Verified</th><th className="px-5 py-3 text-left">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? <tr><td colSpan={8} className="px-5 py-10 text-center text-gray-400">Loading…</td></tr>
              : merchants.length === 0 ? <tr><td colSpan={8} className="px-5 py-10 text-center text-gray-400">No merchants found</td></tr>
              : merchants.map(m => (
                <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center text-base shrink-0">{m.logo_url ? <img src={m.logo_url} alt="" className="w-9 h-9 rounded-lg object-cover" /> : '🏪'}</div>
                      <div><p className="font-medium text-gray-900">{m.name}</p><p className="text-gray-400 text-xs">{m.contact_email || m.slug}</p></div>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-gray-600">{m.category_name || '—'}</td>
                  <td className="px-5 py-3 text-gray-600">{m.branch_count}</td>
                  <td className="px-5 py-3 text-gray-600">{m.gift_instance_count}</td>
                  <td className="px-5 py-3">{m.is_active ? <span className="badge-green">Active</span> : <span className="badge-red">Inactive</span>}</td>
                  <td className="px-5 py-3">{m.is_featured ? <span className="badge-yellow">⭐ Featured</span> : <span className="badge-gray">—</span>}</td>
                  <td className="px-5 py-3">{m.is_verified ? <span className="badge-blue">✓ Verified</span> : <span className="badge-yellow">Pending</span>}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openMerchant(m.id)} className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded" title="View"><Eye size={15} /></button>
                      {!m.is_verified && <button onClick={() => doAction(m.id, 'verify')} className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded" title="Verify"><CheckCircle size={15} /></button>}
                      <button onClick={() => doAction(m.id, 'toggle_active')} className="p-1.5 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded" title="Toggle active"><ToggleLeft size={15} /></button>
                      <button onClick={() => doAction(m.id, 'toggle_featured')} className={`p-1.5 rounded ${m.is_featured ? 'text-yellow-500 hover:bg-yellow-50' : 'text-gray-400 hover:text-yellow-500 hover:bg-yellow-50'}`} title="Toggle featured"><Star size={15} /></button>
                      <button onClick={() => deleteMerchant(m.id, m.name)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded" title="Delete"><Trash2 size={15} /></button>
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
      <DrawerPanel open={drawerOpen} onClose={() => setDrawer(false)} title={m?.name ?? 'Loading…'} subtitle={m?.slug} width="w-[640px]">
        {!selected ? <div className="flex justify-center py-10"><div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" /></div> : (
          <div className="space-y-5">
            {/* Actions */}
            <div className="flex items-center gap-2 flex-wrap">
              {m!.is_active ? <span className="badge-green">Active</span> : <span className="badge-red">Inactive</span>}
              {m!.is_verified ? <span className="badge-blue">✓ Verified</span> : <span className="badge-yellow">Unverified</span>}
              {m!.is_featured && <span className="badge-yellow">⭐ Featured</span>}
              <div className="ml-auto flex gap-2">
                {!m!.is_verified && <button onClick={() => doAction(m!.id, 'verify')} className="btn-primary text-xs py-1.5"><CheckCircle size={13} />Verify</button>}
                <button onClick={() => doAction(m!.id, 'toggle_active')} className="btn-secondary text-xs py-1.5"><ToggleLeft size={13} />{m!.is_active ? 'Deactivate' : 'Activate'}</button>
                <button onClick={() => doAction(m!.id, 'toggle_featured')} className="btn-secondary text-xs py-1.5"><Star size={13} />{m!.is_featured ? 'Unfeature' : 'Feature'}</button>
              </div>
            </div>

            {/* Info */}
            {selected.merchant.description && <p className="text-sm text-gray-600">{selected.merchant.description}</p>}
            <div className="space-y-2 text-sm">
              {selected.merchant.contact_email && <div className="flex items-center gap-2 text-gray-600"><Mail size={14} className="text-gray-400" />{selected.merchant.contact_email}</div>}
              {selected.merchant.contact_phone && <div className="flex items-center gap-2 text-gray-600"><Phone size={14} className="text-gray-400" />{selected.merchant.contact_phone}</div>}
              {selected.merchant.website_url && <div className="flex items-center gap-2 text-gray-600"><Globe size={14} className="text-gray-400" />{selected.merchant.website_url}</div>}
              <div className="flex items-center gap-2 text-gray-600"><MapPin size={14} className="text-gray-400" />{selected.merchant.category_name || 'No category'}</div>
              <p className="text-gray-400 text-xs">Joined {format(new Date(selected.merchant.created_at), 'MMM d, yyyy')}</p>
            </div>

            {/* Tabs */}
            <div className="border-b border-gray-200">
              <nav className="flex gap-1">
                {(['branches', 'items', 'staff', 'redemptions'] as const).map(t => (
                  <button key={t} onClick={() => setDetailTab(t)} className={`px-3 py-2 text-xs font-medium border-b-2 capitalize transition-colors ${detailTab === t ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                    {t} ({t === 'branches' ? selected.branches.length : t === 'items' ? selected.items.length : t === 'staff' ? selected.staff.length : selected.recent_redemptions.length})
                  </button>
                ))}
              </nav>
            </div>

            {detailTab === 'branches' && (selected.branches.length === 0 ? <p className="text-sm text-gray-400">No branches</p> : <div className="space-y-2">{selected.branches.map(b => <div key={b.id} className="bg-gray-50 rounded-lg px-3 py-2 text-sm"><p className="font-medium text-gray-900">{b.name}</p><p className="text-gray-500 text-xs">{b.city} · {b.address}</p></div>)}</div>)}
            {detailTab === 'items' && (selected.items.length === 0 ? <p className="text-sm text-gray-400">No items</p> : <div className="space-y-2">{selected.items.map(i => <div key={i.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm"><p className="font-medium">{i.name}</p><p className="text-gray-600">{i.price} {i.currency_code}</p></div>)}</div>)}
            {detailTab === 'staff' && (selected.staff.length === 0 ? <p className="text-sm text-gray-400">No staff</p> : <div className="space-y-2">{selected.staff.map(s => <div key={s.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm"><div><p className="font-medium">{s.first_name} {s.last_name}</p><p className="text-gray-500 text-xs">{s.email}</p></div><span className="badge-blue capitalize">{s.role}</span></div>)}</div>)}
            {detailTab === 'redemptions' && (selected.recent_redemptions.length === 0 ? <p className="text-sm text-gray-400">No redemptions</p> : <div className="space-y-2">{selected.recent_redemptions.map(r => <div key={r.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm"><p className="font-mono text-xs text-gray-600">{r.redemption_code}</p><div className="text-right"><p className="font-medium">{r.redeemed_amount} {r.currency_code}</p><p className="text-gray-400 text-xs">{format(new Date(r.redeemed_at), 'MMM d')}</p></div></div>)}</div>)}
          </div>
        )}
      </DrawerPanel>
    </div>
  );
}
