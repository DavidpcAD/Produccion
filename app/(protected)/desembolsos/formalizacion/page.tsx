'use client';

import { useEffect, useMemo, useState } from 'react';
import { PageShell, PageHeader } from '@/components/layout/Page';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Table } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { DatePicker } from '@/components/ui/DatePicker';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/Confirm';
import { formatCRC } from '@/lib/utilidades/format';
import type { CasoParaFormalizar, NivelConfianza } from '@/lib/desembolsos/formalizacion';
import { coincideBusqueda } from '@/lib/utilidades/buscar';

/**
 * Formalización — proyección de fecha de firma para casos reservados.
 * Portado de FormalizacionPantalla.tsx (adelante-flujo-desembolsos). Lista los
 * casos reservados; se proyecta/edita fecha + nivel de confianza, o se devuelve
 * a "sin proyectar".
 */

const NIVEL_LABEL: Record<NivelConfianza, string> = { A: 'Alta', M: 'Media', B: 'Baja' };
const NIVEL_VARIANT: Record<NivelConfianza, 'green' | 'yellow' | 'red'> = { A: 'green', M: 'yellow', B: 'red' };

export default function FormalizacionPage() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [casos, setCasos] = useState<CasoParaFormalizar[]>([]);
  const [cargando, setCargando] = useState(true);
  const [q, setQ] = useState('');
  const [soloSinProyectar, setSoloSinProyectar] = useState(false);
  const [editando, setEditando] = useState<CasoParaFormalizar | null>(null);

  function cargar() {
    setCargando(true);
    fetch('/api/desembolsos/formalizacion')
      .then((r) => (r.ok ? r.json() : { casos: [] }))
      .then((d) => setCasos(d.casos ?? []))
      .catch(() => toast('No se pudieron cargar los casos.', 'error'))
      .finally(() => setCargando(false));
  }
  useEffect(cargar, [toast]);

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    return casos.filter((c) => {
      if (soloSinProyectar && c.IDProyeccion != null) return false;
      if (!t) return true;
      return coincideBusqueda([c.Cliente, c.CodigoLote, c.CodigoCaso, c.AbreviaturaProyecto, c.AbrevBanco].map((v) => v ?? '').join(' '), t);
    });
  }, [casos, q, soloSinProyectar]);

  async function quitar(c: CasoParaFormalizar) {
    if (!(await confirm({ message: `¿Devolver el lote ${c.CodigoLote} a "sin proyectar"?`, danger: true, confirmLabel: 'Quitar proyección' }))) return;
    try {
      const r = await fetch(`/api/desembolsos/formalizacion/${c.IDCaso}`, { method: 'DELETE' });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Error');
      toast('Proyección quitada.', 'success');
      cargar();
    } catch (e) {
      toast(`No se pudo quitar: ${e instanceof Error ? e.message : e}`, 'error');
    }
  }

  const columns = [
    { key: 'proy', header: 'Proyecto', render: (c: CasoParaFormalizar) => c.AbreviaturaProyecto },
    { key: 'lote', header: 'Lote', render: (c: CasoParaFormalizar) => c.CodigoLote },
    { key: 'cliente', header: 'Cliente', render: (c: CasoParaFormalizar) => c.Cliente },
    { key: 'banco', header: 'Banco', render: (c: CasoParaFormalizar) => c.AbrevBanco ?? '—' },
    { key: 'precio', header: 'Precio venta', render: (c: CasoParaFormalizar) => formatCRC(c.PrecioVenta ?? 0) },
    {
      key: 'fecha', header: 'Fecha proyectada',
      render: (c: CasoParaFormalizar) => c.FechaProyectada
        ? <span>{c.FechaProyectada}{' '}{c.NivelConfianza && <Badge variant={NIVEL_VARIANT[c.NivelConfianza]}>{NIVEL_LABEL[c.NivelConfianza]}</Badge>}</span>
        : <Badge variant="gray">Sin proyectar</Badge>,
    },
    {
      key: 'acc', header: '', render: (c: CasoParaFormalizar) => (
        <div className="flex gap-2 justify-end">
          <Button size="sm" variant="secondary" onClick={() => setEditando(c)}>{c.IDProyeccion ? 'Editar' : 'Proyectar'}</Button>
          {c.IDProyeccion != null && <Button size="sm" variant="ghost" onClick={() => quitar(c)}>Quitar</Button>}
        </div>
      ),
    },
  ];

  return (
    <PageShell>
      <PageHeader
        title="Formalización"
        subtitle="Proyección de fecha de firma para casos reservados."
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-72"><Input label="Buscar" placeholder="Cliente, lote, caso…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <label className="flex items-center gap-2 text-sm mb-3">
          <input type="checkbox" checked={soloSinProyectar} onChange={(e) => setSoloSinProyectar(e.target.checked)} />
          Solo sin proyectar
        </label>
        <span className="text-sm text-ds-gray-400 mb-3">{filtrados.length} caso(s)</span>
      </div>

      <Table columns={columns} data={filtrados} keyField="IDCaso" loading={cargando} emptyMessage="Sin casos reservados." />

      {editando && (
        <ProyeccionModal
          caso={editando}
          onClose={() => setEditando(null)}
          onSaved={() => { setEditando(null); cargar(); }}
        />
      )}
    </PageShell>
  );
}

function ProyeccionModal({ caso, onClose, onSaved }: { caso: CasoParaFormalizar; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [fecha, setFecha] = useState(caso.FechaProyectada ?? '');
  const [nivel, setNivel] = useState<NivelConfianza>(caso.NivelConfianza ?? 'M');
  const [notas, setNotas] = useState(caso.Notas ?? '');
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    if (!fecha) return toast('Elegí una fecha proyectada.', 'error');
    setGuardando(true);
    try {
      const r = await fetch('/api/desembolsos/formalizacion', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ IDCaso: caso.IDCaso, FechaProyectada: fecha, NivelConfianza: nivel, Notas: notas.trim() || null }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Error');
      toast('Proyección guardada.', 'success');
      onSaved();
    } catch (e) {
      toast(`No se pudo guardar: ${e instanceof Error ? e.message : e}`, 'error');
    } finally { setGuardando(false); }
  }

  return (
    <Modal open onClose={onClose} title={`Proyectar · ${caso.AbreviaturaProyecto} ${caso.CodigoLote}`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={guardar} loading={guardando}>Guardar</Button></>}>
      <div className="space-y-4">
        <p className="text-sm text-ds-gray-500">{caso.Cliente} · {caso.NombreBanco ?? 'Sin banco'}</p>
        <DatePicker label="Fecha proyectada de firma" value={fecha} onChange={setFecha} required />
        <Select label="Nivel de confianza" value={nivel} onChange={(e) => setNivel(e.target.value as NivelConfianza)}
          options={[{ value: 'A', label: 'Alta' }, { value: 'M', label: 'Media' }, { value: 'B', label: 'Baja' }]} />
        <Input label="Notas (opcional)" value={notas} onChange={(e) => setNotas(e.target.value)} />
      </div>
    </Modal>
  );
}
