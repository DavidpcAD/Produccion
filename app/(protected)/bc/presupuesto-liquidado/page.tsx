'use client';
/* eslint-disable react-hooks/set-state-in-effect -- efectos de carga de datos (obras al
   montar, comparación al cambiar de obra): el setState va tras el fetch/await, es el
   patrón normal de "cargar al abrir". */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { PageShell, PageHeader } from '@/components/layout/Page';
import { Combobox } from '@/components/ui/Combobox';
import { DataTable } from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/Toast';
import { Icon, IconName } from '@/components/ds/Icon/Icon';
import type { EstadoPresupuesto, PresupuestoLiquidadoResponse, PresupuestoLiquidadoRow } from '@/lib/bc/presupuesto-liquidado';

// Presupuesto vs. Liquidado por obra (SOLO Super Admin). Portado de la app de
// Digitación: por cada material de la obra (por actividad), lo presupuestado contra
// lo liquidado (consumido), el saldo y su estado. Fuente: /api/bc/presupuesto-liquidado
// (lee workDecomposedLines + workLines + consumidoObra de BC en vivo).

const num = new Intl.NumberFormat('es-CR', { maximumFractionDigits: 2 });

const ESTADO_META: Record<EstadoPresupuesto, { label: string; bg: string; fg: string }> = {
  sin_consumo:    { label: 'Sin consumo',    bg: '#eef0f2', fg: '#6b7280' },
  en_presupuesto: { label: 'En presupuesto', bg: '#eef4d2', fg: '#6f841d' },
  completo:       { label: 'Completo',       bg: '#e3edfb', fg: '#2f66b8' },
  sobregiro:      { label: 'Sobregiro',      bg: '#f5e1e1', fg: '#bb4a4a' },
  extra:          { label: 'Extra',          bg: '#f7ecd6', fg: '#b7791f' },
};

function EstadoChip({ estado }: { estado: EstadoPresupuesto }) {
  const m = ESTADO_META[estado];
  return <span className="inline-flex items-center rounded-ds px-2 py-0.5 text-label font-medium" style={{ background: m.bg, color: m.fg }}>{m.label}</span>;
}

