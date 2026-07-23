'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/Badge';
import { Combobox } from '@/components/ui/Combobox';
import { DataTable } from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/Toast';
import { ConcretoNav } from '../_components/ConcretoNav';
import type { ActividadLab, MuestraListadoItem } from '@/lib/concreto/tipos';

const col = createColumnHelper<MuestraListadoItem>();

function fmtDia(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function LaboratorioPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [muestras, setMuestras] = useState<MuestraListadoItem[]>([]);
  const [actividades, setActividades] = useState<ActividadLab[]>([]);
  const [loading, setLoading] = useState(true);
  const [idActividad, setIdActividad] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ pagina: '1', por_pagina: '500' });
    if (idActividad) params.set('id_actividad', idActividad);
    try {
      const data = await fetch(`/api/concreto/lab/muestras?${params}`).then((r) => r.json());
      if (data.error) throw new Error(data.error);
      setMuestras(data.muestras ?? []);
    } catch {
      toast('Error cargando muestras', 'error');
      setMuestras([]);
    } finally {
      setLoading(false);
    }
  }, [idActividad, toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch('/api/concreto/lab/actividades')
      .then((r) => r.json())
      .then((d) => setActividades(d.data ?? []))
      .catch(() => {});
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columns: ColumnDef<MuestraListadoItem, any>[] = [
    col.accessor('numero_muestra', {
      header: 'N° Muestra', meta: { label: 'N° Muestra' },
      cell: ({ getValue }) => <span className="font-semibold text-black">#{getValue() as number}</span>,
    }),
    col.accessor('actividad_nombre', {
      header: 'Actividad', meta: { label: 'Actividad' },
      cell: ({ getValue }) => (getValue() as string) || '—',
    }),
    col.accessor('obra_works_no', {
      header: 'Obra', meta: { label: 'Obra' },
      cell: ({ row }) => {
        const m = row.original;
        if (!m.obra_works_no) return <span className="text-ds-gray-300">—</span>;
        return (
          <div className="min-w-0">
            <p className="text-black truncate">{m.obra_works_no}</p>
            {m.obra_display_name && <p className="text-xs text-ds-gray-400 truncate">{m.obra_display_name}</p>}
          </div>
        );
      },
    }),
    col.accessor('tipo_concreto_display', {
      header: 'Tipo', meta: { label: 'Tipo' },
      cell: ({ getValue }) => <span className="text-black">{getValue() as string}</span>,
    }),
    col.accessor('fc_objetivo', {
      header: "f'c", meta: { label: "f'c objetivo", align: 'right' },
      cell: ({ getValue }) => <span className="tabular-nums">{getValue() as number}</span>,
    }),
    col.accessor('proveedor', {
      header: 'Proveedor', meta: { label: 'Proveedor' },
      cell: ({ getValue }) => <span className="text-ds-gray-500">{getValue() as string}</span>,
    }),
    col.accessor('fecha_colado', {
      header: 'Colado', meta: { label: 'Colado' },
      cell: ({ getValue }) => <span className="text-ds-gray-500">{fmtDia(getValue() as string)}</span>,
    }),
    col.display({
      id: 'ensayos', header: 'Ensayos',
      meta: { label: 'Ensayos', noFilter: true },
      cell: ({ row }) => {
        const m = row.original;
        if (m.ensayos.length === 0) {
          return m.cantidad_ensayos > 0
            ? <span className="text-xs text-ds-gray-400">{m.cantidad_ensayos} planificado(s)</span>
            : <span className="text-ds-gray-300">—</span>;
        }
        return (
          <div className="flex flex-wrap gap-1">
            {m.ensayos.map((e) => (
              <Badge key={e.edad_dias} variant={e.resistencia_kg_cm2_promedio !== null ? 'green' : 'gray'}>
                {e.edad_dias}d{e.resistencia_kg_cm2_promedio !== null ? `: ${e.resistencia_kg_cm2_promedio.toFixed(0)}` : ''}
              </Badge>
            ))}
          </div>
        );
      },
    }),
  ];

  return (
    <div className="p-6 space-y-5 max-w-[1600px] mx-auto animate-fade-in">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-heading font-bold text-black">Laboratorio de Concreto</h1>
          <p className="text-ds-gray-400 text-body-sm">{muestras.length} muestras</p>
        </div>
      </div>

      <ConcretoNav />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Combobox
          label="Actividad"
          value={idActividad}
          onChange={setIdActividad}
          options={[
            { value: '', label: 'Todas las actividades' },
            ...actividades.map((a) => ({ value: String(a.id), label: a.nombre })),
          ]}
          placeholder="Todas"
        />
      </div>

      <DataTable
        columns={columns}
        data={muestras}
        loading={loading}
        onRowClick={(m) => router.push(`/concreto/laboratorio/${m.id}`)}
        searchPlaceholder="Buscar por obra, actividad, proveedor…"
        exportFilename="muestras-laboratorio"
        emptyMessage="Sin muestras"
      />

      {/* TODO(concreto): crear muestra/ensayo/medición, esclerómetro, fotos
          (Azure Blob) y gestión de actividades — diferidos. */}
    </div>
  );
}
