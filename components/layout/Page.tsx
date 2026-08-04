'use client';
import type { ReactNode } from 'react';

// ─── Shell + Header canónicos de página ───────────────────────────────────────
// Fuente única del "marco" de cada pantalla, para que TODA la app se vea igual.
// Reemplaza los wrappers ad-hoc (p-8, max-w variados, headers text-2xl, etc.).
//
// Uso:
//   <PageShell>
//     <PageHeader title="Obras" subtitle="12 obras activas"
//                 actions={<Button>Nueva</Button>} />
//     ...filtros, tabla, etc...
//   </PageShell>

export function PageShell({
  children,
  width = 'wide',
  className = '',
}: {
  children: ReactNode;
  /** wide = listados/tablas (1600px) · narrow = formularios/detalle (1200px) */
  width?: 'wide' | 'narrow' | 'full';
  className?: string;
}) {
  const max =
    width === 'full' ? '' : width === 'narrow' ? 'max-w-[1200px]' : 'max-w-[1600px]';
  return (
    // Padding responsive: 16px en móvil (alineado al topbar px-4, aprovecha el
    // ancho en pantallas chicas) y 24px desde sm en adelante.
    <div className={`p-4 sm:p-6 space-y-5 ${max} mx-auto animate-fade-in ${className}`}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  back,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Botonera a la derecha (acciones primarias de la pantalla). */
  actions?: ReactNode;
  /** Slot opcional a la izquierda del título (ej. botón Volver en detalles). */
  back?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div className="flex items-start gap-3 min-w-0">
        {back}
        <div className="min-w-0">
          {typeof title === 'string' ? (
            <h1 className="text-heading font-bold text-ds-ink">{title}</h1>
          ) : (
            title
          )}
          {subtitle && <p className="text-ds-gray-400 text-body-sm mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2.5 flex-wrap shrink-0">{actions}</div>}
    </div>
  );
}
