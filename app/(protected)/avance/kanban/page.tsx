'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  CaretDown,
  CaretRight,
  Check,
  MagnifyingGlass,
  Pause,
  Percent,
  Play,
  Plus,
  XCircle,
} from '@phosphor-icons/react';
import { PageShell, PageHeader } from '@/components/layout/Page';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { VENTA_META } from '@/lib/avance/venta';
import type {
  AvanceSprint,
  AvanceSubPartida,
  Causa,
  EstadoVenta,
  ObraAvance,
  Proyecto,
} from '@/lib/avance/types';
import type { SprintCatalogoDetalle } from '@/lib/avance/sprints';
import type { IniciarLoteBody } from '@/lib/avance/campo';
import { AvanceRapidoDialog, type SubRapido } from './AvanceRapidoDialog';
import { RegistrarNCDialog } from './RegistrarNCDialog';
import { CongelarObraDialog } from './CongelarObraDialog';
import { HabilitarLoteDialog } from './HabilitarLoteDialog';

const VENTAS: EstadoVenta[] = ['formalizada', 'reservada', 'disponible', 'entregada'];

/**
 * Vista Kanban del módulo Avance de campo — tablero por sprint con captura
 * rápida inline. Reusa los endpoints existentes (/api/avance/obras,
 * /api/avance/sprints, /api/avance/causas, PUT .../avance) y los nuevos
 * (POST .../sprint, POST .../estado, POST obras/iniciar-lote).
 *
 * Columnas = sprints del catálogo; cada obra habilitada (en_ejecucion/en_espera)
 * cae en la columna de su sprint_actual. Al expandir una tarjeta se cargan sus
 * sub-partidas del sprint y se pueden capturar % / completar / NC, y mover la
 * obra de sprint (Atrás/Avanzar) o congelar/descongelar.
 */
