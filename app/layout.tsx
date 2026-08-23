import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Assistant, Frank_Ruhl_Libre } from 'next/font/google';

import { documentLocale, documentStrings } from '@/lib/uiStrings';

import './globals.css';

/**
 * The font pairing is inherited from the Gali frontend: Assistant for UI text,
 * Frank Ruhl Libre as the editorial Hebrew display face. Loaded through
 * `next/font` rather than a stylesheet link, so the files are self-hosted at
 * build time and no request leaves the browser for a third party.
 */
const uiFont = Assistant({
  subsets: ['hebrew', 'latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-ui',
  display: 'swap',
});

const displayFont = Frank_Ruhl_Libre({
  subsets: ['hebrew', 'latin'],
  weight: ['400', '500', '700', '900'],
  variable: '--font-display',
  display: 'swap',
});

export const metadata: Metadata = {
  title: documentStrings.title,
  description: documentStrings.description,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang={documentLocale.language}
      dir={documentLocale.direction}
      className={`${uiFont.variable} ${displayFont.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
