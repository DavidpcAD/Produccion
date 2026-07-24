'use client';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ds/Icon/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { VENTA_META } from '@/lib/avance/venta';
import type { EstadoVenta, MatrizAvance as MatrizAvanceData } from '@/lib/avance/types';

/** Heatmap del % de avance: brand (lime) suave → fuerte. 0% gris, "no aplica" casi blanco. */
function estiloCelda(v: number | null): CSSProperties {
  if (v === null) return { background: '#fafafa', color: '#d4d4d8' };
  if (v <= 0) return { background: '#f4f4f5', color: '#a1a1aa' };
  const alpha = 0.12 + (Math.min(v, 100) / 100) * 0.88;
  return { background: `rgba(173, 208, 16, ${alpha})`, color: '#18181b' };
}

/** Columnas resumen (Crono / Gen): heatmap gris oscuro para distinguirlas del lime. */
function estiloResumen(v: number | null): CSSProperties {
  if (v === null || v <= 0) return { background: '#f3f3f3', color: '#AAAFB6' };
  const alpha = 0.16 + (Math.min(v, 100) / 100) * 0.74;
  return { background: `rgba(93, 99, 108, ${alpha})`, color: alpha > 0.55 ? '#fff' : '#18181b' };
}

interface Props {
  proyecto: string | null;
  semana?: number | null;
}

/**
 * Vista Matriz "Por Costos": filas = obras habilitadas, columnas = partidas
 * (agrupadas por grupo). Celda = promedio del % de las sub-partidas de esa
 * partida, coloreada como mapa de calor. Click en una celda → captura de la
 * obra enfocada en esa partida; click en el código → captura general.
 */
