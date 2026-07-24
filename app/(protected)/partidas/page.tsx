'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Combobox } from '@/components/ui/Combobox';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/Confirm';
import { useSession } from '@/hooks/useSession';
import { Icon } from '@/components/ds/Icon/Icon';
import { Skeleton } from '@/components/ui/Skeleton';

interface Etapa { idEtapa: number; codigo: string; nombre: string }
interface Partida { idPartida: number; codigo: string; nombre: string; idEtapa: number | null }
interface SubPartida {
  idSubPartida: number; codigo: string; nombre: string; idPartida: number;
  numSprint: number; esCritica: boolean; descripcion: string | null;
}

const EMPTY_SUB = { idEtapa: '', idPartida: '', codigo: '', nombre: '', numSprint: '1', esCritica: false, descripcion: '' };
const EMPTY_PART = { idEtapa: '', codigo: '', nombre: '' };

export default function PartidasPage() {
  const session = useSession();
  const { toast } = useToast();
  const confirm = useConfirm();
  const isSuperAdmin = !!session && session.nivelAdmin >= 4;
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [partidas, setPartidas] = useState<Partida[]>([]);
  const [subpartidas, setSubpartidas] = useState<SubPartida[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState('');
  const [selPartida, setSelPartida] = useState<number | null>(null);
  const puede = mounted && isSuperAdmin;

  // Modal subpartida (crear/editar)
  const [subOpen, setSubOpen] = useState(false);
  const [subEditId, setSubEditId] = useState<number | null>(null);
  const [subForm, setSubForm] = useState({ ...EMPTY_SUB });
  const setSub = (k: keyof typeof subForm, v: string | boolean) => setSubForm(p => ({ ...p, [k]: v }));

  // Modal partida (crear/editar)
  const [partOpen, setPartOpen] = useState(false);
  const [partEditId, setPartEditId] = useState<number | null>(null);
  const [partForm, setPartForm] = useState({ ...EMPTY_PART });
  const setPart = (k: keyof typeof partForm, v: string) => setPartForm(p => ({ ...p, [k]: v }));

  const load = useCallback(async () => {
    setLoading(true);
    const d = await fetch('/api/partidas').then(r => (r.ok ? r.json() : null)).catch(() => null);
    if (d) {
      setEtapas(d.etapas ?? []);
      setPartidas(d.partidas ?? []);
      setSubpartidas(d.subpartidas ?? []);
    }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const partidasDeEtapa = useMemo(
    () => (subForm.idEtapa ? partidas.filter(p => String(p.idEtapa) === subForm.idEtapa) : []),
    [partidas, subForm.idEtapa],
  );

  // ---- Subpartida ----
  function abrirNuevaSub(idPartida?: number) {
    const p = idPartida ? partidas.find(x => x.idPartida === idPartida) : undefined;
    // Código sugerido = código de la partida + el siguiente correlativo según la última
    // subpartida existente (ej. 1.1 con hasta 1.1.5 → sugiere 1.1.6). Queda editable.
    let codigo = '';
    if (p) {
      const nums = subpartidas
        .filter(s => s.idPartida === p.idPartida)
        .map(s => { const m = s.codigo.match(/\.(\d+)\s*$/); return m ? parseInt(m[1], 10) : NaN; })
        .filter(n => !Number.isNaN(n));
      codigo = `${p.codigo}.${(nums.length ? Math.max(...nums) : 0) + 1}`;
    }
    setSubEditId(null);
    setSubForm({ ...EMPTY_SUB, idEtapa: p?.idEtapa != null ? String(p.idEtapa) : '', idPartida: idPartida ? String(idPartida) : '', codigo });
    setSubOpen(true);
  }
  function abrirEditarSub(s: SubPartida) {
    const p = partidas.find(x => x.idPartida === s.idPartida);
    setSubEditId(s.idSubPartida);
    setSubForm({
      idEtapa: p?.idEtapa != null ? String(p.idEtapa) : '', idPartida: String(s.idPartida),
      codigo: s.codigo, nombre: s.nombre, numSprint: String(s.numSprint),
      esCritica: s.esCritica, descripcion: s.descripcion ?? '',
    });
    setSubOpen(true);
  }
  async function guardarSub() {
    if (!subForm.idPartida) { toast('Elegí la partida', 'warning'); return; }
    if (!subForm.codigo.trim()) { toast('El código es requerido', 'warning'); return; }
    if (!subForm.nombre.trim()) { toast('El nombre es requerido', 'warning'); return; }
    setSaving(true);
    try {
      const editing = subEditId != null;
      const res = await fetch(editing ? `/api/subpartidas/${subEditId}` : '/api/subpartidas', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idPartida: Number(subForm.idPartida),
          codigo: subForm.codigo.trim(), nombre: subForm.nombre.trim(),
          numSprint: Number(subForm.numSprint) || 1, esCritica: subForm.esCritica,
          descripcion: subForm.descripcion.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast(data.error || 'No se pudo guardar la subpartida', 'error'); return; }
      toast(editing ? 'Subpartida actualizada' : 'Subpartida creada', 'success');
      setSubOpen(false);
      await load();
    } finally { setSaving(false); }
  }
  async function borrarSub(s: SubPartida) {
    const ok = await confirm({ title: 'Eliminar subpartida', message: `¿Eliminar la subpartida "${s.codigo} — ${s.nombre}"?`, confirmLabel: 'Eliminar', danger: true });
    if (!ok) return;
    const res = await fetch(`/api/subpartidas/${s.idSubPartida}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast(data.error || 'No se pudo eliminar', 'error'); return; }
    toast('Subpartida eliminada', 'success');
    setSubOpen(false);
    await load();
  }

  // ---- Partida ----
  function abrirNuevaPart(idEtapa?: number) {
    setPartEditId(null);
    setPartForm({ ...EMPTY_PART, idEtapa: idEtapa != null ? String(idEtapa) : '' });
    setPartOpen(true);
  }
  function abrirEditarPart(p: Partida) {
    setPartEditId(p.idPartida);
    setPartForm({ idEtapa: p.idEtapa != null ? String(p.idEtapa) : '', codigo: p.codigo, nombre: p.nombre });
    setPartOpen(true);
  }
  async function guardarPart() {
    if (!partForm.idEtapa) { toast('Elegí la etapa', 'warning'); return; }
    if (!partForm.codigo.trim()) { toast('El código es requerido', 'warning'); return; }
    if (!partForm.nombre.trim()) { toast('El nombre es requerido', 'warning'); return; }
    setSaving(true);
    try {
      const editing = partEditId != null;
      const res = await fetch(editing ? `/api/partidas/${partEditId}` : '/api/partidas', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idEtapa: Number(partForm.idEtapa), codigo: partForm.codigo.trim(), nombre: partForm.nombre.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast(data.error || 'No se pudo guardar la partida', 'error'); return; }
      toast(editing ? 'Partida actualizada' : 'Partida creada', 'success');
      setPartOpen(false);
      // Al crear, dejar seleccionada la nueva partida para agregarle subpartidas ahí mismo.
      if (!editing && data?.idPartida) setSelPartida(Number(data.idPartida));
      await load();
    } finally { setSaving(false); }
  }
  async function borrarPart(p: Partida) {
    const ok = await confirm({ title: 'Eliminar partida', message: `¿Eliminar la partida "${p.codigo} — ${p.nombre}"? (debe estar sin subpartidas)`, confirmLabel: 'Eliminar', danger: true });
    if (!ok) return;
    const res = await fetch(`/api/partidas/${p.idPartida}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast(data.error || 'No se pudo eliminar', 'error'); return; }
    toast('Partida eliminada', 'success');
    setPartOpen(false);
    await load();
  }

  const grupos = useMemo(() => {
    const term = q.trim().toLowerCase();
    const match = (...vals: (string | null | undefined)[]) => !term || vals.some(v => (v ?? '').toLowerCase().includes(term));
    const byPartida = new Map<number, SubPartida[]>();
    for (const s of subpartidas) {
      if (!byPartida.has(s.idPartida)) byPartida.set(s.idPartida, []);
      byPartida.get(s.idPartida)!.push(s);
    }
    return etapas.map(e => ({
      etapa: e,
      partidas: partidas
        .filter(p => p.idEtapa === e.idEtapa)
        .map(p => {
          const subs = byPartida.get(p.idPartida) ?? [];
          const partidaMatches = match(p.codigo, p.nombre);
          // Si la partida coincide, muestro todas sus subs; si no, solo las subs que coinciden.
          const subsFiltradas = partidaMatches ? subs : subs.filter(s => match(s.codigo, s.nombre));
          return { partida: p, subs: subsFiltradas, visible: partidaMatches || subsFiltradas.length > 0 };
        })
        .filter(p => p.visible),
    })).filter(g => g.partidas.length > 0 || !term);
  }, [etapas, partidas, subpartidas, q]);

  // Subpartidas agrupadas por partida (para conteos y para el detalle).
  const subsByPartida = useMemo(() => {
    const m = new Map<number, SubPartida[]>();
    for (const s of subpartidas) { if (!m.has(s.idPartida)) m.set(s.idPartida, []); m.get(s.idPartida)!.push(s); }
    return m;
  }, [subpartidas]);

  const sel = selPartida != null ? partidas.find(p => p.idPartida === selPartida) ?? null : null;
  const selEtapa = sel ? etapas.find(e => e.idEtapa === sel.idEtapa) ?? null : null;
  const selSubs = useMemo(() => {
    if (selPartida == null) return [];
    return [...(subsByPartida.get(selPartida) ?? [])].sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }));
  }, [selPartida, subsByPartida]);

  // Mantener una partida seleccionada: si no hay o la actual ya no existe, tomar la primera.
  useEffect(() => {
    if (loading) return;
    if (selPartida != null && partidas.some(p => p.idPartida === selPartida)) return;
    setSelPartida(partidas[0]?.idPartida ?? null);
  }, [loading, partidas, selPartida]);

  if (mounted && session && !isSuperAdmin) {
    return (
      <div className="p-6 max-w-[1600px] mx-auto animate-fade-in">
        <div className="bg-white rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-14 text-center text-ds-gray-400">
          No tenés acceso a esta sección.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5 max-w-[1600px] mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-heading font-bold text-black">Partidas y subpartidas</h1>
          <p className="text-ds-gray-400 text-body-sm">
            {subpartidas.length} subpartidas en {partidas.length} partidas
          </p>
        </div>
        {puede && (
          <Button variant="outline" onClick={() => abrirNuevaPart()} icon={<Icon name="plus" size="sm" color="currentColor" />}>Nueva partida</Button>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(280px,360px)_1fr] gap-5">
          <div className="space-y-3">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
          <Skeleton className="h-80 w-full" rounded="rounded-ds-lg" />
        </div>
      ) : partidas.length === 0 ? (
        <div className="bg-white rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-10 text-center text-ds-gray-400">
          No hay partidas todavía.{puede && ' Creá la primera con “Nueva partida”.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(280px,360px)_1fr] gap-5 items-start">
          {/* IZQUIERDA — lista de todas las partidas (seleccionable) */}
          <div className="space-y-3">
            <Input placeholder="Buscar partida o subpartida…" value={q} onChange={e => setQ(e.target.value)} />
            <div className="bg-white rounded-ds-lg border border-ds-gray-200 shadow-ds-01 overflow-hidden">
              {grupos.length === 0 ? (
                <div className="p-6 text-center text-ds-gray-400 text-sm">Ningún resultado para “{q}”.</div>
              ) : (
                <div className="max-h-[72vh] overflow-y-auto no-scrollbar">
                  {grupos.map(({ etapa, partidas: parts }) => (
                    <div key={etapa.idEtapa}>
                      <div className="flex items-center gap-2 px-3 py-2 bg-ds-gray-100 border-y border-ds-gray-200 sticky top-0 z-10">
                        <span className="inline-flex items-center justify-center h-5 min-w-5 px-1 rounded-ds bg-black text-white text-[11px] font-bold font-mono">{etapa.codigo}</span>
                        <span className="font-bold text-black text-xs uppercase tracking-wide truncate flex-1">{etapa.nombre}</span>
                        {puede && (
                          <button onClick={() => abrirNuevaPart(etapa.idEtapa)} className="text-ds-gray-400 hover:text-brand shrink-0" title="Nueva partida en esta etapa">
                            <Icon name="plus" size="sm" color="currentColor" />
                          </button>
                        )}
                      </div>
                      {parts.map(({ partida }) => {
                        const total = subsByPartida.get(partida.idPartida)?.length ?? 0;
                        const active = selPartida === partida.idPartida;
                        return (
                          <button key={partida.idPartida} onClick={() => setSelPartida(partida.idPartida)}
                            className={'w-full text-left px-3 py-2.5 flex items-center gap-2 border-l-2 transition ' + (active ? 'bg-brand-soft border-brand' : 'border-transparent hover:bg-ds-gray-100')}>
                            <span className="font-mono text-xs font-semibold text-ds-gray-500 shrink-0">{partida.codigo}</span>
                            <span className="text-sm text-black truncate flex-1">{partida.nombre}</span>
                            <span className="text-xs text-ds-gray-400 shrink-0">{total}</span>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* DERECHA — detalle de la partida seleccionada */}
          <div className="bg-white rounded-ds-lg border border-ds-gray-200 shadow-ds-01 overflow-hidden min-h-[300px]">
            {!sel ? (
              <div className="p-12 text-center text-ds-gray-400 text-sm">Seleccioná una partida de la izquierda para ver y agregar sus subpartidas.</div>
            ) : (
              <>
                <div className="px-5 py-4 border-b border-ds-gray-200 flex items-center gap-3 flex-wrap">
                  {selEtapa && <span className="inline-flex items-center justify-center h-5 min-w-5 px-1 rounded-ds bg-black text-white text-[11px] font-bold font-mono shrink-0">{selEtapa.codigo}</span>}
                  <span className="font-mono text-sm font-semibold text-ds-gray-500 shrink-0">{sel.codigo}</span>
                  <h2 className="font-bold text-black truncate flex-1 min-w-0">{sel.nombre}</h2>
                  <span className="text-xs text-ds-gray-400 shrink-0">{selSubs.length} subpartidas</span>
                  {puede && (
                    <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                      <Button size="sm" variant="outline" onClick={() => abrirEditarPart(sel)} icon={<Icon name="edit" size="sm" color="currentColor" />}>Editar</Button>
                      <Button size="sm" onClick={() => abrirNuevaSub(sel.idPartida)} icon={<Icon name="plus" size="sm" color="currentColor" />}>Agregar subpartida</Button>
                    </div>
                  )}
                </div>
                {selSubs.length === 0 ? (
                  <div className="p-12 text-center text-ds-gray-300 text-sm">
                    Esta partida no tiene subpartidas.{puede && ' Agregá la primera con el botón de arriba.'}
                  </div>
                ) : (
                  <ul className="divide-y divide-ds-gray-100 max-h-[62vh] overflow-y-auto no-scrollbar">
                    {selSubs.map(s => (
                      <li key={s.idSubPartida} className="px-5 py-3 flex items-center gap-3 group">
                        <span className="font-mono text-xs font-semibold text-ds-gray-500 shrink-0">{s.codigo}</span>
                        <span className="text-sm text-black truncate flex-1">{s.nombre}</span>
                        {s.esCritica && <Badge variant="red">Crítica</Badge>}
                        <span className="text-xs text-ds-gray-400 shrink-0">S{s.numSprint}</span>
                        {puede && (
                          <button onClick={() => abrirEditarSub(s)} className="text-ds-gray-300 hover:text-black p-1 shrink-0 opacity-0 group-hover:opacity-100 transition" title="Editar subpartida">
                            <Icon name="edit" size="sm" color="currentColor" />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal: partida (crear/editar) */}
      <Modal
        open={partOpen}
        onClose={() => setPartOpen(false)}
        title={partEditId != null ? 'Editar partida' : 'Nueva partida'}
        footer={
          <div className="flex items-center gap-2 w-full">
            {partEditId != null && (
              <Button variant="outline" onClick={() => { const p = partidas.find(x => x.idPartida === partEditId); if (p) borrarPart(p); }}>Eliminar</Button>
            )}
            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" onClick={() => setPartOpen(false)}>Cancelar</Button>
              <Button loading={saving} disabled={!partForm.idEtapa || !partForm.codigo.trim() || !partForm.nombre.trim()} onClick={guardarPart}>{partEditId != null ? 'Guardar' : 'Crear partida'}</Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <Combobox
            label="Etapa" required
            value={partForm.idEtapa}
            onChange={v => setPart('idEtapa', v)}
            placeholder="Seleccionar etapa"
            options={etapas.map(e => ({ value: String(e.idEtapa), label: e.nombre, parts: [{ text: e.codigo, weight: 'bold' as const }, { text: e.nombre, weight: 'light' as const }], search: e.codigo }))}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Código" placeholder="Ej. 1.3" value={partForm.codigo} onChange={e => setPart('codigo', e.target.value)} required maxLength={50} />
            <Input label="Nombre" value={partForm.nombre} onChange={e => setPart('nombre', e.target.value)} required maxLength={100} />
          </div>
        </div>
      </Modal>

      {/* Modal: subpartida (crear/editar) */}
      <Modal
        open={subOpen}
        onClose={() => setSubOpen(false)}
        title={subEditId != null ? 'Editar subpartida' : 'Nueva subpartida'}
        footer={
          <div className="flex items-center gap-2 w-full">
            {subEditId != null && (
              <Button variant="outline" onClick={() => { const s = subpartidas.find(x => x.idSubPartida === subEditId); if (s) borrarSub(s); }}>Eliminar</Button>
            )}
            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" onClick={() => setSubOpen(false)}>Cancelar</Button>
              <Button loading={saving} disabled={!subForm.idPartida || !subForm.codigo.trim() || !subForm.nombre.trim()} onClick={guardarSub}>{subEditId != null ? 'Guardar' : 'Crear subpartida'}</Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          {subForm.idPartida ? (
            // Partida ya definida por contexto (detalle o edición): se muestra fija.
            <div className="rounded-ds bg-ds-gray-100 px-4 py-3 text-sm">
              <span className="text-ds-gray-500">Partida: </span>
              {(() => {
                const p = partidas.find(x => String(x.idPartida) === subForm.idPartida);
                return <span className="font-semibold text-black">{p ? `${p.codigo} — ${p.nombre}` : subForm.idPartida}</span>;
              })()}
            </div>
          ) : (
            <>
              <p className="text-body-sm text-ds-gray-500">
                La subpartida queda amarrada a una <span className="font-semibold text-black">partida</span> existente (y a su etapa).
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Combobox
                  label="Etapa" required
                  value={subForm.idEtapa}
                  onChange={v => { setSub('idEtapa', v); setSub('idPartida', ''); }}
                  placeholder="Seleccionar etapa"
                  options={etapas.map(e => ({ value: String(e.idEtapa), label: e.nombre, parts: [{ text: e.codigo, weight: 'bold' as const }, { text: e.nombre, weight: 'light' as const }], search: e.codigo }))}
                />
                <Combobox
                  label="Partida" required
                  value={subForm.idPartida}
                  onChange={v => setSub('idPartida', v)}
                  placeholder={subForm.idEtapa ? 'Seleccionar partida' : 'Elegí una etapa primero'}
                  emptyText="Esta etapa no tiene partidas"
                  options={partidasDeEtapa.map(p => ({ value: String(p.idPartida), label: p.nombre, parts: [{ text: p.codigo, weight: 'bold' as const }, { text: p.nombre, weight: 'light' as const }], search: p.codigo }))}
                />
              </div>
            </>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Código" placeholder="Ej. 1.1.5" value={subForm.codigo} onChange={e => setSub('codigo', e.target.value)} required maxLength={50} />
            <Input label="Nombre" value={subForm.nombre} onChange={e => setSub('nombre', e.target.value)} required maxLength={50} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Sprint (N°)" type="number" min={0} value={subForm.numSprint} onChange={e => setSub('numSprint', e.target.value)} />
            <div className="flex items-end pb-3">
              <label className="flex items-center gap-2 text-sm text-black cursor-pointer">
                <input type="checkbox" checked={subForm.esCritica} onChange={e => setSub('esCritica', e.target.checked)} className="w-4 h-4 accent-brand" />
                Es crítica
              </label>
            </div>
          </div>
          <Input label="Descripción (opcional)" value={subForm.descripcion} onChange={e => setSub('descripcion', e.target.value)} maxLength={50} />
        </div>
      </Modal>
    </div>
  );
}
