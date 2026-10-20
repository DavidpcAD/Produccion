'use client';
import type { ReactNode } from 'react';
// El DS de la app de Steven (superset del de Produccion: agrega --ds-bg, --ds-surface,
// --ds-text, --ds-nav-bg, etc. que usan SUS componentes). Importado acá, Next lo carga
// SOLO en las rutas /mantenimiento/*, sin tocar el resto de Produccion.
import '@/components/mantenimiento/ds/design-system.css';
// Ajustes para celular de todo el módulo (tablas → tarjetas, títulos, filtros).
import '@/components/mantenimiento/local/movil.css';
import { DataStoreProvider } from '@/lib/mantenimiento/store';
import { ToastProvider } from '@/components/mantenimiento/local/Toast';

// Layout del módulo Mantenimiento (app de Steven embebida nativamente). Envuelve
// sus pantallas en SUS providers (store de datos + toasts). NO usa su AppShell:
// el menú, el tema y el gateo por rol los pone Produccion (su propio layout y
// sidebar). Así sus páginas quedan como contenido dentro del marco de Produccion.
// El padding (16px móvil / 24px desde sm) es el mismo del PageShell de Produccion:
// sin él las pantallas quedaban pegadas al borde del contenido.
export default function MantenimientoLayout({ children }: { children: ReactNode }) {
  return (
    <DataStoreProvider>
      <ToastProvider>
        <div className="mnt-pagina p-4 sm:p-6 min-w-0">{children}</div>
      </ToastProvider>
    </DataStoreProvider>
  );
}
