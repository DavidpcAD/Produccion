'use client';

import { useEffect, useMemo, useState } from 'react';
import { Select } from '@/components/ui/Input';
import type { PendienteItem } from '@/lib/avance/reporte-pendientes';

/**
 * Reporte de Pendientes arrastrados — portado de obrascontrol (PendientesVista).
 * Sub-partidas de sprints anteriores al sprint_actual de cada obra en
 * construcción, sin completar. Agrupable por obra o por sub-partida, filtrable
 * por proyecto. Datos de /api/avance/reportes/pendientes.
 */

type Agrupar = 'obra' | 'sub';

export default function ReportePendientesPage() {
  const [items, setItems] = useState<PendienteItem[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agrupar, setAgrupar] = useState<Agrupar>('sub');
  const [proyecto, setProyecto] = useState<string>('TODOS');

  useEffect(() => {
    setCargando(true);
    fetch('/api/avance/reportes/pendientes')
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Error');
        return r.json();
      })
      .then((d) => setItems((d.data?.items ?? []) as PendienteItem[]))
      .catch((e) => setError(e instanceof Error ? e.message : 'Error al cargar los pendientes.'))
      .finally(() => setCargando(false));
  }, []);

  const proyectos = useMemo(() => [...new Set(items.map((i) => i.proyecto))].sort(), [items]);
  const filtrados = useMemo(
    () => (proyecto === 'TODOS' ? items : items.filter((i) => i.proyecto === proyecto)),
    [items, proyecto],
  );

  const kpis = useMemo(() => {
    const obras = new Set(filtrados.map((i) => i.obra));
    return {
      pendientes: filtrados.length,
      obras: obras.size,
      conNC: filtrados.filter((i) => i.nc_causa).length,
      sinAvance: filtrados.filter((i) => i.pct <= 0).length,
      tresSem: filtrados.filter((i) => i.sem_arrastrada >= 3).length,
    };
  }, [filtrados]);

  const grupos = useMemo(() => {
    const m = new Map<string, PendienteItem[]>();
    for (const i of filtrados) {
      const clave = agrupar === 'sub' ? i.sub_nombre : i.obra;
      const arr = m.get(clave) ?? [];
      arr.push(i);
      m.set(clave, arr);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b, 'es', { numeric: true }));
  }, [filtrados, agrupar]);

  return (
    <main className="page mx-auto w-full max-w-6xl px-4 py-6">
      <div className="mb-2">
        <h1 className="text-heading font-bold">Pendientes arrastrados</h1>
        <p className="text-ds-gray-500">
          Sub-partidas de sprints ya pasados que las obras en construcción aún no completan.
        </p>
      </div>

      {error && (
        <p className="my-4 rounded-ds border border-ds-red bg-ds-red/5 px-4 py-3 text-sm text-ds-red">
          {error}
        </p>
      )}

      {cargando ? (
        <p className="text-ds-gray-400">Cargando pendientes…</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-56">
              <Select
                value={proyecto}
                onChange={(e) => setProyecto(e.target.value)}
                options={[
                  { value: 'TODOS', label: 'Todos los proyectos' },
                  ...proyectos.map((p) => ({ value: p, label: p })),
                ]}
              />
            </div>
            <div className="inline-flex rounded-ds border border-ds-gray-200 p-0.5">
              {(
                [
                  ['obra', 'Por Obra'],
                  ['sub', 'Por Sub-partida'],
                ] as [Agrupar, string][]
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setAgrupar(v)}
                  className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                    agrupar === v ? 'bg-brand text-black' : 'text-ds-gray-500 hover:text-black'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Kpi label="Pendientes" value={kpis.pendientes} />
            <Kpi label="Obras afectadas" value={kpis.obras} />
            <Kpi label="Con NC" value={kpis.conNC} />
            <Kpi label="Sin avance" value={kpis.sinAvance} accent={kpis.sinAvance > 0 ? 'red' : undefined} />
            <Kpi label="≥3 sem." value={kpis.tresSem} accent={kpis.tresSem > 0 ? 'red' : undefined} />
          </div>

          {grupos.length === 0 && (
            <p className="rounded-ds border border-dashed border-ds-gray-200 p-6 text-center text-sm text-ds-gray-400">
              No hay pendientes arrastrados.
            </p>
          )}

          {grupos.map(([clave, lista]) => (
            <section key={clave} className="overflow-hidden rounded-ds-lg border border-ds-gray-200 bg-white shadow-ds-01">
              <div className="flex items-center justify-between border-b border-ds-gray-200 bg-ds-gray-50 px-3 py-1.5">
                <span className="text-sm font-semibold">
                  {agrupar === 'sub' && lista[0]?.es_critica && <span className="mr-1 text-ds-red">●</span>}
                  {clave}
                </span>
                <span className="text-xs text-ds-gray-500">{lista.length} obras</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-ds-gray-200 text-xs uppercase tracking-wide text-ds-gray-500">
                      <th className="px-3 py-1.5 text-left">{agrupar === 'sub' ? 'Obra' : 'Sub-partida'}</th>
                      <th className="px-3 py-1.5 text-left">Tipo</th>
                      <th className="px-3 py-1.5 text-left">Proyecto</th>
                      <th className="px-3 py-1.5 text-left">Sprint origen</th>
                      <th className="px-3 py-1.5 text-right">% Avance</th>
                      <th className="px-3 py-1.5 text-left">NC</th>
                      <th className="px-3 py-1.5 text-right">Sem.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map((i) => (
                      <tr key={`${i.obra}|${i.sub_id}`} className="border-b border-ds-gray-100 last:border-0">
                        <td className="px-3 py-1.5 font-mono text-xs font-semibold">
                          {agrupar === 'sub' ? i.obra : i.sub_nombre}
                        </td>
                        <td className="px-3 py-1.5 text-xs text-ds-gray-500">{i.tipo_casa ?? '—'}</td>
                        <td className="px-3 py-1.5 text-xs text-ds-gray-500">{i.proyecto}</td>
                        <td className="px-3 py-1.5 text-xs text-ds-gray-500">
                          S{i.sprint_origen}
                          {i.sprint_origen_nombre ? ` · ${i.sprint_origen_nombre}` : ''}
                        </td>
                        <td
                          className="px-3 py-1.5 text-right font-mono tabular-nums font-semibold"
                          style={{ color: i.pct <= 0 ? 'var(--color-ds-red-ink)' : '#b45309' }}
                        >
                          {Math.round(i.pct)}%
                        </td>
                        <td className="px-3 py-1.5 text-xs">
                          {i.nc_causa ? (
                            <span className="rounded bg-ds-red-soft px-1 text-[10px] font-semibold uppercase text-ds-red-ink">
                              {i.nc_causa}
                            </span>
                          ) : (
                            <span className="text-ds-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{i.sem_arrastrada}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}

function Kpi({ label, value, accent }: { label: string; value: number; accent?: 'red' }) {
  return (
    <div className="rounded-ds border border-ds-gray-200 bg-white p-3 shadow-ds-01">
      <p className="text-xs uppercase tracking-wider text-ds-gray-500">{label}</p>
      <p className={`text-sub font-semibold tabular-nums ${accent === 'red' ? 'text-ds-red' : 'text-black'}`}>
        {value}
      </p>
    </div>
  );
}
