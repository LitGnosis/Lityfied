import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Lityfied | Modern essentials',
  description: 'A curated collection of elevated everyday goods.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
