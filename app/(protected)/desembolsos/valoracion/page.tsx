'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Table } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { DatePicker } from '@/components/ui/DatePicker';
import { useToast } from '@/components/ui/Toast';
import type { BancoConValoracion, RespuestaValoracion } from '@/lib/desembolsos/valoracion';

/**
 * Valoración de lote por banco × proyecto. Portado de ValoracionPantalla.tsx +
 * PanelValoracion.tsx (adelante-flujo-desembolsos). Se elige un proyecto; por
 * cada banco se ve la valoración vigente y se crea nueva versión o se edita la
 * vigente in-place.
 */

interface ProyectoOpcion { IDProyecto: number; AbreviaturaProyecto: string; Nombre: string }

export default function ValoracionPage() {
  const { toast } = useToast();
  const [proyectos, setProyectos] = useState<ProyectoOpcion[]>([]);
  const [idProyecto, setIdProyecto] = useState<number | null>(null);
  const [data, setData] = useState<RespuestaValoracion | null>(null);
  const [cargando, setCargando] = useState(false);
  const [editar, setEditar] = useState<{ banco: BancoConValoracion; modo: 'nueva' | 'vigente' } | null>(null);

  useEffect(() => {
    fetch('/api/desembolsos/reportes/proyectos')
      .then((r) => (r.ok ? r.json() : { proyectos: [] }))
      .then((d) => {
        const p: ProyectoOpcion[] = d.proyectos ?? [];
        setProyectos(p);
        setIdProyecto((prev) => prev ?? p[0]?.IDProyecto ?? null);
      })
      .catch(() => toast('No se pudieron cargar los proyectos.', 'error'));
  }, [toast]);

  function cargar(id: number) {
    setCargando(true);
    fetch(`/api/desembolsos/valoracion?idProyecto=${id}`)
      .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Error'); return r.json(); })
      .then((d) => setData(d as RespuestaValoracion))
      .catch((e) => toast(e instanceof Error ? e.message : 'Error al cargar valoración.', 'error'))
      .finally(() => setCargando(false));
  }
  useEffect(() => { if (idProyecto) cargar(idProyecto); }, [idProyecto]);

  const columns = [
    { key: 'banco', header: 'Banco', render: (b: BancoConValoracion) => <span className="font-medium">{b.AbrevBanco}</span> },
    {
      key: 'valor', header: 'Valor m² lote',
      render: (b: BancoConValoracion) => b.ValoracionVigente ? `${b.ValoracionVigente.Moneda} ${b.ValoracionVigente.ValorM2Lote.toLocaleString('es-CR')}` : <Badge variant="gray">Sin valoración</Badge>,
    },
    { key: 'pct', header: '% financiamiento', render: (b: BancoConValoracion) => b.ValoracionVigente ? `${b.ValoracionVigente.PorcentajeFinanciamiento}%` : '—' },
    { key: 'desde', header: 'Vigente desde', render: (b: BancoConValoracion) => b.ValoracionVigente?.VigenteDesde ?? '—' },
    {
      key: 'acc', header: '',
      render: (b: BancoConValoracion) => (
        <div className="flex gap-2 justify-end">
          {b.ValoracionVigente && <Button size="sm" variant="ghost" onClick={() => setEditar({ banco: b, modo: 'vigente' })}>Editar vigente</Button>}
          <Button size="sm" variant="secondary" onClick={() => setEditar({ banco: b, modo: 'nueva' })}>Nueva versión</Button>
        </div>
      ),
    },
  ];

  return (
    <main className="page mx-auto w-full max-w-5xl px-4 py-6">
      <div className="mb-4">
        <h1 className="text-3xl font-bold">Valoración de lote</h1>
        <p className="text-ds-gray-500">Valor por m² y % de financiamiento por banco, por proyecto.</p>
      </div>

      <div className="mb-4 max-w-md">
        <Select label="Proyecto" value={idProyecto ?? ''} onChange={(e) => setIdProyecto(Number(e.target.value) || null)}
          options={proyectos.map((p) => ({ value: p.IDProyecto, label: `${p.AbreviaturaProyecto} · ${p.Nombre}` }))}
          placeholder={proyectos.length ? 'Elegí un proyecto…' : 'Cargando…'} />
      </div>

      <Table columns={columns} data={data?.Bancos ?? []} keyField="IDBan" loading={cargando} emptyMessage="Sin bancos." />

      {editar && idProyecto && (
        <ValoracionModal
          idProyecto={idProyecto} banco={editar.banco} modo={editar.modo}
          onClose={() => setEditar(null)} onSaved={() => { setEditar(null); cargar(idProyecto); }} />
      )}
    </main>
  );
}

function ValoracionModal({ idProyecto, banco, modo, onClose, onSaved }: {
  idProyecto: number; banco: BancoConValoracion; modo: 'nueva' | 'vigente'; onClose: () => void; onSaved: () => void;
}) {
  const { toast } = useToast();
  const vig = banco.ValoracionVigente;
  const [valor, setValor] = useState(modo === 'vigente' && vig ? String(vig.ValorM2Lote) : '');
  const [moneda, setMoneda] = useState(vig?.Moneda ?? 'USD');
  const [pct, setPct] = useState(modo === 'vigente' && vig ? String(vig.PorcentajeFinanciamiento) : '');
  const [desde, setDesde] = useState('');
  const [notas, setNotas] = useState(modo === 'vigente' ? (vig?.Notas ?? '') : '');
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    const valorN = Number(valor); const pctN = Number(pct);
    if (!(valorN > 0)) return toast('Valor m² debe ser mayor a 0.', 'error');
    if (!(pctN > 0 && pctN <= 100)) return toast('% financiamiento entre 0 y 100.', 'error');
    if (modo === 'nueva' && !desde) return toast('Elegí la fecha "vigente desde".', 'error');
    setGuardando(true);
    try {
      let r: Response;
      if (modo === 'nueva') {
        r = await fetch('/api/desembolsos/valoracion', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ IDProyecto: idProyecto, IDBan: banco.IDBan, ValorM2Lote: valorN, Moneda: moneda, PorcentajeFinanciamiento: pctN, VigenteDesde: desde, Notas: notas.trim() || null }),
        });
      } else {
        r = await fetch(`/api/desembolsos/valoracion/${idProyecto}/${banco.IDBan}/vigente`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ValorM2Lote: valorN, Moneda: moneda, PorcentajeFinanciamiento: pctN, Notas: notas.trim() || null }),
        });
      }
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Error');
      toast('Valoración guardada.', 'success');
      onSaved();
    } catch (e) {
      toast(`No se pudo guardar: ${e instanceof Error ? e.message : e}`, 'error');
    } finally { setGuardando(false); }
  }

  return (
    <Modal open onClose={onClose} title={`${modo === 'nueva' ? 'Nueva valoración' : 'Editar vigente'} · ${banco.AbrevBanco}`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={guardar} loading={guardando}>Guardar</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Valor por m² de lote" type="number" min={0} value={valor} onChange={(e) => setValor(e.target.value)} />
          <Select label="Moneda" value={moneda} onChange={(e) => setMoneda(e.target.value)} options={[{ value: 'USD', label: 'USD' }, { value: 'CRC', label: 'CRC' }]} />
        </div>
        <Input label="% de financiamiento" type="number" min={0} max={100} value={pct} onChange={(e) => setPct(e.target.value)} />
        {modo === 'nueva' && <DatePicker label="Vigente desde" value={desde} onChange={setDesde} required />}
        <Input label="Notas (opcional)" value={notas} onChange={(e) => setNotas(e.target.value)} />
      </div>
    </Modal>
  );
}
