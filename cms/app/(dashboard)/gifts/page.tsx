'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';

interface Gift {
  id: string;
  sender_name: string;
  recipient_name: string;
  amount: number;
  status: string;
  theme: string | null;
  channel: string | null;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  sent: 'bg-blue-100 text-blue-700',
  redeemed: 'bg-green-100 text-green-700',
  expired: 'bg-red-100 text-red-600',
  cancelled: 'bg-gray-100 text-gray-500',
};

export default function GiftsPage() {
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [theme, setTheme] = useState('');
  const limit = 25;

  useEffect(() => {
    const params: Record<string, string | number> = { page, limit };
    if (status) params.status = status;
    if (theme) params.theme = theme;
    api.get('/v1/admin/gifts', { params }).then((r) => {
      setGifts(r.data.gifts);
      setTotal(r.data.total);
    });
  }, [page, status, theme]);

  const pages = Math.ceil(total / limit);

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold text-gray-800">Gifts</h1>

      <div className="flex gap-3">
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="sent">Sent</option>
          <option value="redeemed">Redeemed</option>
          <option value="expired">Expired</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <input type="text" placeholder="Filter by theme…" value={theme}
          onChange={(e) => { setTheme(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              {['Sender', 'Recipient', 'Amount', 'Status', 'Theme', 'Channel', 'Date'].map((h) => (
                <th key={h} className="px-5 py-3 text-left font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {gifts.map((g) => (
              <tr key={g.id} className="hover:bg-gray-50">
                <td className="px-5 py-3">{g.sender_name}</td>
                <td className="px-5 py-3">{g.recipient_name}</td>
                <td className="px-5 py-3">${(g.amount / 100).toFixed(2)}</td>
                <td className="px-5 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[g.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {g.status}
                  </span>
                </td>
                <td className="px-5 py-3 text-gray-500">{g.theme ?? '—'}</td>
                <td className="px-5 py-3 text-gray-500">{g.channel ?? '—'}</td>
                <td className="px-5 py-3 text-gray-400">{new Date(g.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {gifts.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-gray-400">No gifts found</td></tr>
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
    </div>
  );
}
