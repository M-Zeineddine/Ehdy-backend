'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';

interface Category {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  merchant_count: number;
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const load = () => api.get('/v1/admin/categories').then((r) => setCategories(r.data.categories));

  useEffect(() => { load(); }, []);

  const toSlug = (s: string) => s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  const handleNameChange = (v: string) => {
    setName(v);
    if (!editId) setSlug(toSlug(v));
  };

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (editId) {
        await api.patch(`/v1/admin/categories/${editId}`, { name, slug });
        setEditId(null);
      } else {
        await api.post('/v1/admin/categories', { name, slug });
      }
      setName('');
      setSlug('');
      load();
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (id: string) => {
    await api.patch(`/v1/admin/categories/${id}`, { toggle_active: true });
    load();
  };

  const startEdit = (c: Category) => {
    setEditId(c.id);
    setName(c.name);
    setSlug(c.slug);
  };

  const cancel = () => {
    setEditId(null);
    setName('');
    setSlug('');
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Categories</h1>

      <div className="bg-white rounded-xl shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">
          {editId ? 'Edit Category' : 'New Category'}
        </h2>
        <div className="flex gap-3">
          <input type="text" placeholder="Name" value={name} onChange={(e) => handleNameChange(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-brand-500" />
          <input type="text" placeholder="Slug" value={slug} onChange={(e) => setSlug(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-40 focus:outline-none focus:ring-2 focus:ring-brand-500" />
          <button onClick={save} disabled={saving || !name.trim()}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm rounded-lg disabled:opacity-50">
            {saving ? '…' : editId ? 'Update' : 'Add'}
          </button>
          {editId && (
            <button onClick={cancel} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-sm rounded-lg">
              Cancel
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              {['Name', 'Slug', 'Merchants', 'Status', ''].map((h) => (
                <th key={h} className="px-5 py-3 text-left font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {categories.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-5 py-3 font-medium">{c.name}</td>
                <td className="px-5 py-3 text-gray-500 font-mono text-xs">{c.slug}</td>
                <td className="px-5 py-3 text-gray-500">{c.merchant_count ?? 0}</td>
                <td className="px-5 py-3">
                  <button onClick={() => toggleActive(c.id)}
                    className={`px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer ${
                      c.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                    {c.is_active ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="px-5 py-3">
                  <button onClick={() => startEdit(c)} className="text-brand-600 hover:underline text-xs">Edit</button>
                </td>
              </tr>
            ))}
            {categories.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-400">No categories yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
