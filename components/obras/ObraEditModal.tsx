'use client';
import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Combobox, type ComboOption } from '@/components/ui/Combobox';
import { DatePicker } from '@/components/ui/DatePicker';
import { useToast } from '@/components/ui/Toast';
import { Icon } from '@/components/ds/Icon/Icon';

/** Campos editables de una obra (los que consume el modal). Ambas pantallas
 *  (lista y detalle) pasan un objeto que cumple esta forma. */
export interface ObraEditData {
  idObra: number;
  numeroObra: string;
  nombreMostrado: string | null;
  descripcion: string | null;
  estado: string | null;
  centroCosto: string | null;
  areaCosteo: string | null;
  /** Tipo elegido a mano (O/I/A/F/T). null = se deduce del área de costeo. */
  tipoObra?: string | null;
  tipoObraEfectivo?: string | null;
  idProyecto: number | null;
  origenPrincipal: string | null;
  gerenteProyecto: string | null;
  idEncargado: string | null;
  ubicacion: string | null;
  fechaInicio: string | null;
  fechaFin: string | null;
  areaProrrateadaM2: number | null;
  esBC: boolean | null;
  esProcore: boolean | null;
  /** ¿Su almacén es una bodega física? Marca única de almacenes (dbo.AlmacenClase);
   *  sin marca, cuenta por el código. Es lo mismo que arma "Bodegas" en el pedido. */
  esAlmacenFisico?: boolean | null;
  /** La marca explícita, si la hay: 'real' | 'virtual'. null = sin marcar. */
  claseAlmacen?: 'real' | 'virtual' | null;
}

interface ProyectoOpt { IDProyecto: number; Nombre: string; CodigoBC: string }

interface ObraEditModalProps {
  open: boolean;
  onClose: () => void;
  /** Obra a editar (seed del formulario). */
  obra: ObraEditData | null;
  /** Proyectos disponibles para el selector. */
  proyectos: ProyectoOpt[];
  /** Se llama tras guardar con éxito (cada pantalla recarga sus datos). */
  onSaved: () => void;
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="border-b border-ds-gray-100 pb-2">
        <h3 className="font-bold text-ds-ink text-sm">{titulo}</h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
    </section>
  );
}

/** Estados del proyecto en BC (mismos que ESTADOS_BC de lib/bc/obra-sync.ts, que
 *  es server-only). Se guarda el código en inglés, igual que lo trae el sync. */
const ESTADOS_BC: ComboOption[] = [
  { value: 'Planning', label: 'Planificación' },
  { value: 'Quote', label: 'Oferta' },
  { value: 'Open', label: 'Abierto' },
  { value: 'Completed', label: 'Completado' },
];

/** Valores de dimensión (AC/CC) de BC → opciones de Combobox. */
function toDimOpts(vals: { code: string; name: string }[]): ComboOption[] {
  return (vals ?? []).map(v => ({ value: v.code, label: v.name ? `${v.code} — ${v.name}` : v.code, search: v.name }));
}

/** Editor único de obra: modal compartido por la lista (/obras) y el detalle
 *  (/obras/[id]) para que ambos usen exactamente el mismo formulario. */
