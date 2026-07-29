'use client';

import { useEffect, useState } from 'react';
import { Select } from '@/components/ui/Input';
import { formatCRC } from '@/lib/utilidades/format';
import type { SemanaOperativa } from '@/lib/avance/mano-obra';
import type { FiltroVenta, ResumenMes } from '@/lib/avance/reportes';

/**
 * Reportes de avance — Resumen del Mes (general + financiero). Portado de
 * obrascontrol (ResumenMesVista + ResumenMesFinancieroVista). Elegís una semana
 * operativa; el reporte agrupa TODAS las semanas del mismo mes y muestra:
 *  - General: Crono/Costo esperado vs real por semana + acumulado + diferencia.
 *  - Financiero: Directo/Indirecto/Venta/Utilidad producidos por semana en ₡.
 *
 * El cálculo (m² construidos, avance, económicos) corre en el servidor
 * (/api/avance/reportes/resumen-mes), que a su vez usa el motor lib/avance/reportes.ts.
 */

const FILTROS: { value: FiltroVenta; label: string }[] = [
  { value: 'todas', label: 'Todas las ventas' },
  { value: 'formalizadas', label: 'Formalizadas' },
  { value: 'no_formalizadas', label: 'No formalizadas' },
];

export default function ReportesPage() {
  const [semanas, setSemanas] = useState<SemanaOperativa[]>([]);
  const [semanaId, setSemanaId] = useState<number | null>(null);
  const [venta, setVenta] = useState<FiltroVenta>('todas');
  const [data, setData] = useState<ResumenMes | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/avance/semanas')
      .then((r) => (r.ok ? r.json() : { semanas: [] }))
      .then((d) => {
        const s: SemanaOperativa[] = d.semanas ?? [];
        setSemanas(s);
        setSemanaId((prev) => prev ?? (s[0] ? Number(s[0].id) : null));
      })
      .catch(() => setError('No se pudieron cargar las semanas.'));
  }, []);

  useEffect(() => {
    if (!semanaId) return;
    setCargando(true);
    setError(null);
    fetch(`/api/avance/reportes/resumen-mes?semana=${semanaId}&venta=${venta}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Error');
        return r.json();
      })
      .then((d) => setData(d.data as ResumenMes))
      .catch((e) => setError(e instanceof Error ? e.message : 'Error al cargar el reporte.'))
      .finally(() => setCargando(false));
  }, [semanaId, venta]);

  const semanaLabel = (s: SemanaOperativa) =>
    `Semana ${s.numero_semana}/${s.anio} · ${s.fecha_inicio} → ${s.fecha_fin}`;

  return (
    <main className="page mx-auto w-full max-w-5xl px-4 py-6">
      <div className="mb-2">
        <h1 className="text-heading font-bold">Reportes de avance</h1>
        <p className="text-ds-gray-500">
          Resumen del mes: cronograma, costo y producción económica por semana operativa.
        </p>
      </div>

      <div className="my-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Select
          label="Semana operativa"
          value={semanaId ?? ''}
          onChange={(e) => setSemanaId(Number(e.target.value) || null)}
          options={semanas.map((s) => ({ value: Number(s.id), label: semanaLabel(s) }))}
          placeholder={semanas.length ? 'Elegí una semana…' : 'Cargando…'}
        />
        <Select
          label="Filtro de venta"
          value={venta}
          onChange={(e) => setVenta(e.target.value as FiltroVenta)}
          options={FILTROS}
        />
      </div>

      {error && (
        <p className="my-4 rounded-ds border border-ds-red bg-ds-red/5 px-4 py-3 text-sm text-ds-red">
          {error}
        </p>
      )}

      {!semanaId ? (
        <p className="text-ds-gray-400">Elegí una semana para ver el resumen.</p>
      ) : cargando && !data ? (
        <p className="text-ds-gray-400">Calculando reporte…</p>
      ) : data ? (
        <div className="space-y-6">
          <p className="text-sm text-ds-gray-500">
            Mes <strong>{data.mes}</strong> · {data.filas.length} semana(s)
            {cargando && ' · actualizando…'}
          </p>
          <ResumenGeneral data={data} semanaSel={semanaId} />
          <ResumenFinanciero data={data} semanaSel={semanaId} />
        </div>
      ) : null}
    </main>
  );
}

// --------------------------------------------------------------- helpers

function pct(n: number): string {
  return `${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
}

/** ₡ compacto (₡5.8M, ₡320k) para celdas de tabla. */
function fmtMonto(n: number): string {
  if (!n) return '—';
  if (Math.abs(n) >= 1_000_000)
    return `₡${(n / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 1 })}M`;
  if (Math.abs(n) >= 1_000)
    return `₡${(n / 1_000).toLocaleString('en-US', { maximumFractionDigits: 0 })}k`;
  return formatCRC(n);
}

/** dd/mm desde un ISO YYYY-MM-DD. */
function periodo(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}`;
}

const th = 'px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ds-gray-500';
const td = 'px-3 py-2 text-sm text-black';

// --------------------------------------------------------- Resumen general

function ResumenGeneral({ data, semanaSel }: { data: ResumenMes; semanaSel: number }) {
  const { filas, tot, dif_crono, dif_costo } = data;
  return (
    <section className="overflow-x-auto rounded-ds-lg border border-ds-gray-200 bg-white shadow-ds-01">
      <div className="border-b border-ds-gray-200 bg-ds-gray-100 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-ds-gray-500">
        Resumen del mes
      </div>
      <table className="w-full">
        <thead>
          <tr className="border-b border-ds-gray-200 bg-ds-gray-100">
            <th className={`${th} text-left`}>Semana</th>
            <th className={`${th} text-left`}>Período</th>
            <th className={`${th} text-right`}>Días Ef.</th>
            <th className={`${th} text-right`}>Crono Esp.</th>
            <th className={`${th} text-right`}>Crono Real</th>
            <th className={`${th} text-right`}>Costo Esp.</th>
            <th className={`${th} text-right`}>Costo Real</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => {
            const esSel = f.semana.id === semanaSel;
            return (
              <tr
                key={f.semana.id}
                className={`border-b border-ds-gray-100 last:border-0 ${esSel ? 'bg-brand/10 font-medium' : ''}`}
              >
                <td className={`${td} font-mono text-xs font-semibold ${esSel ? 'border-l-4 border-brand' : ''}`}>
                  S{f.semana.numero_semana}
                </td>
                <td className={`${td} text-xs text-ds-gray-500`}>
                  {periodo(f.semana.fecha_inicio)} → {periodo(f.semana.fecha_fin)}
                </td>
                <td className={`${td} text-right tabular-nums`}>{f.semana.dias_efectivos}</td>
                <td className={`${td} text-right font-mono tabular-nums text-ds-gray-500`}>
                  {pct(f.crono_esp)}
                </td>
                <td
                  className={`${td} text-right font-mono tabular-nums font-semibold ${
                    !f.base_semanal
                      ? 'text-ds-gray-400'
                      : f.crono_real >= f.crono_esp
                        ? 'text-brand-dark'
                        : 'text-ds-red'
                  }`}
                >
                  {f.base_semanal ? pct(f.crono_real) : '—'}
                </td>
                <td className={`${td} text-right font-mono tabular-nums text-ds-gray-500`}>
                  {pct(f.costo_esp)}
                </td>
                <td
                  className={`${td} text-right font-mono tabular-nums font-semibold ${
                    !f.base_semanal
                      ? 'text-ds-gray-400'
                      : f.costo_real >= f.costo_esp
                        ? 'text-brand-dark'
                        : 'text-ds-red'
                  }`}
                >
                  {f.base_semanal ? pct(f.costo_real) : '—'}
                </td>
              </tr>
            );
          })}
          {filas.length === 0 && (
            <tr>
              <td colSpan={7} className="px-3 py-6 text-center text-sm text-ds-gray-400">
                Sin semanas en este mes.
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-ds-gray-200">
            <td className={`${td} font-semibold`} colSpan={3}>
              Total a la fecha
            </td>
            <td className={`${td} text-right font-mono text-xs font-semibold text-ds-gray-500`}>
              {pct(tot.crono_esp)}
            </td>
            <td className={`${td} text-right font-mono text-xs font-semibold`}>{pct(tot.crono_real)}</td>
            <td className={`${td} text-right font-mono text-xs font-semibold text-ds-gray-500`}>
              {pct(tot.costo_esp)}
            </td>
            <td className={`${td} text-right font-mono text-xs font-semibold`}>{pct(tot.costo_real)}</td>
          </tr>
          <tr>
            <td className={`${td} font-semibold`} colSpan={3}>
              Diferencia (real − esperado)
            </td>
            <td />
            <td className={`${td} text-right font-mono text-xs font-semibold ${dif_crono < 0 ? 'text-ds-red' : 'text-brand-dark'}`}>
              {dif_crono >= 0 ? '+' : ''}
              {pct(dif_crono)}
            </td>
            <td />
            <td className={`${td} text-right font-mono text-xs font-semibold ${dif_costo < 0 ? 'text-ds-red' : 'text-brand-dark'}`}>
              {dif_costo >= 0 ? '+' : ''}
              {pct(dif_costo)}
            </td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}

// ------------------------------------------------------- Resumen financiero

function ResumenFinanciero({ data, semanaSel }: { data: ResumenMes; semanaSel: number }) {
  const { filas, tot_fin } = data;
  return (
    <section className="overflow-x-auto rounded-ds-lg border border-ds-gray-200 bg-white shadow-ds-01">
      <div className="border-b border-ds-gray-200 bg-ds-gray-100 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-ds-gray-500">
        Resumen del mes — Financiero (producción por semana)
      </div>
      <table className="w-full">
        <thead>
          <tr className="border-b border-ds-gray-200 bg-ds-gray-100">
            <th className={`${th} text-left`}>Semana</th>
            <th className={`${th} text-left`}>Período</th>
            <th className={`${th} text-right`}>Directo</th>
            <th className={`${th} text-right`}>Indirecto</th>
            <th className={`${th} text-right`}>Venta</th>
            <th className={`${th} text-right`}>Utilidad</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => {
            const esSel = f.semana.id === semanaSel;
            return (
              <tr
                key={f.semana.id}
                className={`border-b border-ds-gray-100 last:border-0 ${esSel ? 'bg-brand/10 font-medium' : ''}`}
              >
                <td className={`${td} font-mono text-xs font-semibold ${esSel ? 'border-l-4 border-brand' : ''}`}>
                  S{f.semana.numero_semana}
                </td>
                <td className={`${td} text-xs text-ds-gray-500`}>
                  {periodo(f.semana.fecha_inicio)} → {periodo(f.semana.fecha_fin)}
                </td>
                <td className={`${td} text-right font-mono tabular-nums`}>
                  {f.base_semanal ? fmtMonto(f.directo) : '—'}
                </td>
                <td className={`${td} text-right font-mono tabular-nums`}>
                  {f.base_semanal ? fmtMonto(f.indirecto) : '—'}
                </td>
                <td className={`${td} text-right font-mono tabular-nums`}>
                  {f.base_semanal ? fmtMonto(f.venta) : '—'}
                </td>
                <td
                  className={`${td} text-right font-mono tabular-nums font-semibold ${
                    !f.base_semanal ? 'text-ds-gray-400' : f.utilidad >= 0 ? 'text-brand-dark' : 'text-ds-red'
                  }`}
                >
                  {f.base_semanal ? fmtMonto(f.utilidad) : '—'}
                </td>
              </tr>
            );
          })}
          {filas.length === 0 && (
            <tr>
              <td colSpan={6} className="px-3 py-6 text-center text-sm text-ds-gray-400">
                Sin semanas en este mes.
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-ds-gray-200">
            <td className={`${td} font-semibold`} colSpan={2}>
              Total a la fecha
            </td>
            <td className={`${td} text-right font-mono text-xs font-semibold`}>{fmtMonto(tot_fin.directo)}</td>
            <td className={`${td} text-right font-mono text-xs font-semibold`}>{fmtMonto(tot_fin.indirecto)}</td>
            <td className={`${td} text-right font-mono text-xs font-semibold`}>{fmtMonto(tot_fin.venta)}</td>
            <td
              className={`${td} text-right font-mono text-xs font-semibold ${tot_fin.utilidad >= 0 ? 'text-brand-dark' : 'text-ds-red'}`}
            >
              {fmtMonto(tot_fin.utilidad)}
            </td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}
