'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowsClockwise } from '@phosphor-icons/react';
import type { ColumnDef } from '@tanstack/react-table';
import { PageShell, PageHeader } from '@/components/layout/Page';
import { DataTable } from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/Toast';
import { Icon, IconName } from '@/components/ds/Icon/Icon';

// Reporte de inventario por almacén (SOLO Super Admin). Lee el snapshot
// dbo.InventarioAlmacen vía /api/bc/inventario/almacen. Lo importante es lo SIN
// LIQUIDAR: material apartado al almacén de proyecto (gomJobWarehouseQuantity > 0),
// lo que muestra la página "Almacén de proyecto" de BC. Se actualiza SOLO al abrir
// (si la foto está vieja, sincroniza en segundo plano). El detalle usa el DataTable
// del DS: filtros por columna, orden, Columnas, búsqueda y exportar.

interface Fila {
  entryNo: number;
  almacen: string | null;
  tipoAlmacen: string | null;
  esVirtual: boolean;
  categoria: string | null;
  itemNo: string;
  descripcion: string | null;
  obra: string | null;
  unidad: string | null;
  cantidad: number;
  cantidadProyecto: number;
  costoActual: number | null;
  proveedor: string | null;
  documentoNo: string | null;
  tipoMovimiento: string | null;
  fechaMovimiento: string | null;
}
interface Estado {
  ultimaCorrida: string | null;
  filas: number | null;
  ok: boolean | null;
  ms: number | null;
  mensaje: string | null;
}

const STALE_MS = 10 * 60 * 1000;
const num = new Intl.NumberFormat('es-CR', { maximumFractionDigits: 2 });
const PALETA = ['#84cc16', '#4d7c0f', '#16a34a', '#0d9488', '#0ea5e9', '#2563eb', '#6366f1', '#a855f7', '#f59e0b'];
const COLOR_OTROS = '#cbd5e1';

function fechaHora(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('es-CR', { dateStyle: 'medium', timeStyle: 'short' });
}

function agrupar(filas: Fila[], key: (f: Fila) => string): { nombre: string; valor: number }[] {
  const m = new Map<string, number>();
  for (const f of filas) {
    const k = key(f);
    m.set(k, (m.get(k) ?? 0) + (f.cantidadProyecto || 0));
  }
  return Array.from(m, ([nombre, valor]) => ({ nombre, valor })).sort((a, b) => b.valor - a.valor);
}

const COLUMNAS: ColumnDef<Fila>[] = [
  {
    id: 'almacen', accessorKey: 'almacen', header: 'Almacén', meta: { label: 'Almacén' },
    cell: ({ row }) => (
      <span className="inline-flex items-center gap-2 font-semibold whitespace-nowrap">
        {row.original.almacen || '—'}
        {row.original.esVirtual && <span className="inline-flex items-center rounded-ds bg-ds-yellow-soft px-1.5 py-0.5 text-label font-medium text-ds-yellow-ink">sin liquidar</span>}
      </span>
    ),
  },
  { id: 'categoria', accessorKey: 'categoria', header: 'Categoría', meta: { label: 'Categoría' }, cell: ({ row }) => row.original.categoria || '—' },
  { id: 'itemNo', accessorKey: 'itemNo', header: 'Artículo', meta: { label: 'Artículo', noFilter: true }, cell: ({ row }) => <span className="font-mono whitespace-nowrap">{row.original.itemNo}</span> },
  { id: 'descripcion', accessorKey: 'descripcion', header: 'Descripción', meta: { label: 'Descripción', noFilter: true }, cell: ({ row }) => row.original.descripcion || '—' },
  { id: 'obra', accessorKey: 'obra', header: 'Obra', meta: { label: 'Obra' }, cell: ({ row }) => <span className="whitespace-nowrap">{row.original.obra || '—'}</span> },
  { id: 'cantidad', accessorKey: 'cantidad', header: 'Existencia', meta: { label: 'Existencia', align: 'right', noFilter: true }, cell: ({ row }) => <span className="whitespace-nowrap">{num.format(row.original.cantidad)}</span> },
  {
    id: 'cantidadProyecto', accessorKey: 'cantidadProyecto', header: 'Sin liquidar', meta: { label: 'Sin liquidar', align: 'right', noFilter: true },
    cell: ({ row }) => row.original.cantidadProyecto > 0 ? <span className="font-semibold text-ds-yellow-ink whitespace-nowrap">{num.format(row.original.cantidadProyecto)}</span> : <span className="text-ds-gray-300">—</span>,
  },
  { id: 'unidad', accessorKey: 'unidad', header: 'Unidad', meta: { label: 'Unidad' }, cell: ({ row }) => row.original.unidad || '—' },
  { id: 'proveedor', accessorKey: 'proveedor', header: 'Proveedor', meta: { label: 'Proveedor' }, cell: ({ row }) => row.original.proveedor || '—' },
  {
    id: 'fechaMovimiento', accessorKey: 'fechaMovimiento', header: 'Fecha',
    meta: { label: 'Fecha', noFilter: true, exportValue: (r: Fila) => r.fechaMovimiento?.slice(0, 10) ?? '' },
    cell: ({ row }) => <span className="whitespace-nowrap">{row.original.fechaMovimiento ? row.original.fechaMovimiento.slice(0, 10) : '—'}</span>,
  },
];

