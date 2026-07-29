'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';
import { Combobox } from '@/components/ui/Combobox';
import { DataTable } from '@/components/ui/DataTable';
import { Skeleton } from '@/components/ui/Skeleton';
import { ComentariosPanel } from './ComentariosPanel';
import { formatCRC, abreviarCRC, formatPct, extraerBloque, etiquetaMes, MESES } from '@/lib/utilidades/format';

// ─── Tipos de la respuesta del API ─────────────────────────────────────────
interface Resumen {
  ecuacionPrincipal: {
    utilidad_ingresada: number;
    devolucion_utilidad: number;
    utilidad_total: number;
    utilidad_gastada: number;
    utilidad_neta: number;
    ingreso_bruto: number;
    ingreso_neto_ad: number;
  };
  componentesGastada: Record<string, number>;
  distribucionPorTipo: { tipo_movimiento: string; monto_total: number; cantidad_movimientos: number }[];
  movimientosPorLote: { lote: string; monto: number }[];
}

interface Ingresos {
  kpisActual: { ingresos: number; ingreso_neto_ad: number; utilidad: number; porcentaje: number | null };
  kpisAnterior: { ingresos: number; ingreso_neto_ad: number; utilidad: number; porcentaje: number | null };
  porLote: { lote: string; ingresos: number; ingreso_neto_ad: number; utilidad: number }[];
}

const NOMBRES_COMPONENTES: Record<string, string> = {
  inversion_casas: 'Inv. Casas',
  inversion_proyectos: 'Inv. Proyectos',
  otros: 'Otros',
  salida_quinta: 'Quinta',
  salida_homes: 'Homes',
  salida_socios: 'Socios',
  credito_clientes: 'Créd. Clientes',
  credito_colaboradores: 'Créd. Colabs.',
  compra_maquinaria: 'Maquinaria',
};

// ─── Sub-componentes de presentación (DS-native) ────────────────────────────
function KpiCard({
  titulo,
  monto,
  destacado,
  delta,
}: {
  titulo: string;
  monto: number;
  destacado?: boolean;
  delta?: number | null;
}) {
  return (
    <div
      className={`rounded-ds-lg border p-4 shadow-ds-01 ${
        destacado ? 'bg-black text-white border-black' : 'bg-white border-ds-gray-200'
      }`}
    >
      <p className={`text-xs uppercase tracking-wide ${destacado ? 'text-white/60' : 'text-ds-gray-400'}`}>
        {titulo}
      </p>
      <p className={`mt-1 text-sub-sm font-bold ${destacado ? 'text-brand' : 'text-black'}`}>{formatCRC(monto)}</p>
      {delta !== undefined && delta !== null && Number.isFinite(delta) && (
        <p className={`mt-0.5 text-xs ${delta >= 0 ? 'text-ds-green-ink' : 'text-ds-red'}`}>
          {delta >= 0 ? '▲' : '▼'} {formatPct(Math.abs(delta))} vs. período anterior
        </p>
      )}
    </div>
  );
}

// Gráfico simple DS-native: barras horizontales con divs (sin librerías).
function BarrasHorizontales({ datos }: { datos: { nombre: string; monto: number }[] }) {
  const max = Math.max(1, ...datos.map((d) => Math.abs(d.monto)));
  if (datos.length === 0) return <p className="py-8 text-center text-sm text-ds-gray-300">Sin datos</p>;
  return (
    <div className="space-y-2">
      {datos.map((d) => (
        <div key={d.nombre} className="flex items-center gap-3">
          <span className="w-28 shrink-0 text-xs text-ds-gray-500 truncate">{d.nombre}</span>
          <div className="flex-1 h-5 bg-ds-gray-100 rounded-ds overflow-hidden">
            <div className="h-full bg-brand rounded-ds" style={{ width: `${(Math.abs(d.monto) / max) * 100}%` }} />
          </div>
          <span className="w-24 shrink-0 text-right text-xs font-mono text-black">{abreviarCRC(d.monto)}</span>
        </div>
      ))}
    </div>
  );
}

const colTipo = createColumnHelper<{ tipo_movimiento: string; monto_total: number; cantidad_movimientos: number }>();
const colLoteMov = createColumnHelper<{ lote: string; bloque: string; monto: number }>();
const colLoteIng = createColumnHelper<{ lote: string; ingresos: number; ingreso_neto_ad: number; utilidad: number }>();

