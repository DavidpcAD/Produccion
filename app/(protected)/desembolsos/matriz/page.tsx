'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageShell, PageHeader } from '@/components/layout/Page';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatCRC } from '@/lib/utilidades/format';
import type {
  CreditoPuenteCancelacion,
  CreditoPuenteHitoEnRango,
  DesembolsoProyectado,
  EstadoTramite,
  RespuestaDesembolsos,
  SemanaInfo,
} from '@/lib/desembolsos/matriz';

/**
 * Matriz de desembolsos — cartera semanal banco × hito × semana. Portado de
 * `MatrizPantalla` de adelante-flujo-desembolsos (vista de lectura).
 *
 * El cálculo (monto por hito, fecha proyectada, real desembolsado, distribución)
 * lo hace el servidor (/api/desembolsos/matriz → lib/desembolsos/matriz.ts, que
 * lee las vistas de AdelanteDB esquema `app`). Acá se agrupa por banco y se
 * ubica cada hito en su columna de semana según FechaProyectada.
 */

const ESTADO_META: Record<EstadoTramite, { label: string; variant: 'gray' | 'blue' | 'yellow' | 'green' | 'red' }> = {
  PLANEADO: { label: 'Planeado', variant: 'gray' },
  VISITA_SOLICITADA: { label: 'Visita solicitada', variant: 'blue' },
  VISITA_REALIZADA: { label: 'Visita realizada', variant: 'yellow' },
  DESEMBOLSADO: { label: 'Desembolsado', variant: 'green' },
  CANCELADO: { label: 'Cancelado', variant: 'red' },
};

/** Fecha ISO → objeto Date (UTC medianoche). */
function iso(d: string): Date {
  return new Date(d + 'T00:00:00Z');
}

/** ¿fecha (ISO) cae dentro de la semana [desde,hasta] (ISO, inclusive)? */
function enSemana(fechaIso: string | null, s: SemanaInfo): boolean {
  if (!fechaIso) return false;
  return fechaIso >= s.desde && fechaIso <= s.hasta;
}

