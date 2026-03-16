'use client';

import { getAdmin } from '@/lib/auth';

interface HeaderProps {
  title: string;
}

export default function Header({ title }: HeaderProps) {
  const admin = getAdmin();

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
      <h1 className="text-xl font-semibold text-gray-800">{title}</h1>
      <div className="text-sm text-gray-500">
        {admin ? `${admin.first_name} ${admin.last_name}` : ''}
      </div>
    </header>
  );
}
