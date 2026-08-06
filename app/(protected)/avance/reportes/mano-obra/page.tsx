'use client';

import { useEffect, useMemo, useState } from 'react';
import { PageShell, PageHeader } from '@/components/layout/Page';
import { Input, Select } from '@/components/ui/Input';
import { Combobox } from '@/components/ui/Combobox';
import { formatCRC } from '@/lib/utilidades/format';
import type { SemanaOperativa } from '@/lib/avance/mano-obra';
import type { FiltroVenta } from '@/lib/avance/reportes';
import type { ManoObraFila, ReporteMO, ResumenMesMO } from '@/lib/avance/reporte-mo';

/**
 * Reporte de Mano de Obra por semana — portado de obrascontrol
 * (ManoObraReporteVista). Consolida la captura (nómina/horas/subcontratos) con
 * los m² avanzados por obra de la semana:
 *   - Producción: m² construidos, costo teórico/m², eficiencia.
 *   - Horas Hombre: HH directas, equiv. subcontrato, costo prom HH, HH/m².
 *   - Costos M.O.: directa, subcontrato, total, presupuestada, sobrecosto.
 *   - Distribución por obra (reparto de la nómina por horas + subcontratos).
 * El cálculo corre en el servidor (/api/avance/reportes/mano-obra).
 */

const FILTROS: { value: FiltroVenta; label: string }[] = [
  { value: 'todas', label: 'Todas las ventas' },
  { value: 'formalizadas', label: 'Formalizadas' },
  { value: 'no_formalizadas', label: 'No formalizadas' },
];

type MoCol = keyof ManoObraFila;
type Orden = { col: MoCol; dir: 'asc' | 'desc' };

