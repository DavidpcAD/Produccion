'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ArrowLeft,
  ArrowRight,
  CaretDown,
  Check,
  MagnifyingGlass,
  Pause,
  Percent,
  Play,
  Plus,
  XCircle,
} from '@phosphor-icons/react';
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
} from '@/lib/avance/types';
import type { SprintCatalogoDetalle } from '@/lib/avance/sprints';
import type { IniciarLoteBody } from '@/lib/avance/campo';
import { AvanceRapidoDialog, type SubRapido } from './kanban/AvanceRapidoDialog';
import { RegistrarNCDialog } from './kanban/RegistrarNCDialog';
import { CongelarObraDialog } from './kanban/CongelarObraDialog';
import { HabilitarLoteDialog } from './kanban/HabilitarLoteDialog';

const VENTAS: EstadoVenta[] = ['formalizada', 'reservada', 'disponible', 'entregada'];
const SPRING = { type: 'spring' as const, stiffness: 420, damping: 34, mass: 0.8 };

/**
 * Vista Kanban del módulo Avance — tablero por sprint con captura rápida inline.
 * Extraída de la antigua página /avance/kanban para vivir como una vista más del
 * dashboard de Avance (el padre controla proyecto y muestra el toggle de vistas).
 * Reusa los mismos endpoints (/api/avance/obras, /sprints, /causas, PUT .../avance,
 * POST .../sprint, .../estado, obras/iniciar-lote). Pulido con motion: columnas con
 * acento, tarjetas con hover/expand suave y reflow animado al mover obras de sprint.
 */
