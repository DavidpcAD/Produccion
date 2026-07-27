'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ds/Icon/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { MatrizAvance } from './MatrizAvance';
import { VENTA_META } from '@/lib/avance/venta';
import type { EstadoVenta, ObraAvance, Proyecto } from '@/lib/avance/types';

type Vista = 'lista' | 'matriz';

/**
 * Dashboard del módulo Avance. Chips de proyecto + toggle Lista/Matriz sobre las
 * obras habilitadas (en_ejecucion / en_espera). Réplica del CampoObrasPantalla
 * de obrascontrol usando el Adelante Design System.
 */
export default function AvancePage() {
  const router = useRouter();
  const { toast } = useToast();
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [proyectoSel, setProyectoSel] = useState<string | null>(null);
  const [obras, setObras] = useState<ObraAvance[]>([]);
  const [loadingObras, setLoadingObras] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [ventaFiltro, setVentaFiltro] = useState<EstadoVenta | null>(null);
  const [vista, setVista] = useState<Vista>('lista');

  useEffect(() => {
    fetch('/api/avance/proyectos')
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((d) => setProyectos(d.data ?? []))
      .catch(() => {});
  }, []);

  // Proyecto activo: '__TODOS__' → null (todas); si no, el seleccionado o el primero.
  const proyectoActivo =
    proyectoSel === '__TODOS__' ? null : (proyectoSel ?? proyectos[0]?.codigo ?? null);

  useEffect(() => {
    let cancel = false;
    setLoadingObras(true);
    const params = new URLSearchParams();
    if (proyectoActivo) params.set('proyecto', proyectoActivo);
    fetch(`/api/avance/obras?${params}`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d) => {
        if (!cancel) setObras(d.data ?? []);
      })
      .catch(() => {
        if (!cancel) { setObras([]); toast('No se pudieron cargar las obras. Reintentá.', 'error'); }
      })
      .finally(() => {
        if (!cancel) setLoadingObras(false);
      });
    return () => {
      cancel = true;
    };
  }, [proyectoActivo]);

  const obrasTexto = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return obras;
    return obras.filter((o) => [o.codigo, o.tipo_casa ?? ''].join(' ').toLowerCase().includes(q));
  }, [obras, busqueda]);

  const conteos = useMemo(() => {
    const c: Record<EstadoVenta, number> = { formalizada: 0, reservada: 0, disponible: 0, entregada: 0 };
    for (const o of obrasTexto) if (o.estado_venta) c[o.estado_venta]++;
    return c;
  }, [obrasTexto]);

  const obrasFiltradas = useMemo(
    () => (ventaFiltro ? obrasTexto.filter((o) => o.estado_venta === ventaFiltro) : obrasTexto),
    [obrasTexto, ventaFiltro],
  );

  const porBloque = useMemo(() => {
    const map = new Map<string, ObraAvance[]>();
    for (const o of obrasFiltradas) {
      const arr = map.get(o.bloque_letra) ?? [];
      arr.push(o);
      map.set(o.bloque_letra, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [obrasFiltradas]);

  return (
    <div className="p-6 space-y-5 max-w-[1600px] mx-auto animate-fade-in">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-heading font-bold text-black">Avance de obra</h1>
          <p className="text-ds-gray-400 text-body-sm">Elegí la obra donde vas a registrar avance.</p>
        </div>
        {/* Toggle Lista / Matriz */}
        <div className="flex shrink-0 rounded-ds border border-ds-gray-200 bg-white p-0.5">
          <ToggleBtn label="Vista de lista" activo={vista === 'lista'} onClick={() => setVista('lista')} icon="list" />
          <ToggleBtn label="Vista de matriz" activo={vista === 'matriz'} onClick={() => setVista('matriz')} icon="options" />
        </div>
      </div>

      {/* Chips de proyecto */}
      <div className="-mx-1 overflow-x-auto px-1">
        <div className="flex gap-2">
          <ProyectoChip label="Todos" activo={proyectoSel === '__TODOS__'} onClick={() => setProyectoSel('__TODOS__')} />
          {proyectos.map((p) => (
            <ProyectoChip
              key={p.codigo}
              label={p.codigo}
              activo={p.codigo === proyectoActivo}
              onClick={() => setProyectoSel(p.codigo)}
            />
          ))}
        </div>
      </div>

      {vista === 'matriz' && <MatrizAvance proyecto={proyectoActivo} />}

      {vista === 'lista' && (
        <div className="space-y-4">
          {/* Buscador */}
          <div className="relative max-w-md">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ds-gray-400">
              <Icon name="search" size="sm" color="currentColor" />
            </span>
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar casa: código o tipo…"
              className="h-10 w-full rounded-ds border border-ds-gray-200 pl-9 pr-3 text-sm text-black focus:border-black focus:outline-none"
            />
          </div>

          {/* Filtro estado de venta */}
          <div className="flex flex-wrap items-center gap-1.5">
            <FiltroChip label="Todas" count={obrasTexto.length} activo={ventaFiltro === null} onClick={() => setVentaFiltro(null)} />
            {(['formalizada', 'reservada', 'disponible', 'entregada'] as const).map((ev) => (
              <FiltroChip
                key={ev}
                label={VENTA_META[ev].label}
                count={conteos[ev]}
                activo={ventaFiltro === ev}
                onClick={() => setVentaFiltro(ventaFiltro === ev ? null : ev)}
              />
            ))}
          </div>

          {loadingObras && <Skeleton className="h-64 w-full" />}

          {!loadingObras && obras.length === 0 && (
            <p className="rounded-ds border border-dashed border-ds-gray-200 p-6 text-center text-body-sm text-ds-gray-400">
              No hay obras habilitadas en este proyecto. Pedile a un administrador que las habilite.
            </p>
          )}

          {!loadingObras && obras.length > 0 && obrasFiltradas.length === 0 && (
            <p className="rounded-ds border border-dashed border-ds-gray-200 p-6 text-center text-body-sm text-ds-gray-400">
              Ninguna obra coincide con la búsqueda.
            </p>
          )}

          <div className="space-y-4">
            {porBloque.map(([bloque, lista]) => (
              <section key={bloque}>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ds-gray-400">
                  Bloque {bloque || '—'}
                </h2>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {lista.map((o) => (
                    <button
                      key={o.codigo}
                      type="button"
                      onClick={() => router.push(`/avance/${encodeURIComponent(o.codigo)}`)}
                      className={`flex items-center justify-between rounded-ds border border-ds-gray-200 bg-white p-3 text-left transition-transform hover:border-ds-gray-300 active:scale-[0.98] ${
                        o.estado === 'en_espera' ? 'opacity-60' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-ds bg-brand/15 text-ds-green-ink">
                          <Icon name="place" size="md" color="currentColor" />
                        </div>
                        <div>
                          <p className="flex items-center gap-1.5 font-mono text-sm font-semibold text-black">
                            {o.codigo}
                            <BadgeVentaMini estado={o.estado_venta} />
                            {o.estado === 'en_espera' && (
                              <span className="rounded bg-ds-gray-100 px-1 py-0.5 text-[9px] font-medium text-ds-gray-500">
                                Congelada
                              </span>
                            )}
                          </p>
                          <p className="text-body-sm text-ds-gray-400">
                            {o.tipo_casa ?? 'tipo —'} · sprint {o.sprint_actual}
                          </p>
                        </div>
                      </div>
                      <span className="text-ds-gray-300">
                        <Icon name="arrow-right" size="sm" color="currentColor" />
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ToggleBtn({
  label,
  activo,
  onClick,
  icon,
}: {
  label: string;
  activo: boolean;
  onClick: () => void;
  icon: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-8 w-9 items-center justify-center rounded-ds ${
        activo ? 'bg-brand text-black' : 'text-ds-gray-400'
      }`}
    >
      <Icon name={icon} size="sm" color="currentColor" />
    </button>
  );
}

function ProyectoChip({ label, activo, onClick }: { label: string; activo: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
        activo ? 'border-black bg-black text-white' : 'border-ds-gray-200 bg-white text-ds-gray-400'
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
        activo ? 'border-brand bg-brand/15 text-ds-green-ink' : 'border-ds-gray-200 bg-white text-ds-gray-400'
      }`}
    >
      {label}
      <span className="ml-1 tabular-nums opacity-70">{count}</span>
    </button>
  );
}

function BadgeVentaMini({ estado }: { estado: EstadoVenta | null }) {
  if (!estado) return null;
  const m = VENTA_META[estado];
  return (
    <span
      title={`Venta: ${m.label}`}
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-ds-gray-200 bg-white text-[10px] font-bold text-ds-gray-500"
    >
      {m.letra}
    </span>
  );
}
