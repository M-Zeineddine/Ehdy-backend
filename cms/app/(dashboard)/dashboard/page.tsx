'use client';

import { useEffect, useState } from 'react';
import { Users, Store, Gift, DollarSign, ShoppingBag, AlertCircle } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { format } from 'date-fns';
import api from '@/lib/api';
import StatCard from '@/components/StatCard';

interface DashboardData {
  stats: { total_users: number; total_merchants: number; gifts_today: number; total_revenue: number; total_redemptions: number; pending_merchants: number; };
  recent_gifts: { id: string; sender_name: string; recipient_name: string; recipient_email: string; sent_at: string; payment_status: string; theme: string; }[];
  charts: { gifts_by_day: { date: string; count: string }[]; revenue_by_day: { date: string; revenue: string }[]; };
}

const SC: Record<string, string> = { paid: 'badge-green', pending: 'badge-yellow', failed: 'badge-red' };
const TE: Record<string, string> = { birthday: '🎂', thank_you: '🙏', love: '❤️', thinking_of_you: '💭', just_because: '✨', congratulations: '🎉' };

export default function DashboardPage() {
  const [data, setData]       = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    api.get('/dashboard').then(r => setData(r.data.data)).catch(() => setError('Failed to load')).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" /></div>;
  if (error || !data) return <div className="flex items-center gap-2 text-red-600 p-4"><AlertCircle size={18} /> {error}</div>;

  const { stats, recent_gifts, charts } = data;
  const chartData = charts.gifts_by_day.map(d => ({
    date: format(new Date(d.date), 'MMM d'),
    gifts: parseInt(d.count),
    revenue: parseFloat(charts.revenue_by_day.find(r => r.date === d.date)?.revenue ?? '0'),
  }));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">Welcome back — here&apos;s what&apos;s happening with Kado</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <StatCard title="Total Users"       value={stats.total_users.toLocaleString()}           icon={Users}       color="blue" />
        <StatCard title="Total Merchants"   value={stats.total_merchants.toLocaleString()}       icon={Store}       color="green" />
        <StatCard title="Gifts Today"       value={stats.gifts_today.toLocaleString()}           icon={Gift}        color="purple" />
        <StatCard title="Total Revenue"     value={`$${stats.total_revenue.toLocaleString()}`}   icon={DollarSign}  color="orange" subtitle="All time" />
        <StatCard title="Total Redemptions" value={stats.total_redemptions.toLocaleString()}     icon={ShoppingBag} color="blue" />
        <StatCard title="Pending Approval"  value={stats.pending_merchants}                      icon={AlertCircle} color={stats.pending_merchants > 0 ? 'red' : 'green'} subtitle="Merchants awaiting verification" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="card p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Gifts Sent (Last 30 Days)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData}>
              <defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#4d64ff" stopOpacity={0.3} /><stop offset="95%" stopColor="#4d64ff" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Area type="monotone" dataKey="gifts" stroke="#4d64ff" fill="url(#g1)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="card p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Revenue (Last 30 Days)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => [`$${v}`, 'Revenue']} />
              <Bar dataKey="revenue" fill="#4d64ff" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <div className="px-5 py-4 border-b border-gray-100"><h3 className="font-semibold text-gray-900">Recent Gifts</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 text-gray-500 text-xs uppercase border-b border-gray-100">
              <th className="px-5 py-3 text-left">Sender</th><th className="px-5 py-3 text-left">Recipient</th>
              <th className="px-5 py-3 text-left">Theme</th><th className="px-5 py-3 text-left">Status</th>
              <th className="px-5 py-3 text-left">Sent</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {recent_gifts.map(g => (
                <tr key={g.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-900">{g.sender_name || '—'}</td>
                  <td className="px-5 py-3 text-gray-600">{g.recipient_name || g.recipient_email || '—'}</td>
                  <td className="px-5 py-3 capitalize">{TE[g.theme]} {g.theme?.replace(/_/g, ' ')}</td>
                  <td className="px-5 py-3"><span className={SC[g.payment_status] || 'badge-gray'}>{g.payment_status}</span></td>
                  <td className="px-5 py-3 text-gray-500">{g.sent_at ? format(new Date(g.sent_at), 'MMM d, HH:mm') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
