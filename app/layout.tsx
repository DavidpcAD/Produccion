import type { Metadata } from 'next';
import { Roboto } from 'next/font/google';
import './globals.css';
import '@/components/ds/design-system.css';
import { ToastProvider } from '@/components/ui/Toast';
import { ConfirmProvider } from '@/components/ui/Confirm';

const roboto = Roboto({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-roboto',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Adelante Desarrollos — Producción',
  description: 'Sistema de producción de obra: obras, partidas, cuadrillas, presupuestos, pedidos y aprobaciones',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="h-full">
      <body className={`${roboto.className} h-full`}>
        <ToastProvider>
          <ConfirmProvider>
            {children}
          </ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