export function ObraEditModal({ open, onClose, obra, proyectos, onSaved }: ObraEditModalProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string | boolean>>({});
  const set = (k: string, v: string | boolean) => setForm(p => ({ ...p, [k]: v }));

  // Valores de dimensión traídos de BC (Área de costeo / Centro de costo). Si BC
  // no responde, quedan vacíos y los campos degradan a texto libre.
  const [tiposObra, setTiposObra] = useState<{ codigo: string; letra: string; nombre: string }[]>([]);
  const [dimAC, setDimAC] = useState<ComboOption[]>([]);
  const [dimCC, setDimCC] = useState<ComboOption[]>([]);
  const [dimLoading, setDimLoading] = useState(false);

  useEffect(() => {
    if (!open || !obra) return;
    const d = (v: string | null) => (v ? v.split('T')[0] : ''); // fecha sin conversión de zona
    setForm({
      numeroObra: obra.numeroObra ?? '',
      nombreMostrado: obra.nombreMostrado ?? '',
      descripcion: obra.descripcion ?? '',
      estado: obra.estado ?? '',
      centroCosto: obra.centroCosto ?? '',
      areaCosteo: obra.areaCosteo ?? '',
      tipoObra: obra.tipoObra ?? '',
      idProyecto: obra.idProyecto != null ? String(obra.idProyecto) : '',
      origenPrincipal: obra.origenPrincipal ?? '',
      gerenteProyecto: obra.gerenteProyecto ?? '',
      idEncargado: obra.idEncargado ?? '',
      ubicacion: obra.ubicacion ?? '',
      fechaInicio: d(obra.fechaInicio),
      fechaFin: d(obra.fechaFin),
      areaProrrateadaM2: obra.areaProrrateadaM2 != null ? String(obra.areaProrrateadaM2) : '',
      esBC: !!obra.esBC,
      esProcore: !!obra.esProcore,
      esAlmacenFisico: !!obra.esAlmacenFisico,
    });
  }, [open, obra]);

  // Tipos de obra del catálogo (O/I/A/F/T) para el selector.
  useEffect(() => {
    if (!open) return;
    fetch('/api/tipos-obra')
      .then(r => (r.ok ? r.json() : null))
      .then(d => setTiposObra(d?.tipos ?? []))
      .catch(() => {});
  }, [open]);

  // Al abrir el modal, traer los valores permitidos de AC/CC desde BC (una vez).
  useEffect(() => {
    if (!open) return;
    let cancel = false;
    setDimLoading(true);
    Promise.all([
      fetch('/api/bc/dimensions?code=AC').then(r => r.json()).catch(() => ({ values: [] })),
      fetch('/api/bc/dimensions?code=CC').then(r => r.json()).catch(() => ({ values: [] })),
    ]).then(([ac, cc]) => {
      if (cancel) return;
      setDimAC(toDimOpts(ac.values));
      setDimCC(toDimOpts(cc.values));
    }).finally(() => { if (!cancel) setDimLoading(false); });
    return () => { cancel = true; };
  }, [open]);

  // Opciones de un campo de dimensión: las de BC + el valor actual si no está en
  // la lista (obras heredadas con un código que BC ya no ofrece), para no perderlo.
  function opcionesDim(base: ComboOption[], actual: string): ComboOption[] {
    if (!actual || base.some(o => o.value === actual)) return base;
    return [{ value: actual, label: `${actual} (actual)` }, ...base];
  }

  // En una obra de BC, lo que se cambió y vive en BC se escribe allá primero (lo
  // decide el servidor, ver lib/bc/obra-sync.ts). Si BC lo rechaza no se guarda
  // nada: el modal queda abierto con lo editado y el motivo de BC en el aviso.
  async function guardar() {
    if (!obra) return;
    if (!form.numeroObra) { toast('El número de obra es requerido', 'warning'); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/obras/${obra.idObra}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const e = await res.json().catch(() => ({}));
      if (!res.ok) { toast(e.error || 'Error guardando la obra', 'error'); return; }
      const bc = e.bc as { enviados?: string[]; avisos?: string[] } | undefined;
      toast(bc?.enviados?.length ? 'Obra actualizada en el sistema y en Business Central' : 'Obra actualizada', 'success');
      if (bc?.avisos?.length) toast(bc.avisos.join(' '), 'warning');
      onClose();
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  const proyectoOptions = proyectos.map(p => ({
    value: String(p.IDProyecto),
    label: p.Nombre,
    parts: [
      { text: p.Nombre, weight: 'bold' as const },
      ...(p.CodigoBC ? [{ text: p.CodigoBC, weight: 'light' as const }] : []),
    ],
    search: p.CodigoBC ?? '',
  }));

  // Render de un campo de dimensión (AC/CC): Combobox si BC dio valores, si no
  // texto libre. Mantiene el valor actual aunque BC no lo ofrezca.
  // En obras de BC va SOLO LECTURA: el AC/CC de la obra se define al crearla y de
  // ahí en adelante BC es el dueño (el sync los vuelve a traer en cada corrida),
  // así que editarlos acá solo crearía diferencias que se pierden.
  function renderDim(key: 'areaCosteo' | 'centroCosto', label: string, base: ComboOption[]) {
    const actual = String(form[key] ?? '');
    if (obra?.esBC) {
      return (
        <Input label={label} value={actual} disabled
          hint="Lo administra Business Central — se cambia en la obra de BC" />
      );
    }
    const opts = opcionesDim(base, actual);
    if (opts.length > 0) {
      return (
        <Combobox label={label} value={actual} onChange={v => set(key, v)} options={opts}
          placeholder="Seleccionar valor…" emptyText="Sin valores" />
      );
    }
    return (
      <Input label={label} value={actual} onChange={e => set(key, e.target.value)}
        hint={dimLoading ? 'Cargando valores de BC…' : 'BC sin conexión: código manual'} />
    );
  }

  // Estado: en una obra de BC es el estado del proyecto, así que solo se ofrecen
  // los que BC acepta. El bloqueo no es un estado de BC: va por el botón
  // «Bloquear / Desbloquear» del detalle (también avisa a postventa).
  function renderEstado() {
    const actual = String(form.estado ?? '');
    if (!obra?.esBC) {
      return <Input label="Estado" placeholder="Open / Blocked…" value={actual} onChange={e => set('estado', e.target.value)} />;
    }
    if (actual.toLowerCase() === 'blocked') {
      return <Input label="Estado" value="Bloqueada" disabled hint="Se desbloquea con el botón «Desbloquear» del detalle" />;
    }
    return (
      <Combobox label="Estado" value={actual} onChange={v => set('estado', v)}
        options={opcionesDim(ESTADOS_BC, actual)} placeholder="Seleccionar estado…" emptyText="Sin estados" />
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Editar obra ${obra?.numeroObra ?? ''}`}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button loading={saving} onClick={guardar}>Guardar cambios</Button>
        </>
      }
    >
      <div className="space-y-6">
        {obra?.esBC && (
          <div className="flex items-start gap-3 rounded-ds-lg border border-brand/40 bg-brand-soft px-4 py-3">
            <Icon name="boleta" size="sm" color="currentColor" />
            <div className="text-sm">
              <p className="font-semibold text-ds-ink">Esta obra está en Business Central.</p>
              <p className="text-ds-gray-500 mt-0.5">
                Al guardar, el nombre, la descripción, el estado, las fechas, el gerente, el encargado y el área
                prorrateada se actualizan también en BC. Si BC no acepta algún cambio, no se guarda nada y te dice por qué.
              </p>
            </div>
          </div>
        )}
        <Seccion titulo="General">
          <Input label="Número de obra" value={String(form.numeroObra ?? '')} disabled
            hint="Llave del registro (BC + avances) — no editable" />
          {renderEstado()}
          <div className="sm:col-span-2">
            <Input label="Nombre mostrado" value={String(form.nombreMostrado ?? '')} onChange={e => set('nombreMostrado', e.target.value)}
              maxLength={obra?.esBC ? 100 : undefined}
              hint={obra?.esBC ? 'En BC es la descripción de la obra, del proyecto, del CC y del almacén (máx. 100)' : undefined} />
          </div>
          <div className="sm:col-span-2">
            <Input label="Descripción" value={String(form.descripcion ?? '')} onChange={e => set('descripcion', e.target.value)}
              maxLength={obra?.esBC ? 50 : undefined}
              hint={obra?.esBC ? 'En BC es la «Descripción 2» de la obra y del proyecto (máx. 50)' : undefined} />
          </div>
        </Seccion>

        <Seccion titulo="Dimensiones y proyecto">
          <div className="sm:col-span-2">
            <Combobox
              label="Tipo de obra"
              value={String(form.tipoObra ?? '')}
              onChange={v => set('tipoObra', v)}
              placeholder={
                obra?.tipoObraEfectivo
                  ? `Deducido del área de costeo: ${tiposObra.find(t => t.codigo === obra.tipoObraEfectivo)?.nombre ?? obra.tipoObraEfectivo}`
                  : 'Deducido del área de costeo'
              }
              options={tiposObra.map(t => ({
                value: t.codigo, label: t.nombre,
                parts: [{ text: t.letra, weight: 'bold' as const }, { text: t.nombre, weight: 'light' as const }],
                search: `${t.letra} ${t.codigo} ${t.nombre}`,
              }))}
              emptyText="Sin tipos de obra en el catálogo"
            />
            <p className="text-xs text-ds-gray-400 mt-1.5">
              Define contra qué catálogo de partidas trabaja la obra. Vacío = se deduce del área de costeo.
            </p>
          </div>
          <div className="sm:col-span-2">
            <label className="flex items-center gap-2 text-sm text-ds-ink cursor-pointer">
              <input type="checkbox" checked={!!form.esAlmacenFisico} onChange={e => set('esAlmacenFisico', e.target.checked)} className="w-4 h-4 accent-brand" />
              Almacén físico (bodega)
            </label>
            <p className="text-xs text-ds-gray-400 mt-1.5">
              Es la misma marca de Business Central → Almacenes: si está marcada, el almacén de esta obra sale en «Bodegas» al
              hacer un pedido y en la tabla de Obras lleva la etiqueta «Almacén físico».
              {obra?.claseAlmacen == null && ' Hoy no está marcada a mano: cuenta por su código.'}
            </p>
          </div>
          {renderDim('areaCosteo', 'Área de costeo (AC)', dimAC)}
          {renderDim('centroCosto', 'Centro de costo (CC)', dimCC)}
          <Combobox label="Proyecto" value={String(form.idProyecto ?? '')} onChange={v => set('idProyecto', v)}
            placeholder="Seleccionar proyecto" options={proyectoOptions} />
          <Input label="Gerente de proyecto" value={String(form.gerenteProyecto ?? '')} onChange={e => set('gerenteProyecto', e.target.value)}
            hint={obra?.esBC ? 'En BC es el «Responsable» del proyecto: código de un recurso' : undefined} />
          <Input label="Encargado" value={String(form.idEncargado ?? '')} onChange={e => set('idEncargado', e.target.value)} />
          <div className="sm:col-span-2">
            <Input label="Ubicación" value={String(form.ubicacion ?? '')} onChange={e => set('ubicacion', e.target.value)} />
          </div>
        </Seccion>

        <Seccion titulo="Fechas y montos">
          <DatePicker label="Fecha inicio" value={String(form.fechaInicio ?? '')} onChange={v => set('fechaInicio', v)} />
          <DatePicker label="Fecha fin" value={String(form.fechaFin ?? '')} onChange={v => set('fechaFin', v)} />
          <Input label="Área prorrateada (m²)" type="number" value={String(form.areaProrrateadaM2 ?? '')} onChange={e => set('areaProrrateadaM2', e.target.value)} />
        </Seccion>

        <section className="space-y-3">
          <div className="border-b border-ds-gray-100 pb-2">
            <h3 className="font-bold text-ds-ink text-sm">Integraciones</h3>
          </div>
          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm text-ds-ink cursor-pointer">
              <input type="checkbox" checked={!!form.esBC} onChange={e => set('esBC', e.target.checked)} className="w-4 h-4 accent-brand" /> Business Central
            </label>
            <label className="flex items-center gap-2 text-sm text-ds-ink cursor-pointer">
              <input type="checkbox" checked={!!form.esProcore} onChange={e => set('esProcore', e.target.checked)} className="w-4 h-4 accent-brand" /> Procore
            </label>
          </div>
        </section>
      </div>
    </Modal>
  );
}
