'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Combobox } from '@/components/ui/Combobox';
import { DataTable } from '@/components/ui/DataTable';
import { DatePicker } from '@/components/ui/DatePicker';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { Icon } from '@/components/ds/Icon/Icon';
import type { ActividadLab, MuestraListadoItem } from '@/lib/concreto/tipos';
import {
  CATEGORIAS_CONCRETO,
  PLANTAS_LAB,
  type CategoriaConcreto,
  type ImportarExcelLabResponse,
} from '@/lib/concreto/tipos-lab';

const col = createColumnHelper<MuestraListadoItem>();

function fmtDia(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const FC_COMUNES = [140, 175, 210, 245, 280, 315, 350, 420] as const;
const EDADES = [3, 7, 14, 28, 56, 90] as const;

export default function LaboratorioPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [muestras, setMuestras] = useState<MuestraListadoItem[]>([]);
  const [actividades, setActividades] = useState<ActividadLab[]>([]);
  const [loading, setLoading] = useState(true);
  const [idActividad, setIdActividad] = useState('');
  const [crearAbierto, setCrearAbierto] = useState(false);
  const [importAbierto, setImportAbierto] = useState(false);

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
        <div className="flex items-center gap-2.5">
          <Button variant="outline" onClick={() => setImportAbierto(true)} icon={<Icon name="list" size="sm" color="currentColor" />}>
            Importar Excel
          </Button>
          <Button onClick={() => setCrearAbierto(true)} icon={<Icon name="plus" size="sm" color="currentColor" />}>
            Nueva muestra
          </Button>
        </div>
      </div>


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

      {crearAbierto && (
        <ModalCrearMuestra
          cerrar={() => setCrearAbierto(false)}
          actividades={actividades}
          onCreado={(idMuestra) => {
            setCrearAbierto(false);
            toast('Muestra creada', 'success');
            load();
            router.push(`/concreto/laboratorio/${idMuestra}`);
          }}
        />
      )}

      {importAbierto && (
        <ModalImportarExcel cerrar={() => setImportAbierto(false)} onImportado={() => load()} />
      )}
    </div>
  );
}

// ─── Modal: crear muestra ─────────────────────────────────────────────────

function ModalCrearMuestra({
  cerrar,
  actividades,
  onCreado,
}: {
  cerrar: () => void;
  actividades: ActividadLab[];
  onCreado: (idMuestra: number) => void;
}) {
  const { toast } = useToast();
  const [idActividad, setIdActividad] = useState('');
  const [fechaColado, setFechaColado] = useState(() => new Date().toISOString().slice(0, 10));
  const [fcObjetivo, setFcObjetivo] = useState('210');
  const [proveedor, setProveedor] = useState('ADELANTE DESARROLLOS');
  const [planta, setPlanta] = useState('');
  const [categoria, setCategoria] = useState<CategoriaConcreto>('convencional');
  const [tipoLibre, setTipoLibre] = useState('');
  const [obra, setObra] = useState('');
  const [casa, setCasa] = useState('');
  const [notas, setNotas] = useState('');
  const [edades, setEdades] = useState<number[]>([7, 14, 28]);
  const [guardando, setGuardando] = useState(false);

  const toggleEdad = (e: number) =>
    setEdades((prev) => (prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e].sort((a, b) => a - b)));

  const guardar = async () => {
    if (!idActividad) return toast('Elegí una actividad', 'warning');
    const fc = Number(fcObjetivo);
    if (!Number.isFinite(fc) || fc <= 0) return toast("f'c objetivo inválido", 'warning');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaColado)) return toast('Fecha de colado inválida', 'warning');

    setGuardando(true);
    try {
      const res = await fetch('/api/concreto/lab/muestras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_actividad: Number(idActividad),
          fecha_colado: fechaColado,
          fc_objetivo: fc,
          proveedor: proveedor.trim() || 'ADELANTE DESARROLLOS',
          planta_nombre: planta || null,
          categoria_concreto: categoria,
          tipo_concreto_libre: tipoLibre.trim() || null,
          obra_works_no: obra.trim() || null,
          id_casa: casa.trim() || null,
          notas: notas.trim() || null,
          edades_ensayos: edades,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo crear la muestra');
      onCreado(data.id);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error al crear', 'error');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      open
      onClose={cerrar}
      title="Nueva muestra"
      size="lg"
      footer={
        <div className="flex justify-end gap-2.5">
          <Button variant="outline" onClick={cerrar} disabled={guardando}>Cancelar</Button>
          <Button onClick={guardar} loading={guardando}>Crear muestra</Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Combobox
          label="Actividad *"
          value={idActividad}
          onChange={setIdActividad}
          options={actividades.map((a) => ({ value: String(a.id), label: a.nombre }))}
          placeholder="Seleccionar actividad"
        />
        <DatePicker label="Fecha de colado *" value={fechaColado} onChange={setFechaColado} />

        <div className="sm:col-span-2 space-y-1.5">
          <label className="text-sm font-medium text-black">{"f'c objetivo (kg/cm²) *"}</label>
          <div className="flex flex-wrap items-center gap-1.5">
            {FC_COMUNES.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFcObjetivo(String(f))}
                className={`px-3 py-1.5 rounded-ds text-sm font-semibold border transition-colors ${
                  Number(fcObjetivo) === f
                    ? 'bg-black text-white border-black'
                    : 'bg-white text-ds-gray-500 border-ds-gray-200 hover:border-ds-gray-300'
                }`}
              >
                {f}
              </button>
            ))}
            <Input
              type="number"
              value={fcObjetivo}
              onChange={(e) => setFcObjetivo(e.target.value)}
              className="w-28"
              placeholder="Otro"
            />
          </div>
        </div>

        <Combobox
          label="Planta"
          value={planta}
          onChange={setPlanta}
          options={[{ value: '', label: 'Sin especificar' }, ...PLANTAS_LAB.map((p) => ({ value: p, label: p }))]}
          placeholder="Sin especificar"
        />
        <Combobox
          label="Categoría"
          value={categoria}
          onChange={(v) => setCategoria(v as CategoriaConcreto)}
          options={CATEGORIAS_CONCRETO.map((c) => ({ value: c, label: c }))}
        />

        <Input label="Proveedor" value={proveedor} onChange={(e) => setProveedor(e.target.value)} />
        <Input label="Tipo de concreto (texto)" value={tipoLibre} onChange={(e) => setTipoLibre(e.target.value)} placeholder="Ej. 210 KG/CM2 AUTOCOMPACTABLE" />

        <Input label="Obra (works_no)" value={obra} onChange={(e) => setObra(e.target.value)} placeholder="Ej. VN-M.12" />
        <Input label="ID Casa / ubicación" value={casa} onChange={(e) => setCasa(e.target.value)} />

        <div className="sm:col-span-2 space-y-1.5">
          <label className="text-sm font-medium text-black">Edades a probar (días)</label>
          <div className="flex flex-wrap gap-1.5">
            {EDADES.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => toggleEdad(e)}
                className={`px-3 py-1.5 rounded-ds text-sm font-semibold border transition-colors ${
                  edades.includes(e)
                    ? 'bg-brand text-black border-brand'
                    : 'bg-white text-ds-gray-500 border-ds-gray-200 hover:border-ds-gray-300'
                }`}
              >
                {e}d
              </button>
            ))}
          </div>
          <p className="text-xs text-ds-gray-400">Se pre-crean los ensayos vacíos para cargar los MPa después.</p>
        </div>

        <div className="sm:col-span-2 space-y-1.5">
          <label className="text-sm font-medium text-black">Notas</label>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={2}
            className="w-full rounded-ds-xl border border-ds-gray-200 bg-white p-3 text-sm text-black placeholder-ds-gray-300 focus:outline-none focus:border-ds-gray-400"
            placeholder="Opcional"
          />
        </div>
      </div>
    </Modal>
  );
}

