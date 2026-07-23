'use client';
import { useState, useEffect, useCallback } from 'react';
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/DataTable';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';

const accionVariant: Record<string, 'green' | 'gray' | 'yellow' | 'red'> = {
  CREAR_USUARIO:     'green',
  CREAR_ACCESO:      'green',
  EDITAR_USUARIO:    'gray',
  EDITAR_CUADRILLA:  'gray',
  ASIGNAR_ROL:       'gray',
  ASIGNAR_PROYECTO:  'yellow',
  MOVER_CUADRILLA:   'yellow',
  CAMBIO_ENCARGADO:  'yellow',
  REVOCAR_ROL:       'red',
  REVOCAR_ACCESO:    'red',
  ELIMINAR_USUARIO:  'red',
};

interface AuditLog {
  IDAudit: number;
  Accion: string;
  Entidad: string;
  IDEntidad: number;
  Actor: string;
  IP: string;
  FechaAccion: string;
  DetallePrevio: string | null;
  DetalleNuevo: string | null;
}

// Resumen legible de un registro de auditoría a partir de sus detalles JSON.
function resumenDetalle(r: AuditLog): string {
  const parse = (s: string | null) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };
  const prev = parse(r.DetallePrevio);
  const nuevo = parse(r.DetalleNuevo);
  if (r.Accion === 'CAMBIO_ENCARGADO') {
    return `Encargado: ${prev?.encargado ?? '—'} → ${nuevo?.encargado ?? '—'}`;
  }
  const src = nuevo ?? prev;
  if (src && typeof src === 'object') {
    return Object.entries(src)
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([k, v]) => `${k}: ${v}`)
      .join(' · ');
  }
  return '';
}

const col = createColumnHelper<AuditLog>();

const fmtFecha = (v: string) =>
  new Date(v).toLocaleString('es-CR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Costa_Rica',
  });

export default function AuditoriaPage() {
  const { toast } = useToast();
  const [data, setData] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/auditoria?porPagina=5000`);
      if (!res.ok) { toast('Error cargando auditoría', 'error'); return; }
      const json = await res.json();
      setData(json.data);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columns: ColumnDef<AuditLog, any>[] = [
    col.accessor('Accion', {
      header: 'Acción',
      meta: { label: 'Acción', exportValue: r => r.Accion.replace(/_/g, ' ') },
      cell: ({ row }) => {
        // Sentence case: en MAYÚSCULAS + borde parecían botones (feedback UX).
        const t = row.original.Accion.replace(/_/g, ' ').toLowerCase();
        return (
          <Badge variant={accionVariant[row.original.Accion] ?? 'gray'}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </Badge>
        );
      },
    }),
    col.accessor('Actor', {
      header: 'Realizado por',
      meta: { label: 'Realizado por' },
      cell: ({ row }) => (
        <div>
          <p className="text-sm font-semibold text-black">{row.original.Actor}</p>
          <p className="text-xs text-ds-gray-300">{row.original.IP}</p>
        </div>
      ),
    }),
    col.accessor(r => `${r.Entidad} ${r.IDEntidad ? `#${r.IDEntidad}` : ''}`.trim(), {
      id: 'Entidad',
      header: 'Entidad',
      meta: { label: 'Entidad' },
      cell: ({ row }) => (
        <span className="text-sm text-ds-gray-500">
          {row.original.Entidad} {row.original.IDEntidad ? `#${row.original.IDEntidad}` : ''}
        </span>
      ),
    }),
    col.accessor(r => resumenDetalle(r), {
      id: 'Detalle',
      header: 'Detalle',
      meta: { label: 'Detalle', noFilter: true, exportValue: r => resumenDetalle(r) },
      cell: ({ row }) => {
        const t = resumenDetalle(row.original);
        return t
          ? <span className="text-xs text-ds-gray-500 line-clamp-2 max-w-[280px]" title={t}>{t}</span>
          : <span className="text-ds-gray-300">—</span>;
      },
    }),
    col.accessor('FechaAccion', {
      header: 'Fecha',
      meta: { label: 'Fecha', noFilter: true, exportValue: r => fmtFecha(r.FechaAccion) },
      cell: ({ row }) => (
        <span className="text-sm text-ds-gray-400">{fmtFecha(row.original.FechaAccion)}</span>
      ),
    }),
  ];

  return (
    <div className="p-6 space-y-5 max-w-[1600px] mx-auto animate-fade-in">
      <div>
        <h1 className="text-heading font-bold text-black">Auditoría</h1>
        <p className="text-ds-gray-400 text-body-sm">
          Registro de acciones del sistema{!loading && data.length > 0 ? ` · ${data.length} acciones registradas` : ''}
        </p>
      </div>

      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        searchPlaceholder="Buscar en auditoría…"
        exportFilename="auditoria"
        emptyMessage="Sin registros de auditoría"
        pageSize={25}
      />
    </div>
  );
}
