'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageShell, PageHeader } from '@/components/layout/Page';
import { Skeleton } from '@/components/ui/Skeleton';
import { CatalogoTabs } from '@/components/layout/CatalogoTabs';
import { useToast } from '@/components/ui/Toast';
import type { SprintCatalogoDetalle } from '@/lib/avance/sprints';

/**
 * Admin · Catálogo de sprints — portado de obrascontrol (SprintsPantalla).
 * Secuencia global de sprints; marca/desmarca cada sprint como "de espera".
 *
 * La gestión de SEMANAS operativas (abrir semana / re-fijar línea base) se movió
 * al Kanban de Avance (Programación): /avance?vista=kanban.
 */
export default function SprintsPage() {
  return (
    <PageShell>
      <PageHeader
        title="Sprints"
        subtitle="Catálogo global de sprints. La gestión de semanas operativas está en el Kanban de Avance."
      />

      <CatalogoTabs />

      <SeccionSprints />
    </PageShell>
  );
}

// ============================================================ Sprints
function SeccionSprints() {
  const { toast } = useToast();
  const [sprints, setSprints] = useState<SprintCatalogoDetalle[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState<number | null>(null);

  const recargar = useCallback(() => {
    setCargando(true);
    fetch('/api/avance/sprints')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('No autorizado'))))
      .then((d) => setSprints((d.sprints as SprintCatalogoDetalle[]) ?? []))
      .catch(() => toast('No se pudieron cargar los sprints.', 'error'))
      .finally(() => setCargando(false));
  }, [toast]);
  useEffect(() => recargar(), [recargar]);

  async function toggleEspera(s: SprintCatalogoDetalle, esEspera: boolean) {
    if (esEspera && s.criticas > 0) {
      return toast(
        `El sprint ${s.numero_global} tiene ${s.criticas} sub-partida(s) crítica(s). Un sprint de espera no puede tenerlas.`,
        'error',
      );
    }
    setGuardando(s.numero_global);
    try {
      const r = await fetch(`/api/avance/sprints/${s.numero_global}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ es_espera: esEspera }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Error');
      setSprints((xs) =>
        xs.map((x) => (x.numero_global === s.numero_global ? { ...x, es_espera: esEspera } : x)),
      );
      toast(
        `Sprint ${s.numero_global}: ${esEspera ? 'marcado' : 'desmarcado'} como espera.`,
        'success',
      );
    } catch (e) {
      toast(`No se pudo actualizar: ${e instanceof Error ? e.message : e}`, 'error');
    } finally {
      setGuardando(null);
    }
  }

  return (
    <section>
      <h2 className="mb-1 text-sub-sm font-bold">Catálogo de sprints</h2>
      <p className="mb-4 text-sm text-ds-gray-500">
        Secuencia global de sprints. Marcá un sprint como <strong>de espera</strong> (colado/curado)
        — no debe tener sub-partidas. La asignación de sub-partidas a cada sprint se hace en
        Sub-partidas.
      </p>

      <div className="overflow-x-auto rounded-ds border border-ds-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-ds-gray-100 text-left">
            <tr>
              <th className="px-3 py-2 text-center">#</th>
              <th className="px-3 py-2">Código</th>
              <th className="px-3 py-2">Nombre</th>
              <th className="px-3 py-2">Categoría</th>
              <th className="px-3 py-2 text-center">Críticas</th>
              <th className="px-3 py-2 text-center">De espera</th>
            </tr>
          </thead>
          <tbody>
            {cargando && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center">
                  <Skeleton className="h-4 w-48 mx-auto" rounded="rounded-full" />
                </td>
              </tr>
            )}
            {!cargando && sprints.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-ds-gray-400">
                  Sin sprints en el catálogo.
                </td>
              </tr>
            )}
            {!cargando &&
              sprints.map((s) => (
                <tr
                  key={s.numero_global}
                  className={`border-t border-ds-gray-100 ${s.es_espera ? 'bg-ds-yellow/10' : ''}`}
                >
                  <td className="px-3 py-2 text-center font-mono font-semibold tabular-nums">
                    {s.numero_global}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-ds-gray-500">{s.codigo}</td>
                  <td className="px-3 py-2">{s.nombre}</td>
                  <td className="px-3 py-2 text-xs text-ds-gray-500">{s.categoria}</td>
                  <td className="px-3 py-2 text-center tabular-nums">
                    {s.criticas > 0 ? s.criticas : '—'}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={s.es_espera}
                      disabled={guardando === s.numero_global}
                      onChange={(e) => toggleEspera(s, e.target.checked)}
                      className="h-4 w-4 accent-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
                    />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
