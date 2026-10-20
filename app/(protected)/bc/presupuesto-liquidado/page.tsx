'use client';
/* eslint-disable react-hooks/set-state-in-effect -- efectos de carga de datos (obras al
   montar, comparación al cambiar de obra): el setState va tras el fetch/await. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { PageShell, PageHeader } from '@/components/layout/Page';
import { Combobox } from '@/components/ui/Combobox';
import { DataTable } from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/Toast';
import { Icon, IconName } from '@/components/ds/Icon/Icon';
import { formatCRC } from '@/lib/utilidades/format';
import type { EstadoPL, PresupuestoLiquidadoResponse, PresupuestoLiquidadoRow } from '@/lib/bc/presupuesto-liquidado';

// Material presupuestado vs. liquidado por obra (SOLO Super Admin). Portado de
// Digitación y armado como dashboard: valores en ₡, por categoría, con gráficos.

const num = new Intl.NumberFormat('es-CR', { maximumFractionDigits: 2 });
const pct = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
const PALETA = ['#16a34a', '#2563eb', '#f59e0b', '#ea580c', '#7c3aed', '#94a3b8', '#0d9488', '#db2777'];

const ESTADO_META: Record<EstadoPL, { label: string; bg: string; fg: string }> = {
  en_rango:           { label: 'En rango',          bg: '#e6f4ea', fg: '#1a8245' },
  revisar:            { label: 'Revisar',           bg: '#f7ecd6', fg: '#b7791f' },
  sobre_presupuesto:  { label: 'Sobre presupuesto', bg: '#f5e1e1', fg: '#bb4a4a' },
};

const COLUMNAS: ColumnDef<PresupuestoLiquidadoRow>[] = [
  { id: 'itemNo', accessorKey: 'itemNo', header: 'Código', meta: { label: 'Código', noFilter: true }, cell: ({ row }) => <span className="font-mono whitespace-nowrap">{row.original.itemNo}</span> },
  { id: 'description', accessorKey: 'description', header: 'Descripción', meta: { label: 'Descripción', noFilter: true }, cell: ({ row }) => row.original.description || '—' },
  { id: 'categoria', accessorKey: 'categoria', header: 'Categoría', meta: { label: 'Categoría' }, cell: ({ row }) => row.original.categoria || '—' },
  { id: 'unidad', accessorKey: 'unitOfMeasureCode', header: 'Unidad', meta: { label: 'Unidad' }, cell: ({ row }) => row.original.unitOfMeasureCode || '—' },
  { id: 'presupCant', accessorKey: 'presupuestadoCant', header: 'Presup. cant', meta: { label: 'Presupuestado (cant)', align: 'right', noFilter: true }, cell: ({ row }) => <span className="whitespace-nowrap">{num.format(row.original.presupuestadoCant)}</span> },
  { id: 'presupValor', accessorKey: 'presupuestadoValor', header: 'Presup. ₡', meta: { label: 'Presupuestado (₡)', align: 'right', noFilter: true }, cell: ({ row }) => <span className="whitespace-nowrap">{formatCRC(row.original.presupuestadoValor)}</span> },
  { id: 'liqCant', accessorKey: 'liquidadoCant', header: 'Liq. cant', meta: { label: 'Liquidado (cant)', align: 'right', noFilter: true }, cell: ({ row }) => <span className="whitespace-nowrap">{num.format(row.original.liquidadoCant)}</span> },
  { id: 'liqValor', accessorKey: 'liquidadoValor', header: 'Liq. ₡', meta: { label: 'Liquidado (₡)', align: 'right', noFilter: true }, cell: ({ row }) => <span className="whitespace-nowrap">{formatCRC(row.original.liquidadoValor)}</span> },
  {
    id: 'variacion', accessorKey: 'variacionPct', header: 'Variación', meta: { label: 'Variación %', align: 'right', noFilter: true },
    cell: ({ row }) => { const v = row.original.variacionPct; return <span className={`font-semibold whitespace-nowrap ${v > 0 ? 'text-ds-red-ink' : v < 0 ? 'text-ds-green-ink' : 'text-ds-gray-400'}`}>{pct(v)}</span>; },
  },
  { id: 'estado', header: 'Estado', meta: { label: 'Estado' }, accessorFn: (r) => ESTADO_META[r.estado].label, cell: ({ row }) => <EstadoChip estado={row.original.estado} /> },
];

interface ObraOpt { codigo: string; nombre: string }

export default function PresupuestoLiquidadoPage() {
  const { toast } = useToast();
  const [obras, setObras] = useState<ObraOpt[]>([]);
  const [obra, setObra] = useState('');
  const [data, setData] = useState<PresupuestoLiquidadoResponse | null>(null);
  const [cargandoObras, setCargandoObras] = useState(true);
  const [loading, setLoading] = useState(false);

  const [categoriaSel, setCategoriaSel] = useState('');
  const [soloVariacion, setSoloVariacion] = useState(false);
  const [vista, setVista] = useState<'resumen' | 'detalle'>('resumen');

  const cargarObras = useCallback(async () => {
    try {
      const res = await fetch('/api/bc/presupuesto-liquidado', { credentials: 'include' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'No se pudieron cargar las obras');
      setObras(Array.isArray(d.obras) ? d.obras : []);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error al cargar obras', 'error');
    } finally {
      setCargandoObras(false);
    }
  }, [toast]);
  useEffect(() => { cargarObras(); }, [cargarObras]);

  useEffect(() => {
    if (!obra) { setData(null); return; }
    let vivo = true;
    setLoading(true);
    setData(null);
    setCategoriaSel('');
    fetch(`/api/bc/presupuesto-liquidado?obra=${encodeURIComponent(obra)}`, { credentials: 'include' })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => { if (!vivo) return; if (!ok) throw new Error(d.error || 'No se pudo cargar'); setData(d as PresupuestoLiquidadoResponse); })
      .catch((e) => { if (vivo) toast(e instanceof Error ? e.message : 'Error al cargar', 'error'); })
      .finally(() => { if (vivo) setLoading(false); });
    return () => { vivo = false; };
  }, [obra, toast]);

  const obraOpts = useMemo(
    () => [{ value: '', label: 'Seleccione una obra' }, ...obras.map((o) => ({ value: o.codigo, label: o.nombre ? `${o.codigo} — ${o.nombre}` : o.codigo }))],
    [obras],
  );
  const categorias = useMemo(
    () => Array.from(new Set((data?.rows ?? []).map((r) => r.categoria).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es')),
    [data],
  );
  const catOpts = useMemo(() => [{ value: '', label: 'Todas las categorías' }, ...categorias.map((c) => ({ value: c, label: c }))], [categorias]);

  const rows = useMemo(() => {
    return (data?.rows ?? []).filter((r) => {
      if (categoriaSel && r.categoria !== categoriaSel) return false;
      if (soloVariacion && r.estado === 'en_rango') return false;
      return true;
    });
  }, [data, categoriaSel, soloVariacion]);

  const k = useMemo(() => {
    const vp = rows.reduce((s, r) => s + r.presupuestadoValor, 0);
    const vl = rows.reduce((s, r) => s + r.liquidadoValor, 0);
    return {
      valorPresup: vp,
      valorLiq: vl,
      diferencia: vp - vl,
      pctLiq: vp > 0 ? (vl / vp) * 100 : 0,
      diffPct: vp > 0 ? ((vp - vl) / vp) * 100 : 0,
      conVariacion: rows.filter((r) => r.estado !== 'en_rango').length,
      total: rows.length,
    };
  }, [rows]);

  const porCategoria = useMemo(() => {
    const m = new Map<string, { presupuestado: number; liquidado: number }>();
    for (const r of rows) {
      const cat = r.categoria || 'Sin categoría';
      const g = m.get(cat) ?? { presupuestado: 0, liquidado: 0 };
      g.presupuestado += r.presupuestadoValor;
      g.liquidado += r.liquidadoValor;
      m.set(cat, g);
    }
    return Array.from(m, ([categoria, v]) => ({ categoria, ...v })).sort((a, b) => (b.presupuestado + b.liquidado) - (a.presupuestado + a.liquidado));
  }, [rows]);

  const donut = useMemo(() => {
    const top = porCategoria.filter((c) => c.liquidado > 0).slice(0, 7).map((c, i) => ({ nombre: c.categoria, valor: c.liquidado, color: PALETA[i % PALETA.length] }));
    const resto = porCategoria.slice(7).reduce((s, c) => s + c.liquidado, 0);
    if (resto > 0) top.push({ nombre: 'Varios', valor: resto, color: '#cbd5e1' });
    return top;
  }, [porCategoria]);

  return (
    <PageShell>
      <PageHeader
        title="Material presupuestado vs. liquidado"
        subtitle="Compará el material presupuestado con el realmente liquidado (consumido), en cantidad y en colones, desde Business Central."
      />

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3 rounded-ds-lg border border-ds-gray-200 bg-ds-surface p-4 shadow-ds-01">
        <div className="w-72"><Combobox label="Obra" value={obra} onChange={setObra} options={obraOpts} placeholder={cargandoObras ? 'Cargando obras…' : 'Seleccione una obra'} emptyText="Sin obras con presupuesto." /></div>
        <div className="w-56"><Combobox label="Categoría" value={categoriaSel} onChange={setCategoriaSel} options={catOpts} placeholder="Todas las categorías" /></div>
        <div className="flex flex-col gap-1.5">
          <span className="text-label text-ds-gray-500">Solo con variación</span>
          <button type="button" onClick={() => setSoloVariacion((v) => !v)} aria-pressed={soloVariacion}
            className={`rounded-ds border px-3 py-2 text-body-sm transition-colors ${soloVariacion ? 'border-ds-ink bg-ds-ink text-ds-surface' : 'border-ds-gray-200 bg-ds-surface text-ds-gray-500 hover:border-ds-gray-300'}`}>
            {soloVariacion ? 'Activado' : 'Todos'}
          </button>
        </div>
        <div className="ml-auto flex flex-col gap-1.5">
          <span className="text-label text-ds-gray-500">Vista</span>
          <div className="inline-flex overflow-hidden rounded-ds border border-ds-gray-200">
            {([{ v: 'resumen', l: 'Resumen' }, { v: 'detalle', l: 'Detalle' }] as const).map((o) => (
              <button key={o.v} type="button" onClick={() => setVista(o.v)}
                className={`px-4 py-2 text-body-sm transition-colors ${vista === o.v ? 'bg-brand text-ds-ink font-semibold' : 'bg-ds-surface text-ds-gray-500 hover:bg-ds-gray-100'}`}>{o.l}</button>
            ))}
          </div>
        </div>
      </div>

      {!obra ? (
        <div className="rounded-ds-lg border border-ds-gray-200 bg-ds-surface py-16 text-center shadow-ds-01">
          <div className="mb-2 flex justify-center text-ds-gray-300"><Icon name="boleta" size="lg" /></div>
          <p className="text-body-sm text-ds-gray-400">Elegí una obra para comparar su presupuesto contra lo liquidado.</p>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard icono="boleta" accent="green" titulo="Valor presupuestado" valor={loading ? '—' : formatCRC(k.valorPresup)} />
            <KpiCard icono="list" accent="blue" titulo="Valor liquidado" valor={loading ? '—' : formatCRC(k.valorLiq)} sub={loading ? undefined : `${k.pctLiq.toFixed(1)}% del presupuesto`} />
            <KpiCard icono="completado" accent="purple" titulo="Diferencia" valor={loading ? '—' : formatCRC(Math.abs(k.diferencia))}
              sub={loading ? undefined : (k.diferencia >= 0 ? `Ahorro · ${k.diffPct.toFixed(1)}%` : `Sobre presupuesto · ${Math.abs(k.diffPct).toFixed(1)}%`)}
              subColor={k.diferencia >= 0 ? 'text-ds-green-ink' : 'text-ds-red-ink'} />
            <KpiCard icono="alert" accent="orange" titulo="Materiales con variación" valor={loading ? '—' : `${num.format(k.conVariacion)}`} sub={loading ? undefined : `de ${num.format(k.total)} materiales`} destacado={k.conVariacion > 0} />
          </div>

          {vista === 'resumen' ? (
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-ds-lg border border-ds-gray-200 bg-ds-surface p-4 shadow-ds-01">
                <SeccionHeader icono="list" titulo="Avance por categoría" leyenda />
                <AvanceCategoria datos={porCategoria.slice(0, 7)} loading={loading} />
              </div>
              <div className="rounded-ds-lg border border-ds-gray-200 bg-ds-surface p-4 shadow-ds-01">
                <SeccionHeader icono="completado" titulo="Distribución del valor liquidado" />
                <Donut datos={donut} total={k.valorLiq} loading={loading} />
              </div>
            </div>
          ) : (
            <div className="rounded-ds-lg border border-ds-gray-200 bg-ds-surface p-4 shadow-ds-01">
              <DataTable<PresupuestoLiquidadoRow>
                columns={COLUMNAS}
                data={rows}
                loading={loading}
                searchPlaceholder="Código, descripción o categoría…"
                exportFilename={`presupuesto-liquidado-${obra}`}
                pageSize={50}
                emptyMessage="Sin materiales con los filtros actuales."
                persistKey="bc-presupuesto-liquidado"
              />
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}

const ACCENTS: Record<string, { bg: string; fg: string }> = {
  green: { bg: '#e6f4ea', fg: '#1a8245' },
  blue: { bg: '#e3edfb', fg: '#2f66b8' },
  purple: { bg: '#ece3fb', fg: '#7c3aed' },
  orange: { bg: '#fdecd6', fg: '#b7791f' },
};

function KpiCard({ icono, accent, titulo, valor, sub, subColor, destacado }: { icono: IconName; accent: string; titulo: string; valor: string; sub?: string; subColor?: string; destacado?: boolean }) {
  const a = ACCENTS[accent] ?? ACCENTS.green;
  return (
    <div className={`flex items-center gap-3 rounded-ds-lg border p-4 shadow-ds-01 ${destacado ? 'border-ds-yellow-ink bg-ds-yellow-soft' : 'border-ds-gray-200 bg-ds-surface'}`}>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-ds" style={{ background: a.bg, color: a.fg }}><Icon name={icono} size="md" /></span>
      <div className="min-w-0">
        <p className="text-label uppercase tracking-wide text-ds-gray-400">{titulo}</p>
        <p className="text-sub-sm font-bold text-ds-ink">{valor}</p>
        {sub && <p className={`text-label ${subColor ?? 'text-ds-gray-400'}`}>{sub}</p>}
      </div>
    </div>
  );
}

function SeccionHeader({ icono, titulo, leyenda }: { icono: IconName; titulo: string; leyenda?: boolean }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-ds bg-ds-gray-100 text-ds-gray-500"><Icon name={icono} size="sm" /></span>
        <h2 className="text-body font-semibold text-ds-ink">{titulo}</h2>
      </div>
      {leyenda && (
        <div className="flex items-center gap-3 text-label text-ds-gray-500">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: '#16a34a' }} /> Presupuestado</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: '#2563eb' }} /> Liquidado</span>
        </div>
      )}
    </div>
  );
}

function EstadoChip({ estado }: { estado: EstadoPL }) {
  const m = ESTADO_META[estado];
  return <span className="inline-flex items-center rounded-ds px-2 py-0.5 text-label font-medium" style={{ background: m.bg, color: m.fg }}>{m.label}</span>;
}

function AvanceCategoria({ datos, loading }: { datos: { categoria: string; presupuestado: number; liquidado: number }[]; loading?: boolean }) {
  const max = Math.max(1, ...datos.flatMap((d) => [d.presupuestado, d.liquidado]));
  if (loading) return <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-8 animate-pulse rounded-ds bg-ds-gray-100" />)}</div>;
  if (datos.length === 0) return <p className="py-8 text-center text-body-sm text-ds-gray-400">Sin datos</p>;
  return (
    <div className="space-y-3">
      {datos.map((d) => (
        <div key={d.categoria} className="grid grid-cols-[minmax(90px,120px)_1fr_auto] items-center gap-3">
          <span className="break-words text-body-sm text-ds-gray-600" title={d.categoria}>{d.categoria}</span>
          <div className="space-y-1">
            <div className="h-2.5 overflow-hidden rounded-ds bg-ds-gray-100"><div className="h-full rounded-ds" style={{ width: `${(d.presupuestado / max) * 100}%`, background: '#16a34a' }} /></div>
            <div className="h-2.5 overflow-hidden rounded-ds bg-ds-gray-100"><div className="h-full rounded-ds" style={{ width: `${(d.liquidado / max) * 100}%`, background: '#2563eb' }} /></div>
          </div>
          <div className="text-right font-mono text-label leading-tight">
            <div className="text-ds-gray-600">{formatCRC(d.presupuestado)}</div>
            <div className="text-ds-gray-400">{formatCRC(d.liquidado)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Donut({ datos, total, loading }: { datos: { nombre: string; valor: number; color: string }[]; total: number; loading?: boolean }) {
  const r = 70, sw = 24, c = 2 * Math.PI * r;
  if (loading) return <div className="h-44 animate-pulse rounded-ds bg-ds-gray-100" />;
  if (datos.length === 0 || total <= 0) return <p className="py-8 text-center text-body-sm text-ds-gray-400">Sin liquidado</p>;
  const segs = datos.map((d, i) => { const antes = datos.slice(0, i).reduce((s, x) => s + x.valor, 0); return { ...d, len: (d.valor / total) * c, offset: (antes / total) * c }; });
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row">
      <div className="relative shrink-0" style={{ width: 180, height: 180 }}>
        <svg width="180" height="180" viewBox="0 0 180 180">
          <g transform="translate(90,90) rotate(-90)">
            <circle r={r} fill="none" stroke="#eef0f2" strokeWidth={sw} />
            {segs.map((d) => <circle key={d.nombre} r={r} fill="none" stroke={d.color} strokeWidth={sw} strokeDasharray={`${d.len} ${c - d.len}`} strokeDashoffset={-d.offset} />)}
          </g>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-body font-bold text-ds-ink">{formatCRC(total)}</span>
          <span className="text-label uppercase tracking-wide text-ds-gray-400">Liquidado</span>
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-1.5 self-stretch">
        {datos.map((d) => (
          <div key={d.nombre} className="flex items-center gap-2 text-body-sm">
            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: d.color }} />
            <span className="min-w-0 flex-1 break-words text-ds-gray-600">{d.nombre}</span>
            <span className="w-12 shrink-0 text-right font-mono text-ds-gray-400">{((d.valor / total) * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
