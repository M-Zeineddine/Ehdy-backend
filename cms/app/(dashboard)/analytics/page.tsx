'use client';

import { useEffect, useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { format } from 'date-fns';
import api from '@/lib/api';
import Header from '@/components/Header';

interface AnalyticsData {
  users_growth: { date: string; new_users: string }[];
  gifts_volume: { date: string; gifts_sent: string }[];
  revenue: { date: string; revenue: string }[];
  top_merchants: { name: string; logo_url: string | null; redemption_count: string; total_redeemed: string }[];
  theme_breakdown: { theme: string; count: string }[];
  delivery_channels: { delivery_channel: string; count: string }[];
  redemption_rate: { redeemed: string; total: string };
}

const THEME_EMOJI: Record<string, string> = {
  birthday: '🎂', thank_you: '🙏', love: '❤️',
  thinking_of_you: '💭', just_because: '✨', congratulations: '🎉',
};

const PIE_COLORS = ['#4d64ff', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#06b6d4'];

export default function AnalyticsPage() {
  const [data, setData]     = useState<AnalyticsData | null>(null);
  const [range, setRange]   = useState('30');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get('/analytics', { params: { range } })
      .then(res => setData(res.data.data))
      .finally(() => setLoading(false));
  }, [range]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) return null;

  const userChartData = data.users_growth.map(d => ({
    date: format(new Date(d.date), 'MMM d'),
    users: parseInt(d.new_users),
  }));

  const giftsChartData = data.gifts_volume.map(d => ({
    date: format(new Date(d.date), 'MMM d'),
    gifts: parseInt(d.gifts_sent),
  }));

  const revenueChartData = data.revenue.map(d => ({
    date: format(new Date(d.date), 'MMM d'),
    revenue: parseFloat(d.revenue),
  }));

  const themeData = data.theme_breakdown.map(d => ({
    name: `${THEME_EMOJI[d.theme] ?? ''} ${d.theme?.replace(/_/g, ' ')}`,
    value: parseInt(d.count),
  }));

  const channelData = data.delivery_channels.map(d => ({
    name: d.delivery_channel,
    value: parseInt(d.count),
  }));

  const redemptionRate = data.redemption_rate;
  const pct = redemptionRate.total === '0' ? 0
    : Math.round((parseInt(redemptionRate.redeemed) / parseInt(redemptionRate.total)) * 100);

  return (
    <div>
      <Header
        title="Analytics"
        subtitle="Platform performance overview"
        actions={
          <select className="input w-36" value={range} onChange={e => setRange(e.target.value)}>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
        }
      />

      {/* Key Metrics Row */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="card p-5">
          <p className="text-sm text-gray-500">New Users</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {userChartData.reduce((s, d) => s + d.users, 0).toLocaleString()}
          </p>
          <p className="text-xs text-gray-400 mt-1">Last {range} days</p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-gray-500">Gifts Sent</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {giftsChartData.reduce((s, d) => s + d.gifts, 0).toLocaleString()}
          </p>
          <p className="text-xs text-gray-400 mt-1">Last {range} days</p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-gray-500">Redemption Rate</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{pct}%</p>
          <p className="text-xs text-gray-400 mt-1">
            {redemptionRate.redeemed} of {redemptionRate.total} redeemed
          </p>
        </div>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="card p-5">
          <h3 className="font-semibold text-gray-900 mb-4">New Users</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={userChartData}>
              <defs>
                <linearGradient id="userGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Area type="monotone" dataKey="users" stroke="#22c55e" fill="url(#userGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Revenue</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={revenueChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => [`$${v}`, 'Revenue']} />
              <Bar dataKey="revenue" fill="#4d64ff" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="card p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Gift Themes</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={themeData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" paddingAngle={3}>
                {themeData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Delivery Channels</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={channelData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" paddingAngle={3}>
                {channelData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Gifts Sent Daily</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={giftsChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="gifts" fill="#a855f7" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Merchants */}
      <div className="card">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Top Merchants by Redemptions</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide border-b border-gray-100">
                <th className="px-5 py-3 text-left font-medium">#</th>
                <th className="px-5 py-3 text-left font-medium">Merchant</th>
                <th className="px-5 py-3 text-left font-medium">Redemptions</th>
                <th className="px-5 py-3 text-left font-medium">Total Redeemed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.top_merchants.map((m, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-5 py-3 text-gray-400 font-mono text-xs">{i + 1}</td>
                  <td className="px-5 py-3 font-medium text-gray-900">{m.name}</td>
                  <td className="px-5 py-3 text-gray-600">{m.redemption_count}</td>
                  <td className="px-5 py-3 text-gray-600">{parseFloat(m.total_redeemed).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
