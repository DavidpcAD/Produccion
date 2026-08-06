'use client';

import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import { PageShell, PageHeader } from '@/components/layout/Page';
import { Combobox } from '@/components/ui/Combobox';
import type { SemanaOperativa } from '@/lib/avance/mano-obra';
import type { M2Partida, M2Reporte } from '@/lib/avance/reporte-m2';

/**
 * Reporte de m² producidos por partida / sub-partida (semana + acumulado) —
 * portado de obrascontrol (M2Vista). Descompone el KPI "M² construidos semana"
 * al nivel de cada sub-partida. Dos vistas: Por Partida (desglose por obra) y
 * Matriz (sub × obra). Datos de /api/avance/reportes/m2.
 */

type Vista = 'partida' | 'matriz';
type Metrica = 'semana' | 'acumulado';
const EPS = 0.001;

const fmt = (n: number | undefined) =>
  n == null ? '—' : n.toLocaleString('es-CR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function obrasDeSub(m: M2Reporte, subId: number, soloAvance: boolean) {
  return m.obras
    .map((o) => ({ o, c: m.celdas[`${o.codigo}|${subId}`] }))
    .filter((x) => x.c != null && (soloAvance ? x.c.s > EPS : x.c.a > EPS || x.c.s > EPS))
    .sort((a, b) => a.o.codigo.localeCompare(b.o.codigo));
}

