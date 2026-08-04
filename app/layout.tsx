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
    <html lang="es" className="h-full" suppressHydrationWarning>
      <head>
        {/* No-flash: aplica el tema guardado antes del paint. Default LIGHT hasta que
            el dark mode esté completo en toda la app; entonces se reactiva el auto por
            prefers-color-scheme. Por ahora solo dark si el usuario lo eligió (toggle). */}
        <script dangerouslySetInnerHTML={{ __html:
          `(function(){try{var t=localStorage.getItem('adelante_oc_theme')||'light';document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`
        }} />
      </head>
      <body className={`${roboto.variable} ${roboto.className} h-full`}>
        <ToastProvider>
          <ConfirmProvider>
            {children}
          </ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
