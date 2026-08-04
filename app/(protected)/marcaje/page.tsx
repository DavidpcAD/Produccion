'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Input } from '@/components/ui/Input';
import { Combobox } from '@/components/ui/Combobox';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { Icon } from '@/components/ds/Icon/Icon';
import { PageShell, PageHeader } from '@/components/layout/Page';

interface Zona { idZona: number; nombre: string; ubicacion: string | null; }
type Estado = 'sin_dispositivos' | 'esperando_biometria' | 'redistribuyendo' | 'lista' | null;
interface Colab {
  idColaborador: number; nombre: string; cedula: string;
  puesto: string | null; departamento: string | null;
  enZona: boolean; estado: Estado;
}

const EST_META: Record<string, { label: string; variant: React.ComponentProps<typeof Badge>['variant'] }> = {
  lista:               { label: 'Lista',               variant: 'green' },
  redistribuyendo:     { label: 'Replicando…',         variant: 'yellow' },
  esperando_biometria: { label: 'Esperando biometría', variant: 'yellow' },
  sin_dispositivos:    { label: 'Sin relojes',         variant: 'gray' },
};

export default function MarcajePage() {
  const { toast } = useToast();
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [idZona, setIdZona] = useState('');
  const [colabs, setColabs] = useState<Colab[] | null>(null);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [enrolando, setEnrolando] = useState(false);

  useEffect(() => {
    fetch('/api/catalogos').then(r => r.json()).then(d => {
      const zs: Zona[] = d.zonas ?? [];
      setZonas(zs);
      if (zs.length === 1) setIdZona(String(zs[0].idZona));
    }).catch(() => {});
  }, []);

  const cargar = useCallback(async (zona: string) => {
    if (!zona) { setColabs(null); return; }
    setLoading(true);
    setSel(new Set());
    try {
      const r = await fetch(`/api/marcaje/colaboradores?idZona=${zona}`, { cache: 'no-store' });
      const d = await r.json();
      setColabs(r.ok ? (d.colaboradores ?? []) : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(idZona); }, [idZona, cargar]);

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    const base = colabs ?? [];
    if (!t) return base;
    return base.filter(c =>
      c.nombre.toLowerCase().includes(t) ||
      c.cedula.toLowerCase().includes(t) ||
      (c.puesto ?? '').toLowerCase().includes(t) ||
      (c.departamento ?? '').toLowerCase().includes(t));
  }, [colabs, q]);

  const pendientes = useMemo(() => filtrados.filter(c => !c.enZona), [filtrados]);
  const totalEnZona = (colabs ?? []).filter(c => c.enZona).length;
  const totalPend = (colabs ?? []).filter(c => !c.enZona).length;
  const allSelected = pendientes.length > 0 && pendientes.every(c => sel.has(c.idColaborador));

  function toggle(id: number) {
    setSel(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    setSel(prev => {
      if (pendientes.every(c => prev.has(c.idColaborador))) {
        const n = new Set(prev); pendientes.forEach(c => n.delete(c.idColaborador)); return n;
      }
      const n = new Set(prev); pendientes.forEach(c => n.add(c.idColaborador)); return n;
    });
  }

  async function enrolar() {
    if (sel.size === 0) return;
    setEnrolando(true);
    try {
      const r = await fetch('/api/marcaje/enrolar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idZona: Number(idZona), idColaboradores: [...sel] }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast(d.error || 'No se pudo enrolar', 'error'); return; }
      if (d.fallidos > 0) {
        toast(`${d.enrolados} enrolado(s), ${d.fallidos} con error. Revisá los que quedaron pendientes.`, 'warning');
      } else {
        toast(`${d.enrolados} colaborador(es) agregados al dispositivo. Deben pasar la cara por un reloj de la zona.`, 'success');
      }
      await cargar(idZona);
    } finally {
      setEnrolando(false);
    }
  }

  return (
    <PageShell>
      <PageHeader title="Marcaje" subtitle="Agregá colaboradores al dispositivo de una zona. Al enrolarlos quedan dados de alta en todos los relojes; luego deben pasar la cara/huella por cualquiera y el sistema la replica." />

      <div className="bg-ds-surface rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Combobox label="Zona de marca" value={idZona} onChange={setIdZona}
            options={zonas.map(z => ({
              value: String(z.idZona), label: z.nombre,
              parts: [{ text: z.nombre, weight: 'bold' as const }, ...(z.ubicacion ? [{ text: z.ubicacion, weight: 'light' as const }] : [])],
              search: z.ubicacion ?? '',
            }))}
            placeholder={zonas.length ? 'Seleccionar zona' : 'No hay zonas configuradas'} emptyText="Sin zonas" />
          {idZona && colabs && (
            <div className="flex items-end gap-4 text-sm">
              <div><span className="font-bold text-ds-ink">{totalEnZona}</span> <span className="text-ds-gray-400">en el dispositivo</span></div>
              <div><span className="font-bold text-ds-ink">{totalPend}</span> <span className="text-ds-gray-400">sin enrolar</span></div>
            </div>
          )}
        </div>

        {!idZona ? (
          <p className="text-sm text-ds-gray-400 py-6 text-center">Elegí una zona para ver los colaboradores.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[220px]">
                <Input placeholder="Buscar por nombre, cédula, puesto…" value={q} onChange={e => setQ(e.target.value)} />
              </div>
              <button type="button" onClick={toggleAll} disabled={pendientes.length === 0}
                className="text-sm font-semibold text-ds-gray-500 hover:text-ds-ink disabled:opacity-40 disabled:cursor-not-allowed">
                {allSelected ? 'Quitar selección' : `Seleccionar pendientes (${pendientes.length})`}
              </button>
              <Button onClick={enrolar} loading={enrolando} disabled={sel.size === 0}
                icon={<Icon name="reloj" size="sm" color="currentColor" />}>
                Agregar {sel.size > 0 ? `${sel.size} ` : ''}al dispositivo
              </Button>
            </div>

            {loading ? (
              <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-ds" />)}</div>
            ) : filtrados.length === 0 ? (
              <p className="text-sm text-ds-gray-400 py-6 text-center">Sin colaboradores{q ? ' para esa búsqueda' : ''}.</p>
            ) : (
              <div className="space-y-1.5">
                {filtrados.map(c => {
                  const m = c.estado ? EST_META[c.estado] : null;
                  const checked = sel.has(c.idColaborador);
                  return (
                    <label key={c.idColaborador}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-ds border transition-colors ${
                        c.enZona ? 'border-ds-gray-100 bg-ds-gray-100/40' : checked ? 'border-black bg-brand-soft' : 'border-ds-gray-200 hover:bg-ds-gray-100/50 cursor-pointer'}`}>
                      {c.enZona ? (
                        <span className="w-5 h-5 flex items-center justify-center shrink-0 text-brand"><Icon name="check" size="sm" color="currentColor" /></span>
                      ) : (
                        <input type="checkbox" checked={checked} onChange={() => toggle(c.idColaborador)}
                          className="w-4 h-4 shrink-0 accent-black cursor-pointer" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-ds-ink truncate">{c.nombre}</p>
                        <p className="text-xs text-ds-gray-400 truncate">{c.cedula}{c.puesto ? ` · ${c.puesto}` : ''}</p>
                      </div>
                      {c.enZona
                        ? <Badge variant={m?.variant ?? 'green'} dot>{m?.label ?? 'En el dispositivo'}</Badge>
                        : <span className="text-xs text-ds-gray-400 shrink-0">Sin enrolar</span>}
                    </label>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </PageShell>
  );
}
