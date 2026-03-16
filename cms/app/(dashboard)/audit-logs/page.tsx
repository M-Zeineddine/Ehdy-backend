'use client';

import { useEffect, useState, useCallback } from 'react';
import { Search } from 'lucide-react';
import { format } from 'date-fns';
import api from '@/lib/api';
import Header from '@/components/Header';
import Pagination from '@/components/Pagination';

interface AuditLog {
  id: string; action: string; resource_type: string; resource_id: string;
  old_values: Record<string, unknown> | null; new_values: Record<string, unknown> | null;
  ip_address: string | null; created_at: string;
  user_email: string | null; first_name: string | null; last_name: string | null;
}

interface PaginationData { total: number; page: number; limit: number; pages: number; }

const ACTION_COLOR: Record<string, string> = {
  create: 'badge-green', update: 'badge-blue', delete: 'badge-red',
  login: 'badge-blue', logout: 'badge-gray',
};

export default function AuditLogsPage() {
  const [logs, setLogs]           = useState<AuditLog[]>([]);
  const [pagination, setPag]      = useState<PaginationData>({ total: 0, page: 1, limit: 30, pages: 0 });
  const [search, setSearch]       = useState('');
  const [resourceType, setRT]     = useState('');
  const [page, setPage]           = useState(1);
  const [loading, setLoading]     = useState(true);
  const [expanded, setExpanded]   = useState<string | null>(null);

  const fetchLogs = useCallback(() => {
    setLoading(true);
    api.get('/audit-logs', {
      params: { action: search || undefined, resource_type: resourceType || undefined, page, limit: 30 },
    })
      .then(res => {
        setLogs(res.data.data.logs);
        setPag(res.data.data.pagination);
      })
      .finally(() => setLoading(false));
  }, [search, resourceType, page]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  return (
    <div>
      <Header title="Audit Logs" subtitle={`${pagination.total.toLocaleString()} log entries`} />

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9"
            placeholder="Filter by action…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <select className="input w-40" value={resourceType} onChange={e => { setRT(e.target.value); setPage(1); }}>
          <option value="">All resources</option>
          <option value="user">User</option>
          <option value="merchant">Merchant</option>
          <option value="gift">Gift</option>
          <option value="purchase">Purchase</option>
          <option value="redemption">Redemption</option>
        </select>
      </div>

      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide border-b border-gray-100">
                <th className="px-5 py-3 text-left font-medium">Time</th>
                <th className="px-5 py-3 text-left font-medium">User</th>
                <th className="px-5 py-3 text-left font-medium">Action</th>
                <th className="px-5 py-3 text-left font-medium">Resource</th>
                <th className="px-5 py-3 text-left font-medium">Resource ID</th>
                <th className="px-5 py-3 text-left font-medium">IP</th>
                <th className="px-5 py-3 text-left font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-gray-400">Loading…</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-gray-400">No logs found</td></tr>
              ) : logs.map(log => (
                <>
                  <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 text-gray-500 text-xs whitespace-nowrap">
                      {format(new Date(log.created_at), 'MMM d, HH:mm:ss')}
                    </td>
                    <td className="px-5 py-3">
                      {log.user_email ? (
                        <div>
                          <p className="text-gray-900">{log.first_name} {log.last_name}</p>
                          <p className="text-gray-400 text-xs">{log.user_email}</p>
                        </div>
                      ) : (
                        <span className="text-gray-400">System</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span className={ACTION_COLOR[log.action?.toLowerCase()] || 'badge-gray'}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="badge-gray capitalize">{log.resource_type}</span>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-gray-500">
                      {log.resource_id ? log.resource_id.slice(0, 8) + '…' : '—'}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-gray-500">{log.ip_address || '—'}</td>
                    <td className="px-5 py-3">
                      {(log.old_values || log.new_values) && (
                        <button
                          onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                          className="text-xs text-brand-600 hover:underline"
                        >
                          {expanded === log.id ? 'Hide' : 'View diff'}
                        </button>
                      )}
                    </td>
                  </tr>
                  {expanded === log.id && (
                    <tr key={`${log.id}-detail`} className="bg-gray-50">
                      <td colSpan={7} className="px-5 py-4">
                        <div className="grid grid-cols-2 gap-4">
                          {log.old_values && (
                            <div>
                              <p className="text-xs font-medium text-gray-500 mb-1">Before</p>
                              <pre className="text-xs bg-red-50 text-red-700 p-3 rounded-lg overflow-auto max-h-40">
                                {JSON.stringify(log.old_values, null, 2)}
                              </pre>
                            </div>
                          )}
                          {log.new_values && (
                            <div>
                              <p className="text-xs font-medium text-gray-500 mb-1">After</p>
                              <pre className="text-xs bg-green-50 text-green-700 p-3 rounded-lg overflow-auto max-h-40">
                                {JSON.stringify(log.new_values, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
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
