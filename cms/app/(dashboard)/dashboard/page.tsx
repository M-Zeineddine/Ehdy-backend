'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

interface Stats {
  total_users: number;
  total_merchants: number;
  gifts_today: number;
  revenue_today: number;
  redemptions_today: number;
  pending_merchants: number;
}

interface ChartPoint { date: string; gifts: number; revenue: number }
interface RecentGift {
  id: string;
  sender_name: string;
  recipient_name: string;
  amount: number;
  status: string;
  created_at: string;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [chart, setChart] = useState<ChartPoint[]>([]);
  const [recent, setRecent] = useState<RecentGift[]>([]);

  useEffect(() => {
    api.get('/v1/admin/dashboard').then((r) => {
      setStats(r.data.stats);
      setChart(r.data.chart ?? []);
      setRecent(r.data.recent_gifts ?? []);
    });
  }, []);

  const fmt = (n: number) => n?.toLocaleString() ?? '—';
  const fmtMoney = (n: number) => n != null ? `$${(n / 100).toFixed(2)}` : '—';

  const cards = stats ? [
    { label: 'Total Users', value: fmt(stats.total_users), color: 'bg-blue-50 text-blue-700' },
    { label: 'Total Merchants', value: fmt(stats.total_merchants), color: 'bg-purple-50 text-purple-700' },
    { label: 'Gifts Today', value: fmt(stats.gifts_today), color: 'bg-green-50 text-green-700' },
    { label: 'Revenue Today', value: fmtMoney(stats.revenue_today), color: 'bg-yellow-50 text-yellow-700' },
    { label: 'Redemptions Today', value: fmt(stats.redemptions_today), color: 'bg-pink-50 text-pink-700' },
    { label: 'Pending Merchants', value: fmt(stats.pending_merchants), color: 'bg-orange-50 text-orange-700' },
  ] : [];

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((c) => (
          <div key={c.label} className={`rounded-xl p-5 ${c.color}`}>
            <p className="text-sm font-medium opacity-75">{c.label}</p>
            <p className="text-3xl font-bold mt-1">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-600 mb-4">Gifts (last 30 days)</h2>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Area type="monotone" dataKey="gifts" stroke="#4f6ef7" fill="#e0eaff" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-600 mb-4">Revenue (last 30 days)</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="revenue" fill="#4f6ef7" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Recent Gifts</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                {['Sender', 'Recipient', 'Amount', 'Status', 'Date'].map((h) => (
                  <th key={h} className="px-6 py-3 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {recent.map((g) => (
                <tr key={g.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3">{g.sender_name}</td>
                  <td className="px-6 py-3">{g.recipient_name}</td>
                  <td className="px-6 py-3">{fmtMoney(g.amount)}</td>
                  <td className="px-6 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      g.status === 'redeemed' ? 'bg-green-100 text-green-700' :
                      g.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>{g.status}</span>
                  </td>
                  <td className="px-6 py-3 text-gray-400">
                    {new Date(g.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {recent.length === 0 && (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400">No gifts yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
