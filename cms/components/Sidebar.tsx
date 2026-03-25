'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Users, Store, Tag, Gift, BarChart2, FileText, LogOut, ChevronRight, Settings } from 'lucide-react';
import { logout, getAdmin } from '@/lib/auth';

const NAV = [
  { href: '/dashboard',  label: 'Dashboard',  icon: LayoutDashboard },
  { href: '/users',      label: 'Users',       icon: Users },
  { href: '/merchants',  label: 'Merchants',   icon: Store },
  { href: '/categories', label: 'Categories',  icon: Tag },
  { href: '/gifts',      label: 'Gifts',       icon: Gift },
  { href: '/analytics',  label: 'Analytics',   icon: BarChart2 },
  { href: '/audit-logs', label: 'Audit Logs',  icon: FileText },
  { href: '/settings',   label: 'Settings',    icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();
  const admin    = getAdmin();

  function handleLogout() { logout(); router.push('/login'); }

  return (
    <aside className="fixed inset-y-0 left-0 w-60 bg-gray-900 flex flex-col z-40">
      <div className="flex items-center gap-3 px-5 py-5 border-b border-gray-800">
        <div className="w-9 h-9 bg-brand-600 rounded-lg flex items-center justify-center text-white text-lg">🎁</div>
        <div>
          <p className="font-bold text-white text-sm leading-none">Ehdy CMS</p>
          <p className="text-gray-400 text-xs mt-0.5">Admin Panel</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link key={href} href={href} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${active ? 'bg-brand-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
              <Icon size={18} className="shrink-0" />
              <span className="flex-1">{label}</span>
              {active && <ChevronRight size={14} className="opacity-60" />}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-gray-800 p-3">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-8 h-8 bg-brand-600 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">
            {admin?.first_name?.[0] ?? 'A'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium truncate">{admin?.first_name} {admin?.last_name}</p>
            <p className="text-gray-400 text-xs truncate">{admin?.role}</p>
          </div>
        </div>
        <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-red-400 transition-colors mt-1">
          <LogOut size={18} /> Sign out
        </button>
      </div>
    </aside>
  );
}