// ─── Modal: importar Excel ────────────────────────────────────────────────

function ModalImportarExcel({
  cerrar,
  onImportado,
}: {
  cerrar: () => void;
  onImportado: () => void;
}) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [resumen, setResumen] = useState<ImportarExcelLabResponse | null>(null);

  const subir = async () => {
    if (!archivo) return toast('Elegí un archivo .xlsx', 'warning');
    setSubiendo(true);
    setResumen(null);
    try {
      const fd = new FormData();
      fd.append('file', archivo);
      const res = await fetch('/api/concreto/lab/importar-excel', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al importar');
      setResumen(data as ImportarExcelLabResponse);
      toast('Importación completada', 'success');
      onImportado();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error al importar', 'error');
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <Modal
      open
      onClose={cerrar}
      title="Importar Excel de laboratorio"
      size="lg"
      footer={
        <div className="flex justify-end gap-2.5">
          <Button variant="outline" onClick={cerrar} disabled={subiendo}>Cerrar</Button>
          <Button onClick={subir} loading={subiendo} disabled={!archivo}>Importar</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-ds-gray-500">
          Subí el archivo <strong>PRUEBAS RESISTENCIA A LA COMPRESIÓN DEL CONCRETO</strong> (hoja
          <code className="mx-1 rounded bg-ds-gray-100 px-1">BASE DATOS</code>). La importación es
          idempotente: correrla de nuevo no duplica muestras.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-ds-gray-500 file:mr-3 file:rounded-ds file:border-0 file:bg-black file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-ds-gray-800"
        />

        {resumen && (
          <div className="space-y-3 rounded-ds-lg border border-ds-gray-200 p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <Resumen label="Filas leídas" value={resumen.total_filas} />
              <Resumen label="Muestras nuevas" value={resumen.muestras_insertadas} />
              <Resumen label="Muestras actualizadas" value={resumen.muestras_actualizadas} />
              <Resumen label="Sin cambios" value={resumen.muestras_duplicadas} />
              <Resumen label="Ensayos nuevos" value={resumen.ensayos_insertados} />
              <Resumen label="Mediciones nuevas" value={resumen.mediciones_insertadas} />
              <Resumen label="Actividades creadas" value={resumen.actividades_creadas} />
            </div>
            {resumen.advertencias.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-ds-gray-500 mb-1">Advertencias ({resumen.advertencias.length})</p>
                <ul className="max-h-32 overflow-auto space-y-0.5 text-xs text-ds-gray-400 list-disc pl-4">
                  {resumen.advertencias.map((a, i) => <li key={i}>{a}</li>)}
                </ul>
              </div>
            )}
            {resumen.errores.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-red-600 mb-1">Errores ({resumen.errores.length})</p>
                <ul className="max-h-32 overflow-auto space-y-0.5 text-xs text-red-500 list-disc pl-4">
                  {resumen.errores.map((e, i) => (
                    <li key={i}>Fila {e.fila_excel} ({e.numero_muestra ?? '—'}): {e.mensaje}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function Resumen({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs text-ds-gray-400">{label}</p>
      <p className="text-lg font-bold text-black tabular-nums">{value}</p>
    </div>
  );
}
