'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logout, getAdmin } from '@/lib/auth';

const nav = [
  { href: '/cms/dashboard', label: 'Dashboard', icon: '▦' },
  { href: '/cms/users', label: 'Users', icon: '👤' },
  { href: '/cms/merchants', label: 'Merchants', icon: '🏪' },
  { href: '/cms/gifts', label: 'Gifts', icon: '🎁' },
  { href: '/cms/categories', label: 'Categories', icon: '🏷️' },
  { href: '/cms/analytics', label: 'Analytics', icon: '📊' },
  { href: '/cms/audit-logs', label: 'Audit Logs', icon: '📋' },
  { href: '/cms/settings', label: 'Settings', icon: '⚙️' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const admin = getAdmin();

  const handleLogout = () => {
    logout();
    window.location.href = '/cms/login';
  };

  return (
    <aside className="w-60 bg-gray-900 text-white flex flex-col min-h-screen">
      <div className="px-6 py-5 border-b border-gray-700">
        <span className="text-xl font-bold text-brand-500">Kado CMS</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {nav.map(({ href, label, icon }) => {
          const active = pathname.replace(/\/$/, '') === href.replace('/cms', '') ||
                         pathname === href.replace('/cms', '') + '/';
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                active ? 'bg-brand-600 text-white' : 'text-gray-300 hover:bg-gray-800'
              }`}
            >
              <span>{icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="px-4 py-4 border-t border-gray-700">
        <p className="text-xs text-gray-400 mb-1">{admin?.email ?? ''}</p>
        <p className="text-xs text-gray-500 mb-3 capitalize">{admin?.role ?? ''}</p>
        <button
          onClick={handleLogout}
          className="w-full text-left text-sm text-gray-400 hover:text-white transition-colors"
        >
          Sign out →
        </button>
      </div>
    </aside>
  );
}
