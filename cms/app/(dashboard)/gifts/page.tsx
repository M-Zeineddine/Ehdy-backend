'use client';

import { useEffect, useState, useCallback } from 'react';
import { Search } from 'lucide-react';
import { format } from 'date-fns';
import api from '@/lib/api';
import Header from '@/components/Header';
import Pagination from '@/components/Pagination';

interface Gift {
  id: string; sender_name: string; sender_user_email: string;
  recipient_name: string; recipient_email: string; recipient_phone: string;
  theme: string; delivery_channel: string; payment_status: string;
  is_claimed: boolean; sent_at: string; expiration_date: string | null;
  tap_charge_id: string | null; merchant_name: string | null;
}

interface PaginationData { total: number; page: number; limit: number; pages: number; }

const THEME_EMOJI: Record<string, string> = {
  birthday: '🎂', thank_you: '🙏', love: '❤️',
  thinking_of_you: '💭', just_because: '✨', congratulations: '🎉',
};

const STATUS_CLASS: Record<string, string> = {
  paid: 'badge-green', pending: 'badge-yellow', failed: 'badge-red',
};

export default function GiftsPage() {
  const [gifts, setGifts]         = useState<Gift[]>([]);
  const [pagination, setPag]      = useState<PaginationData>({ total: 0, page: 1, limit: 20, pages: 0 });
  const [search, setSearch]       = useState('');
  const [status, setStatus]       = useState('');
  const [theme, setTheme]         = useState('');
  const [page, setPage]           = useState(1);
  const [loading, setLoading]     = useState(true);

  const fetchGifts = useCallback(() => {
    setLoading(true);
    api.get('/gifts', {
      params: { search: search || undefined, status: status || undefined, theme: theme || undefined, page, limit: 20 },
    })
      .then(res => {
        setGifts(res.data.data.gifts);
        setPag(res.data.data.pagination);
      })
      .finally(() => setLoading(false));
  }, [search, status, theme, page]);

  useEffect(() => { fetchGifts(); }, [fetchGifts]);

  return (
    <div>
      <Header title="Gifts" subtitle={`${pagination.total.toLocaleString()} total gifts`} />

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9"
            placeholder="Search sender, recipient…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <select className="input w-36" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All status</option>
          <option value="paid">Paid</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
        </select>
        <select className="input w-44" value={theme} onChange={e => { setTheme(e.target.value); setPage(1); }}>
          <option value="">All themes</option>
          <option value="birthday">Birthday</option>
          <option value="thank_you">Thank You</option>
          <option value="love">Love</option>
          <option value="thinking_of_you">Thinking of You</option>
          <option value="just_because">Just Because</option>
          <option value="congratulations">Congratulations</option>
        </select>
      </div>

      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide border-b border-gray-100">
                <th className="px-5 py-3 text-left font-medium">Sender</th>
                <th className="px-5 py-3 text-left font-medium">Recipient</th>
                <th className="px-5 py-3 text-left font-medium">Theme</th>
                <th className="px-5 py-3 text-left font-medium">Channel</th>
                <th className="px-5 py-3 text-left font-medium">Merchant</th>
                <th className="px-5 py-3 text-left font-medium">Status</th>
                <th className="px-5 py-3 text-left font-medium">Claimed</th>
                <th className="px-5 py-3 text-left font-medium">Sent At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-gray-400">Loading…</td></tr>
              ) : gifts.length === 0 ? (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-gray-400">No gifts found</td></tr>
              ) : gifts.map(g => (
                <tr key={g.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3">
                    <p className="font-medium text-gray-900">{g.sender_name || '—'}</p>
                    <p className="text-gray-400 text-xs">{g.sender_user_email || '—'}</p>
                  </td>
                  <td className="px-5 py-3">
                    <p className="text-gray-900">{g.recipient_name || '—'}</p>
                    <p className="text-gray-400 text-xs">{g.recipient_email || g.recipient_phone || '—'}</p>
                  </td>
                  <td className="px-5 py-3 capitalize">
                    {THEME_EMOJI[g.theme]} {g.theme?.replace(/_/g, ' ')}
                  </td>
                  <td className="px-5 py-3">
                    <span className="badge-blue capitalize">{g.delivery_channel}</span>
                  </td>
                  <td className="px-5 py-3 text-gray-600">{g.merchant_name || '—'}</td>
                  <td className="px-5 py-3">
                    <span className={STATUS_CLASS[g.payment_status] || 'badge-gray'}>
                      {g.payment_status}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {g.is_claimed ? <span className="badge-green">Yes</span> : <span className="badge-gray">No</span>}
                  </td>
                  <td className="px-5 py-3 text-gray-500 text-xs">
                    {g.sent_at ? format(new Date(g.sent_at), 'MMM d, HH:mm') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pagination.pages > 1 && (
          <div className="px-4 py-3 border-t border-gray-100">
            <Pagination {...pagination} onPage={setPage} />
          </div>
        )}
      </div>
    </div>
  );
}