export function MatrizAvance({ proyecto, semana = null }: Props) {
  const router = useRouter();
  const [data, setData] = useState<MatrizAvanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [ventaFiltro, setVentaFiltro] = useState<EstadoVenta | null>(null);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    setError(false);
    const params = new URLSearchParams();
    if (proyecto) params.set('proyecto', proyecto);
    if (semana) params.set('semana', String(semana));
    fetch(`/api/avance/matriz?${params}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (!cancel) setData(d.data ?? null);
      })
      .catch(() => {
        if (!cancel) setError(true);
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [proyecto, semana]);

  const grupos = useMemo(() => {
    const out: { codigo: string | null; nombre: string | null; span: number }[] = [];
    for (const p of data?.partidas ?? []) {
      const ultimo = out[out.length - 1];
      if (ultimo && ultimo.codigo === p.grupo_codigo) ultimo.span += 1;
      else out.push({ codigo: p.grupo_codigo, nombre: p.grupo_nombre, span: 1 });
    }
    return out;
  }, [data]);

  if (loading) {
    return <Skeleton className="h-96 w-full" />;
  }
  if (error) {
    return (
      <p className="rounded-ds border border-dashed border-ds-gray-200 p-6 text-center text-body-sm text-ds-gray-400">
        No se pudo cargar la matriz.
      </p>
    );
  }
  if (!data || data.obras.length === 0) {
    return (
      <p className="rounded-ds border border-dashed border-ds-gray-200 p-6 text-center text-body-sm text-ds-gray-400">
        {proyecto
          ? 'No hay obras en ejecución en este proyecto.'
          : 'No hay obras en ejecución para mostrar.'}
      </p>
    );
  }

  const { partidas, obras } = data;
  const q = busqueda.trim().toLowerCase();
  const obrasTexto = q ? obras.filter((o) => o.codigo.toLowerCase().includes(q)) : obras;
  const conteos: Record<EstadoVenta, number> = {
    formalizada: 0,
    reservada: 0,
    disponible: 0,
    entregada: 0,
  };
  for (const o of obrasTexto) if (o.estado_venta) conteos[o.estado_venta]++;
  const obrasFiltradas = ventaFiltro
    ? obrasTexto.filter((o) => o.estado_venta === ventaFiltro)
    : obrasTexto;

  const irACaptura = (codigo: string) => router.push(`/avance/${encodeURIComponent(codigo)}`);
  const irAPartida = (codigo: string, partidaCodigo: string) =>
    router.push(`/avance/${encodeURIComponent(codigo)}?partida=${encodeURIComponent(partidaCodigo)}`);

  const thBase = 'h-7 bg-ds-gray-100 px-1 text-[11px] font-medium text-ds-gray-400';
  const cellBase = 'border-b border-l border-ds-gray-100 px-1 py-1 text-center text-xs tabular-nums';

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-ds-gray-400">
            <Icon name="search" size="sm" color="currentColor" />
          </span>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar obra…"
            className="h-8 w-64 rounded-ds border border-ds-gray-200 pl-8 pr-2 text-sm text-black focus:border-black focus:outline-none"
          />
        </div>
        <span className="text-body-sm text-ds-gray-400">
          {obrasFiltradas.length} obra{obrasFiltradas.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Filtro por estado de venta */}
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

      <div
        className="overflow-auto rounded-ds border border-ds-gray-200"
        style={{ maxHeight: 'calc(100vh - 320px)' }}
      >
        <table className="table-fixed border-collapse" style={{ width: 116 + (partidas.length + 2) * 56 }}>
          <colgroup>
            <col style={{ width: 116 }} />
            {partidas.map((p) => (
              <col key={p.id} style={{ width: 56 }} />
            ))}
            <col style={{ width: 56 }} />
            <col style={{ width: 56 }} />
          </colgroup>
          <thead>
            <tr>
              <th className={`${thBase} sticky top-0 left-0 z-30 border-b border-ds-gray-200`} />
              {grupos.map((g, i) => (
                <th
                  key={`${g.codigo ?? 'sin'}-${i}`}
                  colSpan={g.span}
                  className={`${thBase} sticky top-0 z-20 border-b border-l border-ds-gray-200 text-center uppercase tracking-wide`}
                >
                  {g.nombre ?? '—'}
                </th>
              ))}
              <th
                colSpan={2}
                className={`${thBase} sticky top-0 z-20 border-b border-l border-ds-gray-200 bg-ds-gray-200 text-center uppercase tracking-wide text-ds-gray-500`}
              >
                Resumen
              </th>
            </tr>
            <tr>
              <th className={`${thBase} sticky top-7 left-0 z-30 border-b border-ds-gray-200 text-left`}>
                Obra
              </th>
              {partidas.map((p) => (
                <th
                  key={p.id}
                  className={`${thBase} sticky top-7 z-20 overflow-hidden border-b border-l border-ds-gray-200`}
                  title={`${p.codigo} · ${p.nombre}`}
                >
                  <span className="block truncate text-[10px] font-normal leading-tight">{p.nombre}</span>
                </th>
              ))}
              <th
                className={`${thBase} sticky top-7 z-20 border-b border-l border-ds-gray-200 bg-ds-gray-200 text-ds-gray-500`}
                title="Avance del sprint (crono)"
              >
                <span className="mx-auto block w-fit"><Icon name="reloj" size="sm" color="currentColor" /></span>
              </th>
              <th className={`${thBase} sticky top-7 z-20 border-b border-l border-ds-gray-200 bg-ds-gray-200 text-ds-gray-500`}>
                Gen
              </th>
            </tr>
          </thead>
          <tbody>
            {obrasFiltradas.map((o) => (
              <tr
                key={o.codigo}
                className={`hover:bg-ds-gray-100/50 ${o.congelada ? 'opacity-50' : ''}`}
                title={o.congelada ? `${o.codigo} — congelada (en espera por NC)` : undefined}
              >
                <td className="sticky left-0 z-10 overflow-hidden border-b border-ds-gray-100 bg-white px-2 py-1">
                  <button
                    type="button"
                    onClick={() => irACaptura(o.codigo)}
                    className="flex items-center gap-1 text-left hover:underline"
                    title={`Abrir captura de ${o.codigo}`}
                  >
                    <span className="truncate font-mono text-xs font-semibold text-black">{o.codigo}</span>
                    <BadgeVentaMini estado={o.estado_venta} />
                    {o.congelada && <span className="text-[9px] text-ds-gray-400">*</span>}
                  </button>
                </td>
                {partidas.map((p) => {
                  const v = o.celdas[p.id] ?? null;
                  return (
                    <td key={p.id} className="overflow-hidden border-b border-l border-ds-gray-100 p-0" style={estiloCelda(v)}>
                      <button
                        type="button"
                        title={`${o.codigo} · ${p.codigo} ${p.nombre} — abrir esta partida`}
                        onClick={() => irAPartida(o.codigo, p.codigo)}
                        className="block h-full w-full px-1 py-1 text-center text-xs tabular-nums text-inherit hover:ring-2 hover:ring-inset hover:ring-brand"
                      >
                        {v === null ? '—' : v}
                      </button>
                    </td>
                  );
                })}
                <td className={`${cellBase} font-semibold`} style={estiloResumen(o.avance_crono)}>
                  {o.avance_crono}
                </td>
                <td className={`${cellBase} font-semibold`} style={estiloResumen(o.avance_general)}>
                  {o.avance_general}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-ds-gray-400">
        Cada celda = % de la partida (pasá el mouse por el título para ver el nombre completo). Tocá
        una celda para abrir esa partida, o el código de obra para la captura.
      </p>
    </div>
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
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-ds-gray-200 bg-white text-[9px] font-bold text-ds-gray-500"
    >
      {m.letra}
    </span>
  );
}
