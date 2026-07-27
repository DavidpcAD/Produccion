// Loading de ruta del área protegida: se muestra durante la navegación entre
// pantallas, con esqueletos del Design System (en vez de un salto en blanco).
import { Skeleton } from '@/components/ui/Skeleton';

export default function ProtectedLoading() {
  return (
    <div className="p-6 space-y-5 max-w-[1600px] mx-auto animate-fade-in" role="status" aria-label="Cargando…">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" rounded="rounded-ds" />
        <Skeleton className="h-4 w-72" rounded="rounded-full" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 w-full" rounded="rounded-ds-lg" />)}
      </div>
      <Skeleton className="h-72 w-full" rounded="rounded-ds-lg" />
    </div>
  );
}
