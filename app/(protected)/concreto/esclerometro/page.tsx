'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { DatePicker } from '@/components/ui/DatePicker';
import { Modal } from '@/components/ui/Modal';
import { DataTable } from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/Toast';
import { Icon } from '@/components/ds/Icon/Icon';
import { PageShell, PageHeader } from '@/components/layout/Page';
import { ANGULOS_IMPACTO } from '@/lib/concreto/tipos-esclerometro';
import type {
  EnsayoEsclerometroListado,
  CrearEnsayoEsclerometroRequest,
} from '@/lib/concreto/tipos-esclerometro';

// `/concreto/esclerometro` — listado de ensayos no destructivos (martillo
// Schmidt). Cada ensayo registra N golpes sobre un elemento estructural; el
// promedio descarta máximo y mínimo cuando hay 3 o más golpes. Click en una
// fila abre el detalle.

const ETIQUETAS_ANGULO: Record<number, string> = {
  [-90]: '↓ Hacia abajo (-90°)',
  [-45]: '↘ Diagonal abajo (-45°)',
  [0]: '→ Horizontal (0°)',
  [45]: '↗ Diagonal arriba (45°)',
  [90]: '↑ Hacia arriba (90°)',
};

const ELEMENTOS_TIPICOS = [
  'Columna',
  'Viga',
  'Losa',
  'Muro',
  'Cimiento',
  'Contrapiso',
  'Otro',
] as const;

