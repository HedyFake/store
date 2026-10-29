import type { Metadata } from 'next';
import './globals.css';
import { StoreProvider } from '@/components/store-provider';

export const metadata: Metadata = {
  title: 'Pasti Murahnya — Pasti Murah, Pasti Puas! | Belanja Hemat, Tanpa Ragu',
  description:
    'Pastimurah menyediakan berbagai kebutuhan dengan harga terjangkau tanpa mengorbankan kualitas. Belanja mudah, pelayanan ramah, dan harganya pasti murah.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400..500;1,6..72,400..500&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
        />
      </head>
      <body className="font-sans bg-background text-ink antialiased">
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}
