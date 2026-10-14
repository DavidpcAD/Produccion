'use client';
import type { ReactNode } from 'react';
// El DS de la app de Steven (superset del de Produccion: agrega --ds-bg, --ds-surface,
// --ds-text, --ds-nav-bg, etc. que usan SUS componentes). Importado acá, Next lo carga
// SOLO en las rutas /mantenimiento/*, sin tocar el resto de Produccion.
import '@/components/mantenimiento/ds/design-system.css';
import { DataStoreProvider } from '@/lib/mantenimiento/store';
import { ToastProvider } from '@/components/mantenimiento/local/Toast';

// Layout del módulo Mantenimiento (app de Steven embebida nativamente). Envuelve
// sus pantallas en SUS providers (store de datos + toasts). NO usa su AppShell:
// el menú, el tema y el gateo por rol los pone Produccion (su propio layout y
// sidebar). Así sus páginas quedan como contenido dentro del marco de Produccion.
export default function MantenimientoLayout({ children }: { children: ReactNode }) {
  return (
    <DataStoreProvider>
      <ToastProvider>{children}</ToastProvider>
    </DataStoreProvider>
  );
}
