'use client';

import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import api from '@/lib/api';
import Header from '@/components/Header';

interface Category {
  id: string; name: string; slug: string; description: string | null;
  icon_url: string | null; display_order: number; is_active: boolean;
  merchant_count: string;
}

interface FormState { name: string; slug: string; description: string; icon_url: string; display_order: number; }
const EMPTY: FormState = { name: '', slug: '', description: '', icon_url: '', display_order: 0 };

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);
  const [editId, setEditId]         = useState<string | null>(null);
  const [form, setForm]             = useState<FormState>(EMPTY);
  const [saving, setSaving]         = useState(false);

  const load = () => {
    setLoading(true);
    api.get('/categories')
      .then(res => setCategories(res.data.data.categories))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  function autoSlug(name: string) {
    return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  }

  function startEdit(cat: Category) {
    setEditId(cat.id);
    setForm({ name: cat.name, slug: cat.slug, description: cat.description ?? '', icon_url: cat.icon_url ?? '', display_order: cat.display_order });
    setShowForm(true);
  }

  function startNew() {
    setEditId(null);
    setForm(EMPTY);
    setShowForm(true);
  }

  async function save() {
    setSaving(true);
    try {
      if (editId) {
        await api.patch(`/categories/${editId}`, form);
      } else {
        await api.post('/categories', form);
      }
      setShowForm(false);
      load();
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(cat: Category) {
    await api.patch(`/categories/${cat.id}`, { is_active: !cat.is_active });
    load();
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Delete category "${name}"?`)) return;
    await api.delete(`/categories/${id}`);
    load();
  }

  return (
    <div>
      <Header
        title="Categories"
        subtitle={`${categories.length} categories`}
        actions={
          <button className="btn-primary" onClick={startNew}>
            <Plus size={16} /> Add Category
          </button>
        }
      />

      {/* Form */}
      {showForm && (
        <div className="card p-6 mb-6">
          <h3 className="font-semibold text-gray-900 mb-4">{editId ? 'Edit Category' : 'New Category'}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input
                className="input"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value, slug: autoSlug(e.target.value) }))}
                placeholder="e.g. Restaurants"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Slug *</label>
              <input
                className="input"
                value={form.slug}
                onChange={e => setForm(f => ({ ...f, slug: e.target.value }))}
                placeholder="e.g. restaurants"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Icon URL</label>
              <input
                className="input"
                value={form.icon_url}
                onChange={e => setForm(f => ({ ...f, icon_url: e.target.value }))}
                placeholder="https://…"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Display Order</label>
              <input
                type="number"
                className="input"
                value={form.display_order}
                onChange={e => setForm(f => ({ ...f, display_order: parseInt(e.target.value) || 0 }))}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                className="input resize-none"
                rows={2}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Optional description…"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4">
            <button className="btn-primary" onClick={save} disabled={saving || !form.name || !form.slug}>
              <Check size={15} /> {saving ? 'Saving…' : 'Save'}
            </button>
            <button className="btn-secondary" onClick={() => setShowForm(false)}>
              <X size={15} /> Cancel
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide border-b border-gray-100">
                <th className="px-5 py-3 text-left font-medium">Order</th>
                <th className="px-5 py-3 text-left font-medium">Name</th>
                <th className="px-5 py-3 text-left font-medium">Slug</th>
                <th className="px-5 py-3 text-left font-medium">Merchants</th>
                <th className="px-5 py-3 text-left font-medium">Status</th>
                <th className="px-5 py-3 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-gray-400">Loading…</td></tr>
              ) : categories.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-gray-400">No categories yet</td></tr>
              ) : categories.map(cat => (
                <tr key={cat.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 text-gray-400 font-mono text-xs">{cat.display_order}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      {cat.icon_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={cat.icon_url} alt="" className="w-5 h-5 object-contain" />
                      )}
                      <span className="font-medium text-gray-900">{cat.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-gray-500">{cat.slug}</td>
                  <td className="px-5 py-3 text-gray-600">{cat.merchant_count}</td>
                  <td className="px-5 py-3">
                    <button onClick={() => toggleActive(cat)}>
                      {cat.is_active
                        ? <span className="badge-green cursor-pointer">Active</span>
                        : <span className="badge-red cursor-pointer">Inactive</span>}
                    </button>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => startEdit(cat)} className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded" title="Edit">
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => remove(cat.id, cat.name)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded" title="Delete">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
