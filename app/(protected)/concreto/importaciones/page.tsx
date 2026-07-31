'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { PageShell, PageHeader } from '@/components/layout/Page';
import { useToast } from '@/components/ui/Toast';
import type {
  EstadoImportacion,
  ImportacionResumen,
  IngestaBlendResponse,
} from '@/lib/concreto/tipos-ingesta';

const TAM_MAXIMO_BYTES = 50 * 1024 * 1024; // 50 MB

// ─── Helpers de presentación ─────────────────────────────────────────────────

type BadgeVariant = 'green' | 'yellow' | 'gray' | 'blue';

const ESTADO_VARIANTE: Record<EstadoImportacion, BadgeVariant> = {
  ok: 'green',
  parcial: 'yellow',
  duplicado_archivo: 'gray',
  procesando: 'blue',
};

const ESTADO_TEXTO: Record<EstadoImportacion, string> = {
  ok: 'OK',
  parcial: 'Parcial',
  duplicado_archivo: 'Duplicado',
  procesando: 'Procesando',
};

function fmtFechaHora(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-CR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

const col = createColumnHelper<ImportacionResumen>();

// ─── Página ──────────────────────────────────────────────────────────────────

export default function ImportacionesPage() {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const [archivo, setArchivo] = useState<File | null>(null);
  const [forzar, setForzar] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [resultado, setResultado] = useState<IngestaBlendResponse | null>(null);

  const [items, setItems] = useState<ImportacionResumen[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const cargarHistorial = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetch('/api/concreto/importaciones?limite=50&offset=0').then((r) => r.json());
      if (data.error) throw new Error(data.error);
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error cargando el historial', 'error');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    cargarHistorial();
  }, [cargarHistorial]);

  const seleccionar = (f: File | null | undefined) => {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.csv')) {
      toast(`Solo se aceptan archivos .csv (recibido: ${f.name})`, 'error');
      return;
    }
    if (f.size > TAM_MAXIMO_BYTES) {
      toast(`Archivo demasiado grande (${Math.round(f.size / 1024 / 1024)} MB). Máximo 50 MB.`, 'error');
      return;
    }
    setResultado(null);
    setArchivo(f);
  };

  const importar = async () => {
    if (!archivo) return;
    setSubiendo(true);
    setResultado(null);
    try {
      const form = new FormData();
      form.append('file', archivo);
      if (forzar) form.append('forzar_reingesta', '1');

      const res = await fetch('/api/concreto/batches/ingestar', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`);

      const r = data as IngestaBlendResponse;
      setResultado(r);
      const resumen = r.resumen;
      if (r.estado === 'duplicado_archivo') {
        toast('Archivo ya ingestado previamente (mismo hash). No se hicieron cambios.', 'success');
      } else {
        toast(
          `Ingesta ${ESTADO_TEXTO[r.estado].toLowerCase()}: ${resumen.batches_insertados} nuevos, ${resumen.batches_omitidos_duplicado} duplicados, ${resumen.filas_con_error} con error.`,
          r.estado === 'ok' ? 'success' : 'info',
        );
      }
      await cargarHistorial();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error en la ingesta', 'error');
    } finally {
      setSubiendo(false);
    }
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setArrastrando(false);
    seleccionar(e.dataTransfer.files?.[0]);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columns: ColumnDef<ImportacionResumen, any>[] = [
    col.accessor('fecha_archivo', {
      header: 'Fecha', meta: { label: 'Fecha' },
      cell: ({ getValue }) => <span className="text-ds-gray-500">{fmtFechaHora(getValue() as string)}</span>,
    }),
    col.accessor('archivo_nombre', {
      header: 'Archivo', meta: { label: 'Archivo' },
      cell: ({ getValue }) => <span className="font-mono text-xs text-black">{getValue() as string}</span>,
    }),
    col.accessor('estado', {
      header: 'Estado', meta: { label: 'Estado' },
      cell: ({ getValue }) => {
        const e = getValue() as EstadoImportacion;
        return <Badge variant={ESTADO_VARIANTE[e]} dot>{ESTADO_TEXTO[e]}</Badge>;
      },
    }),
    col.accessor('batches_nuevos', {
      header: 'Nuevos', meta: { label: 'Nuevos', align: 'right' },
      cell: ({ getValue }) => <span className="tabular-nums font-semibold text-black">{getValue() as number}</span>,
    }),
    col.accessor('batches_duplicados', {
      header: 'Duplicados', meta: { label: 'Duplicados', align: 'right' },
      cell: ({ getValue }) => <span className="tabular-nums text-ds-gray-500">{getValue() as number}</span>,
    }),
    col.accessor('batches_con_error', {
      header: 'Errores', meta: { label: 'Errores', align: 'right' },
      cell: ({ getValue }) => {
        const v = getValue() as number;
        return <span className={`tabular-nums ${v > 0 ? 'text-ds-red font-semibold' : 'text-ds-gray-300'}`}>{v}</span>;
      },
    }),
    col.accessor('filas_totales', {
      header: 'Filas', meta: { label: 'Filas', align: 'right' },
      cell: ({ getValue }) => <span className="tabular-nums text-ds-gray-500">{getValue() as number}</span>,
    }),
    col.accessor('usuario_email', {
      header: 'Usuario', meta: { label: 'Usuario' },
      cell: ({ getValue }) => <span className="text-xs text-ds-gray-400">{(getValue() as string | null) ?? '—'}</span>,
    }),
    col.accessor('archivo_hash', {
      header: 'Hash', meta: { label: 'Hash' },
      cell: ({ getValue }) => (
        <span className="font-mono text-[11px] text-ds-gray-300" title={getValue() as string}>
          {(getValue() as string).slice(0, 10)}…
        </span>
      ),
    }),
  ];

  return (
    <PageShell width="full" className="max-w-[1400px] space-y-6">
      <PageHeader
        title="Importaciones"
        subtitle="Ingesta del CSV de la planta Blend e historial de cargas. La planta se detecta del propio archivo."
      />

      {/* Zona de carga */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div
          onDragEnter={(e) => { e.preventDefault(); setArrastrando(true); }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={(e) => { e.preventDefault(); setArrastrando(false); }}
          onDrop={onDrop}
          className={`flex flex-col items-center justify-center gap-3 rounded-ds-lg border-2 border-dashed p-8 transition-colors ${
            arrastrando ? 'border-brand bg-brand/5' : 'border-ds-gray-200 bg-ds-gray-50'
          }`}
        >
          <p className="text-sm font-semibold text-black">Arrastrá un CSV o seleccionalo</p>
          <p className="text-xs text-ds-gray-400 text-center">
            Solo archivos .csv de la planta Blend, máximo 50 MB.
          </p>

          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => { seleccionar(e.target.files?.[0]); e.target.value = ''; }}
          />

          {archivo && (
            <p className="text-sm text-black">
              Seleccionado: <span className="font-mono">{archivo.name}</span>{' '}
              <span className="text-ds-gray-400">({Math.round(archivo.size / 1024)} KB)</span>
            </p>
          )}

          <div className="flex items-center gap-3 flex-wrap justify-center">
            <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={subiendo}>
              Seleccionar archivo
            </Button>
            <Button size="sm" onClick={importar} loading={subiendo} disabled={!archivo || subiendo}>
              Importar
            </Button>
          </div>

          <label className="flex items-center gap-2 text-xs text-ds-gray-500 cursor-pointer select-none">
            <input type="checkbox" checked={forzar} onChange={(e) => setForzar(e.target.checked)} />
            Forzar reingesta (ignorar dedup por hash de archivo)
          </label>
        </div>

        {/* Resultado de la última ingesta */}
        <div className="rounded-ds-lg border border-ds-gray-200 p-5">
          <h2 className="text-body font-semibold text-black mb-3">Resultado de la última ingesta</h2>
          {!resultado ? (
            <p className="text-sm text-ds-gray-400">Todavía no ejecutaste ninguna importación en esta sesión.</p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant={ESTADO_VARIANTE[resultado.estado]} dot>{ESTADO_TEXTO[resultado.estado]}</Badge>
                {resultado.resumen.plantas.length > 0 && (
                  <span className="text-xs text-ds-gray-500">Planta SN: {resultado.resumen.plantas.join(', ')}</span>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Metric label="Insertados" value={resultado.resumen.batches_insertados} strong />
                <Metric label="Duplicados" value={resultado.resumen.batches_omitidos_duplicado} />
                <Metric label="Con error" value={resultado.resumen.filas_con_error} danger={resultado.resumen.filas_con_error > 0} />
                <Metric label="Filas recibidas" value={resultado.resumen.filas_recibidas} />
              </div>
              {(resultado.resumen.fecha_min || resultado.resumen.fecha_max) && (
                <p className="text-xs text-ds-gray-400">
                  Rango: {resultado.resumen.fecha_min ? fmtFechaHora(resultado.resumen.fecha_min) : '—'}
                  {' → '}
                  {resultado.resumen.fecha_max ? fmtFechaHora(resultado.resumen.fecha_max) : '—'}
                </p>
              )}
              {resultado.errores.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-ds-red font-medium">
                    {resultado.errores.length} error{resultado.errores.length === 1 ? '' : 'es'} de parseo
                  </summary>
                  <ul className="mt-2 space-y-1 max-h-40 overflow-auto">
                    {resultado.errores.slice(0, 100).map((e, i) => (
                      <li key={i} className="text-ds-gray-500">
                        Fila {e.fila}{e.campo ? ` (${e.campo})` : ''}: {e.mensaje}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <p className="font-mono text-[11px] text-ds-gray-300 break-all">hash: {resultado.hash_archivo}</p>
            </div>
          )}
        </div>
      </div>

      {/* Historial */}
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-body font-semibold text-black">Historial de importaciones</h2>
          <span className="text-xs text-ds-gray-400">{total} en total</span>
        </div>
        <DataTable
          columns={columns}
          data={items}
          loading={loading}
          searchPlaceholder="Buscar por archivo, usuario…"
          exportFilename="importaciones"
          emptyMessage="Sin importaciones aún"
        />
      </div>
    </PageShell>
  );
}

function Metric({ label, value, strong, danger }: { label: string; value: number; strong?: boolean; danger?: boolean }) {
  return (
    <div className="rounded-ds bg-ds-gray-50 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-ds-gray-400">{label}</p>
      <p className={`tabular-nums text-sub-sm ${danger ? 'text-ds-red' : strong ? 'text-black font-bold' : 'text-ds-gray-600'}`}>
        {value}
      </p>
    </div>
  );
}
