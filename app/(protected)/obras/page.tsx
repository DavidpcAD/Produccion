'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Combobox, type ComboOption } from '@/components/ui/Combobox';
import { DataTable } from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/Toast';
import { useSession } from '@/hooks/useSession';
import { Icon } from '@/components/ds/Icon/Icon';
import { ObraEditModal } from '@/components/obras/ObraEditModal';
import { PageShell, PageHeader } from '@/components/layout/Page';

interface Obra {
  idObra: number;
  numeroObra: string;
  nombreMostrado: string | null;
  descripcion: string | null;
  centroCosto: string | null;
  areaCosteo: string | null;
  proyectoPadre: string | null;
  idProyecto: number | null;
  proyectoNombre: string | null;
  gerenteProyecto: string | null;
  idEncargado: string | null;
  ubicacion: string | null;
  estado: string | null;
  fechaInicio: string | null;
  fechaFin: string | null;
  areaProrrateadaM2: number | null;
  precioNormalMaquinaria: number | null;
  precioConcretoMaquinaria: number | null;
  origenPrincipal: string | null;
  esBC: boolean | null;
  esProcore: boolean | null;
}

const EMPTY: Record<string, string | boolean> = {
  numeroObra: '', nombreMostrado: '', descripcion: '', estado: '', centroCosto: '',
  areaCosteo: '', proyectoPadre: '', idProyecto: '', gerenteProyecto: '', idEncargado: '', ubicacion: '',
  fechaInicio: '', fechaFin: '', areaProrrateadaM2: '', precioNormalMaquinaria: '',
  precioConcretoMaquinaria: '', origenPrincipal: '', esBC: false, esProcore: false,
};
const PASOS = ['Datos', 'Dimensiones', 'Revisar'] as const;

const col = createColumnHelper<Obra>();

// Grupos de registro de inventario que se pueden habilitar en el almacén de la obra.
const GRUPOS_INVENTARIO = ['MATERIALES', 'SUMINISTROS', 'MAQUINARIA', 'HERRAMIENTAS', 'REPUESTOS', 'EQUIPOS', 'LOTES'];
const TIPOS_INV_DEFAULT = ['MATERIALES', 'SUMINISTROS'];