function addDaysIso(base: string, days: number): string {
  const d = iso(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function MatrizPage() {
  const [desde, setDesde] = useState<string | null>(null);
  const [data, setData] = useState<RespuestaDesembolsos | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [verBacklog, setVerBacklog] = useState(false);

  const cargar = useCallback((desdeParam: string | null) => {
    setCargando(true);
    setError(null);
    const qs = desdeParam ? `?desde=${desdeParam}&hasta=${addDaysIso(desdeParam, 27)}` : '';
    fetch(`/api/desembolsos/matriz${qs}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Error');
        return r.json();
      })
      .then((d: RespuestaDesembolsos) => {
        setData(d);
        setDesde(d.desde);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Error al cargar la matriz.'))
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    cargar(null);
  }, [cargar]);

  const filtro = q.trim().toLowerCase();
  const coincide = (d: DesembolsoProyectado) =>
    !filtro ||
    [d.Cliente, d.CodigoLote, d.CodigoCaso, d.AbreviaturaProyecto, d.NombreBloque, d.NombreModelo]
      .filter(Boolean)
      .some((x) => String(x).toLowerCase().includes(filtro));

  // Agrupar desembolsos en rango por banco.
  const porBanco = useMemo(() => {
    if (!data) return [] as { IDBan: number; AbrevBanco: string; ColorBanco: string | null; filas: DesembolsoProyectado[] }[];
    const map = new Map<number, { IDBan: number; AbrevBanco: string; ColorBanco: string | null; filas: DesembolsoProyectado[] }>();
    for (const d of data.desembolsos) {
      if (!coincide(d)) continue;
      let g = map.get(d.IDBan);
      if (!g) {
        g = { IDBan: d.IDBan, AbrevBanco: d.AbrevBanco, ColorBanco: d.ColorBanco, filas: [] };
        map.set(d.IDBan, g);
      }
      g.filas.push(d);
    }
    return Array.from(map.values());
  }, [data, filtro]); // eslint-disable-line react-hooks/exhaustive-deps

  const semanas = data?.semanas ?? [];

  // Totales por semana (montos de los desembolsos visibles).
  const totalPorSemana = useMemo(() => {
    const arr = semanas.map(() => 0);
    if (!data) return arr;
    for (const d of data.desembolsos) {
      if (!coincide(d)) continue;
      const idx = semanas.findIndex((s) => enSemana(d.FechaProyectada, s));
      if (idx >= 0) arr[idx] += d.MontoHitoEsperado ?? 0;
    }
    return arr;
  }, [data, semanas, filtro]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalVisible = totalPorSemana.reduce((a, b) => a + b, 0);
  const cp = data?.creditoPuente;

  return (
    <PageShell>
      <PageHeader
        title="Matriz de desembolsos"
        subtitle="Cartera semanal banco × hito × semana. Cada hito se ubica en la semana de su fecha proyectada de desembolso."
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          disabled={!desde || cargando}
          onClick={() => desde && cargar(addDaysIso(desde, -28))}
        >
          ← 4 semanas antes
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!desde || cargando}
          onClick={() => desde && cargar(addDaysIso(desde, 28))}
        >
          4 semanas después →
        </Button>
        <Button variant="ghost" size="sm" disabled={cargando} onClick={() => cargar(null)}>
          Hoy
        </Button>
        <input
          type="search"
          placeholder="Buscar caso, lote, cliente…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-10 flex-1 min-w-[220px] rounded-ds-xl border-2 border-transparent bg-ds-surface px-4 text-sm shadow-ds-01 focus:border-black focus:outline-none"
        />
        {data && (
          <span className="text-sm text-ds-gray-500">
            {data.desde} → {data.hasta} · Total visible{' '}
            <strong className="text-ds-ink">{formatCRC(totalVisible)}</strong>
          </span>
        )}
      </div>

      {error && (
        <p className="my-4 rounded-ds border border-ds-red bg-ds-red/5 px-4 py-3 text-sm text-ds-red">
          {error}
        </p>
      )}

      {cargando && !data ? (
        <SkeletonRows rows={6} />
      ) : data ? (
        <div className="space-y-6">
          {/* Encabezado de semanas + totales */}
          <section className="overflow-x-auto rounded-ds-lg border border-ds-gray-200 bg-ds-surface shadow-ds-01">
            <table className="w-full">
              <thead>
                <tr className="border-b border-ds-gray-200 bg-ds-gray-100">
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ds-gray-500">
                    Semana
                  </th>
                  {semanas.map((s) => (
                    <th
                      key={s.desde}
                      className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-ds-gray-500"
                    >
                      S{s.numero} · {s.etiqueta}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-3 py-2 text-sm font-semibold">Total proyectado</td>
                  {totalPorSemana.map((t, i) => (
                    <td key={i} className="px-3 py-2 text-right font-mono text-sm tabular-nums">
                      {t ? formatCRC(t) : '—'}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </section>

          {porBanco.length === 0 && (
            <p className="text-ds-gray-400">Sin desembolsos proyectados en este rango.</p>
          )}

          {porBanco.map((g) => (
            <BancoSection key={g.IDBan} grupo={g} semanas={semanas} />
          ))}

          {/* Backlog */}
          {data.backlog.length > 0 && (
            <section className="rounded-ds-lg border border-ds-gray-200 bg-ds-surface shadow-ds-01">
              <button
                type="button"
                onClick={() => setVerBacklog((v) => !v)}
                className="flex w-full items-center justify-between border-b border-ds-gray-200 bg-ds-gray-100 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-ds-gray-500"
              >
                <span>Backlog · {data.backlog.length} pendientes fuera de rango / sin fecha</span>
                <span>{verBacklog ? '−' : '+'}</span>
              </button>
              {verBacklog && (
                <div className="divide-y divide-ds-gray-100">
                  {(filtro ? data.backlogExpandido.filter(coincide) : data.backlog).map((d) => (
                    <div key={`${d.IDCaso}-${d.IDHito}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-sm">
                      <span className="font-medium">{d.Cliente}</span>
                      <span className="text-ds-gray-500">{d.AbreviaturaProyecto} · {d.NombreBloque ?? '—'} · Lote {d.CodigoLote}</span>
                      <HitoTag d={d} />
                      <span className="ml-auto font-mono tabular-nums">{formatCRC(d.MontoHitoEsperado)}</span>
                      <span className="text-xs text-ds-gray-400">{d.FechaProyectada || 'sin fecha'}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Crédito Puente */}
          {cp && (cp.hitos.length > 0 || cp.cancelaciones.length > 0) && (
            <CreditoPuenteSection hitos={cp.hitos} cancelaciones={cp.cancelaciones} />
          )}
        </div>
      ) : null}
    </PageShell>
  );
}

function HitoTag({ d }: { d: DesembolsoProyectado }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs"
      style={{ borderColor: d.ColorHito ?? '#ddd' }}
    >
      {d.ColorHito && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.ColorHito }} />}
      <strong>{d.CodigoHito}</strong>
      <span className="text-ds-gray-400">{d.PorcentajeHito}%</span>
    </span>
  );
}