function fmtFecha(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const col = createColumnHelper<EnsayoEsclerometroListado>();

export default function EsclerometroPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [ensayos, setEnsayos] = useState<EnsayoEsclerometroListado[]>([]);
  const [loading, setLoading] = useState(true);
  const [obra, setObra] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [modalNuevo, setModalNuevo] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ pagina: '1', por_pagina: '100' });
    if (obra.trim()) params.set('obra_works_no', obra.trim());
    if (desde) params.set('desde', desde);
    if (hasta) params.set('hasta', hasta);
    try {
      const data = await fetch(`/api/concreto/lab/esclerometro?${params}`).then((r) => r.json());
      if (data.error) throw new Error(data.error);
      setEnsayos(data.ensayos ?? []);
    } catch {
      toast('Error cargando ensayos', 'error');
      setEnsayos([]);
    } finally {
      setLoading(false);
    }
  }, [obra, desde, hasta, toast]);

  useEffect(() => {
    load();
  }, [load]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columns: ColumnDef<EnsayoEsclerometroListado, any>[] = [
    col.accessor('numero', {
      header: '#',
      meta: { label: 'Número', align: 'right' },
      cell: (c) => <span className="font-semibold tabular-nums">{c.getValue()}</span>,
    }),
    col.accessor('fecha', {
      header: 'Fecha',
      meta: { label: 'Fecha', exportValue: (r) => r.fecha },
      cell: (c) => <span className="tabular-nums">{fmtFecha(c.getValue())}</span>,
    }),
    col.accessor('obra_works_no', {
      header: 'Obra',
      meta: { label: 'Obra' },
      cell: (c) => {
        const r = c.row.original;
        if (!r.obra_works_no) return <span className="text-ds-gray-300">—</span>;
        return (
          <div className="max-w-[200px]">
            <div className="text-xs font-semibold">{r.obra_works_no}</div>
            {r.obra_display_name && (
              <div className="truncate text-xs text-ds-gray-400">{r.obra_display_name}</div>
            )}
          </div>
        );
      },
    }),
    col.accessor('id_casa', {
      header: 'Casa / ubic.',
      meta: { label: 'Casa / ubicación' },
      cell: (c) => c.getValue() || <span className="text-ds-gray-300">—</span>,
    }),
    col.accessor('elemento_estructural', {
      header: 'Elemento estructural',
      meta: { label: 'Elemento estructural' },
    }),
    col.accessor('edad_dias', {
      header: 'Edad (d)',
      meta: { label: 'Edad (días)', align: 'right' },
      cell: (c) => {
        const v = c.getValue();
        return v === null ? (
          <span className="text-ds-gray-300">—</span>
        ) : (
          <span className="tabular-nums">{v}</span>
        );
      },
    }),
    col.accessor('cantidad_rebotes', {
      header: 'Golpes',
      meta: { label: 'Golpes', align: 'right' },
      cell: (c) => <span className="tabular-nums">{c.getValue()}</span>,
    }),
    col.accessor('rebote_promedio', {
      header: 'R̄ promedio',
      meta: {
        label: 'R̄ promedio',
        align: 'right',
        exportValue: (r) => (r.rebote_promedio === null ? '' : r.rebote_promedio.toFixed(1)),
      },
      cell: (c) => {
        const v = c.getValue();
        return v === null ? (
          <span className="text-ds-gray-300">—</span>
        ) : (
          <span className="font-semibold tabular-nums">{v.toFixed(1)}</span>
        );
      },
    }),
  ];

  return (
    <PageShell>
      <PageHeader
        title="Esclerómetro"
        subtitle={`${ensayos.length} ensayos · martillo Schmidt (no destructivo)`}
        actions={
          <Button onClick={() => setModalNuevo(true)} icon={<Icon name="plus" size="sm" color="currentColor" />}>
            Nuevo ensayo
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Input
          label="Obra"
          value={obra}
          onChange={(e) => setObra(e.target.value)}
          placeholder="VB, 6.24, Casa…"
        />
        <DatePicker label="Desde" value={desde} onChange={setDesde} />
        <DatePicker label="Hasta" value={hasta} onChange={setHasta} />
      </div>

      <DataTable
        columns={columns}
        data={ensayos}
        loading={loading}
        onRowClick={(r) => router.push(`/concreto/esclerometro/${r.id}`)}
        searchPlaceholder="Buscar elemento, casa, obra…"
        exportFilename="esclerometro"
        emptyMessage="No hay ensayos que coincidan con los filtros."
      />

      <ModalNuevoEnsayo
        open={modalNuevo}
        onClose={() => setModalNuevo(false)}
        onCreado={(id) => {
          setModalNuevo(false);
          router.push(`/concreto/esclerometro/${id}`);
        }}
      />
    </PageShell>
  );
}

// =============================================================================
// Modal de creación (solo el header; los rebotes se ingresan en el detalle).
// Portado de ModalCrearEnsayoEsclerometro de la app original.
// =============================================================================

function ModalNuevoEnsayo({
  open,
  onClose,
  onCreado,
}: {
  open: boolean;
  onClose: () => void;
  onCreado: (id: number) => void;
}) {
  const { toast } = useToast();
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [obra, setObra] = useState('');
  const [idCasa, setIdCasa] = useState('');
  const [elementoSel, setElementoSel] = useState<string>('Columna');
  const [elementoLibre, setElementoLibre] = useState('');
  const [edadDias, setEdadDias] = useState('');
  const [angulo, setAngulo] = useState(0);
  const [equipoSerial, setEquipoSerial] = useState('');
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (open) {
      setFecha(new Date().toISOString().slice(0, 10));
      setObra('');
      setIdCasa('');
      setElementoSel('Columna');
      setElementoLibre('');
      setEdadDias('');
      setAngulo(0);
      setEquipoSerial('');
      setNotas('');
      setGuardando(false);
    }
  }, [open]);

  const elementoFinal = elementoSel === 'Otro' ? elementoLibre.trim() : elementoSel;
  const edadNum = edadDias.trim() === '' ? null : Number(edadDias);
  const edadValida =
    edadNum === null || (Number.isInteger(edadNum) && edadNum > 0 && edadNum <= 3650);
  const valido = fecha.length === 10 && elementoFinal.length > 0 && edadValida;

  const onSubmit = async () => {
    if (!valido) {
      toast('Revisá los campos requeridos', 'warning');
      return;
    }
    const body: CrearEnsayoEsclerometroRequest = {
      fecha,
      obra_works_no: obra.trim() || null,
      id_casa: idCasa.trim() || null,
      elemento_estructural: elementoFinal,
      edad_dias: edadNum,
      angulo_impacto: angulo,
      equipo_serial: equipoSerial.trim() || null,
      notas: notas.trim() || null,
    };
    setGuardando(true);
    try {
      const res = await fetch('/api/concreto/lab/esclerometro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error creando ensayo');
      onCreado(data.id);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error creando ensayo', 'error');
      setGuardando(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!guardando) onClose();
      }}
      title="Nuevo ensayo de esclerómetro"
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={onSubmit}
            disabled={!valido || guardando}
            loading={guardando}
            icon={<Icon name="plus" />}
          >
            Crear ensayo
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-ds-gray-400">
          Ensayo no destructivo. Después de crear el header, registrás los rebotes uno a uno en la
          pantalla de detalle. El número se asigna automático (consecutivo).
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DatePicker label="Fecha del ensayo" value={fecha} onChange={setFecha} required />
          <Input
            label="Edad del concreto (días)"
            type="number"
            value={edadDias}
            onChange={(e) => setEdadDias(e.target.value)}
            placeholder="28"
            min={1}
            max={3650}
            error={edadValida ? undefined : 'Edad inválida (1-3650)'}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Obra (works_no)"
            value={obra}
            onChange={(e) => setObra(e.target.value)}
            placeholder="VB, 6.24…"
          />
          <Input
            label="Casa / ubicación"
            value={idCasa}
            onChange={(e) => setIdCasa(e.target.value)}
            placeholder="Casa 12, Eje C-3…"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-black">
            Elemento estructural <span className="text-ds-red">*</span>
          </span>
          <div className="flex flex-wrap gap-1.5">
            {ELEMENTOS_TIPICOS.map((el) => (
              <Button
                key={el}
                type="button"
                size="xs"
                variant={elementoSel === el ? 'secondary' : 'outline'}
                onClick={() => setElementoSel(el)}
              >
                {el}
              </Button>
            ))}
          </div>
          {elementoSel === 'Otro' && (
            <Input
              value={elementoLibre}
              onChange={(e) => setElementoLibre(e.target.value)}
              placeholder="Especificá el elemento"
              className="mt-1"
            />
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Ángulo de impacto"
            required
            value={String(angulo)}
            onChange={(e) => setAngulo(Number(e.target.value))}
            options={ANGULOS_IMPACTO.map((a) => ({
              value: String(a),
              label: ETIQUETAS_ANGULO[a] ?? `${a}°`,
            }))}
            hint="El ángulo afecta el valor de rebote (correcciones de tabla)."
          />
          <Input
            label="Equipo (serial)"
            value={equipoSerial}
            onChange={(e) => setEquipoSerial(e.target.value)}
            placeholder="Schmidt N°…"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="notas" className="text-sm font-medium text-black">
            Notas (opcional)
          </label>
          <textarea
            id="notas"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            className="min-h-[64px] w-full rounded-ds-xl border-2 border-transparent bg-white px-5 py-3 text-body-sm text-black shadow-ds-01 focus:border-black focus:shadow-none focus:outline-none"
            placeholder="Observaciones del ensayo…"
          />
        </div>
      </div>
    </Modal>
  );
}
