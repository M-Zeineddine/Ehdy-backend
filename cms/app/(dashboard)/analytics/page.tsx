'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

interface AnalyticsData {
  user_growth: { date: string; users: number }[];
  revenue: { date: string; revenue: number; gifts: number }[];
  themes: { theme: string; count: number }[];
  channels: { channel: string; count: number }[];
  top_merchants: { name: string; revenue: number; gift_count: number }[];
}

const COLORS = ['#4f6ef7', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function AnalyticsPage() {
  const [range, setRange] = useState(30);
  const [data, setData] = useState<AnalyticsData | null>(null);

  useEffect(() => {
    api.get('/v1/admin/analytics', { params: { days: range } }).then((r) => setData(r.data));
  }, [range]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Analytics</h1>
        <div className="flex gap-2">
          {[7, 30, 90].map((d) => (
            <button key={d} onClick={() => setRange(d)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                range === d ? 'bg-brand-600 text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'
              }`}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-600 mb-4">User Growth</h2>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data?.user_growth ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Area type="monotone" dataKey="users" stroke="#4f6ef7" fill="#e0eaff" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-600 mb-4">Revenue & Gifts</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data?.revenue ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="revenue" fill="#4f6ef7" radius={[4, 4, 0, 0]} name="Revenue" />
              <Bar dataKey="gifts" fill="#10b981" radius={[4, 4, 0, 0]} name="Gifts" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-600 mb-4">Gift Themes</h2>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={data?.themes ?? []} dataKey="count" nameKey="theme" cx="50%" cy="50%" outerRadius={80} label>
                {(data?.themes ?? []).map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-600 mb-4">Gift Channels</h2>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={data?.channels ?? []} dataKey="count" nameKey="channel" cx="50%" cy="50%" outerRadius={80} label>
                {(data?.channels ?? []).map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Top Merchants</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              {['Merchant', 'Revenue', 'Gifts'].map((h) => (
                <th key={h} className="px-6 py-3 text-left font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(data?.top_merchants ?? []).map((m) => (
              <tr key={m.name} className="hover:bg-gray-50">
                <td className="px-6 py-3 font-medium">{m.name}</td>
                <td className="px-6 py-3">${(m.revenue / 100).toFixed(2)}</td>
                <td className="px-6 py-3">{m.gift_count}</td>
              </tr>
            ))}
            {(data?.top_merchants ?? []).length === 0 && (
              <tr><td colSpan={3} className="px-6 py-6 text-center text-gray-400">No data</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