function BancoSection({
  grupo,
  semanas,
}: {
  grupo: { IDBan: number; AbrevBanco: string; ColorBanco: string | null; filas: DesembolsoProyectado[] };
  semanas: SemanaInfo[];
}) {
  const totalBanco = grupo.filas.reduce((a, d) => a + (d.MontoHitoEsperado ?? 0), 0);
  const filas = [...grupo.filas].sort(
    (a, b) => (a.FechaProyectada || '').localeCompare(b.FechaProyectada || '') || a.OrdenEnEsquema - b.OrdenEnEsquema,
  );

  return (
    <section className="overflow-x-auto rounded-ds-lg border border-ds-gray-200 bg-ds-surface shadow-ds-01">
      <div className="flex items-center gap-2 border-b border-ds-gray-200 bg-ds-gray-100 px-3 py-2">
        {grupo.ColorBanco && (
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: grupo.ColorBanco }} />
        )}
        <span className="text-sm font-semibold">{grupo.AbrevBanco}</span>
        <span className="text-xs text-ds-gray-500">{grupo.filas.length} hitos</span>
        <span className="ml-auto font-mono text-sm font-semibold tabular-nums">{formatCRC(totalBanco)}</span>
      </div>
      <table className="w-full">
        <thead>
          <tr className="border-b border-ds-gray-200 text-xs uppercase tracking-wide text-ds-gray-500">
            <th className="px-3 py-2 text-left">Caso / Cliente</th>
            <th className="px-3 py-2 text-left">Lote</th>
            <th className="px-3 py-2 text-left">Hito</th>
            <th className="px-3 py-2 text-left">Semana</th>
            <th className="px-3 py-2 text-right">Monto</th>
            <th className="px-3 py-2 text-right">Real</th>
            <th className="px-3 py-2 text-left">Estado</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((d) => {
            const idx = semanas.findIndex((s) => enSemana(d.FechaProyectada, s));
            const s = idx >= 0 ? semanas[idx] : null;
            const meta = ESTADO_META[d.EstadoTramite] ?? ESTADO_META.PLANEADO;
            return (
              <tr key={`${d.IDCaso}-${d.IDHito}`} className="border-b border-ds-gray-100 last:border-0">
                <td className="px-3 py-2 text-sm">
                  <div className="font-medium">{d.Cliente}</div>
                  <div className="text-xs text-ds-gray-400">
                    {d.CodigoCaso ?? `Caso ${d.IDCaso}`}
                    {d.EsReservado ? ' · reservado' : ''}
                    {d.EsDerivado ? ' · derivado' : ''}
                  </div>
                </td>
                <td className="px-3 py-2 text-sm text-ds-gray-500">
                  {d.AbreviaturaProyecto} · {d.NombreBloque ?? '—'} · {d.CodigoLote}
                </td>
                <td className="px-3 py-2"><HitoTag d={d} /></td>
                <td className="px-3 py-2 text-xs text-ds-gray-500">
                  {s ? `S${s.numero}` : '—'}
                  <div className="text-ds-gray-400">{d.FechaProyectada || 'sin fecha'}</div>
                </td>
                <td className="px-3 py-2 text-right font-mono text-sm tabular-nums">{formatCRC(d.MontoHitoEsperado)}</td>
                <td className="px-3 py-2 text-right font-mono text-sm tabular-nums text-ds-gray-500">
                  {d.RealDesembolsado_CRC != null ? formatCRC(d.RealDesembolsado_CRC) : '—'}
                </td>
                <td className="px-3 py-2"><Badge variant={meta.variant}>{meta.label}</Badge></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function CreditoPuenteSection({
  hitos,
  cancelaciones,
}: {
  hitos: CreditoPuenteHitoEnRango[];
  cancelaciones: CreditoPuenteCancelacion[];
}) {
  return (
    <section className="overflow-x-auto rounded-ds-lg border border-ds-gray-200 bg-ds-surface shadow-ds-01">
      <div className="border-b border-ds-gray-200 bg-ds-gray-100 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-ds-gray-500">
        Crédito puente · {hitos.length} hitos · {cancelaciones.length} cancelaciones
      </div>
      {hitos.length > 0 && (
        <table className="w-full">
          <thead>
            <tr className="border-b border-ds-gray-200 text-xs uppercase tracking-wide text-ds-gray-500">
              <th className="px-3 py-2 text-left">Banco CP</th>
              <th className="px-3 py-2 text-left">Proyecto / Lote</th>
              <th className="px-3 py-2 text-left">Hito</th>
              <th className="px-3 py-2 text-right">Esperado</th>
              <th className="px-3 py-2 text-right">Pendiente</th>
              <th className="px-3 py-2 text-left">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {hitos.map((h) => (
              <tr key={h.IDCreditoPuenteLoteHito} className="border-b border-ds-gray-100 last:border-0 text-sm">
                <td className="px-3 py-2">{h.AbrevBancoCP}</td>
                <td className="px-3 py-2 text-ds-gray-500">{h.AbreviaturaProyecto} · {h.CodigoLote}</td>
                <td className="px-3 py-2">
                  <strong>{h.CodigoHito}</strong> <span className="text-ds-gray-400">{h.Porcentaje}%</span>
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{formatCRC(h.MontoHitoEsperado_CRC)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{formatCRC(h.MontoPendiente_CRC)}</td>
                <td className="px-3 py-2 text-xs text-ds-gray-400">{h.FechaProyectada || 'sin fecha'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {cancelaciones.length > 0 && (
        <div className="divide-y divide-ds-gray-100 border-t border-ds-gray-200">
          {cancelaciones.map((c) => (
            <div key={c.IDCreditoPuenteLote} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-sm">
              <Badge variant="red">
                {c.Estado === 'CANCELACION_CONFIRMADA' ? 'Cancelación confirmada' : 'Cancelación programada'}
              </Badge>
              <span className="text-ds-gray-500">{c.AbrevBancoCP} · {c.AbreviaturaProyecto} · {c.CodigoLote}</span>
              <span className="ml-auto font-mono tabular-nums text-ds-red">
                −{formatCRC(c.MontoConfirmadoAlBanco_CRC ?? c.MontoCanceladoAlBanco_CRC)}
              </span>
              <span className="text-xs text-ds-gray-400">
                {c.FechaConfirmacionCancelacion ?? c.FechaCancelacionAlBanco}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
