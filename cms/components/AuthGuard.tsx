'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const authed = isAuthenticated();
    const path = pathname.replace(/\/$/, '') || '/';

    if (!authed && path !== '/login') {
      window.location.href = '/cms/login';
      return;
    }

    if (authed && path === '/login') {
      window.location.href = '/cms/dashboard';
      return;
    }

    setReady(true);
  }, [pathname]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}
