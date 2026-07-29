'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Table } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { DatePicker } from '@/components/ui/DatePicker';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/Confirm';
import { formatCRC } from '@/lib/utilidades/format';
import type { CasoExtra, ExtraEstado, ExtraTipo } from '@/lib/desembolsos/extras';

/**
 * Extras y descuentos por caso. Portado de ExtrasPantalla.tsx
 * (adelante-flujo-desembolsos). Lista global con filtros; crear (por IDCaso),
 * editar (solo COTIZADA), aprobar, rechazar y eliminar.
 */

interface ProyectoOpcion { IDProyecto: number; AbreviaturaProyecto: string; Nombre: string }

const ESTADO_VARIANT: Record<ExtraEstado, 'yellow' | 'green' | 'red'> = { COTIZADA: 'yellow', APROBADA: 'green', RECHAZADA: 'red' };

export default function ExtrasPage() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [proyectos, setProyectos] = useState<ProyectoOpcion[]>([]);
  const [extras, setExtras] = useState<CasoExtra[]>([]);
  const [cargando, setCargando] = useState(true);
  const [fEstado, setFEstado] = useState<'' | ExtraEstado>('');
  const [fTipo, setFTipo] = useState<'' | ExtraTipo>('');
  const [fProyecto, setFProyecto] = useState<number | ''>('');
  const [q, setQ] = useState('');
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<CasoExtra | null>(null);
  const [aprobando, setAprobando] = useState<CasoExtra | null>(null);

  useEffect(() => {
    fetch('/api/desembolsos/reportes/proyectos').then((r) => (r.ok ? r.json() : { proyectos: [] })).then((d) => setProyectos(d.proyectos ?? [])).catch(() => {});
  }, []);

  function cargar() {
    setCargando(true);
    const sp = new URLSearchParams();
    if (fEstado) sp.set('estado', fEstado);
    if (fTipo) sp.set('tipo', fTipo);
    if (fProyecto) sp.set('idProyecto', String(fProyecto));
    if (q.trim()) sp.set('q', q.trim());
    fetch(`/api/desembolsos/extras?${sp.toString()}`)
      .then((r) => (r.ok ? r.json() : { extras: [] }))
      .then((d) => setExtras(d.extras ?? []))
      .catch(() => toast('No se pudieron cargar las extras.', 'error'))
      .finally(() => setCargando(false));
  }
  useEffect(() => { const t = setTimeout(cargar, 250); return () => clearTimeout(t); }, [fEstado, fTipo, fProyecto, q]);

  const totalAprobadas = useMemo(
    () => extras.filter((e) => e.Estado === 'APROBADA').reduce((a, e) => a + (e.Tipo === 'EXTRA' ? e.MontoAjuste_CRC : -e.MontoAjuste_CRC), 0),
    [extras],
  );

  async function rechazar(e: CasoExtra) {
    if (!(await confirm({ message: `¿Rechazar la extra "${e.Descripcion}"?`, danger: true, confirmLabel: 'Rechazar' }))) return;
    try {
      const r = await fetch(`/api/desembolsos/extras/${e.IDExtra}/rechazar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Error');
      toast('Extra rechazada.', 'success'); cargar();
    } catch (err) { toast(`No se pudo rechazar: ${err instanceof Error ? err.message : err}`, 'error'); }
  }
  async function eliminar(e: CasoExtra) {
    if (!(await confirm({ message: `¿Eliminar la extra "${e.Descripcion}"?`, danger: true, confirmLabel: 'Eliminar' }))) return;
    try {
      const r = await fetch(`/api/desembolsos/extras/${e.IDExtra}`, { method: 'DELETE' });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Error');
      toast('Extra eliminada.', 'success'); cargar();
    } catch (err) { toast(`No se pudo eliminar: ${err instanceof Error ? err.message : err}`, 'error'); }
  }

  const columns = [
    { key: 'caso', header: 'Caso / Lote', render: (e: CasoExtra) => <span>{e.AbreviaturaProyecto} {e.CodigoLote}<br /><span className="text-xs text-ds-gray-400">{e.Cliente}</span></span> },
    { key: 'tipo', header: 'Tipo', render: (e: CasoExtra) => <Badge variant={e.Tipo === 'EXTRA' ? 'blue' : 'gray'}>{e.Tipo}</Badge> },
    { key: 'desc', header: 'Descripción', render: (e: CasoExtra) => e.Descripcion },
    { key: 'monto', header: 'Monto', render: (e: CasoExtra) => formatCRC(e.MontoAjuste_CRC) },
    { key: 'estado', header: 'Estado', render: (e: CasoExtra) => <Badge variant={ESTADO_VARIANT[e.Estado]}>{e.Estado}</Badge> },
    {
      key: 'acc', header: '', render: (e: CasoExtra) => (
        <div className="flex gap-1.5 justify-end">
          {e.Estado === 'COTIZADA' && <>
            <Button size="sm" variant="secondary" onClick={() => setEditando(e)}>Editar</Button>
            <Button size="sm" variant="primary" onClick={() => setAprobando(e)}>Aprobar</Button>
          </>}
          {e.Estado !== 'RECHAZADA' && <Button size="sm" variant="ghost" onClick={() => rechazar(e)}>Rechazar</Button>}
          {e.Estado !== 'APROBADA' && <Button size="sm" variant="ghost" onClick={() => eliminar(e)}>Eliminar</Button>}
        </div>
      ),
    },
  ];

  return (
    <main className="page mx-auto w-full max-w-6xl px-4 py-6">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">Extras y descuentos</h1>
          <p className="text-ds-gray-500">Ajustes al precio de venta por caso. Neto aprobado: {formatCRC(totalAprobadas)}</p>
        </div>
        <Button onClick={() => setCreando(true)}>Nueva extra</Button>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-56"><Input label="Buscar" placeholder="Descripción, cliente…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select label="Estado" value={fEstado} onChange={(e) => setFEstado(e.target.value as ExtraEstado | '')}
          options={[{ value: 'COTIZADA', label: 'Cotizada' }, { value: 'APROBADA', label: 'Aprobada' }, { value: 'RECHAZADA', label: 'Rechazada' }]} placeholder="Todos" />
        <Select label="Tipo" value={fTipo} onChange={(e) => setFTipo(e.target.value as ExtraTipo | '')}
          options={[{ value: 'EXTRA', label: 'Extra' }, { value: 'DESCUENTO', label: 'Descuento' }]} placeholder="Todos" />
        <Select label="Proyecto" value={fProyecto} onChange={(e) => setFProyecto(Number(e.target.value) || '')}
          options={proyectos.map((p) => ({ value: p.IDProyecto, label: p.AbreviaturaProyecto }))} placeholder="Todos" />
      </div>

      <Table columns={columns} data={extras} keyField="IDExtra" loading={cargando} emptyMessage="Sin extras." />

      {creando && <CrearExtraModal onClose={() => setCreando(false)} onSaved={() => { setCreando(false); cargar(); }} />}
      {editando && <EditarExtraModal extra={editando} onClose={() => setEditando(null)} onSaved={() => { setEditando(null); cargar(); }} />}
      {aprobando && <AprobarExtraModal extra={aprobando} onClose={() => setAprobando(null)} onSaved={() => { setAprobando(null); cargar(); }} />}
    </main>
  );
}

function CrearExtraModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [idCaso, setIdCaso] = useState('');
  const [tipo, setTipo] = useState<ExtraTipo>('EXTRA');
  const [desc, setDesc] = useState('');
  const [monto, setMonto] = useState('');
  const [fecha, setFecha] = useState('');
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    const caso = Number(idCaso);
    if (!(caso > 0)) return toast('IDCaso inválido.', 'error');
    if (!desc.trim()) return toast('Descripción obligatoria.', 'error');
    if (!(Number(monto) > 0)) return toast('Monto debe ser mayor a 0.', 'error');
    if (!fecha) return toast('Elegí la fecha de cotización.', 'error');
    setGuardando(true);
    try {
      const r = await fetch(`/api/desembolsos/extras/caso/${caso}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Tipo: tipo, Descripcion: desc.trim(), MontoAjuste_CRC: Number(monto), FechaCotizacion: fecha, Notas: notas.trim() || null }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Error');
      toast('Extra creada.', 'success'); onSaved();
    } catch (e) { toast(`No se pudo crear: ${e instanceof Error ? e.message : e}`, 'error'); } finally { setGuardando(false); }
  }

  return (
    <Modal open onClose={onClose} title="Nueva extra / descuento"
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={guardar} loading={guardando}>Crear</Button></>}>
      <div className="space-y-4">
        <Input label="ID del caso" type="number" min={1} value={idCaso} onChange={(e) => setIdCaso(e.target.value)} hint="ID interno del caso (Casos.IDCaso)" />
        <Select label="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value as ExtraTipo)} options={[{ value: 'EXTRA', label: 'Extra (suma)' }, { value: 'DESCUENTO', label: 'Descuento (resta)' }]} />
        <Input label="Descripción" value={desc} onChange={(e) => setDesc(e.target.value)} />
        <Input label="Monto (₡)" type="number" min={0} value={monto} onChange={(e) => setMonto(e.target.value)} hint={monto ? formatCRC(Number(monto)) : undefined} />
        <DatePicker label="Fecha de cotización" value={fecha} onChange={setFecha} required />
        <Input label="Notas (opcional)" value={notas} onChange={(e) => setNotas(e.target.value)} />
      </div>
    </Modal>
  );
}

