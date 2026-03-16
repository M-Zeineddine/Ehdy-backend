'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const pathname = usePathname();

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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  return <>{children}</>;
}