export default function ObrasPage() {
  const router = useRouter();
  const session = useSession();
  const { toast } = useToast();
  const [obras, setObras] = useState<Obra[]>([]);
  const [proyectos, setProyectos] = useState<{ IDProyecto: number; Nombre: string; CodigoBC: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string | boolean>>(EMPTY);

  // Edición: editor único compartido (mismo modal que el detalle)
  const [editOpen, setEditOpen] = useState(false);
  const [editObra, setEditObra] = useState<Obra | null>(null);

  // Creación: wizard de 3 pasos
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [crearEnBC, setCrearEnBC] = useState(false);
  const [dimOpts, setDimOpts] = useState<{ AC: ComboOption[]; CC: ComboOption[] }>({ AC: [], CC: [] });
  const [dimLoading, setDimLoading] = useState(false);
  const [tiposInv, setTiposInv] = useState<string[]>(TIPOS_INV_DEFAULT);
  const [grupoOpts, setGrupoOpts] = useState<ComboOption[]>(GRUPOS_INVENTARIO.map(g => ({ value: g, label: g })));

  const isAdmin = !!session && session.nivelAdmin >= 2;

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ pagina: '1', porPagina: '5000' });
    try {
      const r = await fetch(`/api/obras?${params}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setObras(data.data ?? []);
    } catch {
      // Distinguir "falló la carga" de "no hay obras": avisar en vez de mostrar vacío.
      toast('No se pudieron cargar las obras. Revisá tu conexión y reintentá.', 'error');
    } finally {
      setLoading(false);
    }
    // toast es estable (contexto); no se incluye en deps para no re-crear load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { fetch('/api/proyectos').then(r => r.json()).then(d => setProyectos(d.data ?? [])).catch(() => {}); }, []);

  const set = (k: string, v: string | boolean) => setForm(p => ({ ...p, [k]: v }));

  // ─── Wizard de creación ───────────────────────────────────────────────
  async function openCreate() {
    setForm(EMPTY);
    setStep(0);
    setDimOpts({ AC: [], CC: [] });
    setTiposInv(TIPOS_INV_DEFAULT);
    setGrupoOpts(GRUPOS_INVENTARIO.map(g => ({ value: g, label: g })));
    setWizardOpen(true);
    // AC y grupos de inventario se traen de BC. CC = N° de obra (lo crea el AL).
    setDimLoading(true);
    try {
      const [ac, grupos] = await Promise.all([
        fetch('/api/bc/dimensions?code=AC').then(r => r.json()).catch(() => ({ values: [] })),
        fetch('/api/bc/inventory-groups').then(r => r.json()).catch(() => ({ groups: [] })),
      ]);
      const toOpts = (vals: { code: string; name: string }[]): ComboOption[] =>
        (vals ?? []).map(v => ({ value: v.code, label: v.name ? `${v.code} — ${v.name}` : v.code, search: v.name }));
      setDimOpts({ AC: toOpts(ac.values), CC: [] });
      const gopts = toOpts(grupos.groups);
      if (gopts.length) setGrupoOpts(gopts);
      setCrearEnBC(Boolean(ac.bcReady));
    } finally {
      setDimLoading(false);
    }
  }

  function validarNumero(): boolean {
    if (!form.numeroObra) { toast('El número de obra es requerido', 'warning'); return false; }
    if (crearEnBC && String(form.numeroObra).length > 10) {
      toast('Para crear en BC, el N° de obra no puede superar 10 caracteres (límite del almacén).', 'warning');
      return false;
    }
    return true;
  }

  function nextStep() {
    if (step === 0 && !form.idProyecto) { toast('Seleccioná el proyecto de la obra', 'warning'); return; }
    if (step === 0 && !validarNumero()) return;
    setStep(s => Math.min(s + 1, PASOS.length - 1));
  }
  function prevStep() { setStep(s => Math.max(s - 1, 0)); }

  async function handleCreate() {
    if (!form.idProyecto) { toast('Seleccioná el proyecto de la obra', 'warning'); return; }
    if (!validarNumero()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/obras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, crearEnBC, tiposInventario: tiposInv }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast(data.error || 'Error creando la obra', 'error'); return; }
      toast(crearEnBC ? 'Obra creada en BC y guardada' : 'Obra creada', 'success');
      setWizardOpen(false);
      await load();
    } finally { setSaving(false); }
  }

  // ─── Edición (editor único compartido) ────────────────────────────────
  function openEdit(o: Obra) {
    setEditObra(o);
    setEditOpen(true);
  }

  // Las obras NO se eliminan. Una obra vendida se "bloquea" desde su detalle
  // (estado → Blocked), acción que además se conectará con Business Central.

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columns: ColumnDef<Obra, any>[] = [
    col.accessor('numeroObra', {
      header: 'N° Obra', meta: { label: 'N° Obra' },
      cell: ({ getValue }) => <span className="font-semibold text-black">{getValue() as string}</span>,
    }),
    col.accessor('nombreMostrado', {
      header: 'Nombre', meta: { label: 'Nombre' },
      cell: ({ getValue }) => (getValue() as string) || <span className="text-ds-gray-300">—</span>,
    }),
    col.accessor('estado', {
      header: 'Estado', meta: { label: 'Estado' },
      cell: ({ getValue }) => {
        const raw = getValue() as string | null;
        if (!raw) return '—';
        const e = raw.toLowerCase();
        const cfg = e === 'open'
          ? { label: 'Abierta', cls: 'bg-brand/15 text-ds-green-ink', dot: 'bg-brand' }
          : e === 'blocked'
            ? { label: 'Bloqueada', cls: 'bg-ds-red/10 text-ds-red', dot: 'bg-ds-red' }
            : { label: raw, cls: 'bg-ds-gray-100 text-ds-gray-500', dot: 'bg-ds-gray-400' };
        return (
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 h-7 text-[13px] font-semibold ${cfg.cls}`}>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />{cfg.label}
          </span>
        );
      },
    }),
    col.accessor('centroCosto', {
      header: 'Centro de costo', meta: { label: 'Centro de costo' },
      cell: ({ getValue }) => (getValue() as string) || '—',
    }),
    col.accessor('proyectoNombre', {
      header: 'Proyecto', meta: { label: 'Proyecto' },
      cell: ({ getValue }) => (getValue() as string) || '—',
    }),
    col.display({
      id: 'origen', header: 'Origen',
      meta: { label: 'Origen', noFilter: true, exportValue: (o) => [o.esBC && 'BC', o.esProcore && 'Procore'].filter(Boolean).join(' / ') },
      cell: ({ row }) => { const o = row.original; return (
        <div className="flex gap-1">
          {o.esBC && <Badge variant="gray">BC</Badge>}
          {o.esProcore && <Badge variant="gray">Procore</Badge>}
          {!o.esBC && !o.esProcore && <span className="text-ds-gray-300">—</span>}
        </div>
      ); },
    }),
    ...(isAdmin ? [col.display({
      id: 'acciones', header: '', meta: { label: 'Acciones' },
      cell: ({ row }) => { const o = row.original; return (
        <div className="flex items-center gap-2 justify-end">
          <button onClick={e => { e.stopPropagation(); openEdit(o); }} className="text-ds-gray-400 hover:text-black" title="Editar"><Icon name="edit" size="sm" color="currentColor" /></button>
        </div>
      ); },
    })] : []),
  ];

  // Combobox si BC devolvió valores; si no, texto libre. Función de render
  // (no componente anidado) para no reiniciar estado en cada render.
  function renderDim(code: 'AC' | 'CC', label: string) {
    const key = code === 'AC' ? 'areaCosteo' : 'centroCosto';
    const opts = dimOpts[code];
    if (opts.length > 0) {
      return (
        <Combobox
          label={label}
          value={String(form[key])}
          onChange={v => set(key, v)}
          options={opts}
          placeholder="Seleccionar valor…"
          emptyText="Sin valores"
        />
      );
    }
    return (
      <Input
        label={label}
        value={String(form[key])}
        onChange={e => set(key, e.target.value)}
        hint={dimLoading ? 'Cargando valores de BC…' : 'BC sin conexión: código manual'}
      />
    );
  }

  return (
    <PageShell>
      <PageHeader title="Obras" subtitle={`${obras.length} obras`}
        actions={isAdmin ? <Button onClick={openCreate} icon={<Icon name="plus" size="sm" color="currentColor" />}>Nueva obra</Button> : undefined} />

      <DataTable
        columns={columns}
        data={obras}
        loading={loading}
        onRowClick={o => router.push(`/obras/${o.idObra}`)}
        searchPlaceholder="Buscar por número, nombre o centro de costo…"
        exportFilename="obras"
        emptyMessage="Sin obras"
      />

      {/* ─── Wizard: Nueva obra ─── */}
      <Modal
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        size="xl"
        title="Nueva obra"
        footer={
          <>
            {step > 0 && <Button variant="outline" onClick={prevStep}>Atrás</Button>}
            <Button variant="outline" onClick={() => setWizardOpen(false)}>Cancelar</Button>
            {step < PASOS.length - 1
              ? <Button onClick={nextStep}>Siguiente</Button>
              : <Button loading={saving} onClick={handleCreate} icon={<Icon name="check" size="sm" color="currentColor" />}>
                  {crearEnBC ? 'Crear proyecto en BC' : 'Crear obra'}
                </Button>}
          </>
        }
      >
        {/* Stepper */}
        <div className="flex items-center gap-2 mb-6">
          {PASOS.map((p, i) => (
            <div key={p} className="flex items-center gap-2 flex-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors
                ${i < step ? 'bg-black text-white' : i === step ? 'bg-brand text-black' : 'bg-ds-gray-100 text-ds-gray-400'}`}>
                {i < step ? <Icon name="check" size="sm" color="currentColor" /> : i + 1}
              </div>
              <span className={`text-sm font-semibold ${i === step ? 'text-black' : 'text-ds-gray-400'}`}>{p}</span>
              {i < PASOS.length - 1 && <div className="flex-1 h-px bg-ds-gray-200" />}
            </div>
          ))}
        </div>

        <div className="space-y-4 min-h-[220px]">
          {step === 0 && (
            <>
              <Combobox label="Proyecto" value={String(form.idProyecto)} onChange={v => set('idProyecto', v)} required
                options={proyectos.map(p => ({ value: String(p.IDProyecto), label: p.Nombre, parts: [{ text: p.Nombre, weight: 'bold' as const }, ...(p.CodigoBC ? [{ text: p.CodigoBC, weight: 'light' as const }] : [])], search: p.CodigoBC ?? '' }))}
                placeholder="Seleccionar proyecto" />
              <p className="text-xs text-ds-gray-400 -mt-2">La obra queda amarrada a este proyecto (solo en el sistema; no viaja a Business Central).</p>
              <Input label="Número de obra" value={String(form.numeroObra)} onChange={e => set('numeroObra', e.target.value)} required
                maxLength={crearEnBC ? 10 : undefined}
                hint={crearEnBC ? 'Se envía a Business Central · máx. 10 caracteres' : undefined} />
              <Input label="Nombre mostrado" value={String(form.nombreMostrado)} onChange={e => set('nombreMostrado', e.target.value)}
                hint="Descripción principal del proyecto en BC" />
              <Input label="Descripción" value={String(form.descripcion)} onChange={e => set('descripcion', e.target.value)} />
              <label className="flex items-center gap-2 text-sm font-medium text-black cursor-pointer pt-1">
                <input type="checkbox" checked={crearEnBC} onChange={e => setCrearEnBC(e.target.checked)} className="w-4 h-4 accent-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2" />
                Crear también en Business Central
              </label>
              {crearEnBC && dimOpts.AC.length === 0 && !dimLoading && (
                <p className="text-xs text-ds-red">BC no respondió: no se pudieron cargar valores de dimensión. Podés continuar en modo manual o desmarcar la opción.</p>
              )}
            </>
          )}

          {step === 1 && (
            <>
              <p className="text-body-sm text-ds-gray-400">Área de costo del proyecto.</p>
              {renderDim('AC', 'Área de costo (AC)')}
              <div className="rounded-ds border border-ds-gray-200 px-4 py-3 text-sm">
                <span className="text-ds-gray-400 font-medium">Centro de costo (CC): </span>
                <span className="text-black font-semibold">{String(form.numeroObra) || '—'}</span>
                <span className="text-ds-gray-300"> · se crea automático con el N° de obra</span>
              </div>

              <div className="pt-1">
                <Combobox
                  multiple
                  label="Tipos de inventario que se podrán cargar"
                  values={tiposInv}
                  onValuesChange={setTiposInv}
                  options={grupoOpts}
                  placeholder="Seleccionar tipos…"
                  emptyText="Sin grupos"
                />
                <p className="text-xs text-ds-gray-400 mt-1.5">Cada tipo se registra contra la cuenta 10-10-006-000-010 (Inventario de producto en proceso).</p>
              </div>
            </>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <p className="text-body-sm text-ds-gray-400">Revisá antes de crear.</p>
              <dl className="rounded-ds border border-ds-gray-200 divide-y divide-ds-gray-100 text-sm">
                {[
                  ['N° de obra', form.numeroObra],
                  ['Nombre', form.nombreMostrado || '—'],
                  ['Descripción', form.descripcion || '—'],
                  ['Área de costo (AC)', form.areaCosteo || '—'],
                  ['Centro de costo (CC)', `${form.numeroObra || '—'} (automático)`],
                  ['Tipos de inventario', tiposInv.length ? tiposInv.join(', ') : '—'],
                  ['Destino', crearEnBC ? 'Business Central + SQL' : 'Solo SQL'],
                ].map(([k, v]) => (
                  <div key={String(k)} className="flex justify-between px-4 py-2.5">
                    <dt className="text-ds-gray-400 font-medium">{k}</dt>
                    <dd className="text-black font-semibold text-right">{String(v)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      </Modal>

      {/* ─── Modal: Editar obra (editor único compartido con el detalle) ─── */}
      <ObraEditModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        obra={editObra}
        proyectos={proyectos}
        onSaved={load}
      />
    </PageShell>
  );
}
