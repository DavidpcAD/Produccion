// Skeleton del design system. Reemplaza los `animate-pulse` ad-hoc.
// Usa la clase .ds-skeleton (shimmer con tokens ds-gray) definida en globals.css.

export function Skeleton({ className = '', rounded = 'rounded-ds' }: { className?: string; rounded?: string }) {
  return <div aria-hidden="true" className={`ds-skeleton ${rounded} ${className}`} />;
}

// Varias líneas de texto (para párrafos / celdas).
export function SkeletonText({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-3.5 ${i === lines - 1 ? 'w-2/3' : 'w-full'}`} rounded="rounded-full" />
      ))}
    </div>
  );
}

// Grilla de tarjetas en carga (cuadrillas, roles, apps…).
export function SkeletonCards({ count = 6, className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3', height = 'h-32' }: {
  count?: number; className?: string; height?: string;
}) {
  return (
    <div className={className} aria-hidden="true" role="status" aria-label="Cargando…">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-ds-lg border border-ds-gray-200 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Skeleton className="w-8 h-8 shrink-0" />
            <Skeleton className="h-4 flex-1" rounded="rounded-full" />
          </div>
          <SkeletonText lines={2} />
          <Skeleton className={`${height} w-full`} rounded="rounded-ds-lg" />
        </div>
      ))}
    </div>
  );
}

// Filas de lista/tabla en carga.
export function SkeletonRows({ rows = 5, className = '' }: { rows?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden="true" role="status" aria-label="Cargando…">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-ds border border-ds-gray-100 px-4 py-3">
          <Skeleton className="w-9 h-9 shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-1/3" rounded="rounded-full" />
            <Skeleton className="h-3 w-1/2" rounded="rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