export default function ReporteM2Page() {
  const [semanas, setSemanas] = useState<SemanaOperativa[]>([]);
  const [semanaId, setSemanaId] = useState<number | null>(null);
  const [m, setM] = useState<M2Reporte | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [vista, setVista] = useState<Vista>('partida');
  const [metrica, setMetrica] = useState<Metrica>('semana');
  const [soloAvance, setSoloAvance] = useState(true);
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    fetch('/api/avance/semanas')
      .then((r) => (r.ok ? r.json() : { semanas: [] }))
      .then((d) => {
        const s: SemanaOperativa[] = d.semanas ?? [];
        setSemanas(s);
        setSemanaId((prev) => prev ?? (s[0] ? Number(s[0].id) : null));
      })
      .catch(() => setError('No se pudieron cargar las semanas.'));
  }, []);

  useEffect(() => {
    if (!semanaId) return;
    setCargando(true);
    setError(null);
    fetch(`/api/avance/reportes/m2?semana=${semanaId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Error');
        return r.json();
      })
      .then((d) => setM(d.data as M2Reporte))
      .catch((e) => setError(e instanceof Error ? e.message : 'Error al cargar el reporte.'))
      .finally(() => setCargando(false));
  }, [semanaId]);

  const semanaLabel = (s: SemanaOperativa) =>
    `Semana ${s.numero_semana}/${s.anio} · ${s.fecha_inicio} → ${s.fecha_fin}`;

  return (
    <PageShell>
      <PageHeader
        title="Reporte de m²"
        subtitle="m² de construcción producidos, desglosados por partida y sub-partida: lo de la semana elegida y el acumulado. Con la vista 'Matriz por obra' ves cuántos m² aportó cada obra. Sirve para medir el volumen físico de producción, no el dinero."
      />

      <div className="my-4 max-w-md">
        <Combobox
          label="Semana operativa"
          value={String(semanaId ?? '')}
          onChange={(v) => setSemanaId(Number(v) || null)}
          options={semanas.map((s) => ({ value: String(s.id), label: semanaLabel(s) }))}
          placeholder={semanas.length ? 'Elegí una semana…' : 'Cargando…'}
        />
      </div>

      {error && (
        <p className="my-4 rounded-ds border border-ds-red bg-ds-red/5 px-4 py-3 text-sm text-ds-red">
          {error}
        </p>
      )}

      {cargando && !m ? (
        <p className="text-ds-gray-400">Cargando m²…</p>
      ) : !m ? (
        <p className="text-ds-gray-400">Elegí una semana.</p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span title="Por Partida: totales por partida/sub-partida. Matriz por obra: cuánto aportó cada obra.">
              <Toggle
                value={vista}
                onChange={setVista}
                opts={[
                  ['partida', 'Por Partida'],
                  ['matriz', 'Matriz por obra'],
                ]}
              />
            </span>
            {vista === 'matriz' && (
              <span title="Semana: m² producidos solo en la semana elegida. Acumulado: total a la fecha.">
                <Toggle
                  value={metrica}
                  onChange={setMetrica}
                  opts={[
                    ['semana', 'Semana'],
                    ['acumulado', 'Acumulado'],
                  ]}
                />
              </span>
            )}
            <label className="flex cursor-pointer items-center gap-1.5 rounded-ds border border-ds-gray-200 px-2.5 py-1 text-xs" title="Oculta las filas sin m² producidos, para ver solo lo que se movió">
              <input
                type="checkbox"
                checked={soloAvance}
                onChange={(e) => setSoloAvance(e.target.checked)}
              />
              Solo con avance
            </label>
            {vista === 'matriz' && (
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar obra…"
                className="h-8 w-56 rounded-ds border border-ds-gray-200 px-3 text-sm"
              />
            )}
            <span className="text-xs text-ds-gray-500">
              Total semana <strong className="text-ds-ink">{fmt(m.total_semana)}</strong> m² ·
              acumulado <strong className="text-ds-ink">{fmt(m.total_acumulado)}</strong> m² ·{' '}
              {m.cerrada ? 'foto del cierre' : 'estado vivo (semana abierta)'}
            </span>
          </div>

          {!m.base_semanal && (
            <p className="mb-2 rounded-ds border border-ds-yellow bg-ds-yellow/10 px-3 py-1.5 text-xs text-ds-yellow-ink">
              Esta semana no tiene línea base ni cierre previo: el m² de la semana no es fiable. El
              acumulado sí es válido.
            </p>
          )}

          {vista === 'partida' ? (
            <M2PorPartida m={m} soloAvance={soloAvance} />
          ) : (
            <M2Matriz m={m} metrica={metrica} soloAvance={soloAvance} busqueda={busqueda} />
          )}
        </>
      )}
    </PageShell>
  );
}

function Toggle<T extends string>({
  value,
  onChange,
  opts,
}: {
  value: T;
  onChange: (v: T) => void;
  opts: [T, string][];
}) {
  return (
    <div className="inline-flex rounded-ds border border-ds-gray-200 p-0.5">
      {opts.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
            value === v ? 'bg-brand text-black' : 'text-ds-gray-500 hover:text-black'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ---- Vista Por Partida ----
function M2PorPartida({ m, soloAvance }: { m: M2Reporte; soloAvance: boolean }) {
  const [expandidas, setExpandidas] = useState<Set<number>>(new Set());

  const partidas = useMemo(() => {
    const subOk = (s: M2Partida['subs'][number]) => !soloAvance || s.m2_semana > EPS;
    return m.partidas
      .map((p) => {
        const subs = p.subs.filter(subOk);
        return {
          ...p,
          subs,
          m2_semana: subs.reduce((a, s) => a + s.m2_semana, 0),
          m2_acumulado: subs.reduce((a, s) => a + s.m2_acumulado, 0),
        };
      })
      .filter((p) => p.subs.length > 0);
  }, [m.partidas, soloAvance]);

  const totSemana = partidas.reduce((a, p) => a + p.m2_semana, 0);
  const totAcum = partidas.reduce((a, p) => a + p.m2_acumulado, 0);

  function toggle(id: number) {
    setExpandidas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (partidas.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-ds-gray-400">
        No hay producción de m² {soloAvance ? 'en la semana' : 'registrada'} para esta semana.
      </p>
    );
  }

  return (
    <div className="overflow-auto rounded-ds border border-ds-gray-200" style={{ maxHeight: 'calc(100vh - 220px)' }}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="sticky top-0 z-10 h-8 border-b border-ds-gray-200 bg-ds-gray-100 px-3 text-left text-xs font-medium text-ds-gray-500">
              Partida · Sub-partida · Obra
            </th>
            <th className="sticky top-0 z-10 h-8 w-32 border-b border-l border-ds-gray-200 bg-ds-gray-100 px-3 text-right text-xs font-medium text-ds-gray-500" title="m² producidos solo en la semana elegida">
              m² Semana
            </th>
            <th className="sticky top-0 z-10 h-8 w-32 border-b border-l border-ds-gray-200 bg-ds-gray-100 px-3 text-right text-xs font-medium text-ds-gray-500" title="m² producidos acumulados a la fecha (todas las semanas)">
              m² Acumulado
            </th>
          </tr>
        </thead>
        <tbody>
          {partidas.map((p) => (
            <PartidaBloque key={p.partida_id} p={p} m={m} soloAvance={soloAvance} expandidas={expandidas} toggle={toggle} />
          ))}
          <tr className="border-t-2 border-ds-gray-200 bg-ds-gray-50 font-semibold">
            <td className="px-3 py-2">TOTAL</td>
            <td className="border-l border-ds-gray-200 px-3 py-2 text-right tabular-nums">{fmt(totSemana)}</td>
            <td className="border-l border-ds-gray-200 px-3 py-2 text-right tabular-nums">{fmt(totAcum)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function PartidaBloque({
  p,
  m,
  soloAvance,
  expandidas,
  toggle,
}: {
  p: M2Partida;
  m: M2Reporte;
  soloAvance: boolean;
  expandidas: Set<number>;
  toggle: (id: number) => void;
}) {
  return (
    <>
      <tr className="bg-ds-gray-100/70 font-medium">
        <td className="px-3 py-1.5">
          <span className="font-mono text-xs text-ds-gray-500">{p.partida_codigo}</span> {p.partida_nombre}
        </td>
        <td className="border-l border-ds-gray-200 px-3 py-1.5 text-right tabular-nums">{fmt(p.m2_semana)}</td>
        <td className="border-l border-ds-gray-200 px-3 py-1.5 text-right tabular-nums">{fmt(p.m2_acumulado)}</td>
      </tr>
      {p.subs.map((s) => {
        const abierta = expandidas.has(s.id);
        const obras = abierta ? obrasDeSub(m, s.id, soloAvance) : [];
        return (
          <FragmentoSub key={s.id} s={s} abierta={abierta} obras={obras} onToggle={() => toggle(s.id)} />
        );
      })}
    </>
  );
}

function FragmentoSub({
  s,
  abierta,
  obras,
  onToggle,
}: {
  s: M2Partida['subs'][number];
  abierta: boolean;
  obras: ReturnType<typeof obrasDeSub>;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="border-t border-ds-gray-100 hover:bg-ds-gray-50">
        <td className="py-1 pr-3 pl-6">
          <button type="button" onClick={onToggle} className="flex w-full items-center gap-1 text-left">
            <span className="inline-flex w-3 text-ds-gray-400">{abierta ? '▾' : '▸'}</span>
            <span>
              <span className="font-mono text-xs text-ds-gray-500">{s.codigo}</span> {s.nombre}
              <span className="ml-1 text-xs text-ds-gray-400">· S{s.sprint_numero}</span>
            </span>
          </button>
        </td>
        <td
          className="border-l border-ds-gray-100 px-3 py-1 text-right tabular-nums"
          style={{ color: s.m2_semana > EPS ? 'var(--color-ds-green-ink)' : undefined }}
        >
          {s.m2_semana > EPS ? fmt(s.m2_semana) : '—'}
        </td>
        <td className="border-l border-ds-gray-100 px-3 py-1 text-right tabular-nums">{fmt(s.m2_acumulado)}</td>
      </tr>
      {abierta &&
        (obras.length === 0 ? (
          <tr className="bg-ds-gray-50">
            <td className="py-1 pr-3 pl-14 text-xs text-ds-gray-400" colSpan={3}>
              Sin obras con avance para esta sub-partida.
            </td>
          </tr>
        ) : (
          obras.map(({ o, c }) => (
            <tr key={o.codigo} className="bg-ds-gray-50 text-xs">
              <td className="py-0.5 pr-3 pl-14">
                <span className="font-mono text-xs">{o.codigo}</span>
                <span className="ml-1 text-xs text-ds-gray-400">
                  {o.tipo_casa ?? ''} · S{o.sprint_actual ?? '-'}
                </span>
              </td>
              <td
                className="border-l border-ds-gray-100 px-3 py-0.5 text-right tabular-nums"
                style={{ color: c && c.s > EPS ? 'var(--color-ds-green-ink)' : undefined }}
              >
                {c && c.s > EPS ? fmt(c.s) : '—'}
              </td>
              <td className="border-l border-ds-gray-100 px-3 py-0.5 text-right tabular-nums">{fmt(c?.a)}</td>
            </tr>
          ))
        ))}
    </>
  );
}

// ---- Vista Matriz ----
function M2Matriz({
  m,
  metrica,
  soloAvance,
  busqueda,
}: {
  m: M2Reporte;
  metrica: Metrica;
  soloAvance: boolean;
  busqueda: string;
}) {
  const obras = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return m.obras
      .filter((o) => !soloAvance || o.m2_semana > EPS)
      .filter((o) => (q ? o.codigo.toLowerCase().includes(q) : true));
  }, [m.obras, soloAvance, busqueda]);

  const celda = (obra: string, sub: number) => m.celdas[`${obra}|${sub}`];

  const partidas = useMemo(() => {
    const visible = (subId: number) =>
      obras.some((o) => {
        const c = m.celdas[`${o.codigo}|${subId}`];
        return c != null && (soloAvance ? c.s > EPS : c.a > EPS || c.s > EPS);
      });
    return m.partidas
      .map((p) => ({ ...p, subs: p.subs.filter((s) => visible(s.id)) }))
      .filter((p) => p.subs.length > 0);
  }, [m.partidas, m.celdas, obras, soloAvance]);

  const totalW = 260 + obras.length * 64;

  function celdaStyle(val: number, tuvoSemana: boolean): { txt: string; style: CSSProperties } {
    if (val <= EPS) return { txt: '·', style: { background: 'var(--ds-color-gray-100)', color: 'var(--ds-color-gray-300)' } };
    const linea: CSSProperties = tuvoSemana ? { boxShadow: 'inset 3px 0 0 var(--color-brand-200)' } : {};
    return { txt: fmt(val), style: { background: 'var(--color-brand-soft)', color: 'var(--color-ds-green-ink)', ...linea } };
  }

  if (obras.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-ds-gray-400">
        Ninguna obra con producción de m² {soloAvance ? 'en la semana' : ''}.
      </p>
    );
  }

  const thBase = 'bg-ds-gray-100 px-1 text-xs font-medium text-ds-gray-500';
  return (
    <div className="overflow-auto rounded-ds border border-ds-gray-200" style={{ maxHeight: 'calc(100vh - 220px)' }}>
      <table className="table-fixed border-collapse" style={{ width: totalW }}>
        <colgroup>
          <col style={{ width: 260 }} />
          {obras.map((o) => (
            <col key={o.codigo} style={{ width: 64 }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th className={`${thBase} sticky top-0 left-0 z-30 border-b border-ds-gray-200 text-left`} style={{ height: 34 }}>
              Sub-partida
            </th>
            {obras.map((o) => (
              <th
                key={o.codigo}
                className={`${thBase} sticky top-0 z-20 overflow-hidden border-b border-l border-ds-gray-200 align-bottom`}
                title={`${o.codigo} · ${o.tipo_casa ?? ''} · S${o.sprint_actual ?? '-'}`}
              >
                <span className="block truncate font-mono text-[10px]">{o.codigo}</span>
                <span className="block truncate text-[9px] font-normal" style={{ color: 'var(--color-ds-green-ink)' }}>
                  {fmt(metrica === 'semana' ? o.m2_semana : o.m2_acumulado)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {partidas.map((p) => (
            <MatrizPartida
              key={p.partida_id}
              p={p}
              obras={obras}
              metrica={metrica}
              celda={celda}
              celdaStyle={celdaStyle}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MatrizPartida({
  p,
  obras,
  metrica,
  celda,
  celdaStyle,
}: {
  p: M2Partida;
  obras: M2Reporte['obras'];
  metrica: Metrica;
  celda: (obra: string, sub: number) => { s: number; a: number } | undefined;
  celdaStyle: (val: number, tuvoSemana: boolean) => { txt: string; style: CSSProperties };
}) {
  return (
    <>
      <tr>
        <td
          className="sticky left-0 z-10 border-y border-ds-gray-200 bg-ds-gray-100 px-2 py-1 text-xs font-medium"
          colSpan={1 + obras.length}
        >
          {p.partida_codigo} — {p.partida_nombre}
          <span className="ml-2 text-ds-gray-500">
            ({metrica === 'semana' ? fmt(p.m2_semana) : fmt(p.m2_acumulado)} m²)
          </span>
        </td>
      </tr>
      {p.subs.map((s) => (
        <tr key={s.id}>
          <td className="sticky left-0 z-10 truncate border-b border-ds-gray-200 bg-ds-surface px-2 py-1 text-xs">
            <span className="font-mono text-[10px] text-ds-gray-500">{s.codigo}</span> {s.nombre}
          </td>
          {obras.map((o) => {
            const c = celda(o.codigo, s.id);
            const val = c ? (metrica === 'semana' ? c.s : c.a) : 0;
            const info = celdaStyle(val, !!c && c.s > EPS);
            return (
              <td
                key={o.codigo}
                className="border-b border-l border-ds-gray-200 px-1 py-1 text-right text-[10px] tabular-nums"
                style={info.style}
              >
                {info.txt}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