function EditarExtraModal({ extra, onClose, onSaved }: { extra: CasoExtra; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [desc, setDesc] = useState(extra.Descripcion);
  const [monto, setMonto] = useState(String(extra.MontoAjuste_CRC));
  const [fecha, setFecha] = useState(extra.FechaCotizacion);
  const [notas, setNotas] = useState(extra.Notas ?? '');
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    if (!(Number(monto) > 0)) return toast('Monto debe ser mayor a 0.', 'error');
    setGuardando(true);
    try {
      const r = await fetch(`/api/desembolsos/extras/${extra.IDExtra}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Descripcion: desc.trim(), MontoAjuste_CRC: Number(monto), FechaCotizacion: fecha, Notas: notas.trim() || null }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Error');
      toast('Extra actualizada.', 'success'); onSaved();
    } catch (e) { toast(`No se pudo actualizar: ${e instanceof Error ? e.message : e}`, 'error'); } finally { setGuardando(false); }
  }

  return (
    <Modal open onClose={onClose} title="Editar extra"
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={guardar} loading={guardando}>Guardar</Button></>}>
      <div className="space-y-4">
        <Input label="Descripción" value={desc} onChange={(e) => setDesc(e.target.value)} />
        <Input label="Monto (₡)" type="number" min={0} value={monto} onChange={(e) => setMonto(e.target.value)} hint={monto ? formatCRC(Number(monto)) : undefined} />
        <DatePicker label="Fecha de cotización" value={fecha} onChange={setFecha} />
        <Input label="Notas (opcional)" value={notas} onChange={(e) => setNotas(e.target.value)} />
      </div>
    </Modal>
  );
}

function AprobarExtraModal({ extra, onClose, onSaved }: { extra: CasoExtra; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [fecha, setFecha] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    if (!fecha) return toast('Elegí la fecha de aprobación.', 'error');
    setGuardando(true);
    try {
      const r = await fetch(`/api/desembolsos/extras/${extra.IDExtra}/aprobar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ FechaAprobacion: fecha }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Error');
      toast('Extra aprobada.', 'success'); onSaved();
    } catch (e) { toast(`No se pudo aprobar: ${e instanceof Error ? e.message : e}`, 'error'); } finally { setGuardando(false); }
  }

  return (
    <Modal open onClose={onClose} title={`Aprobar · ${extra.Descripcion}`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={guardar} loading={guardando}>Aprobar</Button></>}>
      <div className="space-y-4">
        <p className="text-sm text-ds-gray-500">{extra.Tipo} · {formatCRC(extra.MontoAjuste_CRC)}. Al aprobar se recalcula el precio de venta actual del caso.</p>
        <DatePicker label="Fecha de aprobación" value={fecha} onChange={setFecha} required />
      </div>
    </Modal>
  );
}