export default function KanbanPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [proyectoSel, setProyectoSel] = useState<string | null>(null);
  const [obras, setObras] = useState<ObraAvance[]>([]);
  const [loadingObras, setLoadingObras] = useState(true);
  const [sprints, setSprints] = useState<SprintCatalogoDetalle[]>([]);
  const [causas, setCausas] = useState<Causa[]>([]);

  const [busqueda, setBusqueda] = useState('');
  const [ventaFiltro, setVentaFiltro] = useState<EstadoVenta | null>(null);

  const [expandida, setExpandida] = useState<string | null>(null);
  const [avanceMap, setAvanceMap] = useState<Record<string, AvanceSprint>>({});
  const [loadingAvance, setLoadingAvance] = useState<string | null>(null);

  // Diálogos.
  const [pctDe, setPctDe] = useState<{ codigo: string; sub: SubRapido } | null>(null);
  const [ncDe, setNcDe] = useState<{ codigo: string; sub: AvanceSubPartida } | null>(null);
  const [congelarDe, setCongelarDe] = useState<string | null>(null);
  const [loteOpen, setLoteOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const proyectoActivo =
    proyectoSel === '__TODOS__' ? null : (proyectoSel ?? proyectos[0]?.codigo ?? null);

  useEffect(() => {
    fetch('/api/avance/proyectos')
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((d) => setProyectos(d.data ?? []))
      .catch(() => {});
    fetch('/api/avance/sprints')
      .then((r) => (r.ok ? r.json() : { sprints: [] }))
      .then((d) => setSprints(d.sprints ?? []))
      .catch(() => {});
    fetch('/api/avance/causas?activo=true')
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((d) => setCausas(d.data ?? []))
      .catch(() => {});
  }, []);

  const cargarObras = useCallback(() => {
    setLoadingObras(true);
    const params = new URLSearchParams();
    if (proyectoActivo) params.set('proyecto', proyectoActivo);
    return fetch(`/api/avance/obras?${params}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => setObras(d.data ?? []))
      .catch(() => {
        setObras([]);
        toast('No se pudieron cargar las obras.', 'error');
      })
      .finally(() => setLoadingObras(false));
  }, [proyectoActivo, toast]);

  useEffect(() => {
    cargarObras();
  }, [cargarObras]);

  const cargarAvance = useCallback(
    async (codigo: string) => {
      setLoadingAvance(codigo);
      try {
        const r = await fetch(`/api/avance/obras/${encodeURIComponent(codigo)}/avance`);
        const d = await r.json();
        if (r.ok) setAvanceMap((m) => ({ ...m, [codigo]: d.data }));
        else toast(d.error ?? 'No se pudo cargar el avance', 'error');
      } catch {
        toast('No se pudo cargar el avance', 'error');
      } finally {
        setLoadingAvance(null);
      }
    },
    [toast],
  );

  function toggleExpand(codigo: string) {
    setExpandida((prev) => {
      const next = prev === codigo ? null : codigo;
      if (next && !avanceMap[next]) cargarAvance(next);
      return next;
    });
  }

  async function registrarAvance(codigo: string, body: Record<string, unknown>) {
    try {
      const r = await fetch(`/api/avance/obras/${encodeURIComponent(codigo)}/avance`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) {
        toast(d.error ?? 'No se pudo registrar', 'error');
        return false;
      }
      await cargarAvance(codigo);
      return true;
    } catch {
      toast('No se pudo registrar', 'error');
      return false;
    }
  }

  async function accionSprint(codigo: string, accion: 'avanzar' | 'retroceder') {
    try {
      const r = await fetch(`/api/avance/obras/${encodeURIComponent(codigo)}/sprint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast(d.error ?? 'No se pudo mover el sprint', 'error');
        return;
      }
      toast(
        d.data?.sprint_a == null
          ? `${codigo}: devuelta a Por Iniciar`
          : `${codigo}: sprint ${d.data.sprint_de} → ${d.data.sprint_a}`,
        'success',
      );
      setAvanceMap((m) => {
        const { [codigo]: _omit, ...rest } = m;
        return rest;
      });
      await cargarObras();
    } catch {
      toast('No se pudo mover el sprint', 'error');
    }
  }

  async function cambiarEstado(codigo: string, estado: string, motivo?: string | null) {
    setPending(true);
    try {
      const r = await fetch(`/api/avance/obras/${encodeURIComponent(codigo)}/estado`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado, motivo_inactiva: motivo ?? null }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast(d.error ?? 'No se pudo cambiar el estado', 'error');
        return false;
      }
      await cargarObras();
      return true;
    } catch {
      toast('No se pudo cambiar el estado', 'error');
      return false;
    } finally {
      setPending(false);
    }
  }

  async function habilitarLote(body: IniciarLoteBody) {
    setPending(true);
    try {
      const r = await fetch('/api/avance/obras/iniciar-lote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) {
        toast(d.error ?? 'No se pudo habilitar el lote', 'error');
        return;
      }
      toast(
        `${d.data?.habilitadas ?? 0}/${d.data?.solicitadas ?? 0} obras habilitadas` +
          (d.data?.omitidas ? ` (${d.data.omitidas} omitidas)` : ''),
        'success',
      );
      setLoteOpen(false);
      await cargarObras();
    } catch {
      toast('No se pudo habilitar el lote', 'error');
    } finally {
      setPending(false);
    }
  }

  async function completarArrastradas(codigo: string) {
    try {
      const r = await fetch(
        `/api/avance/obras/${encodeURIComponent(codigo)}/completar-arrastradas`,
        { method: 'POST' },
      );
      const d = await r.json();
      if (!r.ok) {
        toast(d.error ?? 'No se pudo completar', 'error');
        return;
      }
      toast(`${d.data?.completadas ?? 0} arrastradas completadas`, 'success');
      await cargarAvance(codigo);
    } catch {
      toast('No se pudo completar', 'error');
    }
  }

  // Filtro por texto + estado de venta (el proyecto se filtra en el fetch).
  const obrasFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return obras.filter((o) => {
      if (ventaFiltro && o.estado_venta !== ventaFiltro) return false;
      if (q && !`${o.codigo} ${o.tipo_casa ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [obras, busqueda, ventaFiltro]);

  const ventaConteos = useMemo(() => {
    const c: Record<EstadoVenta, number> = {
      formalizada: 0,
      reservada: 0,
      disponible: 0,
      entregada: 0,
    };
    const q = busqueda.trim().toLowerCase();
    for (const o of obras) {
      if (q && !`${o.codigo} ${o.tipo_casa ?? ''}`.toLowerCase().includes(q)) continue;
      if (o.estado_venta) c[o.estado_venta]++;
    }
    return c;
  }, [obras, busqueda]);

  // Columnas: catálogo de sprints ∪ sprints presentes en las obras.
  const columnas = useMemo(() => {
    const meta = new Map<number, { nombre: string; es_espera: boolean }>();
    for (const s of sprints) meta.set(s.numero_global, { nombre: s.nombre, es_espera: s.es_espera });
    const nums = new Set<number>(sprints.map((s) => s.numero_global));
    for (const o of obrasFiltradas) nums.add(o.sprint_actual);
    return Array.from(nums)
      .sort((a, b) => a - b)
      .map((n) => ({
        numero: n,
        nombre: meta.get(n)?.nombre ?? `Sprint ${n}`,
        es_espera: meta.get(n)?.es_espera ?? false,
        obras: obrasFiltradas
          .filter((o) => o.sprint_actual === n)
          .sort((a, b) => a.codigo.localeCompare(b.codigo)),
      }));
  }, [sprints, obrasFiltradas]);

  return (
    <PageShell>
      <PageHeader
        back={
          <button
            type="button"
            onClick={() => router.push('/avance')}
            className="mb-1 flex items-center gap-1 text-body-sm text-ds-gray-400 hover:text-ds-ink"
          >
            <ArrowLeft size={16} weight="bold" /> Volver a obras
          </button>
        }
        title="Kanban de avance"
        subtitle="Tablero por sprint. Tocá una tarjeta para capturar avance o mover la obra."
        actions={
          <Button variant="outline" icon={<Plus size={16} weight="bold" />} onClick={() => setLoteOpen(true)}>
            Habilitar lote
          </Button>
        }
      />

      {/* Chips de proyecto */}
      <div className="-mx-1 overflow-x-auto px-1">
        <div className="flex gap-2">
          <Chip label="Todos" activo={proyectoSel === '__TODOS__'} onClick={() => setProyectoSel('__TODOS__')} />
          {proyectos.map((p) => (
            <Chip
              key={p.codigo}
              label={p.codigo}
              activo={p.codigo === proyectoActivo}
              onClick={() => setProyectoSel(p.codigo)}
            />
          ))}
        </div>
      </div>

      {/* Buscador + filtro de venta */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-ds-gray-400">
            <MagnifyingGlass size={16} weight="bold" />
          </span>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar obra…"
            className="h-9 w-64 rounded-ds border border-ds-gray-200 pl-8 pr-2 text-sm text-ds-ink focus:border-black focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <FiltroChip label="Todas" count={obrasFiltradas.length} activo={ventaFiltro === null} onClick={() => setVentaFiltro(null)} />
          {VENTAS.map((ev) => (
            <FiltroChip
              key={ev}
              label={VENTA_META[ev].label}
              count={ventaConteos[ev]}
              activo={ventaFiltro === ev}
              onClick={() => setVentaFiltro(ventaFiltro === ev ? null : ev)}
            />
          ))}
        </div>
      </div>

      {loadingObras && <Skeleton className="h-96 w-full" />}

      {!loadingObras && obrasFiltradas.length === 0 && (
        <p className="rounded-ds border border-dashed border-ds-gray-200 p-6 text-center text-body-sm text-ds-gray-400">
          No hay obras habilitadas para mostrar. Usá «Habilitar lote» para poner obras en ejecución.
        </p>
      )}

      {!loadingObras && obrasFiltradas.length > 0 && (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {columnas.map((col) => (
            <section key={col.numero} className="w-[320px] shrink-0">
              <header className="mb-2 flex items-center justify-between gap-2 rounded-ds bg-ds-gray-100 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-ds-ink">{col.nombre}</span>
                  {col.es_espera && <Badge variant="yellow">espera</Badge>}
                </div>
                <span className="text-xs font-semibold tabular-nums text-ds-gray-400">
                  {col.obras.length}
                </span>
              </header>
              <div className="space-y-2">
                {col.obras.map((o) => (
                  <ObraCard
                    key={o.codigo}
                    obra={o}
                    expandida={expandida === o.codigo}
                    avance={avanceMap[o.codigo] ?? null}
                    loadingAvance={loadingAvance === o.codigo}
                    causaLabel={(cod) => causas.find((c) => c.codigo === cod)?.descripcion ?? cod}
                    onToggle={() => toggleExpand(o.codigo)}
                    onCaptura={() => router.push(`/avance/${encodeURIComponent(o.codigo)}`)}
                    onCompletar={(sub) =>
                      registrarAvance(o.codigo, {
                        sub_partida_id: sub.sub_partida_id,
                        pct_completado: 100,
                        completada: true,
                        nc_causa: null,
                        nc_nota: null,
                      })
                    }
                    onPct={(sub) =>
                      setPctDe({
                        codigo: o.codigo,
                        sub: {
                          sub_partida_id: sub.sub_partida_id,
                          codigo: sub.codigo,
                          nombre: sub.nombre,
                          pct_completado: sub.pct_completado,
                          piso_pct: sub.piso_pct,
                        },
                      })
                    }
                    onNC={(sub) => setNcDe({ codigo: o.codigo, sub })}
                    onCompletarArrastradas={() => completarArrastradas(o.codigo)}
                    onAvanzar={() => accionSprint(o.codigo, 'avanzar')}
                    onRetroceder={() => accionSprint(o.codigo, 'retroceder')}
                    onCongelar={() => setCongelarDe(o.codigo)}
                    onDescongelar={() => cambiarEstado(o.codigo, 'en_ejecucion')}
                  />
                ))}
                {col.obras.length === 0 && (
                  <p className="rounded-ds border border-dashed border-ds-gray-200 p-4 text-center text-xs text-ds-gray-300">
                    Sin obras
                  </p>
                )}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Diálogos */}
      <AvanceRapidoDialog
        sub={pctDe?.sub ?? null}
        pending={false}
        onClose={() => setPctDe(null)}
        onConfirmar={(pct) => {
          if (!pctDe) return;
          registrarAvance(pctDe.codigo, {
            sub_partida_id: pctDe.sub.sub_partida_id,
            pct_completado: pct,
            completada: pct >= 100,
          });
          setPctDe(null);
        }}
      />

      <RegistrarNCDialog
        sub={ncDe?.sub ?? null}
        causas={causas}
        pending={false}
        onClose={() => setNcDe(null)}
        onConfirmar={(causa, nota) => {
          if (!ncDe) return;
          registrarAvance(ncDe.codigo, {
            sub_partida_id: ncDe.sub.sub_partida_id,
            nc_causa: causa,
            nc_nota: nota,
          });
          setNcDe(null);
        }}
      />

      <CongelarObraDialog
        codigo={congelarDe}
        causas={causas}
        pending={pending}
        onClose={() => setCongelarDe(null)}
        onConfirmar={async (causa, nota) => {
          if (!congelarDe) return;
          const ok = await cambiarEstado(
            congelarDe,
            'en_espera',
            nota ? `${causa} — ${nota}` : causa,
          );
          if (ok) {
            toast(`${congelarDe}: congelada`, 'success');
            setCongelarDe(null);
            setExpandida(null);
          }
        }}
      />

      <HabilitarLoteDialog
        open={loteOpen}
        pending={pending}
        onClose={() => setLoteOpen(false)}
        onConfirmar={habilitarLote}
      />
    </PageShell>
  );
}

// ============================================================ Tarjeta de obra
interface CardProps {
  obra: ObraAvance;
  expandida: boolean;
  avance: AvanceSprint | null;
  loadingAvance: boolean;
  causaLabel: (codigo: string) => string;
  onToggle: () => void;
  onCaptura: () => void;
  onCompletar: (sub: AvanceSubPartida) => void;
  onPct: (sub: AvanceSubPartida) => void;
  onNC: (sub: AvanceSubPartida) => void;
  onCompletarArrastradas: () => void;
  onAvanzar: () => void;
  onRetroceder: () => void;
  onCongelar: () => void;
  onDescongelar: () => void;
}

function ObraCard(p: CardProps) {
  const { obra: o } = p;
  const congelada = o.estado === 'en_espera';

  const delSprint = (p.avance?.sub_partidas ?? []).filter(
    (s) => s.sprint_numero === p.avance?.sprint && !s.arrastrada,
  );
  const arrastradasPend = (p.avance?.sub_partidas ?? []).filter(
    (s) => s.arrastrada && !s.completada,
  ).length;

  return (
    <div className={`rounded-ds border border-ds-gray-200 bg-ds-surface ${congelada ? 'opacity-70' : ''}`}>
      <button
        type="button"
        onClick={p.onToggle}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-ds-gray-100/40"
      >
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-mono text-sm font-semibold text-ds-ink">
            {o.codigo}
            <BadgeVenta estado={o.estado_venta} />
            {congelada && <Badge variant="gray">congelada</Badge>}
          </p>
          <p className="truncate text-body-sm text-ds-gray-400">
            {o.tipo_casa ?? 'tipo —'} · sprint {o.sprint_actual}
          </p>
        </div>
        <span className="text-ds-gray-300">
          {p.expandida ? <CaretDown size={16} weight="bold" /> : <CaretRight size={16} weight="bold" />}
        </span>
      </button>

      {p.expandida && (
        <div className="border-t border-ds-gray-100 px-3 py-3 space-y-3">
          {p.loadingAvance && <Skeleton className="h-24 w-full" />}

          {!p.loadingAvance && p.avance && (
            <>
              <div className="flex items-center justify-between text-body-sm">
                <span className="text-ds-gray-400">Avance del sprint</span>
                <span className="font-semibold tabular-nums text-ds-ink">{p.avance.avance_sprint}%</span>
              </div>

              {/* Acciones de sprint / estado */}
              <div className="flex flex-wrap gap-1.5">
                <Button size="xs" variant="outline" icon={<ArrowLeft size={14} weight="bold" />} onClick={p.onRetroceder}>
                  Atrás
                </Button>
                {congelada ? (
                  <Button size="xs" variant="primary" icon={<Play size={14} weight="bold" />} onClick={p.onDescongelar}>
                    Descongelar
                  </Button>
                ) : (
                  <Button size="xs" variant="secondary" icon={<Pause size={14} weight="bold" />} onClick={p.onCongelar}>
                    Congelar
                  </Button>
                )}
                <Button size="xs" variant="outline" iconRight={<ArrowRight size={14} weight="bold" />} onClick={p.onAvanzar}>
                  Avanzar
                </Button>
              </div>

              {arrastradasPend > 0 && (
                <Button size="xs" variant="ghost" icon={<Check size={14} weight="bold" />} onClick={p.onCompletarArrastradas}>
                  Completar {arrastradasPend} arrastrada{arrastradasPend === 1 ? '' : 's'}
                </Button>
              )}

              {/* Sub-partidas del sprint */}
              <div className="divide-y divide-ds-gray-100 rounded-ds border border-ds-gray-100">
                {delSprint.map((sp) => {
                  const estado = sp.nc_causa
                    ? 'nc'
                    : sp.completada
                      ? 'ok'
                      : sp.pct_completado > 0
                        ? 'prog'
                        : 'none';
                  return (
                    <div key={sp.sub_partida_id} className="p-2 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-medium text-ds-ink">
                          <span className="font-mono">{sp.codigo}</span> · {sp.nombre}
                          {sp.es_critica && <span className="ml-1 text-[10px] font-bold text-amber-600">crítica</span>}
                        </p>
                        <span
                          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                            estado === 'ok'
                              ? 'bg-brand/20 text-ds-green-ink'
                              : estado === 'nc'
                                ? 'bg-ds-red/10 text-ds-red-200'
                                : 'bg-ds-gray-100 text-ds-gray-500'
                          }`}
                        >
                          {sp.pct_completado}%
                        </span>
                      </div>
                      {sp.nc_causa && (
                        <p className="text-[11px] text-ds-red-200">
                          NC: {p.causaLabel(sp.nc_causa)}
                          {sp.nc_nota ? ` — ${sp.nc_nota}` : ''}
                        </p>
                      )}
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => p.onCompletar(sp)}
                          title="Marcar completada"
                          className="flex h-7 w-7 items-center justify-center rounded-ds border border-ds-gray-200 text-ds-gray-500 hover:border-brand hover:text-ds-green-ink"
                        >
                          <Check size={14} weight="bold" />
                        </button>
                        <button
                          type="button"
                          onClick={() => p.onPct(sp)}
                          title="Fijar %"
                          className="flex h-7 w-7 items-center justify-center rounded-ds border border-ds-gray-200 text-ds-gray-500 hover:border-black hover:text-ds-ink"
                        >
                          <Percent size={14} weight="bold" />
                        </button>
                        <button
                          type="button"
                          onClick={() => p.onNC(sp)}
                          title="No cumplió"
                          className="flex h-7 w-7 items-center justify-center rounded-ds border border-ds-red/40 text-ds-red-200 hover:bg-ds-red/10"
                        >
                          <XCircle size={14} weight="bold" />
                        </button>
                      </div>
                    </div>
                  );
                })}
                {delSprint.length === 0 && (
                  <p className="p-3 text-center text-xs text-ds-gray-400">
                    Este sprint no tiene sub-partidas propias.
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={p.onCaptura}
                className="text-body-sm font-semibold text-ds-green-ink hover:underline"
              >
                Abrir captura completa →
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================ Chips / badges
function Chip({ label, activo, onClick }: { label: string; activo: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
        activo
          ? 'border-black bg-black text-white'
          : 'border-ds-gray-200 bg-ds-surface text-ds-gray-400 hover:border-ds-gray-400 hover:text-ds-ink'
      }`}
    >
      {label}
    </button>
  );
}

function FiltroChip({
  label,
  count,
  activo,
  onClick,
}: {
  label: string;
  count: number;
  activo: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
        activo
          ? 'border-brand bg-brand/15 text-ds-green-ink'
          : 'border-ds-gray-200 bg-ds-surface text-ds-gray-400 hover:border-ds-gray-400 hover:text-ds-ink'
      }`}
    >
      {label}
      <span className="ml-1 tabular-nums opacity-70">{count}</span>
    </button>
  );
}

function BadgeVenta({ estado }: { estado: EstadoVenta | null }) {
  if (!estado) return null;
  const m = VENTA_META[estado];
  return (
    <span
      title={`Venta: ${m.label}`}
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-ds-gray-200 bg-ds-surface text-[10px] font-bold text-ds-gray-500"
    >
      {m.letra}
    </span>
  );
}
