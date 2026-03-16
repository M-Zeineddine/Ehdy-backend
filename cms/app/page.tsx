'use client';

import { useEffect } from 'react';

export default function RootPage() {
  useEffect(() => {
    window.location.href = '/cms/dashboard';
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
    </div>
  );
}
