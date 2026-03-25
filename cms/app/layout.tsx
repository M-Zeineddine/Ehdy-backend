import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ehdy CMS',
  description: 'Ehdy Admin Control Panel',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
