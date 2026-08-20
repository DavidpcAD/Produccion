'use client';

import { useEffect, useMemo, useState } from 'react';
import { PageShell, PageHeader } from '@/components/layout/Page';
import { Skeleton, SkeletonRows } from '@/components/ui/Skeleton';
import { Combobox } from '@/components/ui/Combobox';
import { Icon } from '@/components/ds/Icon/Icon';
import type { SemanaOperativa } from '@/lib/avance/mano-obra';
import type { HistoricoReporte, HistoricoObra, HistoricoSub } from '@/lib/avance/reporte-historico';
import { coincideBusqueda } from '@/lib/utilidades/buscar';

type Vista = 'sprint' | 'partida' | 'kanban';

/**
 * Histórico de avance — portado de obrascontrol (HistoricoVista). Foto del cierre
 * (o estado vivo) de una semana. Tres vistas: Por Sprint / Por Partida (grilla
 * sub-partida × obra agrupada) y Kanban (tarjetas de obra por sprint). Con
 * buscador de obra. Datos de /api/avance/reportes/historico?semana=N.
 */
export default function ReporteHistoricoPage() {
  const [semanas, setSemanas] = useState<SemanaOperativa[]>([]);
  const [semanaId, setSemanaId] = useState<number | null>(null);
  const [data, setData] = useState<HistoricoReporte | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>('sprint');
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    fetch('/api/avance/semanas')
      .then((r) => (r.ok ? r.json() : { semanas: [] }))
      .then((d) => {
        const s: SemanaOperativa[] = d.semanas ?? [];
        setSemanas(s);
        setSemanaId((prev) => prev ?? s[0]?.id ?? null);
      })
      .catch(() => setError('No se pudieron cargar las semanas.'));
  }, []);

  useEffect(() => {
    if (!semanaId) return;
    setCargando(true);
    setError(null);
    fetch(`/api/avance/reportes/historico?semana=${semanaId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Error');
        return r.json();
      })
      .then((d) => setData(d.data as HistoricoReporte))
      .catch((e) => {
        setData(null);
        setError(e instanceof Error ? e.message : 'Error al cargar el histórico.');
      })
      .finally(() => setCargando(false));
  }, [semanaId]);

  const semLabel = (s: SemanaOperativa) => `Semana ${s.numero_semana}/${s.anio} · ${s.fecha_inicio} → ${s.fecha_fin}`;

  // Obras (columnas) filtradas por el buscador, ordenadas por código.
  const obras = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const lista = [...(data?.obras ?? [])].sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }));
    return q ? lista.filter((o) => coincideBusqueda([o.codigo, o.tipo_casa ?? ''].join(' '), q)) : lista;
  }, [data, busqueda]);

  const subs = useMemo(
    () =>
      [...(data?.subs ?? [])].sort(
        (a, b) => a.sprint_numero - b.sprint_numero || a.codigo.localeCompare(b.codigo, 'es', { numeric: true }),
      ),
    [data],
  );

  const celda = (obra: string, subId: number): number | null => {
    const pct = data?.celdas?.[`${obra}|${subId}`];
    return pct == null ? null : pct;
  };
  const avanzo = (obra: string, subId: number) => !!data?.avanceSemana?.includes(`${obra}|${subId}`);

  const VISTAS: [Vista, string][] = [
    ['sprint', 'Por Sprint'],
    ['partida', 'Por Partida'],
    ['kanban', 'Kanban'],
  ];

  return (
    <PageShell>
      <PageHeader
        title="Histórico de avance"
        subtitle="Para la semana elegida: % de avance de cada sub-partida en cada obra. Agrupá por Sprint o por Partida, o mirá el Kanban de obras por sprint. Se resalta lo que avanzó justo esa semana."
      />

      <div className="my-4 flex flex-wrap items-center gap-3">
        <div className="max-w-md flex-1">
          <Combobox
            label="Semana operativa"
            value={String(semanaId ?? '')}
            onChange={(v) => setSemanaId(Number(v) || null)}
            options={semanas.map((s) => ({ value: String(s.id), label: semLabel(s) }))}
            placeholder={semanas.length ? 'Elegí una semana…' : 'Cargando…'}
          />
        </div>
        {data && (
          <span
            className={`rounded-ds px-3 py-1 text-xs font-semibold ${
              data.cerrada ? 'bg-ds-gray-100 text-ds-gray-500' : 'bg-brand/20 text-black'
            }`}
          >
            {data.cerrada ? 'Semana cerrada (foto)' : 'Semana en curso (estado vivo)'}
          </span>
        )}
      </div>

      {/* Toggle de vista + buscador de obra */}
      {data && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-ds border border-ds-gray-200 p-0.5 bg-ds-surface">
            {VISTAS.map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setVista(v)}
                className={'px-3.5 py-1.5 rounded-ds text-sm font-semibold transition ' + (vista === v ? 'bg-black text-white' : 'text-ds-gray-500 hover:text-ds-ink')}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="relative max-w-xs flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ds-gray-400">
              <Icon name="search" size="sm" color="currentColor" />
            </span>
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar obra…"
              className="h-10 w-full rounded-ds border border-ds-gray-200 pl-9 pr-3 text-sm text-ds-ink focus:border-black focus:outline-none"
            />
          </div>
          <span className="text-xs text-ds-gray-400">{obras.length} obra{obras.length === 1 ? '' : 's'}</span>
        </div>
      )}

      {data && obras.length > 0 && subs.length > 0 && vista !== 'kanban' && (
        <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ds-gray-500">
          <span className="font-semibold text-ds-ink">Cómo leer el color:</span>
          <span className="inline-flex items-center gap-1.5" title="Sub-partida terminada al 100% en esa obra"><span style={{ width: 14, height: 14, borderRadius: 4, background: CELDA.completo }} aria-hidden />Completo (100%)</span>
          <span className="inline-flex items-center gap-1.5" title="En proceso, entre 1% y 99%"><span style={{ width: 14, height: 14, borderRadius: 4, background: CELDA.avance }} aria-hidden />En avance</span>
          <span className="inline-flex items-center gap-1.5" title="Aplica a la obra pero aún sin avance (0%)"><span style={{ width: 14, height: 14, borderRadius: 4, background: CELDA.pendiente, border: '1px solid var(--ds-color-gray-200)' }} aria-hidden />Pendiente (0%)</span>
          <span className="inline-flex items-center gap-1.5" title="No aplica a esa obra o sin dato"><span style={{ width: 14, height: 14, borderRadius: 4, border: '1px solid var(--ds-color-gray-200)' }} aria-hidden />No aplica</span>
          <span className="inline-flex items-center gap-1.5" title="Sub-partida que avanzó justo en la semana elegida"><span style={{ width: 14, height: 14, borderRadius: 4, background: CELDA.completo, outline: '2px solid var(--color-brand)', outlineOffset: 1 }} aria-hidden />Avanzó esta semana</span>
        </div>
      )}

      {error && (
        <p className="my-4 rounded-ds border border-ds-red bg-ds-red/5 px-4 py-3 text-sm text-ds-red">{error}</p>
      )}

      {cargando ? (
        <div className="space-y-3">
          <Skeleton className="h-4 w-40" rounded="rounded-full" />
          <SkeletonRows rows={6} />
        </div>
      ) : !data ? (
        <p className="text-ds-gray-400">Elegí una semana.</p>
      ) : obras.length === 0 || subs.length === 0 ? (
        <p className="rounded-ds border border-dashed border-ds-gray-200 p-6 text-center text-sm text-ds-gray-400">
          {busqueda.trim() ? 'Ninguna obra coincide con la búsqueda.' : 'Sin datos para esta semana.'}
        </p>
      ) : vista === 'kanban' ? (
        <HistoricoKanban subs={subs} obras={obras} celda={celda} avanzo={avanzo} />
      ) : (
        <HistoricoGrilla subs={subs} obras={obras} celda={celda} avanzo={avanzo} agrupar={vista} />
      )}
    </PageShell>
  );
}

// Color de celda = % de avance. Distingue 0% (aplica sin avance) de "no aplica".
const CELDA = {
  completo: 'var(--color-brand)',
  avance: 'color-mix(in srgb, var(--color-brand) 35%, #fff)',
  pendiente: 'color-mix(in srgb, var(--ds-color-gray-400) 20%, transparent)',
};
function colorPct(pct: number | null): string {
  if (pct == null) return 'transparent';
  if (pct >= 100) return CELDA.completo;
  if (pct > 0) return CELDA.avance;
  return CELDA.pendiente;
}

// ─── Grilla: sub-partidas (filas, agrupadas por sprint o partida) × obras ───
function HistoricoGrilla({
  subs, obras, celda, avanzo, agrupar,
}: {
  subs: HistoricoSub[];
  obras: HistoricoObra[];
  celda: (o: string, s: number) => number | null;
  avanzo: (o: string, s: number) => boolean;
  agrupar: 'sprint' | 'partida';
}) {
  const grupos = useMemo(() => {
    const out: { clave: string; label: string; subs: HistoricoSub[] }[] = [];
    const idx = new Map<string, number>();
    const subsOrden =
      agrupar === 'partida'
        ? [...subs].sort(
            (a, b) =>
              a.partida_codigo.localeCompare(b.partida_codigo, 'es', { numeric: true }) ||
              a.codigo.localeCompare(b.codigo, 'es', { numeric: true }),
          )
        : subs; // ya ordenado por sprint, codigo
    for (const s of subsOrden) {
      const clave = agrupar === 'sprint' ? `s${s.sprint_numero}` : `p${s.partida_id}`;
      const label = agrupar === 'sprint' ? `Sprint ${s.sprint_numero}` : `${s.partida_codigo} — ${s.partida_nombre}`;
      let i = idx.get(clave);
      if (i === undefined) { i = out.length; idx.set(clave, i); out.push({ clave, label, subs: [] }); }
      out[i]!.subs.push(s);
    }
    return out;
  }, [subs, agrupar]);

  return (
    <div className="overflow-auto rounded-ds-lg border border-ds-gray-200 bg-ds-surface shadow-ds-01" style={{ maxHeight: '75vh' }}>
      <table className="border-collapse text-xs">
        <thead>
          <tr>
            {/* sticky en las CELDAS (no en <thead>/<tr>, que varios navegadores ignoran)
                para que la primera fila (encabezado de obras) quede anclada al hacer scroll. */}
            <th className="sticky left-0 top-0 z-30 border-b border-r border-ds-gray-200 bg-ds-gray-50 px-2 py-2 text-left">Sub-partida</th>
            {obras.map((o) => (
              <th key={o.codigo} className="sticky top-0 z-10 border-b border-ds-gray-200 bg-ds-gray-50 px-1 py-2 text-center font-mono" style={{ minWidth: 44 }}
                title={`${o.codigo}${o.tipo_casa ? ` · ${o.tipo_casa}` : ''}${o.sprint_actual != null ? ` · S${o.sprint_actual}` : ''}`}>
                <span className="inline-block whitespace-nowrap" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>{o.codigo}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grupos.map((g) => (
            <GrupoFilas key={g.clave} label={g.label} subs={g.subs} obras={obras} celda={celda} avanzo={avanzo} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GrupoFilas({
  label, subs, obras, celda, avanzo,
}: {
  label: string;
  subs: HistoricoSub[];
  obras: HistoricoObra[];
  celda: (o: string, s: number) => number | null;
  avanzo: (o: string, s: number) => boolean;
}) {
  return (
    <>
      <tr>
        <td colSpan={obras.length + 1} className="sticky left-0 border-y border-ds-gray-200 bg-ds-gray-100 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-ds-gray-500">
          {label}
        </td>
      </tr>
      {subs.map((s) => (
        <tr key={s.id} className="border-b border-ds-gray-100 last:border-0">
          <th className="sticky left-0 z-10 border-r border-ds-gray-200 bg-ds-surface px-2 py-1 text-left font-normal">
            <span className="whitespace-nowrap">
              {s.es_critica && <span className="mr-1 text-ds-red">●</span>}
              <span className="font-mono text-[10px] text-ds-gray-400">S{s.sprint_numero}</span>{' '}
              <span className="font-semibold">{s.codigo}</span> {s.nombre}
            </span>
          </th>
          {obras.map((o) => {
            const pct = celda(o.codigo, s.id);
            const marc = avanzo(o.codigo, s.id);
            return (
              <td key={o.codigo} className={`border-l border-ds-gray-100 px-1 py-1 text-center tabular-nums ${pct != null && pct >= 100 ? 'font-bold text-ds-green-ink' : ''}`}
                style={{ background: colorPct(pct), outline: marc ? '2px solid var(--color-brand)' : undefined, outlineOffset: -2 }}
                title={`${o.codigo} · ${s.codigo}: ${pct == null ? 's/d' : Math.round(pct) + '%'}${marc ? ' · avanzó esta semana' : ''}`}>
                {pct == null ? '' : pct >= 100 ? '✓' : Math.round(pct)}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}

// ─── Kanban histórico: columnas = sprint, tarjetas = obras en ese sprint ───
function HistoricoKanban({
  subs, obras, celda, avanzo,
}: {
  subs: HistoricoSub[];
  obras: HistoricoObra[];
  celda: (o: string, s: number) => number | null;
  avanzo: (o: string, s: number) => boolean;
}) {
  const subsPorSprint = useMemo(() => {
    const m = new Map<number, HistoricoSub[]>();
    for (const s of subs) { const arr = m.get(s.sprint_numero) ?? []; arr.push(s); m.set(s.sprint_numero, arr); }
    return m;
  }, [subs]);

  const sprints = useMemo(() => {
    const set = new Set<number>();
    for (const o of obras) if (o.sprint_actual != null) set.add(o.sprint_actual);
    return [...set].sort((a, b) => a - b);
  }, [obras]);

  if (sprints.length === 0) {
    return <p className="rounded-ds border border-dashed border-ds-gray-200 p-6 text-center text-sm text-ds-gray-400">Ninguna obra en ejecución con sprint asignado.</p>;
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {sprints.map((spr) => {
        const obrasDelSprint = obras.filter((o) => o.sprint_actual === spr);
        const subsSprint = subsPorSprint.get(spr) ?? [];
        return (
          <div key={spr} className="w-64 shrink-0">
            <div className="mb-2 rounded-ds bg-black px-3 py-1.5 text-sm font-semibold text-white">
              Sprint {spr} · {obrasDelSprint.length} obra{obrasDelSprint.length === 1 ? '' : 's'}
            </div>
            <div className="space-y-2">
              {obrasDelSprint.map((o) => {
                const aplican = subsSprint.filter((s) => celda(o.codigo, s.id) !== null);
                const criticas = aplican.filter((s) => s.es_critica);
                const noCriticas = aplican.filter((s) => !s.es_critica);
                return (
                  <div key={o.codigo} className="rounded-ds border border-ds-gray-200 bg-ds-surface p-2">
                    <p className="mb-1 font-mono text-xs font-semibold text-ds-ink">
                      {o.codigo} <span className="text-ds-gray-400">· {o.tipo_casa}</span>
                    </p>
                    {criticas.length > 0 && <SubLista titulo="Críticas" subs={criticas} obra={o.codigo} celda={celda} avanzo={avanzo} />}
                    {noCriticas.length > 0 && <SubLista titulo="No críticas" subs={noCriticas} obra={o.codigo} celda={celda} avanzo={avanzo} />}
                  </div>
                );
              })}
              {obrasDelSprint.length === 0 && <p className="text-xs text-ds-gray-300 px-1">Sin obras.</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SubLista({
  titulo, subs, obra, celda, avanzo,
}: {
  titulo: string;
  subs: HistoricoSub[];
  obra: string;
  celda: (o: string, s: number) => number | null;
  avanzo: (o: string, s: number) => boolean;
}) {
  return (
    <div className="mt-1">
      <p className="text-[9px] font-semibold uppercase tracking-wide text-ds-gray-400">{titulo}</p>
      <ul className="text-[11px]">
        {subs.map((s) => {
          const v = celda(obra, s.id);
          const marc = avanzo(obra, s.id);
          const completadaSemana = v != null && v >= 100 && marc;
          const txt = v == null ? '—' : completadaSemana ? '✓' : v >= 100 ? '100%' : `${Math.round(v)}%`;
          return (
            <li key={s.id} className={'flex items-center justify-between gap-1 py-0.5 ' + (marc ? 'border-l-2 border-brand pl-1' : '')}>
              <span className="min-w-0 flex-1 truncate text-ds-gray-600">{s.nombre}</span>
              <span className={'shrink-0 tabular-nums ' + (completadaSemana ? 'font-semibold text-ds-green-ink' : v != null && v >= 100 ? 'font-semibold text-ds-green-ink' : 'text-ds-gray-400')}>{txt}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
