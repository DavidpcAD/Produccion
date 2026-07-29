'use client';

import { useEffect, useMemo, useState } from 'react';
import { Select } from '@/components/ui/Input';
import type { SemanaOperativa } from '@/lib/avance/mano-obra';
import type { HistoricoReporte } from '@/lib/avance/reporte-historico';

/**
 * Histórico de avance — portado de obrascontrol (HistoricoVista). Grilla
 * sub-partida × obra de una semana (foto del cierre o estado vivo): cada celda
 * es el % completado al fin de esa semana; se resalta lo que avanzó en la
 * semana. Datos de /api/avance/reportes/historico?semana=N.
 */
export default function ReporteHistoricoPage() {
  const [semanas, setSemanas] = useState<SemanaOperativa[]>([]);
  const [semanaId, setSemanaId] = useState<number | null>(null);
  const [data, setData] = useState<HistoricoReporte | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/avance/semanas')
      .then((r) => (r.ok ? r.json() : { semanas: [] }))
      .then((d) => {
        const s: SemanaOperativa[] = d.semanas ?? [];
        setSemanas(s);
        setSemanaId((prev) => prev ?? s[0]?.id ?? null);
      })
      .catch(() => setError('No se pudieron cargar las semanas.'));
  }, []);

  useEffect(() => {
    if (!semanaId) return;
    setCargando(true);
    setError(null);
    fetch(`/api/avance/reportes/historico?semana=${semanaId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Error');
        return r.json();
      })
      .then((d) => setData(d.data as HistoricoReporte))
      .catch((e) => {
        setData(null);
        setError(e instanceof Error ? e.message : 'Error al cargar el histórico.');
      })
      .finally(() => setCargando(false));
  }, [semanaId]);

  const semLabel = (s: SemanaOperativa) => `Semana ${s.numero_semana}/${s.anio} · ${s.fecha_inicio} → ${s.fecha_fin}`;

  // Obras ordenadas por código; subs ordenadas por sprint y luego partida/código.
  const obras = useMemo(
    () => [...(data?.obras ?? [])].sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true })),
    [data],
  );
  const subs = useMemo(
    () =>
      [...(data?.subs ?? [])].sort(
        (a, b) => a.sprint_numero - b.sprint_numero || a.codigo.localeCompare(b.codigo, 'es', { numeric: true }),
      ),
    [data],
  );

  function celda(obra: string, subId: number): { pct: number | null; avanzo: boolean } {
    const key = `${obra}|${subId}`;
    const pct = data?.celdas?.[key];
    return { pct: pct == null ? null : pct, avanzo: !!data?.avanceSemana?.includes(key) };
  }

  function colorPct(pct: number | null): string {
    if (pct == null) return 'transparent';
    if (pct >= 100) return 'var(--color-brand, #add010)';
    if (pct > 0) return 'color-mix(in srgb, var(--color-brand, #add010) 35%, #fff)';
    return 'transparent';
  }

  return (
    <main className="page mx-auto w-full max-w-[1400px] px-4 py-6">
      <div className="mb-2">
        <h1 className="text-3xl font-bold">Histórico de avance</h1>
        <p className="text-ds-gray-500">
          Grilla sub-partida × obra al cierre de una semana. Las celdas resaltadas avanzaron esa semana.
        </p>
      </div>

      <div className="my-4 flex flex-wrap items-center gap-3">
        <div className="max-w-md flex-1">
          <Select
            label="Semana operativa"
            value={semanaId ?? ''}
            onChange={(e) => setSemanaId(Number(e.target.value) || null)}
            options={semanas.map((s) => ({ value: s.id, label: semLabel(s) }))}
            placeholder={semanas.length ? 'Elegí una semana…' : 'Cargando…'}
          />
        </div>
        {data && (
          <span
            className={`rounded-ds px-3 py-1 text-xs font-semibold ${
              data.cerrada ? 'bg-ds-gray-100 text-ds-gray-500' : 'bg-brand/20 text-black'
            }`}
          >
            {data.cerrada ? 'Semana cerrada (foto)' : 'Semana en curso (estado vivo)'}
          </span>
        )}
      </div>

      {error && (
        <p className="my-4 rounded-ds border border-ds-red bg-ds-red/5 px-4 py-3 text-sm text-ds-red">{error}</p>
      )}

      {cargando ? (
        <p className="text-ds-gray-400">Calculando histórico…</p>
      ) : !data ? (
        <p className="text-ds-gray-400">Elegí una semana.</p>
      ) : obras.length === 0 || subs.length === 0 ? (
        <p className="rounded-ds border border-dashed border-ds-gray-200 p-6 text-center text-sm text-ds-gray-400">
          Sin datos para esta semana.
        </p>
      ) : (
        <div className="overflow-auto rounded-ds-lg border border-ds-gray-200 bg-white shadow-ds-01" style={{ maxHeight: '75vh' }}>
          <table className="border-collapse text-xs">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="sticky left-0 z-20 border-b border-r border-ds-gray-200 bg-ds-gray-50 px-2 py-2 text-left">
                  Sub-partida
                </th>
                {obras.map((o) => (
                  <th
                    key={o.codigo}
                    className="border-b border-ds-gray-200 bg-ds-gray-50 px-1 py-2 text-center font-mono"
                    style={{ minWidth: 44 }}
                    title={`${o.codigo}${o.tipo_casa ? ` · ${o.tipo_casa}` : ''}`}
                  >
                    <span className="inline-block whitespace-nowrap" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                      {o.codigo}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {subs.map((s) => (
                <tr key={s.id} className="border-b border-ds-gray-100 last:border-0">
                  <th className="sticky left-0 z-10 border-r border-ds-gray-200 bg-white px-2 py-1 text-left font-normal">
                    <span className="whitespace-nowrap">
                      {s.es_critica && <span className="mr-1 text-ds-red">●</span>}
                      <span className="font-mono text-[10px] text-ds-gray-400">S{s.sprint_numero}</span>{' '}
                      <span className="font-semibold">{s.codigo}</span> {s.nombre}
                    </span>
                  </th>
                  {obras.map((o) => {
                    const { pct, avanzo } = celda(o.codigo, s.id);
                    return (
                      <td
                        key={o.codigo}
                        className="border-l border-ds-gray-100 px-1 py-1 text-center tabular-nums"
                        style={{
                          background: colorPct(pct),
                          outline: avanzo ? '2px solid var(--color-brand, #add010)' : undefined,
                          outlineOffset: -2,
                        }}
                        title={`${o.codigo} · ${s.codigo}: ${pct == null ? 's/d' : Math.round(pct) + '%'}`}
                      >
                        {pct == null ? '' : Math.round(pct)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
