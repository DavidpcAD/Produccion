'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Combobox } from '@/components/ui/Combobox';
import { useToast } from '@/components/ui/Toast';
import { useSession } from '@/hooks/useSession';
import { Icon } from '@/components/ds/Icon/Icon';
import { Skeleton } from '@/components/ui/Skeleton';

interface Obra { idObra: number; numeroObra: string; nombreMostrado: string }
interface Etapa { idEtapa: number; codigo: string; nombre: string }
interface Partida { idPartida: number; codigo: string; nombre: string; idEtapa: number | null }
interface SubPartida { idSubPartida: number; codigo: string; nombre: string; idPartida: number; numSprint: number }

type Tab = 'general' | 'detallado' | 'horas';
const crc = new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC', maximumFractionDigits: 0 });

export default function PresupuestoPage() {
  const session = useSession();
  const { toast } = useToast();
  const puede = !!session && session.nivelAdmin >= 2;
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [tab, setTab] = useState<Tab>('general');
  const [obras, setObras] = useState<Obra[]>([]);
  const [obraId, setObraId] = useState('');
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [partidas, setPartidas] = useState<Partida[]>([]);
  const [subpartidas, setSubpartidas] = useState<SubPartida[]>([]);
  const [loading, setLoading] = useState(true);
  const [subiendo, setSubiendo] = useState(false);

  // Montos por partida (vista General). Clave = idPartida.
  const [montoPartida, setMontoPartida] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const [o, p] = await Promise.all([
      fetch('/api/obras?porPagina=1000').then(r => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/partidas').then(r => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    if (o) setObras(o.data ?? []);
    if (p) { setEtapas(p.etapas ?? []); setPartidas(p.partidas ?? []); setSubpartidas(p.subpartidas ?? []); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const grupos = useMemo(() =>
    etapas.map(e => ({ etapa: e, partidas: partidas.filter(p => p.idEtapa === e.idEtapa) })).filter(g => g.partidas.length > 0),
    [etapas, partidas]);

  const totalGeneral = useMemo(
    () => Object.values(montoPartida).reduce((s, v) => s + (Number(v) || 0), 0),
    [montoPartida]);

  async function subir() {
    if (!obraId) { toast('Elegí una obra primero', 'warning'); return; }
    const lineas = Object.entries(montoPartida)
      .map(([idPartida, monto]) => ({ idPartida: Number(idPartida), monto: Number(monto) || 0 }))
      .filter(l => l.monto > 0);
    if (lineas.length === 0) { toast('Ingresá al menos un monto', 'warning'); return; }
    setSubiendo(true);
    try {
      const res = await fetch('/api/presupuesto', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idObra: Number(obraId), vista: 'general', lineas }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast(data.error || 'No se pudo subir el presupuesto', 'error'); return; }
      toast(data.message || 'Presupuesto enviado', data.ok ? 'success' : 'info');
    } finally { setSubiendo(false); }
  }

  if (mounted && session && !puede) {
    return (
      <div className="p-6 max-w-[1600px] mx-auto animate-fade-in">
        <div className="bg-white rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-14 text-center text-ds-gray-400">No tenés acceso a esta sección.</div>
      </div>
    );
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: 'general', label: 'General' },
    { id: 'detallado', label: 'Detallado' },
    { id: 'horas', label: 'Horas y cantidades' },
  ];

  return (
    <div className="p-6 space-y-5 max-w-[1600px] mx-auto animate-fade-in">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-heading font-bold text-black">Subir presupuesto</h1>
          <p className="text-ds-gray-400 text-body-sm">Cargá el presupuesto de una obra y súbilo a Business Central.</p>
        </div>
        <Button onClick={subir} loading={subiendo} disabled={!obraId} icon={<Icon name="open" size="sm" color="currentColor" />}>
          Subir a Business Central
        </Button>
      </div>

      {/* Selector de obra + tabs */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-4">
        <div className="sm:max-w-sm w-full">
          <Combobox
            label="Obra" required value={obraId} onChange={setObraId}
            placeholder="Seleccionar obra"
            options={obras.map(o => ({ value: String(o.idObra), label: o.nombreMostrado, parts: [{ text: o.numeroObra, weight: 'bold' as const }, { text: o.nombreMostrado, weight: 'light' as const }], search: `${o.numeroObra} ${o.nombreMostrado}` }))}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map(t => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={'inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold transition ' +
              (tab === t.id ? 'bg-black text-white' : 'bg-white text-ds-gray-500 border border-ds-gray-200 hover:bg-ds-gray-100')}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : !obraId ? (
        <div className="bg-white rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-10 text-center text-ds-gray-400">Elegí una obra para cargar su presupuesto.</div>
      ) : tab === 'general' ? (
        <div className="space-y-5">
          {grupos.map(({ etapa, partidas: parts }) => (
            <div key={etapa.idEtapa} className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center h-6 min-w-6 px-1.5 rounded-ds bg-black text-white text-xs font-bold font-mono">{etapa.codigo}</span>
                <h2 className="font-bold text-black text-sm uppercase tracking-wide">{etapa.nombre}</h2>
              </div>
              <div className="bg-white rounded-ds-lg border border-ds-gray-200 shadow-ds-01 divide-y divide-ds-gray-100">
                {parts.map(p => (
                  <div key={p.idPartida} className="px-4 py-2.5 flex items-center gap-3">
                    <span className="font-mono text-xs font-semibold text-ds-gray-500 shrink-0 w-14">{p.codigo}</span>
                    <span className="text-sm text-black truncate flex-1">{p.nombre}</span>
                    <div className="w-44 shrink-0">
                      <Input type="number" min={0} placeholder="₡ 0"
                        value={montoPartida[p.idPartida] ?? ''}
                        onChange={e => setMontoPartida(m => ({ ...m, [p.idPartida]: e.target.value }))} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="flex items-center justify-end gap-3 bg-white rounded-ds-lg border border-ds-gray-200 shadow-ds-01 px-5 py-4 sticky bottom-3">
            <span className="text-ds-gray-400 text-body-sm">Total presupuesto</span>
            <span className="text-black font-bold text-lg">{crc.format(totalGeneral)}</span>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-10 text-center text-ds-gray-400">
          Vista <strong className="text-black">{tab === 'detallado' ? 'Detallado' : 'Horas y cantidades'}</strong> — en construcción.
        </div>
      )}
    </div>
  );
}