// ─── Página ─────────────────────────────────────────────────────────────────
export default function UtilidadesPage() {
  // Default: mes anterior al actual (último mes cerrado).
  const hoy = new Date();
  const prev = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
  const [anio, setAnio] = useState(prev.getFullYear());
  const [mes, setMes] = useState(prev.getMonth() + 1);
  const [tab, setTab] = useState<'resumen' | 'lotes'>('resumen');

  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [ingresos, setIngresos] = useState<Ingresos | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = `anio=${anio}&mes=${mes}`;
    const [r, i] = await Promise.all([
      fetch(`/api/utilidades/resumen?${qs}`).then((res) => (res.ok ? res.json() : null)).catch(() => null),
      fetch(`/api/utilidades/ingresos?${qs}`).then((res) => (res.ok ? res.json() : null)).catch(() => null),
    ]);
    setResumen(r);
    setIngresos(i);
    setLoading(false);
  }, [anio, mes]);

  useEffect(() => {
    load();
  }, [load]);

  // Componentes de la utilidad gastada → barras.
  const datosGastada = useMemo(() => {
    if (!resumen) return [];
    return Object.entries(resumen.componentesGastada)
      .map(([k, v]) => ({ nombre: NOMBRES_COMPONENTES[k] ?? k, monto: Number(v) }))
      .filter((d) => d.monto > 0)
      .sort((a, b) => b.monto - a.monto);
  }, [resumen]);

  const movLote = useMemo(
    () => (resumen?.movimientosPorLote ?? []).map((f) => ({ ...f, bloque: extraerBloque(f.lote), monto: Number(f.monto) })),
    [resumen],
  );

  // Deltas vs período anterior (fracción).
  const delta = (act: number, ant: number) => (ant !== 0 ? (act - ant) / Math.abs(ant) : null);

  const columnasTipo: ColumnDef<{ tipo_movimiento: string; monto_total: number; cantidad_movimientos: number }, any>[] = [
    colTipo.accessor('tipo_movimiento', { header: 'Tipo de movimiento', meta: { label: 'Tipo de movimiento' } }),
    colTipo.accessor('monto_total', {
      header: 'Monto', meta: { label: 'Monto', align: 'right', exportValue: (r) => r.monto_total },
      cell: ({ getValue }) => <span className="font-mono">{formatCRC(Number(getValue()))}</span>,
    }),
    colTipo.accessor('cantidad_movimientos', {
      header: 'Movimientos', meta: { label: 'Movimientos', align: 'right' },
      cell: ({ getValue }) => <span className="text-ds-gray-400">{String(getValue())}</span>,
    }),
  ];

  const columnasMovLote: ColumnDef<{ lote: string; bloque: string; monto: number }, any>[] = [
    colLoteMov.accessor('bloque', { header: 'Bloque', meta: { label: 'Bloque' } }),
    colLoteMov.accessor('lote', {
      header: 'Lote', meta: { label: 'Lote' },
      cell: ({ getValue }) => <span className="font-semibold text-black">{getValue() as string}</span>,
    }),
    colLoteMov.accessor('monto', {
      header: 'Monto', meta: { label: 'Monto', align: 'right', exportValue: (r) => r.monto },
      cell: ({ getValue }) => <span className="font-mono">{formatCRC(Number(getValue()))}</span>,
    }),
  ];

  const columnasIngLote: ColumnDef<{ lote: string; ingresos: number; ingreso_neto_ad: number; utilidad: number }, any>[] = [
    colLoteIng.accessor('lote', {
      header: 'Lote', meta: { label: 'Lote' },
      cell: ({ getValue }) => <span className="font-semibold text-black">{getValue() as string}</span>,
    }),
    colLoteIng.accessor('ingresos', {
      header: 'Ingreso Bruto', meta: { label: 'Ingreso Bruto', align: 'right', exportValue: (r) => r.ingresos },
      cell: ({ getValue }) => <span className="font-mono">{formatCRC(Number(getValue()))}</span>,
    }),
    colLoteIng.accessor('ingreso_neto_ad', {
      header: 'Ingreso Neto AD', meta: { label: 'Ingreso Neto AD', align: 'right', exportValue: (r) => r.ingreso_neto_ad },
      cell: ({ getValue }) => <span className="font-mono">{formatCRC(Number(getValue()))}</span>,
    }),
    colLoteIng.accessor('utilidad', {
      header: 'Utilidad', meta: { label: 'Utilidad', align: 'right', exportValue: (r) => r.utilidad },
      cell: ({ getValue }) => <span className="font-mono font-semibold text-black">{formatCRC(Number(getValue()))}</span>,
    }),
  ];

  const aniosOpts = useMemo(() => {
    const y = hoy.getFullYear();
    return Array.from({ length: 6 }, (_, i) => y - i).map((a) => ({ value: String(a), label: String(a) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const mesesOpts = MESES.map((m, i) => ({ value: String(i + 1), label: m }));

  return (
    <div className="p-6 space-y-5 max-w-[1600px] mx-auto animate-fade-in">
      {/* Header + selector de período */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-heading font-bold text-black">Reporte de Utilidades</h1>
          <p className="text-ds-gray-400 text-body-sm">{etiquetaMes(anio, mes)}</p>
        </div>
        <div className="flex items-end gap-3">
          <Combobox
            label="Mes"
            value={String(mes)}
            onChange={(v) => setMes(Number(v))}
            options={mesesOpts}
            placeholder="Mes"
          />
          <Combobox
            label="Año"
            value={String(anio)}
            onChange={(v) => setAnio(Number(v))}
            options={aniosOpts}
            placeholder="Año"
          />
        </div>
      </div>

      {/* Tabs — toggle pill compacto (consistente con el resto del app) */}
      <div className="inline-flex gap-1 p-1 bg-ds-gray-100 rounded-full">
        {([['resumen', 'Resumen mensual'], ['lotes', 'Utilidad por lote']] as const).map(([k, lbl]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`px-5 h-10 rounded-full text-sm font-semibold transition-all ${
              tab === k ? 'bg-black text-white shadow-ds-02' : 'text-ds-gray-400 hover:text-black'
            }`}
          >
            {lbl}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      ) : tab === 'resumen' ? (
        <div className="space-y-6">
          {/* Ingresos del período */}
          <section className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-ds-gray-400">Ingresos del período</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
              <KpiCard titulo="Ingreso Bruto" monto={resumen?.ecuacionPrincipal.ingreso_bruto ?? 0} />
              <KpiCard titulo="Ingreso Neto AD" monto={resumen?.ecuacionPrincipal.ingreso_neto_ad ?? 0} destacado />
            </div>
          </section>

          {/* Ecuación de utilidad */}
          <section className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-ds-gray-400">Utilidad</p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <KpiCard titulo="Ingresada" monto={resumen?.ecuacionPrincipal.utilidad_ingresada ?? 0} />
              <KpiCard titulo="Devolución" monto={resumen?.ecuacionPrincipal.devolucion_utilidad ?? 0} />
              <KpiCard titulo="Total" monto={resumen?.ecuacionPrincipal.utilidad_total ?? 0} />
              <KpiCard titulo="Gastada" monto={resumen?.ecuacionPrincipal.utilidad_gastada ?? 0} />
              <KpiCard titulo="Neta" monto={resumen?.ecuacionPrincipal.utilidad_neta ?? 0} destacado />
            </div>
          </section>

          {/* Utilidad gastada (barras DS) */}
          <section className="bg-white rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-4 space-y-3">
            <h3 className="font-bold text-black text-sm">Utilidad gastada — componentes</h3>
            <BarrasHorizontales datos={datosGastada} />
          </section>

          {/* Distribución por tipo */}
          <section className="space-y-2">
            <h3 className="font-bold text-black text-sm">Distribución por tipo de movimiento</h3>
            <DataTable
              columns={columnasTipo}
              data={resumen?.distribucionPorTipo ?? []}
              searchPlaceholder="Buscar tipo…"
              exportFilename="utilidades-por-tipo"
              emptyMessage="Sin movimientos"
            />
          </section>

          <ComentariosPanel anio={anio} mes={mes} scope="ejecutivo" titulo="Comentario ejecutivo del mes" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* KPIs ingresos con comparación */}
          <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              titulo="Ingreso Bruto"
              monto={ingresos?.kpisActual.ingresos ?? 0}
              delta={ingresos ? delta(ingresos.kpisActual.ingresos, ingresos.kpisAnterior.ingresos) : null}
            />
            <KpiCard
              titulo="Ingreso Neto AD"
              monto={ingresos?.kpisActual.ingreso_neto_ad ?? 0}
              delta={ingresos ? delta(ingresos.kpisActual.ingreso_neto_ad, ingresos.kpisAnterior.ingreso_neto_ad) : null}
            />
            <KpiCard
              titulo="Utilidad"
              monto={ingresos?.kpisActual.utilidad ?? 0}
              destacado
              delta={ingresos ? delta(ingresos.kpisActual.utilidad, ingresos.kpisAnterior.utilidad) : null}
            />
            <div className="rounded-ds-lg border border-ds-gray-200 bg-white p-4 shadow-ds-01">
              <p className="text-xs uppercase tracking-wide text-ds-gray-400">% Utilidad</p>
              <p className="mt-1 text-sub-sm font-bold text-black">{formatPct(ingresos?.kpisActual.porcentaje ?? null)}</p>
            </div>
          </section>

          {/* Ingresos y utilidad por lote */}
          <section className="space-y-2">
            <h3 className="font-bold text-black text-sm">Ingresos y utilidad por lote</h3>
            <DataTable
              columns={columnasIngLote}
              data={ingresos?.porLote ?? []}
              searchPlaceholder="Buscar lote…"
              exportFilename="utilidad-por-lote"
              emptyMessage="Sin datos"
            />
          </section>

          {/* Movimientos por lote (del resumen) */}
          <section className="space-y-2">
            <h3 className="font-bold text-black text-sm">Movimientos por lote</h3>
            <DataTable
              columns={columnasMovLote}
              data={movLote}
              searchPlaceholder="Buscar lote o bloque…"
              exportFilename="movimientos-por-lote"
              emptyMessage="Sin movimientos"
            />
          </section>

          <ComentariosPanel anio={anio} mes={mes} scope="seccion" seccionId="ingresos" titulo="Comentario — utilidad por lote" />
        </div>
      )}

      {/* TODO(utilidades): drilldown de movimientos por lote (v_movimientos_con_indirecto),
          indirectos por obra, evolución mensual como gráfico, export PDF/Excel del reporte,
          envío del reporte (uti.envios_reporte), comentarios a nivel de celda (3ª capa),
          filtros por tipo/lote y selector de período por trimestre/año/rango. */}
    </div>
  );
}
