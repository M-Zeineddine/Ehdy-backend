'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';

interface AuditLog {
  id: string;
  admin_email: string;
  action: string;
  entity_type: string;
  entity_id: string;
  diff: Record<string, unknown> | null;
  created_at: string;
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const limit = 30;

  useEffect(() => {
    api.get('/v1/admin/audit-logs', { params: { page, limit } }).then((r) => {
      setLogs(r.data.logs);
      setTotal(r.data.total);
    });
  }, [page]);

  const pages = Math.ceil(total / limit);

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold text-gray-800">Audit Logs</h1>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              {['Admin', 'Action', 'Entity', 'Entity ID', 'Date', ''].map((h) => (
                <th key={h} className="px-5 py-3 text-left font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {logs.map((l) => (
              <>
                <tr key={l.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 text-gray-600">{l.admin_email}</td>
                  <td className="px-5 py-3 font-mono text-xs">{l.action}</td>
                  <td className="px-5 py-3 text-gray-500">{l.entity_type}</td>
                  <td className="px-5 py-3 font-mono text-xs text-gray-400">{l.entity_id?.slice(0, 8)}…</td>
                  <td className="px-5 py-3 text-gray-400">{new Date(l.created_at).toLocaleString()}</td>
                  <td className="px-5 py-3">
                    {l.diff && (
                      <button onClick={() => setExpanded(expanded === l.id ? null : l.id)}
                        className="text-brand-600 hover:underline text-xs">
                        {expanded === l.id ? 'Hide' : 'Diff'}
                      </button>
                    )}
                  </td>
                </tr>
                {expanded === l.id && l.diff && (
                  <tr key={`${l.id}-diff`}>
                    <td colSpan={6} className="px-5 py-3 bg-gray-50">
                      <pre className="text-xs text-gray-700 overflow-x-auto whitespace-pre-wrap">
                        {JSON.stringify(l.diff, null, 2)}
                      </pre>
                    </td>
                  </tr>
                )}
              </>
            ))}
            {logs.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400">No audit logs yet</td></tr>
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