export default function ReporteInventarioPage() {
  const { toast } = useToast();
  const [filas, setFilas] = useState<Fila[]>([]);
  const [estado, setEstado] = useState<Estado | null>(null);
  const [loading, setLoading] = useState(true);
  const [actualizando, setActualizando] = useState(false);
  const [soloVirtuales, setSoloVirtuales] = useState(true);
  const yaAutorefresco = useRef(false);

  const cargar = useCallback(async (): Promise<Estado | null> => {
    try {
      const res = await fetch('/api/bc/inventario/almacen', { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo cargar el inventario');
      setFilas(Array.isArray(data.filas) ? data.filas : []);
      setEstado(data.estado ?? null);
      return (data.estado ?? null) as Estado | null;
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error al cargar', 'error');
      return null;
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const sincronizar = useCallback(async () => {
    setActualizando(true);
    try {
      const res = await fetch('/api/bc/inventario/sync-almacen', { method: 'POST', credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo actualizar');
      await cargar();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo actualizar desde BC', 'error');
    } finally {
      setActualizando(false);
    }
  }, [cargar, toast]);

  // Al abrir: carga la foto y, si está vieja (o vacía), re-sincroniza SOLA una vez.
  useEffect(() => {
    let vivo = true;
    (async () => {
      const est = await cargar();
      if (!vivo || yaAutorefresco.current) return;
      const edad = est?.ultimaCorrida ? Date.now() - new Date(est.ultimaCorrida).getTime() : Infinity;
      if (edad > STALE_MS) {
        yaAutorefresco.current = true;
        sincronizar();
      }
    })();
    return () => { vivo = false; };
  }, [cargar, sincronizar]);

  const soloSinLiquidar = useMemo(() => filas.filter((f) => f.esVirtual), [filas]);
  const dataset = useMemo(() => (soloVirtuales ? soloSinLiquidar : filas), [soloVirtuales, soloSinLiquidar, filas]);
  const totalSinLiquidar = useMemo(() => soloSinLiquidar.reduce((s, f) => s + (f.cantidadProyecto || 0), 0), [soloSinLiquidar]);

  const kpis = useMemo(() => ({
    movimientos: dataset.length,
    almacenes: new Set(dataset.map((f) => f.almacen)).size,
    cantidad: dataset.reduce((s, f) => s + (f.cantidad || 0), 0),
    sinLiquidar: totalSinLiquidar,
  }), [dataset, totalSinLiquidar]);

  const porAlmacen = useMemo(() => agrupar(soloSinLiquidar, (f) => f.almacen ?? '—').slice(0, 10), [soloSinLiquidar]);
  const donutCategoria = useMemo(() => {
    const full = agrupar(soloSinLiquidar, (f) => f.categoria ?? 'Sin categoría');
    const top = full.slice(0, 9).map((d, i) => ({ ...d, color: PALETA[i % PALETA.length] }));
    const resto = full.slice(9).reduce((s, d) => s + d.valor, 0);
    if (resto > 0) top.push({ nombre: 'Otros', valor: resto, color: COLOR_OTROS });
    return top;
  }, [soloSinLiquidar]);

  return (
    <PageShell>
      <PageHeader
        title="Reporte de inventario"
        subtitle="Material apartado al almacén de proyecto que aún no se liquidó, tomado de Business Central. Se actualiza solo al abrir."
        actions={
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-2 text-body-sm text-ds-gray-500">
              <span className={`h-2 w-2 rounded-full ${actualizando ? 'animate-pulse bg-ds-yellow-ink' : 'bg-ds-green-ink'}`} />
              {actualizando ? 'Actualizando desde BC…' : estado?.ultimaCorrida ? `Actualizado · ${fechaHora(estado.ultimaCorrida)}` : 'Sin datos aún'}
            </span>
            <button type="button" onClick={sincronizar} disabled={actualizando} title="Actualizar ahora"
              className="inline-flex items-center gap-2 rounded-ds border border-ds-gray-200 bg-ds-surface px-3 py-2 text-body-sm font-medium text-ds-gray-600 transition-colors hover:border-ds-gray-300 disabled:opacity-50">
              <ArrowsClockwise size={16} className={actualizando ? 'animate-spin' : ''} /> Actualizar
            </button>
          </div>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard titulo="Movimientos" valor={loading ? '—' : num.format(kpis.movimientos)} icono="list" />
        <KpiCard titulo="Almacenes" valor={loading ? '—' : num.format(kpis.almacenes)} icono="traslado" />
        <KpiCard titulo="Existencia total" valor={loading ? '—' : num.format(kpis.cantidad)} icono="calculator" />
        <KpiCard titulo="Apartado sin liquidar" valor={loading ? '—' : num.format(kpis.sinLiquidar)} icono="alert" destacado={kpis.sinLiquidar > 0} />
      </div>

      {/* Alcance */}
      <div className="flex items-center gap-2">
        <span className="text-label text-ds-gray-500">Mostrar:</span>
        <div className="inline-flex overflow-hidden rounded-ds border border-ds-gray-200">
          {[{ v: true, l: 'Solo sin liquidar' }, { v: false, l: 'Todo el inventario' }].map((o) => (
            <button key={o.l} type="button" onClick={() => setSoloVirtuales(o.v)}
              className={`px-3 py-1.5 text-body-sm transition-colors ${soloVirtuales === o.v ? 'bg-ds-ink text-ds-surface' : 'bg-ds-surface text-ds-gray-500 hover:bg-ds-gray-100'}`}>
              {o.l}
            </button>
          ))}
        </div>
      </div>

      {/* Gráficos */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-ds-lg border border-ds-gray-200 bg-ds-surface p-4 shadow-ds-01">
          <SeccionHeader icono="traslado" titulo="Apartado sin liquidar por almacén" />
          <BarChart datos={porAlmacen} loading={loading} />
        </div>
        <div className="rounded-ds-lg border border-ds-gray-200 bg-ds-surface p-4 shadow-ds-01">
          <SeccionHeader icono="list" titulo="Apartado sin liquidar por categoría" />
          <Donut datos={donutCategoria} total={totalSinLiquidar} loading={loading} />
        </div>
      </div>

      {/* Detalle (DataTable del DS: filtros por columna, orden, Columnas, exportar) */}
      <div className="rounded-ds-lg border border-ds-gray-200 bg-ds-surface p-4 shadow-ds-01">
        <SeccionHeader icono="boleta" titulo="Detalle de artículos" />
        <DataTable<Fila>
          columns={COLUMNAS}
          data={dataset}
          loading={loading}
          searchPlaceholder="Artículo, descripción, obra…"
          exportFilename="inventario-sin-liquidar"
          pageSize={50}
          emptyMessage={soloVirtuales ? 'No hay material sin liquidar.' : 'Sin movimientos.'}
          persistKey="bc-reporte-inventario"
        />
      </div>
    </PageShell>
  );
}

function KpiCard({ titulo, valor, icono, destacado }: { titulo: string; valor: string; icono: IconName; destacado?: boolean }) {
  return (
    <div className={`flex items-center gap-3 rounded-ds-lg border p-4 shadow-ds-01 ${destacado ? 'border-ds-yellow-ink bg-ds-yellow-soft' : 'border-ds-gray-200 bg-ds-surface'}`}>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-ds ${destacado ? 'bg-ds-yellow-ink/15 text-ds-yellow-ink' : 'bg-ds-gray-100 text-ds-gray-500'}`}>
        <Icon name={icono} size="md" />
      </span>
      <div className="min-w-0">
        <p className="text-label uppercase tracking-wide text-ds-gray-400">{titulo}</p>
        <p className={`text-sub-sm font-bold ${destacado ? 'text-ds-yellow-ink' : 'text-ds-ink'}`}>{valor}</p>
      </div>
    </div>
  );
}

function SeccionHeader({ icono, titulo }: { icono: IconName; titulo: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-ds bg-ds-gray-100 text-ds-gray-500"><Icon name={icono} size="sm" /></span>
      <h2 className="text-body font-semibold text-ds-ink">{titulo}</h2>
    </div>
  );
}

function BarChart({ datos, loading }: { datos: { nombre: string; valor: number }[]; loading?: boolean }) {
  const max = Math.max(1, ...datos.map((d) => d.valor));
  if (loading) return <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-5 animate-pulse rounded-ds bg-ds-gray-100" />)}</div>;
  if (datos.length === 0) return <p className="py-8 text-center text-body-sm text-ds-gray-400">Sin material sin liquidar</p>;
  return (
    <div className="space-y-2">
      {datos.map((d) => (
        <div key={d.nombre} className="flex items-center gap-3">
          <span className="w-28 shrink-0 break-words text-body-sm text-ds-gray-600" title={d.nombre}>{d.nombre}</span>
          <div className="h-5 flex-1 overflow-hidden rounded-ds bg-ds-gray-100">
            <div className="h-full rounded-ds bg-brand" style={{ width: `${(d.valor / max) * 100}%` }} />
          </div>
          <span className="w-20 shrink-0 text-right font-mono text-body-sm text-ds-ink">{num.format(d.valor)}</span>
        </div>
      ))}
    </div>
  );
}

function Donut({ datos, total, loading }: { datos: { nombre: string; valor: number; color: string }[]; total: number; loading?: boolean }) {
  const r = 70, sw = 24, c = 2 * Math.PI * r;
  if (loading) return <div className="h-44 animate-pulse rounded-ds bg-ds-gray-100" />;
  if (datos.length === 0 || total <= 0) return <p className="py-8 text-center text-body-sm text-ds-gray-400">Sin material sin liquidar</p>;
  const segs = datos.map((d, i) => {
    const antes = datos.slice(0, i).reduce((s, x) => s + x.valor, 0);
    return { ...d, len: (d.valor / total) * c, offset: (antes / total) * c };
  });
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row">
      <div className="relative shrink-0" style={{ width: 180, height: 180 }}>
        <svg width="180" height="180" viewBox="0 0 180 180">
          <g transform="translate(90,90) rotate(-90)">
            <circle r={r} fill="none" stroke="#eef0f2" strokeWidth={sw} />
            {segs.map((d) => (
              <circle key={d.nombre} r={r} fill="none" stroke={d.color} strokeWidth={sw} strokeDasharray={`${d.len} ${c - d.len}`} strokeDashoffset={-d.offset} />
            ))}
          </g>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-sub-sm font-bold text-ds-ink">{num.format(total)}</span>
          <span className="text-label uppercase tracking-wide text-ds-gray-400">Total</span>
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-1.5 self-stretch">
        {datos.map((d) => (
          <div key={d.nombre} className="flex items-center gap-2 text-body-sm">
            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: d.color }} />
            <span className="min-w-0 flex-1 break-words text-ds-gray-600">{d.nombre}</span>
            <span className="shrink-0 font-mono text-ds-ink">{num.format(d.valor)}</span>
            <span className="w-12 shrink-0 text-right font-mono text-ds-gray-400">{((d.valor / total) * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
