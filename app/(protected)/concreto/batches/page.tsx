'use client';
import { useState, useEffect, useCallback } from 'react';
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/Badge';
import { DataTable } from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/Toast';
import { Pills } from '../_components/Pills';
import { PageShell, PageHeader } from '@/components/layout/Page';
import type { BatchDetallePlanta, PlantaListadoItem } from '@/lib/concreto/tipos';

const col = createColumnHelper<BatchDetallePlanta>();

function fmtFechaHora(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-CR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
function delta(n: number | null): React.ReactNode {
  if (n === null) return <span className="text-ds-gray-300">—</span>;
  const alto = Math.abs(n) >= 5;
  return (
    <span className={`tabular-nums ${alto ? 'text-ds-red font-semibold' : 'text-ds-gray-500'}`}>
      {n > 0 ? '+' : ''}{n.toFixed(1)}%
    </span>
  );
}

export default function BatchesPage() {
  const { toast } = useToast();
  const [batches, setBatches] = useState<BatchDetallePlanta[]>([]);
  const [plantas, setPlantas] = useState<PlantaListadoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [idPlanta, setIdPlanta] = useState('');
  const [soloAnomalias, setSoloAnomalias] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ pagina: '1', por_pagina: '500' });
    if (idPlanta) params.set('id_planta', idPlanta);
    if (soloAnomalias) params.set('solo_anomalias', '1');
    try {
      const data = await fetch(`/api/concreto/batches?${params}`).then((r) => r.json());
      if (data.error) throw new Error(data.error);
      setBatches(data.batches ?? []);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error cargando batches', 'error');
      setBatches([]);
    } finally {
      setLoading(false);
    }
  }, [idPlanta, soloAnomalias, toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch('/api/concreto/plantas')
      .then((r) => r.json())
      .then((d) => setPlantas(d.data ?? []))
      .catch(() => {});
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columns: ColumnDef<BatchDetallePlanta, any>[] = [
    col.accessor('record_no', {
      header: 'Record', meta: { label: 'Record' },
      cell: ({ getValue }) => <span className="font-semibold text-black tabular-nums">#{getValue() as number}</span>,
    }),
    col.accessor('fecha_inicio', {
      header: 'Fecha', meta: { label: 'Fecha' },
      cell: ({ getValue }) => <span className="text-ds-gray-500">{fmtFechaHora(getValue() as string)}</span>,
    }),
    col.accessor('planta_nombre', { header: 'Planta', meta: { label: 'Planta' } }),
    col.accessor('codigo_interno_colada', {
      header: 'Colada', meta: { label: 'Colada' },
      cell: ({ getValue }) => {
        const v = getValue() as number | null;
        return v ? <span className="tabular-nums">#{v}</span> : <span className="text-ds-gray-300">—</span>;
      },
    }),
    col.accessor('recipe_name_raw', {
      header: 'Receta', meta: { label: 'Receta' },
      cell: ({ getValue }) => (getValue() as string) || '—',
    }),
    col.accessor('m3_producidos', {
      header: 'm³', meta: { label: 'm³', align: 'right' },
      cell: ({ getValue }) => <span className="tabular-nums">{Number(getValue()).toFixed(2)}</span>,
    }),
    col.accessor('agua_delta_pct', {
      header: 'Δ Agua', meta: { label: 'Δ Agua', align: 'right' },
      cell: ({ getValue }) => delta(getValue() as number | null),
    }),
    col.accessor('relacion_agua_cemento', {
      header: 'a/c', meta: { label: 'a/c', align: 'right' },
      cell: ({ getValue }) => {
        const v = getValue() as number | null;
        return v === null ? <span className="text-ds-gray-300">—</span> : <span className="tabular-nums">{v.toFixed(3)}</span>;
      },
    }),
    col.accessor('cemento_delta_pct', {
      header: 'Δ Cemento', meta: { label: 'Δ Cemento', align: 'right' },
      cell: ({ getValue }) => delta(getValue() as number | null),
    }),
    col.display({
      id: 'flags', header: 'Estado',
      meta: { label: 'Estado', noFilter: true },
      cell: ({ row }) => {
        const o = row.original;
        return (
          <div className="flex gap-1 flex-wrap">
            {o.tuvo_alarma && <Badge variant="red" dot>{o.cantidad_alarmas} alarma{o.cantidad_alarmas === 1 ? '' : 's'}</Badge>}
            {o.receta_modificada && <Badge variant="yellow" dot>Receta mod.</Badge>}
            {!o.tuvo_alarma && !o.receta_modificada && <span className="text-ds-gray-300">OK</span>}
          </div>
        );
      },
    }),
  ];

  return (
    <PageShell>
      <PageHeader
        title="Batches"
        subtitle={`${batches.length} batches · datos crudos de planta`}
      />

      <div className="space-y-3">
        <Pills
          label="Planta"
          value={idPlanta}
          onChange={setIdPlanta}
          options={[
            { value: '', label: 'Todas' },
            ...plantas.map((p) => ({ value: String(p.id), label: p.codigo })),
          ]}
        />
        <Pills
          label="Mostrar"
          value={soloAnomalias}
          onChange={setSoloAnomalias}
          options={[
            { value: '', label: 'Todos' },
            { value: '1', label: 'Solo anomalías' },
          ]}
        />
      </div>

      <DataTable
        columns={columns}
        data={batches}
        loading={loading}
        searchPlaceholder="Buscar por cliente, receta, record…"
        exportFilename="batches"
        emptyMessage="Sin batches"
      />
    </PageShell>
  );
}