export function KanbanAvance({ proyecto }: { proyecto: string | null }) {
  const router = useRouter();
  const { toast } = useToast();
  const reduce = useReducedMotion();

  const [obras, setObras] = useState<ObraAvance[]>([]);
  const [loadingObras, setLoadingObras] = useState(true);
  const [sprints, setSprints] = useState<SprintCatalogoDetalle[]>([]);
  const [causas, setCausas] = useState<Causa[]>([]);

  const [busqueda, setBusqueda] = useState('');
  const [ventaFiltro, setVentaFiltro] = useState<EstadoVenta | null>(null);

  // Varias tarjetas pueden quedar abiertas a la vez: se cierran solo cuando el
  // usuario las cierra (antes abrir una cerraba la anterior).
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());
  const [avanceMap, setAvanceMap] = useState<Record<string, AvanceSprint>>({});
  const [loadingAvance, setLoadingAvance] = useState<string | null>(null);

  const [pctDe, setPctDe] = useState<{ codigo: string; sub: SubRapido } | null>(null);
  const [ncDe, setNcDe] = useState<{ codigo: string; sub: AvanceSubPartida } | null>(null);
  const [congelarDe, setCongelarDe] = useState<string | null>(null);
  const [loteOpen, setLoteOpen] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
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
    if (proyecto) params.set('proyecto', proyecto);
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
  }, [proyecto, toast]);

  useEffect(() => {
    cargarObras();
  }, [cargarObras]);

  const cargarAvance = useCallback(
    // silent = refresco tras registrar avance: NO muestra el skeleton (evita que
    // la tarjeta colapse y se reabra); mantiene los datos viejos hasta que llegan
    // los nuevos y se actualizan en su lugar.
    async (codigo: string, silent = false) => {
      if (!silent) setLoadingAvance(codigo);
      try {
        const r = await fetch(`/api/avance/obras/${encodeURIComponent(codigo)}/avance`);
        const d = await r.json();
        if (r.ok) setAvanceMap((m) => ({ ...m, [codigo]: d.data }));
        else toast(d.error ?? 'No se pudo cargar el avance', 'error');
      } catch {
        toast('No se pudo cargar el avance', 'error');
      } finally {
        if (!silent) setLoadingAvance(null);
      }
    },
    [toast],
  );

  function toggleExpand(codigo: string) {
    setExpandidas((prev) => {
      const next = new Set(prev);
      if (next.has(codigo)) {
        next.delete(codigo);
      } else {
        next.add(codigo);
        if (!avanceMap[codigo]) cargarAvance(codigo);
      }
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
      await cargarAvance(codigo, true); // refresco silencioso (sin colapsar la tarjeta)
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
      await cargarAvance(codigo, true);
    } catch {
      toast('No se pudo completar', 'error');
    }
  }

  const obrasFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return obras.filter((o) => {
      if (ventaFiltro && o.estado_venta !== ventaFiltro) return false;
      if (q && !`${o.codigo} ${o.tipo_casa ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [obras, busqueda, ventaFiltro]);

  const ventaConteos = useMemo(() => {
    const c: Record<EstadoVenta, number> = { formalizada: 0, reservada: 0, disponible: 0, entregada: 0 };
    const q = busqueda.trim().toLowerCase();
    for (const o of obras) {
      if (q && !`${o.codigo} ${o.tipo_casa ?? ''}`.toLowerCase().includes(q)) continue;
      if (o.estado_venta) c[o.estado_venta]++;
    }
    return c;
  }, [obras, busqueda]);

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
    <div className="space-y-4">
      {/* Buscador + filtro de venta + acción */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ds-gray-400">
            <MagnifyingGlass size={16} weight="bold" />
          </span>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar obra…"
            className="h-9 w-56 rounded-ds border border-ds-gray-200 bg-ds-surface pl-8 pr-2 text-sm text-ds-ink transition-colors focus:border-black focus:outline-none"
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
        <div className="ml-auto">
          <Button variant="outline" icon={<Plus size={16} weight="bold" />} onClick={() => setLoteOpen(true)}>
            Habilitar lote
          </Button>
        </div>
      </div>

      {loadingObras && (
        <div className="flex gap-3 overflow-hidden">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-80 w-[320px] shrink-0 rounded-ds-lg" />
          ))}
        </div>
      )}

      {!loadingObras && obrasFiltradas.length === 0 && (
        <p className="rounded-ds-lg border border-dashed border-ds-gray-200 p-8 text-center text-body-sm text-ds-gray-400">
          No hay obras habilitadas para mostrar. Usá «Habilitar lote» para poner obras en ejecución.
        </p>
      )}

      {!loadingObras && obrasFiltradas.length > 0 && (
        <div className="flex gap-4 overflow-x-auto pb-4 [scrollbar-width:thin]">
          {columnas.map((col) => {
            const total = col.obras.length;
            return (
              <section key={col.numero} className="flex w-[320px] shrink-0 flex-col">
                <header
                  className={`sticky top-0 z-[1] mb-2 flex items-center justify-between gap-2 rounded-ds-lg border px-3 py-2.5 backdrop-blur ${
                    col.es_espera
                      ? 'border-ds-yellow/40 bg-ds-yellow/10'
                      : 'border-ds-gray-200 bg-ds-surface/90'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${col.es_espera ? 'bg-ds-yellow' : 'bg-brand'}`}
                    />
                    <span className="truncate text-sm font-bold text-ds-ink">{col.nombre}</span>
                    {col.es_espera && <Badge variant="yellow">espera</Badge>}
                  </div>
                  <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-ds-gray-100 px-1.5 text-xs font-bold tabular-nums text-ds-gray-500">
                    {total}
                  </span>
                </header>

                <motion.div layout={!reduce} className="flex flex-col gap-2">
                  <AnimatePresence initial={false} mode="popLayout">
                    {col.obras.map((o) => (
                      <ObraCard
                        key={o.codigo}
                        reduce={!!reduce}
                        obra={o}
                        expandida={expandidas.has(o.codigo)}
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
                        onDescongelar={async () => {
                          const ok = await cambiarEstado(o.codigo, 'en_ejecucion');
                          // Recargar el avance para que reaparezcan las subpartidas
                          // capturables tras reactivar (antes quedaba data vieja).
                          if (ok) await cargarAvance(o.codigo, true);
                        }}
                      />
                    ))}
                  </AnimatePresence>
                  {total === 0 && (
                    <p className="rounded-ds-lg border border-dashed border-ds-gray-200 p-5 text-center text-xs text-ds-gray-300">
                      Sin obras
                    </p>
                  )}
                </motion.div>
              </section>
            );
          })}
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
          const ok = await cambiarEstado(congelarDe, 'en_espera', nota ? `${causa} — ${nota}` : causa);
          if (ok) {
            toast(`${congelarDe}: congelada`, 'success');
            const cod = congelarDe;
            setCongelarDe(null);
            setExpandidas((prev) => { const n = new Set(prev); n.delete(cod); return n; });
          }
        }}
      />

      <HabilitarLoteDialog
        open={loteOpen}
        pending={pending}
        onClose={() => setLoteOpen(false)}
        onConfirmar={habilitarLote}
      />
    </div>
  );
}

// ============================================================ Tarjeta de obra
interface CardProps {
  reduce: boolean;
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
  // Obra que ya avanzó de sprint en la semana abierta → tarjeta púrpura (señal
  // de "ya avanzó esta semana", igual que en obrascontrol).
  const avanzoEstaSemana = !!o.avanzo_esta_semana && !congelada;
  const pct = p.avance?.avance_sprint ?? null;

  const delSprint = (p.avance?.sub_partidas ?? []).filter(
    (s) => s.sprint_numero === p.avance?.sprint && !s.arrastrada,
  );
  // Pendientes arrastradas de sprints anteriores (sin completar) — se listan para
  // poder capturarlas sin salir del Kanban.
  const arrastradas = (p.avance?.sub_partidas ?? []).filter((s) => s.arrastrada && !s.completada);
  const arrastradasPend = arrastradas.length;
  // Cada pendiente arrastrada queda ANCLADA a su sprint original (no se mezcla
  // con las del sprint actual): se agrupan por su sprint y siguen ahí hasta
  // que se completen.
  const arrastradasPorSprint = (() => {
    const m = new Map<number, AvanceSubPartida[]>();
    for (const sp of arrastradas) {
      const arr = m.get(sp.sprint_numero);
      if (arr) arr.push(sp);
      else m.set(sp.sprint_numero, [sp]);
    }
    return Array.from(m.entries()).sort((a, b) => a[0] - b[0]);
  })();

  return (
    <motion.div
      layout={!p.reduce}
      initial={p.reduce ? false : { opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={p.reduce ? undefined : { opacity: 0, scale: 0.97 }}
      transition={SPRING}
      whileHover={p.reduce ? undefined : { y: -2 }}
      className={`overflow-hidden rounded-ds-lg border shadow-ds-01 transition-shadow hover:shadow-ds-03 ${
        avanzoEstaSemana
          ? 'border-[#8b5cf6] bg-[#8b5cf6]/10'
          : `bg-ds-surface ${p.expandida ? 'border-ds-gray-300' : 'border-ds-gray-200'}`
      } ${congelada ? 'opacity-75' : ''}`}
    >
      <button
        type="button"
        onClick={p.onToggle}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
      >
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-mono text-sm font-semibold text-ds-ink">
            {o.codigo}
            <BadgeVenta estado={o.estado_venta} />
            {congelada && <Badge variant="gray">congelada</Badge>}
            {avanzoEstaSemana && (
              <span className="rounded-full bg-[#8b5cf6]/15 px-1.5 py-0.5 text-[10px] font-bold text-[#6d28d9]">
                avanzó
              </span>
            )}
          </p>
          <p className="truncate text-body-sm text-ds-gray-400">
            {o.tipo_casa ?? 'tipo —'} · sprint {o.sprint_actual}
          </p>
        </div>
        <motion.span
          className="shrink-0 text-ds-gray-300"
          animate={{ rotate: p.expandida ? 0 : -90 }}
          transition={SPRING}
        >
          <CaretDown size={16} weight="bold" />
        </motion.span>
      </button>

      {/* Barra de progreso del sprint (visible siempre que se conozca) */}
      {pct !== null && (
        <div className="mx-3 mb-2 h-1.5 overflow-hidden rounded-full bg-ds-gray-100">
          <motion.div
            className="h-full rounded-full bg-brand"
            initial={false}
            animate={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
            transition={SPRING}
          />
        </div>
      )}

      <AnimatePresence initial={false}>
        {p.expandida && (
          <motion.div
            key="body"
            initial={p.reduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={p.reduce ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-3 border-t border-ds-gray-100 px-3 py-3">
              {p.loadingAvance && <Skeleton className="h-24 w-full" />}

              {!p.loadingAvance && p.avance && (
                <>
                  <div className="flex items-center justify-between text-body-sm">
                    <span className="text-ds-gray-400">Avance del sprint</span>
                    <span className="font-semibold tabular-nums text-ds-ink">{p.avance.avance_sprint}%</span>
                  </div>

                  {congelada && (
                    <p className="flex items-center gap-1.5 rounded-ds bg-ds-gray-100 px-2.5 py-1.5 text-[11px] font-medium text-ds-gray-500">
                      <Pause size={13} weight="bold" /> Obra congelada — descongelala para avanzar o registrar.
                    </p>
                  )}

                  <div className="flex flex-wrap gap-1.5">
                    <Button size="xs" variant="outline" icon={<ArrowLeft size={14} weight="bold" />} onClick={p.onRetroceder} disabled={congelada}>
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
                    <Button size="xs" variant="outline" iconRight={<ArrowRight size={14} weight="bold" />} onClick={p.onAvanzar} disabled={congelada}>
                      Avanzar
                    </Button>
                  </div>

                  {arrastradasPend > 0 && !congelada && (
                    <Button size="xs" variant="ghost" icon={<Check size={14} weight="bold" />} onClick={p.onCompletarArrastradas}>
                      Completar {arrastradasPend} arrastrada{arrastradasPend === 1 ? '' : 's'}
                    </Button>
                  )}

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
                        <div key={sp.sub_partida_id} className="space-y-1.5 p-2">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-medium text-ds-ink">
                              <span className="font-mono">{sp.codigo}</span> · {sp.nombre}
                              {sp.es_critica && <span className="ml-1 text-[10px] font-bold text-ds-yellow-ink">crítica</span>}
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
                            <IconBtn title="Marcar completada" tone="ok" disabled={congelada} onClick={() => p.onCompletar(sp)}>
                              <Check size={14} weight="bold" />
                            </IconBtn>
                            <IconBtn title="Fijar %" tone="ink" disabled={congelada} onClick={() => p.onPct(sp)}>
                              <Percent size={14} weight="bold" />
                            </IconBtn>
                            <IconBtn title="No cumplió" tone="nc" disabled={congelada} onClick={() => p.onNC(sp)}>
                              <XCircle size={14} weight="bold" />
                            </IconBtn>
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

                  {arrastradas.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-ds-red-200">
                        <span className="inline-block h-2 w-2 rounded-full bg-ds-red" />
                        Pendientes arrastradas ({arrastradas.length})
                      </p>
                      {/* Agrupadas por su sprint original: se quedan en su sprint hasta completarse. */}
                      <div className="overflow-hidden rounded-ds border border-ds-red/20">
                        {arrastradasPorSprint.map(([spr, subs]) => (
                          <div key={spr}>
                            <div className="flex items-center gap-2 bg-ds-red/5 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-ds-red-200">
                              Sprint {spr}
                              <span className="ml-auto font-semibold text-ds-red-200/80">{subs.length}</span>
                            </div>
                            <div className="divide-y divide-ds-gray-100">
                              {subs.map((sp) => (
                                <div key={sp.sub_partida_id} className="space-y-1.5 p-2">
                                  <div className="flex items-start justify-between gap-2">
                                    <p className="text-xs font-medium text-ds-ink">
                                      <span className="font-mono">{sp.codigo}</span> · {sp.nombre}
                                    </p>
                                    <span className="shrink-0 rounded-full bg-ds-gray-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-ds-gray-500">
                                      {sp.pct_completado}%
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <IconBtn title="Marcar completada" tone="ok" disabled={congelada} onClick={() => p.onCompletar(sp)}>
                                      <Check size={14} weight="bold" />
                                    </IconBtn>
                                    <IconBtn title="Fijar %" tone="ink" disabled={congelada} onClick={() => p.onPct(sp)}>
                                      <Percent size={14} weight="bold" />
                                    </IconBtn>
                                    <IconBtn title="No cumplió" tone="nc" disabled={congelada} onClick={() => p.onNC(sp)}>
                                      <XCircle size={14} weight="bold" />
                                    </IconBtn>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

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
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function IconBtn({
  title,
  tone,
  onClick,
  children,
  disabled,
}: {
  title: string;
  tone: 'ok' | 'ink' | 'nc';
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const cls = disabled
    ? 'border-ds-gray-100 bg-ds-gray-100 text-ds-gray-300 cursor-not-allowed'
    : tone === 'ok'
      ? 'border-ds-gray-200 text-ds-gray-500 hover:border-brand hover:text-ds-green-ink'
      : tone === 'nc'
        ? 'border-ds-red/40 text-ds-red-200 hover:bg-ds-red/10'
        : 'border-ds-gray-200 text-ds-gray-500 hover:border-black hover:text-ds-ink';
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`flex h-7 w-7 items-center justify-center rounded-ds border transition-colors active:scale-95 ${cls}`}
    >
      {children}
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
