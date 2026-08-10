'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageShell, PageHeader } from '@/components/layout/Page';
import { SkeletonText } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Table } from '@/components/ui/Table';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { TIPOS_CASA } from '@/lib/avance/sub-partidas';
import type {
  PartidaConGrupo,
  SubPartidaDetalle,
  SubPartidaListado,
  TipoCasa,
} from '@/lib/avance/sub-partidas';

const TODOS = '__todos__';

/**
 * Sub-partidas — admin (portado de obrascontrol: SubPartidasPantalla +
 * Crear/EditarSubPartidaDialog). Catálogo núcleo de ObrasControl: unidades
 * atómicas que conectan sprints con partidas de costo. Se crea sin peso; la
 * ponderación (por sprint y por partida) se asigna en la pantalla de Pesos.
 */
export default function SubPartidasPage() {
  const { toast } = useToast();

  const [subPartidas, setSubPartidas] = useState<SubPartidaListado[]>([]);
  const [partidas, setPartidas] = useState<PartidaConGrupo[]>([]);
  const [cargando, setCargando] = useState(true);

  // Filtros
  const [q, setQ] = useState('');
  const [sprint, setSprint] = useState<string>(TODOS);
  const [tipoCasa, setTipoCasa] = useState<string>(TODOS);
  const [activo, setActivo] = useState<string>('true'); // 'true' | 'false' | TODOS

  // Modales
  const [creando, setCreando] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);

  const cargar = useCallback(() => {
    setCargando(true);
    const params = new URLSearchParams();
    if (q.trim().length >= 2) params.set('q', q.trim());
    if (sprint !== TODOS) params.set('sprint', sprint);
    if (tipoCasa !== TODOS) params.set('tipo_casa', tipoCasa);
    if (activo === 'true' || activo === 'false') params.set('activo', activo);
    fetch(`/api/avance/sub-partidas?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Error al cargar'))))
      .then((d) => {
        setSubPartidas(d.subPartidas ?? []);
        setPartidas(d.partidas ?? []);
      })
      .catch(() => toast('No se pudieron cargar las sub-partidas.', 'error'))
      .finally(() => setCargando(false));
  }, [q, sprint, tipoCasa, activo, toast]);

  // Recarga con debounce ligero (por el filtro de búsqueda).
  useEffect(() => {
    const t = setTimeout(cargar, 250);
    return () => clearTimeout(t);
  }, [cargar]);

  const kpis = useMemo(() => {
    const total = subPartidas.length;
    const criticas = subPartidas.filter((r) => r.es_critica).length;
    const sprints = new Set(subPartidas.map((r) => r.sprint_numero)).size;
    return { total, criticas, sprints };
  }, [subPartidas]);

  const sprintsOpciones = useMemo(() => {
    const set = new Set<number>();
    for (const f of subPartidas) set.add(f.sprint_numero);
    return Array.from(set).sort((a, b) => a - b);
  }, [subPartidas]);

  return (
    <PageShell>
      <PageHeader
        title="Sub-partidas"
        subtitle="Catálogo núcleo de ObrasControl — unidades atómicas que conectan sprints con partidas de costo."
        actions={<Button onClick={() => setCreando(true)}>Nueva sub-partida</Button>}
      />

      {/* Filtros */}
      <div className="mb-5 grid grid-cols-1 gap-3 rounded-ds-lg border border-ds-gray-200 bg-ds-surface p-4 shadow-ds-01 md:grid-cols-4">
        <div className="md:col-span-2">
          <Input
            label="Buscar"
            type="search"
            placeholder="Código o nombre…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select
          label="Sprint"
          value={sprint}
          onChange={(e) => setSprint(e.target.value)}
          options={[
            { value: TODOS, label: 'Todos' },
            ...sprintsOpciones.map((s) => ({ value: String(s), label: `Sprint ${s}` })),
          ]}
        />
        <Select
          label="Tipo de casa"
          value={tipoCasa}
          onChange={(e) => setTipoCasa(e.target.value)}
          options={[
            { value: TODOS, label: 'Todos' },
            ...TIPOS_CASA.map((t) => ({ value: t, label: t })),
          ]}
        />
        <div className="flex flex-wrap items-center gap-4 text-sm md:col-span-4">
          {(
            [
              ['true', 'Solo activas'],
              ['false', 'Solo inactivas'],
              [TODOS, 'Ambas'],
            ] as const
          ).map(([val, lbl]) => (
            <label key={val} className="flex cursor-pointer items-center gap-1.5">
              <input
                type="radio"
                name="activo"
                value={val}
                checked={activo === val}
                onChange={(e) => setActivo(e.target.value)}
              />
              {lbl}
            </label>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-ds-lg border border-ds-gray-200 bg-ds-surface p-4 shadow-ds-01">
          <p className="text-xs font-semibold uppercase tracking-wide text-ds-gray-400">
            Total filtrado
          </p>
          <p className="text-heading font-bold tabular-nums">{kpis.total}</p>
        </div>
        <div className="rounded-ds-lg border border-ds-gray-200 bg-ds-surface p-4 shadow-ds-01">
          <p className="text-xs font-semibold uppercase tracking-wide text-ds-gray-400">Críticas</p>
          <p className="text-heading font-bold tabular-nums">{kpis.criticas}</p>
        </div>
        <div className="rounded-ds-lg border border-ds-gray-200 bg-ds-surface p-4 shadow-ds-01">
          <p className="text-xs font-semibold uppercase tracking-wide text-ds-gray-400">
            Sprints distintos
          </p>
          <p className="text-heading font-bold tabular-nums">{kpis.sprints}</p>
        </div>
      </div>

      {/* Tabla */}
      <Table<SubPartidaListado>
        columns={[
          { key: 'codigo', header: 'Código', className: 'font-mono text-xs' },
          {
            key: 'nombre',
            header: 'Nombre',
            render: (s) => (
              <div>
                <p className="font-medium">{s.nombre}</p>
                <p className="text-xs text-ds-gray-400">{s.grupo_nombre}</p>
              </div>
            ),
          },
          {
            key: 'partida_codigo',
            header: 'Partida',
            render: (s) => (
              <span className="text-sm">
                <span className="font-mono text-xs text-ds-gray-400">{s.partida_codigo}</span>{' '}
                {s.partida_nombre}
              </span>
            ),
          },
          {
            key: 'sprint_numero',
            header: 'Sprint',
            className: 'text-center',
            render: (s) => <span className="tabular-nums">{s.sprint_numero}</span>,
          },
          {
            key: 'tipos_casa',
            header: 'Tipos casa',
            render: (s) => (
              <div className="flex flex-wrap gap-1">
                {s.tipos_casa.map((tc) => (
                  <span
                    key={tc}
                    className="rounded-ds border border-ds-gray-200 px-1.5 py-0.5 font-mono text-[10px]"
                  >
                    {tc}
                  </span>
                ))}
              </div>
            ),
          },
          {
            key: 'es_critica',
            header: 'Crítica',
            className: 'text-center',
            render: (s) => (s.es_critica ? '⚡' : <span className="text-ds-gray-300">—</span>),
          },
          {
            key: 'activo',
            header: 'Activa',
            className: 'text-center',
            render: (s) =>
              s.activo ? (
                <span className="rounded-ds bg-black px-2 py-0.5 text-xs font-semibold text-white">
                  Activa
                </span>
              ) : (
                <span className="rounded-ds bg-ds-gray-100 px-2 py-0.5 text-xs font-semibold text-ds-gray-400">
                  Inactiva
                </span>
              ),
          },
        ]}
        data={subPartidas}
        keyField="id"
        loading={cargando}
        emptyMessage="Sin resultados con los filtros actuales."
        onRowClick={(s) => setEditandoId(s.id)}
      />

      {creando && (
        <SubPartidaModal
          partidas={partidas}
          onClose={() => setCreando(false)}
          onGuardado={() => {
            setCreando(false);
            cargar();
          }}
        />
      )}

      {editandoId !== null && (
        <SubPartidaModal
          partidas={partidas}
          editandoId={editandoId}
          onClose={() => setEditandoId(null)}
          onGuardado={() => {
            setEditandoId(null);
            cargar();
          }}
        />
      )}
    </PageShell>
  );
}

// ---------------------------------------------------------------- Modal crear/editar
interface FormState {
  codigo: string;
  nombre: string;
  partida_id: string;
  sprint_numero: string;
  es_critica: boolean;
  descripcion: string;
  activo: boolean;
  tipos_casa: Set<TipoCasa>;
}

const FORM_VACIO: FormState = {
  codigo: '',
  nombre: '',
  partida_id: '',
  sprint_numero: '',
  es_critica: false,
  descripcion: '',
  activo: true,
  tipos_casa: new Set(),
};

interface ModalProps {
  partidas: PartidaConGrupo[];
  editandoId?: number;
  onClose: () => void;
  onGuardado: () => void;
}

function SubPartidaModal({ partidas, editandoId, onClose, onGuardado }: ModalProps) {
  const { toast } = useToast();
  const esEdicion = editandoId !== undefined;

  const [form, setForm] = useState<FormState | null>(esEdicion ? null : { ...FORM_VACIO });
  const [detalle, setDetalle] = useState<SubPartidaDetalle | null>(null);
  const [guardando, setGuardando] = useState(false);

  // En edición, cargar el detalle y precargar el form.
  useEffect(() => {
    if (!esEdicion) return;
    let vivo = true;
    fetch(`/api/avance/sub-partidas/${editandoId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Error'))))
      .then((d) => {
        if (!vivo) return;
        const sp: SubPartidaDetalle = d.subPartida;
        setDetalle(sp);
        setForm({
          codigo: sp.codigo,
          nombre: sp.nombre,
          partida_id: String(sp.partida_id),
          sprint_numero: String(sp.sprint_numero),
          es_critica: sp.es_critica,
          descripcion: sp.descripcion ?? '',
          activo: sp.activo,
          tipos_casa: new Set(sp.tipos_casa),
        });
      })
      .catch(() => {
        if (vivo) toast('No se pudo cargar la sub-partida.', 'error');
      });
    return () => {
      vivo = false;
    };
  }, [esEdicion, editandoId, toast]);

  function toggleTipoCasa(tc: TipoCasa) {
    setForm((f) => {
      if (!f) return f;
      const next = new Set(f.tipos_casa);
      if (next.has(tc)) next.delete(tc);
      else next.add(tc);
      return { ...f, tipos_casa: next };
    });
  }

  const sprintNum = form ? Number(form.sprint_numero) : NaN;
  const puedeGuardar =
    !!form &&
    form.codigo.trim().length > 0 &&
    form.nombre.trim().length > 0 &&
    form.partida_id !== '' &&
    Number.isInteger(sprintNum) &&
    sprintNum >= 1 &&
    sprintNum <= 50 &&
    form.tipos_casa.size > 0;

  async function guardarCrear() {
    if (!form) return;
    const body = {
      codigo: form.codigo.trim(),
      nombre: form.nombre.trim(),
      partida_id: Number(form.partida_id),
      sprint_numero: Number(form.sprint_numero),
      tipos_casa: Array.from(form.tipos_casa),
      es_critica: form.es_critica,
      descripcion: form.descripcion.trim() || null,
      activo: form.activo,
    };
    const r = await fetch('/api/avance/sub-partidas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Error');
    toast('Sub-partida creada. Asigná su peso en la pantalla de Pesos.', 'success');
  }

  async function guardarEditar() {
    if (!form || !detalle || editandoId === undefined) return;
    // Parche solo con lo que cambió.
    const parche: Record<string, unknown> = {};
    if (form.codigo.trim() !== detalle.codigo) parche.codigo = form.codigo.trim();
    if (form.nombre.trim() !== detalle.nombre) parche.nombre = form.nombre.trim();
    if (Number(form.partida_id) !== detalle.partida_id)
      parche.partida_id = Number(form.partida_id);
    if (Number(form.sprint_numero) !== detalle.sprint_numero)
      parche.sprint_numero = Number(form.sprint_numero);
    if (form.es_critica !== detalle.es_critica) parche.es_critica = form.es_critica;
    if (form.activo !== detalle.activo) parche.activo = form.activo;
    if (form.descripcion.trim() !== (detalle.descripcion ?? ''))
      parche.descripcion = form.descripcion.trim() || null;
    const actuales = new Set(detalle.tipos_casa);
    const cambioTipos =
      form.tipos_casa.size !== actuales.size ||
      [...form.tipos_casa].some((t) => !actuales.has(t));
    if (cambioTipos) parche.tipos_casa = Array.from(form.tipos_casa);

    if (Object.keys(parche).length === 0) {
      toast('No hay cambios para guardar.', 'info');
      return;
    }
    const r = await fetch(`/api/avance/sub-partidas/${editandoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parche),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Error');
    toast('Sub-partida actualizada.', 'success');
  }

  async function handleGuardar() {
    if (!puedeGuardar) return;
    setGuardando(true);
    try {
      if (esEdicion) await guardarEditar();
      else await guardarCrear();
      onGuardado();
    } catch (e) {
      toast(`No se pudo guardar: ${e instanceof Error ? e.message : e}`, 'error');
    } finally {
      setGuardando(false);
    }
  }

  const partidasOpciones = partidas.map((p) => ({
    value: String(p.id),
    label: `${p.codigo} · ${p.nombre} (${p.grupo_codigo})`,
  }));

  return (
    <Modal
      open
      onClose={onClose}
      title={esEdicion ? 'Editar sub-partida' : 'Nueva sub-partida'}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={handleGuardar} loading={guardando} disabled={!puedeGuardar}>
            {esEdicion ? 'Guardar cambios' : 'Crear sub-partida'}
          </Button>
        </>
      }
    >
      {!form ? (
        <SkeletonText lines={4} />
      ) : (
        <div className="space-y-4">
          {!esEdicion && (
            <p className="text-sm text-ds-gray-500">
              Se crea sin peso. Luego asignás su ponderación (por sprint y por partida) en la
              pantalla de Pesos.
            </p>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Input
              label="Código"
              value={form.codigo}
              placeholder="Ej. 3.2.5"
              className="font-mono"
              onChange={(e) => setForm({ ...form, codigo: e.target.value })}
            />
            <div className="sm:col-span-2">
              <Input
                label="Nombre"
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Select
                label="Partida"
                value={form.partida_id}
                onChange={(e) => setForm({ ...form, partida_id: e.target.value })}
                options={partidasOpciones}
                placeholder="Seleccioná una partida…"
              />
            </div>
            <Input
              label="Sprint"
              type="number"
              min={1}
              max={50}
              value={form.sprint_numero}
              onChange={(e) => setForm({ ...form, sprint_numero: e.target.value })}
            />
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-ds-ink">Aplica a tipos de casa</p>
            <div className="grid grid-cols-2 gap-2">
              {TIPOS_CASA.map((tc) => (
                <label
                  key={tc}
                  className="flex cursor-pointer items-center gap-2 rounded-ds border border-ds-gray-200 bg-ds-surface px-3 py-2 text-sm hover:bg-ds-gray-100"
                >
                  <input
                    type="checkbox"
                    checked={form.tipos_casa.has(tc)}
                    onChange={() => toggleTipoCasa(tc)}
                    className="w-4 h-4 accent-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
                  />
                  <span className="font-mono">{tc}</span>
                </label>
              ))}
            </div>
            {form.tipos_casa.size === 0 && (
              <p className="mt-1 text-xs text-ds-yellow">
                Elegí al menos un tipo de casa: de ahí salen las columnas donde luego asignás el
                peso.
              </p>
            )}
          </div>

          <Input
            label="Descripción (opcional)"
            value={form.descripcion}
            onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
          />

          <div className="flex flex-col gap-3 border-t border-ds-gray-100 pt-3">
            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span>
                <span className="text-sm font-medium">Crítica</span>
                <span className="block text-xs text-ds-gray-400">
                  Bloquea el avance del sprint si está pendiente.
                </span>
              </span>
              <input
                type="checkbox"
                checked={form.es_critica}
                onChange={(e) => setForm({ ...form, es_critica: e.target.checked })}
                className="w-4 h-4 accent-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
              />
            </label>
            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span>
                <span className="text-sm font-medium">Activa</span>
                <span className="block text-xs text-ds-gray-400">
                  Si está inactiva no aparece para registrar avances.
                </span>
              </span>
              <input
                type="checkbox"
                checked={form.activo}
                onChange={(e) => setForm({ ...form, activo: e.target.checked })}
                className="w-4 h-4 accent-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
              />
            </label>
          </div>
        </div>
      )}
    </Modal>
  );
}
