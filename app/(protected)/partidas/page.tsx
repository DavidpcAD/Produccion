'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Combobox } from '@/components/ui/Combobox';
import { useToast } from '@/components/ui/Toast';
import { useSession } from '@/hooks/useSession';
import { Icon } from '@/components/ds/Icon/Icon';
import { Skeleton } from '@/components/ui/Skeleton';

interface Etapa { idEtapa: number; codigo: string; nombre: string }
interface Partida { idPartida: number; codigo: string; nombre: string; idEtapa: number | null }
interface SubPartida {
  idSubPartida: number; codigo: string; nombre: string; idPartida: number;
  numSprint: number; esCritica: boolean; descripcion: string | null;
}

export default function PartidasPage() {
  const session = useSession();
  const { toast } = useToast();
  const isSuperAdmin = !!session && session.nivelAdmin >= 4;
  // useSession se resuelve en cliente; para evitar mismatch de hidratación con lo
  // renderizado en el server (sesión null), la UI dependiente de sesión se muestra
  // solo tras montar.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [partidas, setPartidas] = useState<Partida[]>([]);
  const [subpartidas, setSubpartidas] = useState<SubPartida[]>([]);
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{ idEtapa: string; idPartida: string; codigo: string; nombre: string; numSprint: string; esCritica: boolean; descripcion: string }>({
    idEtapa: '', idPartida: '', codigo: '', nombre: '', numSprint: '1', esCritica: false, descripcion: '',
  });
  const set = (k: keyof typeof form, v: string | boolean) => setForm(p => ({ ...p, [k]: v }));

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

  // Partidas de la etapa elegida (para el selector del modal).
  const partidasDeEtapa = useMemo(
    () => (form.idEtapa ? partidas.filter(p => String(p.idEtapa) === form.idEtapa) : []),
    [partidas, form.idEtapa],
  );

  function abrirNueva() {
    setForm({ idEtapa: '', idPartida: '', codigo: '', nombre: '', numSprint: '1', esCritica: false, descripcion: '' });
    setOpen(true);
  }

  async function guardar() {
    if (!form.idPartida) { toast('Elegí la partida', 'warning'); return; }
    if (!form.codigo.trim()) { toast('El código es requerido', 'warning'); return; }
    if (!form.nombre.trim()) { toast('El nombre es requerido', 'warning'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/subpartidas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idPartida: Number(form.idPartida),
          codigo: form.codigo.trim(),
          nombre: form.nombre.trim(),
          numSprint: Number(form.numSprint) || 1,
          esCritica: form.esCritica,
          descripcion: form.descripcion.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast(data.error || 'No se pudo crear la subpartida', 'error'); return; }
      toast('Subpartida creada', 'success');
      setOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  // Agrupar subpartidas por etapa → partida para el listado.
  const grupos = useMemo(() => {
    const byPartida = new Map<number, SubPartida[]>();
    for (const s of subpartidas) {
      if (!byPartida.has(s.idPartida)) byPartida.set(s.idPartida, []);
      byPartida.get(s.idPartida)!.push(s);
    }
    return etapas.map(e => ({
      etapa: e,
      partidas: partidas
        .filter(p => p.idEtapa === e.idEtapa)
        .map(p => ({ partida: p, subs: byPartida.get(p.idPartida) ?? [] })),
    }));
  }, [etapas, partidas, subpartidas]);

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
        {mounted && isSuperAdmin && (
          <Button onClick={abrirNueva} icon={<Icon name="plus" size="sm" color="currentColor" />}>Nueva subpartida</Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : (
        <div className="space-y-6">
          {grupos.map(({ etapa, partidas: parts }) => (
            <div key={etapa.idEtapa} className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center h-6 min-w-6 px-1.5 rounded-ds bg-black text-white text-xs font-bold font-mono">{etapa.codigo}</span>
                <h2 className="font-bold text-black text-sm uppercase tracking-wide">{etapa.nombre}</h2>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {parts.map(({ partida, subs }) => (
                  <div key={partida.idPartida} className="bg-white rounded-ds-lg border border-ds-gray-200 shadow-ds-01 overflow-hidden">
                    <div className="px-4 py-3 bg-ds-gray-100 border-b border-ds-gray-200 flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-ds-gray-500">{partida.codigo}</span>
                      <span className="font-bold text-black text-sm truncate">{partida.nombre}</span>
                      <span className="ml-auto text-xs text-ds-gray-400">{subs.length}</span>
                    </div>
                    {subs.length === 0 ? (
                      <div className="px-4 py-4 text-xs text-ds-gray-300">Sin subpartidas</div>
                    ) : (
                      <ul className="divide-y divide-ds-gray-100">
                        {subs.map(s => (
                          <li key={s.idSubPartida} className="px-4 py-2.5 flex items-center gap-3">
                            <span className="font-mono text-xs font-semibold text-ds-gray-500 shrink-0">{s.codigo}</span>
                            <span className="text-sm text-black truncate flex-1">{s.nombre}</span>
                            {s.esCritica && <Badge variant="red">Crítica</Badge>}
                            <span className="text-xs text-ds-gray-400 shrink-0">S{s.numSprint}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
                {parts.length === 0 && (
                  <div className="text-xs text-ds-gray-300 px-1">Sin partidas en esta etapa</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal: nueva subpartida */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nueva subpartida"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button loading={saving} onClick={guardar}>Crear subpartida</Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-body-sm text-ds-gray-500">
            La subpartida queda amarrada a una <span className="font-semibold text-black">partida</span> existente (y a su etapa).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Combobox
              label="Etapa" required
              value={form.idEtapa}
              onChange={v => { set('idEtapa', v); set('idPartida', ''); }}
              placeholder="Seleccionar etapa"
              options={etapas.map(e => ({ value: String(e.idEtapa), label: e.nombre, parts: [{ text: e.codigo, weight: 'bold' as const }, { text: e.nombre, weight: 'light' as const }], search: e.codigo }))}
            />
            <Combobox
              label="Partida" required
              value={form.idPartida}
              onChange={v => set('idPartida', v)}
              placeholder={form.idEtapa ? 'Seleccionar partida' : 'Elegí una etapa primero'}
              emptyText="Esta etapa no tiene partidas"
              options={partidasDeEtapa.map(p => ({ value: String(p.idPartida), label: p.nombre, parts: [{ text: p.codigo, weight: 'bold' as const }, { text: p.nombre, weight: 'light' as const }], search: p.codigo }))}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Código" placeholder="Ej. 1.1.5" value={form.codigo} onChange={e => set('codigo', e.target.value)} required maxLength={50} />
            <Input label="Nombre" value={form.nombre} onChange={e => set('nombre', e.target.value)} required maxLength={50} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Sprint (N°)" type="number" min={0} value={form.numSprint} onChange={e => set('numSprint', e.target.value)} />
            <div className="flex items-end pb-3">
              <label className="flex items-center gap-2 text-sm text-black cursor-pointer">
                <input type="checkbox" checked={form.esCritica} onChange={e => set('esCritica', e.target.checked)} className="w-4 h-4 accent-brand" />
                Es crítica
              </label>
            </div>
          </div>
          <Input label="Descripción (opcional)" value={form.descripcion} onChange={e => set('descripcion', e.target.value)} maxLength={50} />
        </div>
      </Modal>
    </div>
  );
}
