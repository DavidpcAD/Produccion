'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/Toast';
import { Pills } from '../_components/Pills';
import { ESTADO_COLADA, ESTADOS_COLADA } from '@/lib/concreto/estados';
import { PageShell, PageHeader } from '@/components/layout/Page';
import type { ColadaListadoItem, EstadoColada, PlantaListadoItem } from '@/lib/concreto/tipos';

const col = createColumnHelper<ColadaListadoItem>();

function fmtFecha(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function ColadasPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [coladas, setColadas] = useState<ColadaListadoItem[]>([]);
  const [plantas, setPlantas] = useState<PlantaListadoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [estado, setEstado] = useState<string>('');
  const [idPlanta, setIdPlanta] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    const params = new URLSearchParams({ pagina: '1', por_pagina: '500' });
    if (estado) params.set('estado', estado);
    if (idPlanta) params.set('id_planta', idPlanta);
    try {
      const data = await fetch(`/api/concreto/coladas?${params}`).then((r) => r.json());
      if (data.error) throw new Error(data.error);
      setColadas(data.coladas ?? []);
    } catch {
      toast('Error cargando coladas', 'error');
      setColadas([]);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [estado, idPlanta, toast]);

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
  const columns: ColumnDef<ColadaListadoItem, any>[] = [
    col.accessor('codigo_interno', {
      header: 'Código', meta: { label: 'Código' },
      cell: ({ getValue }) => <span className="font-semibold text-ds-ink">#{getValue() as number}</span>,
    }),
    col.accessor('estado', {
      header: 'Estado', meta: { label: 'Estado' },
      cell: ({ getValue }) => {
        const cfg = ESTADO_COLADA[getValue() as EstadoColada];
        return <Badge variant={cfg.variant} dot>{cfg.label}</Badge>;
      },
    }),
    col.accessor('planta_nombre', {
      header: 'Planta', meta: { label: 'Planta' },
      cell: ({ getValue }) => (getValue() as string) || '—',
    }),
    col.accessor('receta_blend_nombre', {
      header: 'Receta', meta: { label: 'Receta' },
      cell: ({ row }) => {
        const o = row.original;
        return (
          <div className="min-w-0">
            <p className="text-ds-ink truncate">{o.receta_blend_nombre}</p>
            {o.codigo_receta_bc && (
              <p className="text-xs text-ds-gray-400 truncate">{o.codigo_receta_bc}</p>
            )}
          </div>
        );
      },
    }),
    col.accessor('destino_display', {
      header: 'Destino', meta: { label: 'Destino' },
      cell: ({ row }) => {
        const o = row.original;
        return (
          <div className="min-w-0">
            <p className="text-ds-ink truncate">{o.destino_display || '—'}</p>
            {o.obra_works_no && (
              <p className="text-xs text-ds-gray-400 truncate">
                {o.obra_works_no}{o.obra_display_name ? ` · ${o.obra_display_name}` : ''}
              </p>
            )}
          </div>
        );
      },
    }),
    col.accessor('fecha_inicio', {
      header: 'Fecha', meta: { label: 'Fecha' },
      cell: ({ getValue }) => <span className="text-ds-gray-500">{fmtFecha(getValue() as string)}</span>,
    }),
    col.accessor('m3_producidos', {
      header: 'm³', meta: { label: 'm³', align: 'right' },
      cell: ({ getValue }) => <span className="tabular-nums">{Number(getValue()).toFixed(2)}</span>,
    }),
    col.accessor('cantidad_batches', {
      header: 'Batches', meta: { label: 'Batches', align: 'right' },
      cell: ({ getValue }) => <span className="tabular-nums">{getValue() as number}</span>,
    }),
    col.display({
      id: 'alarmas', header: 'Alarmas',
      meta: { label: 'Alarmas', noFilter: true },
      cell: ({ row }) => {
        const o = row.original;
        if (!o.tuvo_alarma) return <span className="text-ds-gray-300">—</span>;
        return <Badge variant="red" dot>{o.cantidad_alarmas_total}</Badge>;
      },
    }),
    col.accessor('numero_pedido_ensamblado_bc', {
      header: 'Pedido BC', meta: { label: 'Pedido BC' },
      cell: ({ getValue }) => (getValue() as string) || <span className="text-ds-gray-300">—</span>,
    }),
  ];

  return (
    <PageShell>
      <PageHeader
        title="Coladas"
        subtitle={`${coladas.length} coladas`}
      />

      <div className="space-y-3">
        <Pills
          label="Estado"
          value={estado}
          onChange={setEstado}
          options={[
            { value: '', label: 'Todos' },
            ...ESTADOS_COLADA.map((e) => ({ value: e, label: ESTADO_COLADA[e].label })),
          ]}
        />
        <Pills
          label="Planta"
          value={idPlanta}
          onChange={setIdPlanta}
          options={[
            { value: '', label: 'Todas' },
            ...plantas.map((p) => ({ value: String(p.id), label: p.codigo })),
          ]}
        />
      </div>

      {error && !loading && (
        <div className="bg-ds-surface rounded-ds-lg border border-ds-red/40 shadow-ds-01 p-4 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-body-sm text-ds-red font-semibold">No se pudieron cargar las coladas.</p>
          <Button variant="outline" size="sm" onClick={load}>Reintentar</Button>
        </div>
      )}

      <DataTable
        columns={columns}
        data={coladas}
        loading={loading}
        onRowClick={(o) => router.push(`/concreto/coladas/${o.id_colada}`)}
        searchPlaceholder="Buscar por destino, receta, obra…"
        exportFilename="coladas"
        emptyMessage="Sin coladas"
      />
    </PageShell>
  );
}
