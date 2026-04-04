'use client';

import { useEffect, useState, useCallback } from 'react';
import { Search, X } from 'lucide-react';
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
  share_code: string | null;
  gift_type: 'gift_item' | 'store_credit' | null;
  item_name: string | null;
  initial_balance: string | null;
  current_balance: string | null;
  redeemed_amount: string | null;
  currency_code: string | null;
  redemption_codes: string | null;
  redeemed_at: string | null;
}

interface RedemptionEvent {
  id: string;
  amount: string | null;
  currency_code: string | null;
  balance_after: string | null;
  notes: string | null;
  redeemed_at: string;
  redemption_code: string;
  merchant_name: string | null;
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
  const [modalGift, setModalGift] = useState<Gift | null>(null);
  const [events, setEvents]       = useState<RedemptionEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  function openRedemptions(gift: Gift) {
    setModalGift(gift);
    setEvents([]);
    setEventsLoading(true);
    api.get(`/gifts/${gift.id}/redemptions`)
      .then(res => setEvents(res.data.data))
      .finally(() => setEventsLoading(false));
  }

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
                <th className="px-5 py-3 text-left font-medium whitespace-nowrap">Sender</th>
                <th className="px-5 py-3 text-left font-medium">Recipient</th>
                <th className="px-5 py-3 text-left font-medium whitespace-nowrap">Theme</th>
                <th className="px-5 py-3 text-left font-medium">Merchant</th>
                <th className="px-5 py-3 text-left font-medium whitespace-nowrap">Gift</th>
                <th className="px-5 py-3 text-left font-medium whitespace-nowrap">Balance</th>
                <th className="px-5 py-3 text-left font-medium whitespace-nowrap">Status</th>
                <th className="px-5 py-3 text-left font-medium whitespace-nowrap">Sent At</th>
                <th className="px-5 py-3 text-left font-medium whitespace-nowrap">Redeemed At</th>
                <th className="px-5 py-3 text-left font-medium whitespace-nowrap">Gift Code</th>
                <th className="px-5 py-3 text-left font-medium whitespace-nowrap">Redemption Code</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={11} className="px-5 py-10 text-center text-gray-400">Loading…</td></tr>
              ) : gifts.length === 0 ? (
                <tr><td colSpan={11} className="px-5 py-10 text-center text-gray-400">No gifts found</td></tr>
              ) : gifts.map(g => (
                <tr key={g.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 whitespace-nowrap">
                    <p className="font-medium text-gray-900">{g.sender_name || '—'}</p>
                    <p className="text-gray-400 text-xs">{g.sender_user_email || '—'}</p>
                  </td>
                  <td className="px-5 py-3">
                    <p className="text-gray-900">{g.recipient_name || '—'}</p>
                    <p className="text-gray-400 text-xs">{g.recipient_email || g.recipient_phone || '—'}</p>
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap capitalize">
                    {THEME_EMOJI[g.theme]} {g.theme?.replace(/_/g, ' ')}
                  </td>
                  <td className="px-5 py-3 text-gray-600">{g.merchant_name || '—'}</td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    <span className={g.gift_type === 'gift_item' ? 'badge-blue' : 'badge-yellow'}>
                      {g.gift_type === 'gift_item' ? 'Gift' : 'Credit'}
                    </span>
                    {g.item_name && <p className="text-xs text-gray-500 mt-1">{g.item_name}</p>}
                    {g.initial_balance && (
                      <p className="text-xs text-gray-700 font-medium mt-0.5">
                        {parseFloat(g.initial_balance).toLocaleString()} {g.currency_code}
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-3 text-xs whitespace-nowrap">
                    {g.gift_type === 'store_credit' && g.current_balance != null ? (
                      <div className="space-y-0.5">
                        <p className="text-gray-700">
                          <span className="text-gray-400">Rem:</span>{' '}
                          <span className="font-medium">{parseFloat(g.current_balance).toLocaleString()} {g.currency_code}</span>
                        </p>
                        {parseFloat(g.redeemed_amount ?? '0') > 0 && (
                          <p className="text-gray-400">
                            <span>Used:</span>{' '}
                            {parseFloat(g.redeemed_amount!).toLocaleString()} {g.currency_code}
                          </p>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    <span className={STATUS_CLASS[g.payment_status] || 'badge-gray'}>
                      {g.payment_status}
                    </span>
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap text-gray-500 text-xs">
                    {g.sent_at ? format(new Date(g.sent_at), 'MMM d, HH:mm') : '—'}
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap text-xs">
                    {g.redeemed_at ? (
                      <button
                        onClick={() => openRedemptions(g)}
                        className="text-blue-600 hover:underline font-medium"
                      >
                        {format(new Date(g.redeemed_at), 'MMM d, HH:mm')}
                      </button>
                    ) : (
                      g.redeemed_amount && parseFloat(g.redeemed_amount) > 0 ? (
                        <button onClick={() => openRedemptions(g)} className="text-blue-600 hover:underline font-medium">
                          View
                        </button>
                      ) : <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    {g.share_code
                      ? <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">{g.share_code}</span>
                      : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-5 py-3 text-xs">
                    {g.redemption_codes ? (
                      <div className="space-y-1">
                        {g.redemption_codes.split('\n').map((code, i) => (
                          <p key={i}><span className="font-mono bg-gray-100 px-2 py-0.5 rounded whitespace-nowrap">{code}</span></p>
                        ))}
                      </div>
                    ) : <span className="text-gray-400">—</span>}
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

      {/* Redemption History Modal */}
      {modalGift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setModalGift(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <p className="font-semibold text-gray-900">Redemption History</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {modalGift.sender_name} → {modalGift.recipient_name} · {modalGift.merchant_name}
                </p>
              </div>
              <button onClick={() => setModalGift(null)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <div className="px-6 py-4 max-h-96 overflow-y-auto">
              {eventsLoading ? (
                <p className="text-sm text-gray-400 text-center py-6">Loading…</p>
              ) : events.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No redemption events recorded yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 uppercase border-b border-gray-100">
                      <th className="pb-2 text-left font-medium">Date</th>
                      <th className="pb-2 text-left font-medium">Amount</th>
                      <th className="pb-2 text-left font-medium">Balance After</th>
                      <th className="pb-2 text-left font-medium">Code</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {events.map(ev => (
                      <tr key={ev.id}>
                        <td className="py-2 text-gray-600 whitespace-nowrap">{format(new Date(ev.redeemed_at), 'MMM d, HH:mm')}</td>
                        <td className="py-2 font-medium text-gray-900 whitespace-nowrap">
                          {ev.amount ? `${parseFloat(ev.amount).toLocaleString()} ${ev.currency_code}` : '—'}
                        </td>
                        <td className="py-2 text-gray-500 whitespace-nowrap">
                          {ev.balance_after != null ? `${parseFloat(ev.balance_after).toLocaleString()} ${ev.currency_code}` : '—'}
                        </td>
                        <td className="py-2">
                          <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{ev.redemption_code}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
