'use client';

import { useEffect, useMemo, useState } from 'react';
import { PageShell, PageHeader } from '@/components/layout/Page';
import { Skeleton, SkeletonRows } from '@/components/ui/Skeleton';
import { Combobox } from '@/components/ui/Combobox';
import { formatCRC } from '@/lib/utilidades/format';
import type { SemanaOperativa } from '@/lib/avance/mano-obra';
import type { FiltroVenta, ResumenMes, ReporteSemanal, ReporteObra, ReporteTotales } from '@/lib/avance/reportes';
import { coincideBusqueda } from '@/lib/utilidades/buscar';

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
  // Reporte semanal completo (KPIs + detalle por obra) — de /api/avance/reportes.
  const [reporte, setReporte] = useState<ReporteSemanal | null>(null);
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

  // Reporte semanal completo (KPIs + detalle por obra) de la semana elegida.
  useEffect(() => {
    if (!semanaId) return;
    fetch(`/api/avance/reportes?semana=${semanaId}&venta=${venta}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setReporte(d.data as ReporteSemanal))
      .catch(() => setReporte(null));
  }, [semanaId, venta]);

  const semanaLabel = (s: SemanaOperativa) =>
    `Semana ${s.numero_semana}/${s.anio} · ${s.fecha_inicio} → ${s.fecha_fin}`;

  return (
    <PageShell>
      <PageHeader
        title="Reportes de avance"
        subtitle="Compara, semana por semana del mes, el avance ESPERADO (meta del cronograma) contra el REAL (lo ejecutado), en cronograma y en costo, más la producción económica (directo, indirecto, venta y utilidad). Sirve para ver si el mes va adelantado o atrasado y cuánto."
      />

      <div className="my-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Combobox
          label="Semana operativa"
          value={String(semanaId ?? '')}
          onChange={(v) => setSemanaId(Number(v) || null)}
          options={semanas.map((s) => ({ value: String(s.id), label: semanaLabel(s) }))}
          placeholder={semanas.length ? 'Elegí una semana…' : 'Cargando…'}
        />
        <Combobox
          label="Filtro de venta"
          value={venta}
          onChange={(v) => setVenta((v as FiltroVenta) || 'todas')}
          options={FILTROS}
          placeholder="Filtro de venta"
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
        <div className="space-y-3">
          <Skeleton className="h-4 w-40" rounded="rounded-full" />
          <SkeletonRows rows={6} />
        </div>
      ) : data ? (
        <div className="space-y-6">
          <div className="space-y-0.5">
            <p className="text-sm text-ds-gray-500">
              Mes <strong>{data.mes}</strong> · {data.filas.length} semana(s)
              {cargando && ' · actualizando…'}
            </p>
            <p className="text-xs text-ds-gray-400">
              En <span className="font-semibold text-ds-red">rojo</span>, el valor real quedó por debajo de lo esperado (atrasado). La fila <strong>Diferencia</strong> = real − esperado.
            </p>
          </div>
          {reporte && <KpisProduccion t={reporte.totales} />}
          <ResumenGeneral data={data} semanaSel={semanaId} />
          {reporte && <KpisFinanciero t={reporte.totales} />}
          <ResumenFinanciero data={data} semanaSel={semanaId} />
          {reporte && reporte.obras.length > 0 && <DetallePorObra obras={reporte.obras} />}
        </div>
      ) : null}
    </PageShell>
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
const td = 'px-3 py-2 text-sm text-ds-ink';

// --------------------------------------------------------- Resumen general

function ResumenGeneral({ data, semanaSel }: { data: ResumenMes; semanaSel: number }) {
  const { filas, tot, dif_crono, dif_costo } = data;
  return (
    <section className="overflow-x-auto rounded-ds-lg border border-ds-gray-200 bg-ds-surface shadow-ds-01">
      <div className="border-b border-ds-gray-200 bg-ds-gray-100 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-ds-gray-500">
        Resumen del mes
      </div>
      <table className="w-full">
        <thead>
          <tr className="border-b border-ds-gray-200 bg-ds-gray-100">
            <th className={`${th} text-left`}>Semana</th>
            <th className={`${th} text-left`}>Período</th>
            <th className={`${th} text-right`} title="Días efectivos de trabajo de la semana (base del cálculo esperado)">Días Ef.</th>
            <th className={`${th} text-right`} title="Cronograma ESPERADO: cuánto debía avanzar la semana según el plan">Crono Esp.</th>
            <th className={`${th} text-right`} title="Cronograma REAL: cuánto se avanzó de verdad esa semana">Crono Real</th>
            <th className={`${th} text-right`} title="Costo ESPERADO: costo que debía ejecutarse según el plan">Costo Esp.</th>
            <th className={`${th} text-right`} title="Costo REAL: costo efectivamente ejecutado esa semana">Costo Real</th>
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
    <section className="overflow-x-auto rounded-ds-lg border border-ds-gray-200 bg-ds-surface shadow-ds-01">
      <div className="border-b border-ds-gray-200 bg-ds-gray-100 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-ds-gray-500">
        Resumen del mes — Financiero (producción por semana)
      </div>
      <table className="w-full">
        <thead>
          <tr className="border-b border-ds-gray-200 bg-ds-gray-100">
            <th className={`${th} text-left`}>Semana</th>
            <th className={`${th} text-left`}>Período</th>
            <th className={`${th} text-right`} title="Costo directo producido en la semana (₡)">Directo</th>
            <th className={`${th} text-right`} title="Costo indirecto producido en la semana (₡)">Indirecto</th>
            <th className={`${th} text-right`} title="Venta producida en la semana (₡)">Venta</th>
            <th className={`${th} text-right`} title="Utilidad producida = venta − directo − indirecto (₡)">Utilidad</th>
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

// ------------------------------------------------------------ KPIs (B2)

function fmtM2(n: number): string {
  return `${n.toLocaleString('es-CR', { maximumFractionDigits: 0 })} m²`;
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: 'pos' | 'neg' }) {
  return (
    <div className="rounded-ds-lg border border-ds-gray-200 bg-ds-surface shadow-ds-01 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ds-gray-400">{label}</p>
      <p className={'text-sub-sm font-bold mt-0.5 ' + (accent === 'pos' ? 'text-ds-green-ink' : accent === 'neg' ? 'text-ds-red' : 'text-ds-ink')}>{value}</p>
      {sub && <p className="text-xs text-ds-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function KpisProduccion({ t }: { t: ReporteTotales }) {
  const difCrono = t.crono_real_prom - t.crono_esperado_prom;
  const difCosto = t.costo_real_prom - t.costo_esperado_prom;
  return (
    <section className="space-y-2">
      <h2 className="text-body-sm font-semibold uppercase tracking-wider text-ds-gray-500">Indicadores de la semana</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Kpi label="Obras en construcción" value={String(t.construccion)} sub={`${t.trabajando} con trabajo · ${t.en_espera} en espera`} />
        <Kpi label="Área construida" value={fmtM2(t.area_construida)} sub={`de ${fmtM2(t.area_total)} · faltan ${fmtM2(t.area_por_construir)}`} />
        <Kpi label="Avance cronograma" value={pct(t.crono_real_prom)} sub={`esperado ${pct(t.crono_esperado_prom)}`} accent={difCrono < 0 ? 'neg' : 'pos'} />
        <Kpi label="Avance costo" value={pct(t.costo_real_prom)} sub={`esperado ${pct(t.costo_esperado_prom)}`} accent={difCosto < 0 ? 'neg' : 'pos'} />
        <Kpi label="m² esta semana" value={fmtM2(t.m2_semana)} sub={`esperado ${fmtM2(t.m2_esperado)}`} />
        <Kpi label="Producido acumulado" value={fmtMonto(t.monto_acumulado)} sub={`de ${fmtMonto(t.presupuesto_total)} · falta ${fmtMonto(t.faltante)}`} />
        <Kpi label="Venta acumulada" value={fmtMonto(t.venta_acumulada)} />
        <Kpi label="Utilidad acumulada" value={fmtMonto(t.utilidad_acumulada)} accent={t.utilidad_acumulada >= 0 ? 'pos' : 'neg'} />
      </div>
    </section>
  );
}

// --------------------------------------------- KPIs financieros (tarjetas)

/** Tarjetas Directo / Indirecto / Venta / Utilidad (valor de la semana + acumulado),
 *  como el encabezado del reporte Financiero de obrascontrol. */
function KpisFinanciero({ t }: { t: ReporteTotales }) {
  const cards = [
    { label: 'Costo directo', semana: t.monto_semana, acum: t.monto_acumulado, accent: '' as '' | 'pos' | 'neg' },
    { label: 'Indirecto', semana: t.indirecto_semana, acum: t.indirecto_acumulado, accent: '' as '' | 'pos' | 'neg' },
    { label: 'Venta', semana: t.venta_semana, acum: t.venta_acumulada, accent: 'pos' as '' | 'pos' | 'neg' },
    { label: 'Utilidad', semana: t.utilidad_semana, acum: t.utilidad_acumulada, accent: (t.utilidad_semana >= 0 ? 'pos' : 'neg') as '' | 'pos' | 'neg' },
  ];
  return (
    <section className="space-y-2">
      <h2 className="text-body-sm font-semibold uppercase tracking-wider text-ds-gray-500">Financiero — producción de la semana</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-ds-lg border border-ds-gray-200 bg-ds-surface p-4 shadow-ds-01">
            <p className="text-xs font-semibold uppercase tracking-wide text-ds-gray-500">{c.label}</p>
            <p className={`mt-1 font-mono text-sub font-bold tabular-nums ${c.accent === 'neg' ? 'text-ds-red' : c.accent === 'pos' ? 'text-brand-dark' : 'text-ds-ink'}`}>
              {formatCRC(c.semana)}
            </p>
            <p className="mt-0.5 text-xs text-ds-gray-400 tabular-nums">Acum: {formatCRC(c.acum)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// --------------------------------------------- Detalle por obra (B3 + B4)

function DetallePorObra({ obras }: { obras: ReporteObra[] }) {
  const [modo, setModo] = useState<'semana' | 'acumulado'>('acumulado');
  const [q, setQ] = useState('');
  const acum = modo === 'acumulado';
  const lista = useMemo(() => {
    const term = q.trim().toLowerCase();
    const arr = [...obras].sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }));
    return term ? arr.filter((o) => coincideBusqueda([o.codigo, o.tipo_casa ?? ''].join(' '), term)) : arr;
  }, [obras, q]);

  const g = (o: ReporteObra) => ({
    crono: acum ? o.crono_acumulado : o.crono_semana,
    costo: acum ? o.costo_acumulado : o.costo_semana,
    m2: acum ? o.m2_acumulado : o.m2_semana,
    directo: acum ? o.monto_acumulado : o.monto_semana,
    indirecto: acum ? o.indirecto_acumulado : o.indirecto_semana,
    venta: acum ? o.venta_acumulada : o.venta_semana,
    utilidad: acum ? o.utilidad_acumulada : o.utilidad_semana,
  });

  return (
    <section className="overflow-hidden rounded-ds-lg border border-ds-gray-200 bg-ds-surface shadow-ds-01">
      <div className="flex flex-wrap items-center gap-3 border-b border-ds-gray-200 bg-ds-gray-100 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-ds-gray-500">Detalle por obra</span>
        <div className="inline-flex rounded-ds border border-ds-gray-200 p-0.5 bg-ds-surface">
          {(['semana', 'acumulado'] as const).map((m) => (
            <button key={m} onClick={() => setModo(m)}
              className={'px-3 py-1 rounded-ds text-xs font-semibold capitalize transition ' + (modo === m ? 'bg-black text-white' : 'text-ds-gray-500 hover:text-ds-ink')}>
              {m}
            </button>
          ))}
        </div>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar obra…"
          className="ml-auto h-8 w-48 rounded-ds border border-ds-gray-200 px-3 text-sm focus:border-black focus:outline-none" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-ds-gray-200 bg-ds-gray-50">
              <th className={`${th} text-left`}>Obra</th>
              <th className={`${th} text-left`}>Tipo</th>
              <th className={`${th} text-right`}>Sprint</th>
              <th className={`${th} text-right`} title="Avance de cronograma">Crono</th>
              <th className={`${th} text-right`} title="Avance de costo">Costo</th>
              <th className={`${th} text-right`}>m²</th>
              <th className={`${th} text-right`} title="Costo directo producido (₡)">Directo</th>
              <th className={`${th} text-right`} title="Costo indirecto (₡)">Indirecto</th>
              <th className={`${th} text-right`} title="Venta producida (₡)">Venta</th>
              <th className={`${th} text-right`} title="Utilidad = venta − directo − indirecto (₡)">Utilidad</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((o) => {
              const v = g(o);
              return (
                <tr key={o.codigo} className="border-b border-ds-gray-100 last:border-0">
                  <td className={`${td} font-mono text-xs font-semibold`}>{o.codigo}</td>
                  <td className={`${td} text-xs text-ds-gray-500`}>{o.tipo_casa ?? '—'}</td>
                  <td className={`${td} text-right text-xs tabular-nums text-ds-gray-500`}>{o.sprint_actual ?? '—'}/{o.total_sprints}</td>
                  <td className={`${td} text-right font-mono tabular-nums`}>{pct(v.crono)}</td>
                  <td className={`${td} text-right font-mono tabular-nums`}>{pct(v.costo)}</td>
                  <td className={`${td} text-right tabular-nums`}>{v.m2.toLocaleString('es-CR', { maximumFractionDigits: 0 })}</td>
                  <td className={`${td} text-right font-mono tabular-nums`}>{fmtMonto(v.directo)}</td>
                  <td className={`${td} text-right font-mono tabular-nums`}>{fmtMonto(v.indirecto)}</td>
                  <td className={`${td} text-right font-mono tabular-nums`}>{fmtMonto(v.venta)}</td>
                  <td className={`${td} text-right font-mono tabular-nums font-semibold ${v.utilidad >= 0 ? 'text-brand-dark' : 'text-ds-red'}`}>{fmtMonto(v.utilidad)}</td>
                </tr>
              );
            })}
            {lista.length === 0 && (
              <tr><td colSpan={10} className="px-3 py-6 text-center text-sm text-ds-gray-400">Sin obras.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
