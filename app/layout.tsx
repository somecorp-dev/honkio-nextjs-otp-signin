import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sign in with your phone',
  description: 'Phone number sign-in with one-time codes, built on HonkIO Verify.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <footer>
          Codes sent with <a href="https://honkio.ca">HonkIO</a>
        </footer>
      </body>
    </html>
  );
}
