// Íconos del tablero de Gerencia. Inline (no dependemos del set de Produccion),
// trazo fino estilo "line icon" como la app original.
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;
const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export const IconInicio = (p: P) => (
  <svg {...base} {...p}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>
);
export const IconFlujo = (p: P) => (
  <svg {...base} {...p}><path d="M3 17l6-6 4 4 7-8" /><path d="M21 7v5M21 7h-5" /></svg>
);
export const IconPersonal = (p: P) => (
  <svg {...base} {...p}><circle cx="9" cy="8" r="3" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" /><path d="M16.5 6.5a3 3 0 0 1 0 5.8" /><path d="M17 15.5a5.5 5.5 0 0 1 3.5 4.5" /></svg>
);
export const IconCostos = (p: P) => (
  <svg {...base} {...p}><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" /><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></svg>
);
export const IconAlertas = (p: P) => (
  <svg {...base} {...p}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></svg>
);

export const IconPlus = (p: P) => (
  <svg {...base} strokeWidth={2.4} {...p}><path d="M12 5v14M5 12h14" /></svg>
);
export const IconClose = (p: P) => (
  <svg {...base} strokeWidth={2.2} {...p}><path d="M6 6l12 12M18 6 6 18" /></svg>
);
export const IconChevronLeft = (p: P) => (
  <svg {...base} strokeWidth={2.6} {...p}><path d="M15 5l-7 7 7 7" /></svg>
);
