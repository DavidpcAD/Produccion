'use client';
// Error boundary del área protegida: si una pantalla revienta al renderizar,
// mostramos una tarjeta del Design System con opción de reintentar, en vez de
// la pantalla de error cruda de Next.
import { useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ds/Icon/Icon';

export default function ProtectedError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Deja rastro en consola para diagnóstico (no expone el error al usuario).
    console.error('Error de render en área protegida:', error);
  }, [error]);

  return (
    <div className="p-6 max-w-[1600px] mx-auto animate-fade-in">
      <div className="bg-ds-surface rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-12 text-center">
        <div className="w-12 h-12 rounded-ds bg-ds-red/10 text-ds-red flex items-center justify-center mx-auto mb-4">
          <Icon name="alert" size="lg" color="currentColor" />
        </div>
        <h1 className="text-sub-sm font-bold text-ds-ink">Algo salió mal</h1>
        <p className="text-ds-gray-400 text-body-sm mt-1 mb-5 max-w-md mx-auto">
          Ocurrió un error al cargar esta sección. Podés reintentar; si sigue fallando, avisá a TI.
        </p>
        <Button onClick={() => reset()} icon={<Icon name="arrow-right" size="sm" color="currentColor" />}>
          Reintentar
        </Button>
      </div>
    </div>
  );
}
