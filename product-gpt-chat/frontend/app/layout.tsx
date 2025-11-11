import { AuthProvider } from '../lib/auth';
import './globals.css';

export const metadata = {
  title: 'Product GPT Chat',
  description: 'PulsePoint Product Intelligence Chat',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}

