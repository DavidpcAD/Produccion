// Helpers de formato para el reporte de utilidades. Funciones puras — se
// pueden usar tanto en el server (routes) como en el cliente (page).

export const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Setiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

export const MESES_CORTOS = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];

/** ₡1.234.567 — colones sin decimales. */
export function formatCRC(valor: number | null | undefined): string {
  const v = Number(valor ?? 0);
  return `₡${Math.round(v).toLocaleString('es-CR')}`;
}

/** Versión abreviada para ejes/etiquetas: ₡1.2bn, ₡340M, etc. */
export function abreviarCRC(valor: number | null | undefined): string {
  const v = Number(valor ?? 0);
  if (Math.abs(v) >= 1e9) return `₡${(v / 1e9).toFixed(1)}bn`;
  if (Math.abs(v) >= 1e6) return `₡${(v / 1e6).toFixed(0)}M`;
  return `₡${Math.round(v).toLocaleString('es-CR')}`;
}

/** Porcentaje ya expresado como fracción (0.18 → "18.0%"). */
export function formatPct(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return '—';
  return `${(Number(valor) * 100).toFixed(1)}%`;
}

/** El "bloque" de un lote es el prefijo antes del primer punto ("A.12" → "A"). */
export function extraerBloque(lote: string): string {
  const idx = lote.indexOf('.');
  return idx > 0 ? lote.slice(0, idx) : lote;
}

/** "Julio 2026" a partir de (anio, mes). */
export function etiquetaMes(anio: number, mes: number): string {
  return `${MESES[mes - 1] ?? mes} ${anio}`;
}
