'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageShell, PageHeader } from '@/components/layout/Page';
import { CatalogoTabs } from '@/components/layout/CatalogoTabs';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useSession } from '@/hooks/useSession';
import { Icon } from '@/components/ds/Icon/Icon';
import { Skeleton } from '@/components/ui/Skeleton';

type Ambito = 'sprint' | 'partida';

interface TipoCasa { codigo: string; descripcion: string }
interface SprintCat { numero_global: number; nombre: string }
interface Fila {
  subPartidaId: number; codigo: string; nombre: string;
  partidaId: number; partidaCodigo: string; partidaNombre: string;
  sprintNumero: number; aplica: string[]; pesos: Record<string, number>;
}
interface PesosData { ambito: Ambito; tiposCasa: TipoCasa[]; sprints: SprintCat[]; filas: Fila[] }

const key = (subId: number, tc: string) => `${subId}|${tc}`;
const TOL = 0.5; // tolerancia de suma de columna (100%)

export default function PesosPage() {
  const session = useSession();
  const { toast } = useToast();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const puedeEditar = mounted && !!session && session.nivelAdmin >= 2;

  const [ambito, setAmbito] = useState<Ambito>('sprint');
  const [data, setData] = useState<PesosData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [valores, setValores] = useState<Record<string, string>>({}); // `${subId}|${tc}` → texto
  const [colapsados, setColapsados] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);

  const cargar = useCallback((amb: Ambito) => {
    setLoading(true);
    setDirty(false);
    fetch(`/api/avance/pesos?ambito=${amb}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('No autorizado'))))
      .then((d: PesosData) => {
        setData(d);
        // Semilla de valores editables: solo celdas que aplican (default '0').
        const v: Record<string, string> = {};
        for (const f of d.filas) {
          for (const tc of f.aplica) v[key(f.subPartidaId, tc)] = String(f.pesos[tc] ?? 0);
        }
        setValores(v);
        // Colapsa todos los grupos menos el primero.
        const groups = new Set<string>();
        for (const f of d.filas) groups.add(amb === 'sprint' ? String(f.sprintNumero) : String(f.partidaId));
        const arr = Array.from(groups);
        setColapsados(new Set(arr.slice(1)));
      })
      .catch(() => toast('No se pudieron cargar los pesos.', 'error'))
      .finally(() => setLoading(false));
  }, [toast]);

  useEffect(() => { cargar(ambito); }, [cargar, ambito]);

  const tipos = data?.tiposCasa ?? [];
  const sprintNombre = useMemo(() => {
    const m = new Map<number, string>();
    for (const s of data?.sprints ?? []) m.set(s.numero_global, s.nombre);
    return m;
  }, [data]);

  // Agrupación por scope (sprint_numero | partida_id) + orden estable.
  const grupos = useMemo(() => {
    if (!data) return [] as { id: string; titulo: string; subtitulo: string; filas: Fila[] }[];
    const map = new Map<string, Fila[]>();
    for (const f of data.filas) {
      const gid = ambito === 'sprint' ? String(f.sprintNumero) : String(f.partidaId);
      const arr = map.get(gid) ?? [];
      arr.push(f);
      map.set(gid, arr);
    }
    const gs = Array.from(map.entries()).map(([id, filas]) => {
      const fs = filas.slice().sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }));
      const titulo = ambito === 'sprint'
        ? `Sprint ${id}`
        : `${fs[0]?.partidaCodigo ?? ''} ${fs[0]?.partidaNombre ?? ''}`.trim();
      const subtitulo = ambito === 'sprint'
        ? (sprintNombre.get(Number(id)) ?? '')
        : `${fs.length} sub-partidas`;
      return { id, titulo, subtitulo, filas: fs };
    });
    return gs.sort((a, b) =>
      ambito === 'sprint'
        ? Number(a.id) - Number(b.id)
        : (a.filas[0]?.partidaCodigo ?? '').localeCompare(b.filas[0]?.partidaCodigo ?? '', undefined, { numeric: true }),
    );
  }, [data, ambito, sprintNombre]);

  // Total de una columna (tipo de casa) dentro de un grupo.
  function totalColumna(filas: Fila[], tc: string): number {
    let s = 0;
    for (const f of filas) {
      if (!f.aplica.includes(tc)) continue;
      const v = Number(valores[key(f.subPartidaId, tc)]);
      if (!Number.isNaN(v)) s += v;
    }
    return Math.round(s * 100) / 100;
  }

  function setCelda(subId: number, tc: string, v: string) {
    setValores(p => ({ ...p, [key(subId, tc)]: v }));
    setDirty(true);
  }

  function toggleGrupo(id: string) {
    setColapsados(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  const todosColapsados = grupos.length > 0 && grupos.every(g => colapsados.has(g.id));
  function toggleTodos() {
    setColapsados(todosColapsados ? new Set() : new Set(grupos.map(g => g.id)));
  }

  async function guardar() {
    if (!data) return;
    const cambios: { subPartidaId: number; tipoCasa: string; peso: number }[] = [];
    for (const f of data.filas) {
      for (const tc of f.aplica) {
        const v = Number(valores[key(f.subPartidaId, tc)]);
        cambios.push({ subPartidaId: f.subPartidaId, tipoCasa: tc, peso: Number.isNaN(v) ? 0 : v });
      }
    }
    setSaving(true);
    try {
      const r = await fetch('/api/avance/pesos', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ambito, cambios }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast(d.error || 'No se pudieron guardar los pesos', 'error'); return; }
      toast(`Pesos guardados (${d.guardados ?? cambios.length}).`, 'success');
      setDirty(false);
    } finally { setSaving(false); }
  }

  if (mounted && session && (session.nivelAdmin ?? 0) < 1) {
    return (
      <PageShell>
        <div className="bg-ds-surface rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-14 text-center text-ds-gray-400">
          No tenés acceso a esta sección.
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title="Pesos"
        subtitle="Peso (%) de cada sub-partida dentro de su sprint o de su partida, por tipo de casa. Cada columna debe sumar 100%."
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" onClick={toggleTodos}>{todosColapsados ? 'Expandir todos' : 'Colapsar todos'}</Button>
            {puedeEditar && (
              <Button onClick={guardar} loading={saving} disabled={!dirty}
                icon={<Icon name="check" size="sm" color="currentColor" />}>
                Guardar todos los pesos
              </Button>
            )}
          </div>
        }
      />

      <CatalogoTabs />

      {/* Selector de ámbito */}
      <div className="inline-flex rounded-ds border border-ds-gray-200 p-0.5 bg-ds-surface w-fit">
        {([['Por sprint', 'sprint'], ['Por partida', 'partida']] as const).map(([label, val]) => (
          <button key={val} onClick={() => setAmbito(val)}
            className={'px-3.5 py-1.5 rounded-ds text-sm font-semibold transition ' + (ambito === val ? 'bg-black text-white' : 'text-ds-gray-500 hover:text-ds-ink')}>
            {label}
          </button>
        ))}
      </div>

      {dirty && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-ds px-3 py-1.5 w-fit">
          Hay cambios sin guardar.
        </p>
      )}

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" rounded="rounded-ds-lg" />)}</div>
      ) : grupos.length === 0 ? (
        <div className="bg-ds-surface rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-10 text-center text-ds-gray-400">
          No hay sub-partidas para mostrar.
        </div>
      ) : (
        <div className="space-y-3">
          {grupos.map(g => {
            const abierto = !colapsados.has(g.id);
            const totales = tipos.map(t => ({ tc: t.codigo, total: totalColumna(g.filas, t.codigo) }));
            const todoOk = totales.every(x => Math.abs(x.total - 100) <= TOL);
            return (
              <section key={g.id} className="bg-ds-surface rounded-ds-lg border border-ds-gray-200 shadow-ds-01 overflow-hidden">
                <button type="button" onClick={() => toggleGrupo(g.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-ds-gray-100/50">
                  <Icon name={abierto ? 'open' : 'arrow-right'} size="sm" color="currentColor" />
                  <span className="font-bold text-ds-ink">{g.titulo}</span>
                  <span className="text-body-sm text-ds-gray-400 truncate">{g.subtitulo}</span>
                  <span className="ml-auto flex items-center gap-1.5 flex-wrap justify-end">
                    {totales.map(x => (
                      <span key={x.tc}
                        className={'text-[11px] font-mono font-semibold rounded-full px-2 py-0.5 ' +
                          (Math.abs(x.total - 100) <= TOL ? 'bg-brand/20 text-ds-green-ink' : 'bg-ds-red/10 text-ds-red')}>
                        {x.tc}: {x.total.toFixed(1)}%
                      </span>
                    ))}
                    <Icon name={todoOk ? 'completado' : 'alert'} size="sm" color="currentColor" />
                  </span>
                </button>

                {abierto && (
                  <div className="overflow-x-auto border-t border-ds-gray-100">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-ds-gray-100/60 text-left">
                          <th className="px-3 py-2 font-semibold text-ds-gray-500 text-xs uppercase tracking-wide">Código</th>
                          <th className="px-3 py-2 font-semibold text-ds-gray-500 text-xs uppercase tracking-wide">Sub-partida</th>
                          {ambito === 'partida' && <th className="px-2 py-2 font-semibold text-ds-gray-500 text-xs uppercase tracking-wide text-center">Sprint</th>}
                          {tipos.map(t => (
                            <th key={t.codigo} className="px-2 py-2 font-semibold text-ds-gray-500 text-xs uppercase tracking-wide text-center whitespace-nowrap" title={t.descripcion}>{t.codigo}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {g.filas.map(f => (
                          <tr key={f.subPartidaId} className="border-t border-ds-gray-100">
                            <td className="px-3 py-1.5 font-mono text-xs text-ds-gray-500 whitespace-nowrap">{f.codigo}</td>
                            <td className="px-3 py-1.5 text-ds-ink">{f.nombre}</td>
                            {ambito === 'partida' && <td className="px-2 py-1.5 text-center text-xs text-ds-gray-400 tabular-nums">{f.sprintNumero}</td>}
                            {tipos.map(t => {
                              const aplica = f.aplica.includes(t.codigo);
                              if (!aplica) return <td key={t.codigo} className="px-2 py-1.5 text-center text-ds-gray-300 text-xs">N/A</td>;
                              return (
                                <td key={t.codigo} className="px-2 py-1.5 text-center">
                                  <input
                                    type="number" step="0.01" min={0}
                                    value={valores[key(f.subPartidaId, t.codigo)] ?? '0'}
                                    onChange={e => setCelda(f.subPartidaId, t.codigo, e.target.value)}
                                    disabled={!puedeEditar}
                                    className="w-16 rounded-ds border border-ds-gray-200 px-1.5 py-1 text-center text-sm tabular-nums focus:border-black focus:outline-none disabled:bg-ds-gray-100 disabled:text-ds-gray-400"
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                        {/* Fila de totales */}
                        <tr className="border-t-2 border-ds-gray-200 bg-ds-gray-100/40">
                          <td className="px-3 py-2 font-bold text-ds-ink text-xs uppercase" colSpan={ambito === 'partida' ? 3 : 2}>Total</td>
                          {tipos.map(t => {
                            const total = totalColumna(g.filas, t.codigo);
                            const ok = Math.abs(total - 100) <= TOL;
                            return (
                              <td key={t.codigo} className={'px-2 py-2 text-center text-xs font-bold tabular-nums ' + (ok ? 'text-ds-green-ink' : 'text-ds-red')}>
                                {total.toFixed(2)}%
                              </td>
                            );
                          })}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