const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 1 });
const fmt2 = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ReporteManoObraPage() {
  const [semanas, setSemanas] = useState<SemanaOperativa[]>([]);
  const [semanaId, setSemanaId] = useState<number | null>(null);
  const [venta, setVenta] = useState<FiltroVenta>('todas');
  const [data, setData] = useState<ReporteMO | null>(null);
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
    fetch(`/api/avance/reportes/mano-obra?semana=${semanaId}&venta=${venta}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Error');
        return r.json();
      })
      .then((d) => setData(d.data as ReporteMO))
      .catch((e) => setError(e instanceof Error ? e.message : 'Error al cargar el reporte.'))
      .finally(() => setCargando(false));
  }, [semanaId, venta]);

  const semanaLabel = (s: SemanaOperativa) =>
    `Semana ${s.numero_semana}/${s.anio} · ${s.fecha_inicio} → ${s.fecha_fin}`;

  const calc = data?.calc ?? null;

  return (
    <PageShell>
      <PageHeader
        title="Reporte de Mano de Obra"
        subtitle="Reparte la nómina de la semana (por horas) más los subcontratos entre las obras, y lo compara contra los m² construidos. Muestra el costo de mano de obra por m², la eficiencia y el sobrecosto vs. lo presupuestado — para saber si la M.O. salió más cara o más barata de lo planeado."
      />

      <div className="my-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Combobox
          label="Semana operativa"
          value={String(semanaId ?? '')}
          onChange={(v) => setSemanaId(Number(v) || null)}
          options={semanas.map((s) => ({ value: String(s.id), label: semanaLabel(s) }))}
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
        <p className="text-ds-gray-400">Elegí una semana para ver el reporte.</p>
      ) : cargando && !calc ? (
        <p className="text-ds-gray-400">Calculando reporte…</p>
      ) : calc ? (
        <div className="space-y-6">
          {cargando && <p className="text-xs text-ds-gray-400">Actualizando…</p>}

          {!calc.tieneNomina && (
            <div className="rounded-ds border border-ds-yellow bg-ds-yellow/10 px-3 py-2 text-xs text-ds-yellow-ink">
              No hay <strong>nómina registrada</strong> para esta semana — cargala en Mano de
              Obra · Nómina para ver los indicadores de costo/eficiencia.
            </div>
          )}

          <Seccion titulo="Producción">
            <Kpi label="m² Construidos Semana" value={fmt(calc.m2Sem)} accent="lime" hint="m² construidos (producidos) en la semana elegida" />
            <Kpi label="Costo teórico/m²" value={formatCRC(calc.teorico)} small hint="Costo de M.O. por m² que se presupuestó (la meta)" />
            <Kpi
              label="Eficiencia"
              value={calc.eficiencia > 0 ? `${calc.eficiencia.toFixed(0)}%` : '—'}
              accent={calc.eficiencia >= 100 ? 'lime' : 'red'}
              hint="Teórico ÷ real × 100. ≥100% = la M.O. rindió mejor de lo presupuestado"
            />
          </Seccion>

          <Seccion titulo="Horas Hombre">
            <Kpi label="HH Directas Semana" value={fmt(calc.hhDirectas)} hint="Horas-hombre de nómina directa asignadas esta semana" />
            <Kpi
              label="HH Equiv. Subcontrato"
              value={calc.hhEquivSubc > 0 ? fmt(calc.hhEquivSubc) : '—'}
              hint="Horas-hombre equivalentes aportadas por subcontratos"
            />
            <Kpi label="Costo Prom HH c/Cargas" value={formatCRC(calc.costoPromHH)} small hint="Costo promedio de la hora-hombre, incluidas cargas sociales" />
            <Kpi label="HH/m² Sin Subcontrato" value={calc.hhM2Sin > 0 ? fmt2(calc.hhM2Sin) : '—'} hint="Horas-hombre por m² usando SOLO nómina directa" />
            <Kpi label="HH/m² Con Subcontrato" value={calc.hhM2Con > 0 ? fmt2(calc.hhM2Con) : '—'} hint="Horas-hombre por m² incluyendo subcontratos" />
            <Kpi label="Costo M.O. por m²" value={formatCRC(calc.costoMOm2)} small hint="Costo real de mano de obra por cada m² construido" />
          </Seccion>

          <Seccion titulo="Costos Mano de Obra">
            <Kpi label="M.O. Directa Semana" value={formatCRC(calc.moDirecta)} small hint="Gasto de nómina directa de la semana (₡)" />
            <Kpi
              label="M.O. Subcontrato"
              value={calc.moSubcontrato > 0 ? formatCRC(calc.moSubcontrato) : '—'}
              small
              hint="Gasto de subcontratos de la semana (₡)"
            />
            <Kpi label="M.O. Total Gastada" value={formatCRC(calc.moTotalGastada)} small accent="lime" hint="Directa + subcontrato (₡)" />
            <Kpi label="M.O. Presupuestada" value={formatCRC(calc.moPresupuestada)} small hint="Costo teórico/m² × m² construidos = lo que debía costar" />
            <Kpi
              label="Sobrecosto M.O."
              value={formatCRC(calc.sobrecosto)}
              small
              accent={calc.sobrecosto > 0 ? 'red' : 'lime'}
              hint="Gastada − presupuestada. Rojo = salió más cara de lo presupuestado"
            />
          </Seccion>

          <p className="text-xs text-ds-gray-400">
            M.O. Presupuestada = teórico/m² × m² construidos. Sobrecosto = gastada − presupuestada
            (rojo = más caro que lo presupuestado). Eficiencia = teórico ÷ real × 100 (≥100% = más
            eficiente).
          </p>

          <BarrasGastoVsPresup gastada={calc.moTotalGastada} presupuestada={calc.moPresupuestada} />

          <ResumenMesMO semanaId={semanaId} venta={venta} />

          <Distribucion obras={calc.obras} />
        </div>
      ) : null}
    </PageShell>
  );
}

// -------------------------------------------------------- Distribución por obra

function Distribucion({ obras }: { obras: ManoObraFila[] }) {
  const [busqueda, setBusqueda] = useState('');
  const [orden, setOrden] = useState<Orden>({ col: 'moTotal', dir: 'desc' });

  const filtro = busqueda.trim().toLowerCase();
  const vista = obras
    .filter((o) => !filtro || o.codigo.toLowerCase().includes(filtro))
    .sort((a, b) => {
      const av = a[orden.col];
      const bv = b[orden.col];
      const cmp =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv), 'es', { numeric: true });
      return orden.dir === 'asc' ? cmp : -cmp;
    });

  const Th = ({ col, children, left }: { col: MoCol; children: React.ReactNode; left?: boolean }) => {
    const activo = orden.col === col;
    return (
      <th className={`${th} ${left ? 'text-left' : 'text-right'}`}>
        <button
          type="button"
          className={`inline-flex w-full items-center gap-1 hover:text-ds-ink ${left ? 'justify-start' : 'justify-end'}`}
          onClick={() =>
            setOrden((prev) =>
              prev.col === col
                ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
                : { col, dir: col === 'codigo' ? 'asc' : 'desc' },
            )
          }
        >
          {children}
          <span className="text-ds-gray-300">{activo ? (orden.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
        </button>
      </th>
    );
  };

  return (
    <section className="overflow-hidden rounded-ds-lg border border-ds-gray-200 bg-ds-surface shadow-ds-01">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ds-gray-200 bg-ds-gray-100 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-ds-gray-500">
          Distribución por obra
        </span>
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar obra…"
          className="!h-8 !w-44 !text-xs"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-ds-gray-200 bg-ds-gray-100">
              <Th col="codigo" left>Obra</Th>
              <Th col="hrs">Horas</Th>
              <Th col="pctHoras">% horas</Th>
              <Th col="nominaAsig">Nómina asignada</Th>
              <Th col="sc">Subcontratos</Th>
              <Th col="moTotal">M.O. total</Th>
              <Th col="m2">m² sem.</Th>
              <Th col="costoM2">Costo M.O./m²</Th>
            </tr>
          </thead>
          <tbody>
            {vista.map((o) => (
              <tr key={o.codigo} className="border-b border-ds-gray-100 last:border-0">
                <td className={`${td} font-mono text-xs font-semibold`}>{o.codigo}</td>
                <td className={`${td} text-right tabular-nums`}>{fmt(o.hrs)}</td>
                <td className={`${td} text-right tabular-nums text-ds-gray-500`}>
                  {o.pctHoras > 0 ? `${o.pctHoras.toFixed(1)}%` : '—'}
                </td>
                <td className={`${td} text-right font-mono tabular-nums`}>
                  {o.nominaAsig > 0 ? formatCRC(o.nominaAsig) : '—'}
                </td>
                <td className={`${td} text-right font-mono tabular-nums`}>
                  {o.sc > 0 ? formatCRC(o.sc) : '—'}
                </td>
                <td className={`${td} text-right font-mono tabular-nums font-semibold`}>
                  {formatCRC(o.moTotal)}
                </td>
                <td className={`${td} text-right tabular-nums text-ds-gray-500`}>{fmt(o.m2)}</td>
                <td className={`${td} text-right font-mono tabular-nums`}>
                  {o.costoM2 > 0 ? formatCRC(o.costoM2) : '—'}
                </td>
              </tr>
            ))}
            {vista.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-sm text-ds-gray-400">
                  {filtro
                    ? `Ninguna obra coincide con «${busqueda}».`
                    : 'Sin horas ni subcontratos para esta semana.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------- Resumen del mes MO

function ResumenMesMO({ semanaId, venta }: { semanaId: number; venta: FiltroVenta }) {
  const [abierto, setAbierto] = useState(false);
  const [data, setData] = useState<ResumenMesMO | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setData(null);
    setCargando(true);
    fetch(`/api/avance/reportes/mano-obra?semana=${semanaId}&venta=${venta}&modo=resumen-mes`)
      .then((r) => (r.ok ? r.json() : { data: null }))
      .then((d) => setData(d.data as ResumenMesMO))
      .catch(() => setData(null))
      .finally(() => setCargando(false));
  }, [abierto, semanaId, venta]);

  return (
    <section className="overflow-hidden rounded-ds-lg border border-ds-gray-200 bg-ds-surface shadow-ds-01">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center gap-2 border-b border-ds-gray-200 bg-ds-gray-100 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-ds-gray-500 hover:bg-ds-gray-200"
      >
        <span className={`transition-transform ${abierto ? 'rotate-90' : ''}`}>▸</span>
        Resumen del mes — Mano de Obra
        {abierto && cargando && <span className="font-normal normal-case">· cargando…</span>}
        {!abierto && <span className="font-normal normal-case opacity-70">(tocá para cargar)</span>}
      </button>
      {abierto && data && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-ds-gray-200 bg-ds-gray-100">
                <th className={`${th} text-left`}>Semana</th>
                <th className={`${th} text-left`}>Período</th>
                <th className={`${th} text-right`}>M.O. Gastada</th>
                <th className={`${th} text-right`}>m² Construidos</th>
                <th className={`${th} text-right`}>Costo por m²</th>
              </tr>
            </thead>
            <tbody>
              {data.filas.map((f) => {
                const esSel = Number(f.semana.id) === semanaId;
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
                      {f.base_semanal ? formatCRC(f.mo_gastada) : '—'}
                    </td>
                    <td className={`${td} text-right font-mono tabular-nums`}>
                      {f.base_semanal ? fmt(f.m2) : '—'}
                    </td>
                    <td className={`${td} text-right font-mono tabular-nums`}>
                      {f.base_semanal && f.m2 > 0 ? formatCRC(f.costo_m2) : '—'}
                    </td>
                  </tr>
                );
              })}
              {data.filas.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-sm text-ds-gray-400">
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
                <td className={`${td} text-right font-mono text-xs font-semibold`}>
                  {formatCRC(data.tot.mo_gastada)}
                </td>
                <td className={`${td} text-right font-mono text-xs font-semibold`}>{fmt(data.tot.m2)}</td>
                <td className={`${td} text-right font-mono text-xs font-semibold`}>
                  {data.tot.m2 > 0 ? formatCRC(data.tot.costo_m2) : '—'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}

// ----------------------------------------------------------------- Auxiliares

const th = 'px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ds-gray-500';
const td = 'px-3 py-2 text-sm text-ds-ink';

function periodo(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}`;
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-ds-gray-500">{titulo}</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">{children}</div>
    </div>
  );
}