const COLUMNAS: ColumnDef<PresupuestoLiquidadoRow>[] = [
  { id: 'taskNo', accessorKey: 'taskNo', header: 'Actividad', meta: { label: 'Actividad' }, cell: ({ row }) => <span className="font-mono whitespace-nowrap">{row.original.taskNo || '—'}</span> },
  {
    id: 'material', header: 'Material', meta: { label: 'Material', noFilter: true },
    accessorFn: (r) => `${r.description} ${r.itemNo} ${r.variantCode}`,
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="break-words text-ds-ink">{row.original.description || '—'}</div>
        <div className="text-label text-ds-gray-400">{row.original.itemNo}{row.original.variantCode ? ` · ${row.original.variantDescription || row.original.variantCode}` : ''}</div>
      </div>
    ),
  },
  { id: 'unidad', accessorKey: 'unitOfMeasureCode', header: 'Unidad', meta: { label: 'Unidad' }, cell: ({ row }) => row.original.unitOfMeasureCode || '—' },
  { id: 'presupuestado', accessorKey: 'presupuestado', header: 'Presupuestado', meta: { label: 'Presupuestado', align: 'right', noFilter: true }, cell: ({ row }) => <span className="whitespace-nowrap">{num.format(row.original.presupuestado)}</span> },
  { id: 'liquidado', accessorKey: 'liquidado', header: 'Liquidado', meta: { label: 'Liquidado', align: 'right', noFilter: true }, cell: ({ row }) => <span className="whitespace-nowrap">{num.format(row.original.liquidado)}</span> },
  {
    id: 'saldo', accessorKey: 'saldo', header: 'Saldo', meta: { label: 'Saldo', align: 'right', noFilter: true },
    cell: ({ row }) => <span className={`font-semibold whitespace-nowrap ${row.original.saldo < 0 ? 'text-ds-red-ink' : 'text-ds-ink'}`}>{num.format(row.original.saldo)}</span>,
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

  // Catálogo de obras con presupuesto (para el selector).
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

  // Al elegir obra, traer su comparación.
  useEffect(() => {
    if (!obra) { setData(null); return; }
    let vivo = true;
    setLoading(true);
    setData(null);
    fetch(`/api/bc/presupuesto-liquidado?obra=${encodeURIComponent(obra)}`, { credentials: 'include' })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!vivo) return;
        if (!ok) throw new Error(d.error || 'No se pudo cargar el presupuesto');
        setData(d as PresupuestoLiquidadoResponse);
      })
      .catch((e) => { if (vivo) toast(e instanceof Error ? e.message : 'Error al cargar', 'error'); })
      .finally(() => { if (vivo) setLoading(false); });
    return () => { vivo = false; };
  }, [obra, toast]);

  const obraOpts = useMemo(
    () => [{ value: '', label: 'Seleccione una obra' }, ...obras.map((o) => ({ value: o.codigo, label: o.nombre ? `${o.codigo} — ${o.nombre}` : o.codigo }))],
    [obras],
  );

  const r = data?.resumen;

  return (
    <PageShell>
      <PageHeader
        title="Presupuesto vs. Liquidado"
        subtitle="Compará, por obra, lo presupuestado contra lo consumido (liquidado) de cada material. Se lee de Business Central en vivo."
      />

      {/* Selector de obra */}
      <div className="rounded-ds-lg border border-ds-gray-200 bg-ds-surface p-4 shadow-ds-01">
        <div className="w-80 max-w-full">
          <Combobox label="Obra" value={obra} onChange={setObra} options={obraOpts} placeholder={cargandoObras ? 'Cargando obras…' : 'Seleccione una obra'} emptyText="Sin obras con presupuesto." />
        </div>
      </div>

      {!obra ? (
        <div className="rounded-ds-lg border border-ds-gray-200 bg-ds-surface py-16 text-center shadow-ds-01">
          <div className="mb-2 flex justify-center text-ds-gray-300"><Icon name="boleta" size="lg" /></div>
          <p className="text-body-sm text-ds-gray-400">Elegí una obra para ver su presupuesto contra lo liquidado.</p>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <KpiCard titulo="Materiales" valor={loading ? '—' : num.format(r?.materiales ?? 0)} icono="list" />
            <KpiCard titulo="Presupuestadas" valor={loading ? '—' : num.format(r?.presupuestadas ?? 0)} icono="completado" />
            <KpiCard titulo="Sin consumo" valor={loading ? '—' : num.format(r?.sinConsumo ?? 0)} icono="pendiente" />
            <KpiCard titulo="Sobregiros" valor={loading ? '—' : num.format(r?.sobregiros ?? 0)} icono="alert" destacado={(r?.sobregiros ?? 0) > 0} />
            <KpiCard titulo="Extras" valor={loading ? '—' : num.format(r?.extras ?? 0)} icono="plus" />
          </div>

          {/* Detalle */}
          <div className="rounded-ds-lg border border-ds-gray-200 bg-ds-surface p-4 shadow-ds-01">
            <DataTable<PresupuestoLiquidadoRow>
              columns={COLUMNAS}
              data={data?.rows ?? []}
              loading={loading}
              searchPlaceholder="Material, código o actividad…"
              exportFilename={`presupuesto-liquidado-${obra}`}
              pageSize={50}
              emptyMessage="Esta obra no tiene materiales presupuestados ni consumidos."
              persistKey="bc-presupuesto-liquidado"
            />
          </div>
        </>
      )}
    </PageShell>
  );
}

function KpiCard({ titulo, valor, icono, destacado }: { titulo: string; valor: string; icono: IconName; destacado?: boolean }) {
  return (
    <div className={`flex items-center gap-3 rounded-ds-lg border p-4 shadow-ds-01 ${destacado ? 'border-ds-red-ink bg-ds-red-soft' : 'border-ds-gray-200 bg-ds-surface'}`}>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-ds ${destacado ? 'bg-ds-red-ink/15 text-ds-red-ink' : 'bg-ds-gray-100 text-ds-gray-500'}`}>
        <Icon name={icono} size="md" />
      </span>
      <div className="min-w-0">
        <p className="text-label uppercase tracking-wide text-ds-gray-400">{titulo}</p>
        <p className={`text-sub-sm font-bold ${destacado ? 'text-ds-red-ink' : 'text-ds-ink'}`}>{valor}</p>
      </div>
    </div>
  );
}
