'use client';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

// Gráficos del tablero (SVG puro, sin librerías). Medimos el ancho del
// contenedor y dibujamos a tamaño real (viewBox en px) para no distorsionar
// puntos ni texto.

// useLayoutEffect en el cliente (sin parpadeo al medir), useEffect en el
// servidor (SSR) para no tirar el warning de React.
const useIsoLayout = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

function useAncho<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useIsoLayout(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => setW(el.clientWidth || fallback);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fallback]);
  return [ref, w] as const;
}

function escala(serie: number[], extra: number[] = []) {
  const vals = [...serie, ...extra.filter((n) => Number.isFinite(n))];
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  return { min, span: max - min || 1 };
}

/** Línea compacta para las tarjetas principal/ancha (sin ejes), con punto final.
 *  `stroke` lo fija quien la usa: oscuro sobre la tarjeta lima, lima sobre la oscura. */
export function Sparkline({ serie, stroke = 'var(--kpi-ink)' }: { serie: number[]; stroke?: string }) {
  const [ref, W] = useAncho<HTMLSpanElement>(180);
  const H = 56, pad = 6;
  const { min, span } = escala(serie);
  const n = serie.length;
  const x = (i: number) => (i / (n - 1)) * (W - pad * 2) + pad;
  const y = (v: number) => H - pad - ((v - min) / span) * (H - pad * 2);
  const d = serie.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  return (
    <span className="kpi-card__spark" ref={ref} aria-hidden>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <path d={d} fill="none" stroke={stroke} strokeWidth={2.5}
          strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={x(n - 1)} cy={y(serie[n - 1])} r={4} fill={stroke} />
      </svg>
    </span>
  );
}

/** Gráfico de tendencia del detalle: área lima + meta punteada + valor actual. */
export function TrendChart({
  serie, metaNum, meta, valor, nombre,
}: { serie: number[]; metaNum: number | null; meta: string; valor: string; nombre: string }) {
  const gid = useId();
  const [ref, W] = useAncho<HTMLDivElement>(520);
  const H = 190, padT = 28, padB = 14, padX = 2;
  const { min, span } = escala(serie, metaNum != null ? [metaNum] : []);
  const n = serie.length;
  const x = (i: number) => (i / (n - 1)) * (W - padX * 2) + padX;
  const y = (v: number) => H - padB - ((v - min) / span) * (H - padT - padB);
  const linea = serie.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const area = `${linea} L${x(n - 1).toFixed(1)} ${H - padB} L${x(0).toFixed(1)} ${H - padB} Z`;
  const lx = x(n - 1), ly = y(serie[n - 1]);
  const my = metaNum != null ? y(metaNum) : null;
  return (
    <div className="kpi-chart" ref={ref}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}
        role="img" aria-label={`Tendencia de ${nombre}, últimas 12 semanas`}>
        <defs>
          <linearGradient id={`g-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--kpi-lime)" stopOpacity="0.4" />
            <stop offset="100%" stopColor="var(--kpi-lime)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {my != null && (
          <>
            <line x1={padX} y1={my} x2={W - padX} y2={my} stroke="rgba(255,255,255,0.32)"
              strokeWidth={1.5} strokeDasharray="5 5" />
            <text x={padX + 2} y={my - 7} fill="rgba(255,255,255,0.55)" fontSize="11"
              fontWeight={700} fontFamily="var(--kpi-font)">META {meta}</text>
          </>
        )}
        <path d={area} fill={`url(#g-${gid})`} />
        <path d={linea} fill="none" stroke="var(--kpi-lime)" strokeWidth={3}
          strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={lx} cy={ly} r={5} fill="var(--kpi-lime)" />
        <text x={lx - 12} y={ly - 10} textAnchor="end" fill="#fff" fontSize="20" fontStyle="italic"
          fontWeight={900} fontFamily="var(--kpi-display)">{valor}</text>
      </svg>
    </div>
  );
}