function Kpi({
  label,
  value,
  accent,
  small,
  hint,
}: {
  label: string;
  value: string;
  accent?: 'lime' | 'red';
  small?: boolean;
  hint?: string;
}) {
  return (
    <div className="rounded-ds border border-ds-gray-200 bg-ds-surface p-3 shadow-ds-01" title={hint} style={hint ? { cursor: 'help' } : undefined}>
      <p className="text-xs uppercase tracking-wider text-ds-gray-500">{label}</p>
      <p
        className={`font-semibold tabular-nums ${small ? 'text-sub-sm' : 'text-sub'} ${
          accent === 'lime' ? 'text-brand-dark' : accent === 'red' ? 'text-ds-red' : 'text-ds-ink'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function BarrasGastoVsPresup({ gastada, presupuestada }: { gastada: number; presupuestada: number }) {
  const max = Math.max(gastada, presupuestada, 1);
  const Barra = ({ label, val, color }: { label: string; val: number; color: string }) => (
    <div className="flex items-center gap-2">
      <span className="w-40 shrink-0 text-xs text-ds-gray-500">{label}</span>
      <div className="h-5 flex-1 overflow-hidden rounded bg-ds-gray-100">
        <div className={`h-5 rounded ${color}`} style={{ width: `${(val / max) * 100}%` }} />
      </div>
      <span className="w-28 shrink-0 text-right font-mono text-xs tabular-nums">{formatCRC(val)}</span>
    </div>
  );
  return (
    <div className="space-y-2 rounded-ds border border-ds-gray-200 bg-ds-surface p-3 shadow-ds-01">
      <p className="text-xs font-semibold uppercase tracking-wider text-ds-gray-500">
        M.O. Gastada vs Presupuestada
      </p>
      <Barra label="M.O. Gastada" val={gastada} color="bg-ds-yellow" />
      <Barra label="M.O. Presupuestada" val={presupuestada} color="bg-brand" />
    </div>
  );
}
