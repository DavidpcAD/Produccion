'use client';
import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Combobox } from '@/components/ui/Combobox';
import { DatePicker } from '@/components/ui/DatePicker';
import { useToast } from '@/components/ui/Toast';

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
        <h3 className="font-bold text-black text-sm">{titulo}</h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
    </section>
  );
}

/** Editor único de obra: modal compartido por la lista (/obras) y el detalle
 *  (/obras/[id]) para que ambos usen exactamente el mismo formulario. */
export function ObraEditModal({ open, onClose, obra, proyectos, onSaved }: ObraEditModalProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string | boolean>>({});
  const set = (k: string, v: string | boolean) => setForm(p => ({ ...p, [k]: v }));

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
    });
  }, [open, obra]);

  async function handleGuardar() {
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
      toast('Obra actualizada', 'success');
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

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Editar obra ${obra?.numeroObra ?? ''}`}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button loading={saving} onClick={handleGuardar}>Guardar cambios</Button>
        </>
      }
    >
      <div className="space-y-6">
        <Seccion titulo="General">
          <Input label="Número de obra" value={String(form.numeroObra ?? '')} onChange={e => set('numeroObra', e.target.value)} required />
          <Input label="Estado" placeholder="Open / Blocked…" value={String(form.estado ?? '')} onChange={e => set('estado', e.target.value)} />
          <div className="sm:col-span-2">
            <Input label="Nombre mostrado" value={String(form.nombreMostrado ?? '')} onChange={e => set('nombreMostrado', e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Input label="Descripción" value={String(form.descripcion ?? '')} onChange={e => set('descripcion', e.target.value)} />
          </div>
        </Seccion>

        <Seccion titulo="Dimensiones y proyecto">
          <Input label="Área de costeo (AC)" value={String(form.areaCosteo ?? '')} onChange={e => set('areaCosteo', e.target.value)} />
          <Input label="Centro de costo (CC)" value={String(form.centroCosto ?? '')} onChange={e => set('centroCosto', e.target.value)} />
          <Combobox label="Proyecto" value={String(form.idProyecto ?? '')} onChange={v => set('idProyecto', v)}
            placeholder="Seleccionar proyecto" options={proyectoOptions} />
          <Input label="Origen principal" value={String(form.origenPrincipal ?? '')} onChange={e => set('origenPrincipal', e.target.value)} />
          <Input label="Gerente de proyecto" value={String(form.gerenteProyecto ?? '')} onChange={e => set('gerenteProyecto', e.target.value)} />
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
            <h3 className="font-bold text-black text-sm">Integraciones</h3>
          </div>
          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm text-black cursor-pointer">
              <input type="checkbox" checked={!!form.esBC} onChange={e => set('esBC', e.target.checked)} className="w-4 h-4 accent-brand" /> Business Central
            </label>
            <label className="flex items-center gap-2 text-sm text-black cursor-pointer">
              <input type="checkbox" checked={!!form.esProcore} onChange={e => set('esProcore', e.target.checked)} className="w-4 h-4 accent-brand" /> Procore
            </label>
          </div>
        </section>
      </div>
    </Modal>
  );
}
