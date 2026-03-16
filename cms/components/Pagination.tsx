'use client';

interface PaginationProps { page: number; pages: number; total: number; limit: number; onPage: (p: number) => void; }

export default function Pagination({ page, pages, total, limit, onPage }: PaginationProps) {
  const from = (page - 1) * limit + 1;
  const to   = Math.min(page * limit, total);
  const nums = Array.from({ length: Math.min(pages, 7) }, (_, i) => i + 1);

  return (
    <div className="flex items-center justify-between px-1 py-2 text-sm text-gray-500">
      <span>Showing {from}–{to} of {total}</span>
      <div className="flex items-center gap-1">
        <button className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 text-gray-700" onClick={() => onPage(page - 1)} disabled={page <= 1}>← Prev</button>
        {nums.map(p => (
          <button key={p} onClick={() => onPage(p)} className={`w-9 h-9 rounded-lg border text-sm font-medium ${p === page ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}>{p}</button>
        ))}
        <button className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 text-gray-700" onClick={() => onPage(page + 1)} disabled={page >= pages}>Next →</button>
      </div>
    </div>
  );
}
