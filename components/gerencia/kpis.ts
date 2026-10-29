// ─────────────────────────────────────────────────────────────────────────
// Catálogo de KPIs del tablero de Gerencia — PORTADO EXACTO de la app "KPI
// Adelante" de Marcos (https://adelante-kpi.vercel.app). Los datos crudos (RAW),
// las fórmulas (meta/sem. anterior/prom. 12 sem./tendencia) y el formato son los
// mismos que usa esa app. Son DATOS DE EJEMPLO del prototipo.
//
// Cada valor mostrado es el ÚLTIMO punto de su serie de 12 semanas. El resto
// (meta, badge de tendencia, promedio) se DERIVA de la serie + el target.
// ─────────────────────────────────────────────────────────────────────────

export type Good = 'up' | 'down' | 'none';
export type Direccion = 'up' | 'down' | 'flat';
export type Sentimiento = 'good' | 'bad' | 'neutral';
export type CategoriaId = 'produccion' | 'materiales' | 'personas' | 'ventas' | 'finanzas';
export type SlotSize = 'hero' | 'wide' | 'sm';

/** App (sistema de Adelante) de donde sale cada dato → nombre para el chip del detalle. */
export const APP_NOMBRE: Record<string, string> = {
  A3: 'Tres Amigos', B0: 'Boletas', H4: 'Horas', V5: 'Ventas', BC: 'Business Central',
};

const AREA_A_CAT: Record<string, CategoriaId> = {
  'Producción': 'produccion', 'Materiales': 'materiales', 'Personas': 'personas',
  'Ventas': 'ventas', 'Finanzas': 'finanzas',
};

export interface Categoria { id: CategoriaId; nombre: string }
/** Orden de los chips del selector (TODOS lo agrega el componente). */
export const CATEGORIAS: Categoria[] = [
  { id: 'produccion', nombre: 'Producción' },
  { id: 'materiales', nombre: 'Materiales' },
  { id: 'personas', nombre: 'Personas' },
  { id: 'ventas', nombre: 'Ventas' },
  { id: 'finanzas', nombre: 'Finanzas' },
];
export const NOMBRE_CATEGORIA: Record<CategoriaId, string> =
  Object.fromEntries(CATEGORIAS.map((c) => [c.id, c.nombre])) as Record<CategoriaId, string>;

interface Raw {
  id: string; area: string; app: string; label: string; unit: string;
  pct?: boolean; dec?: number; good: Good; target?: number;
  series: number[]; by: string; rows: [string, string, number][]; note: string;
}

// ── Datos crudos (copiados tal cual de la app original) ──────────────────────
const RAW: Raw[] = [
  { id: 'ppc', area: 'Producción', app: 'A3', label: 'PPC semanal', unit: '% del plan cumplido', pct: true, good: 'up', target: 85,
    series: [71, 74, 69, 76, 80, 77, 73, 79, 82, 75, 76, 78],
    by: 'Por cuadrilla', rows: [['Losa 1', '84%', 6], ['Losa 2', '79%', 2], ['Soldadura', '81%', -3], ['Repello', '72%', -5], ['Enchape', '74%', 1]],
    note: 'Porcentaje de tareas comprometidas en el sprint que se completaron.' },
  { id: 'entregadas', area: 'Producción', app: 'A3', label: 'Viviendas entregadas', unit: 'viviendas / semana', good: 'up', target: 15,
    series: [9, 11, 10, 12, 12, 13, 11, 14, 12, 13, 15, 14],
    by: 'Por etapa', rows: [['Etapa 1', '6', 1], ['Etapa 2', '5', -1], ['Etapa 3', '3', 0]],
    note: 'Viviendas que salieron de la última estación (Pintura y Reparaciones) esta semana.' },
  { id: 'takt', area: 'Producción', app: 'A3', label: 'Takt de Losa', unit: 'días por vivienda', dec: 1, good: 'down', target: 4,
    series: [4.9, 4.8, 4.7, 4.8, 4.5, 4.6, 4.4, 4.5, 4.3, 4.4, 4.3, 4.2],
    by: 'Por cuadrilla', rows: [['Losa 1', '4,0', -0.2], ['Losa 2', '4,4', 0]],
    note: 'Losa marca el ritmo de toda la cascada: cada día que baja aquí se gana aguas abajo.' },
  { id: 'wip', area: 'Producción', app: 'A3', label: 'Viviendas en proceso', unit: 'viviendas abiertas', good: 'none',
    series: [58, 60, 61, 59, 62, 64, 63, 61, 62, 65, 64, 63],
    by: 'Por estación', rows: [['Losa', '4', 0], ['Muros y soldadura', '14', 1], ['Repello', '12', -1], ['Liviano y complementarias', '19', 0], ['Acabados', '14', -1]],
    note: 'Inventario en proceso. Si sube sin que suban las entregas, hay un cuello de botella.' },
  { id: 'missmat', area: 'Producción', app: 'A3', label: 'Fallas por materiales', unit: '% de tareas no cumplidas', pct: true, good: 'down', target: 25,
    series: [33, 35, 38, 36, 40, 44, 39, 42, 45, 43, 40, 41],
    by: 'Causas de incumplimiento', rows: [['Materiales', '41%', 1], ['Prerrequisito no listo', '24%', -2], ['Clima', '14%', 3], ['Cambio de diseño', '9%', -1], ['Cuadrilla', '8%', 0], ['Otro', '4%', -1]],
    note: 'Cuando materiales domina, la palanca está aguas arriba, en B0, no en el ritual del sprint.' },
  { id: 'solpend', area: 'Materiales', app: 'B0', label: 'Solicitudes pendientes', unit: 'solicitudes abiertas', good: 'down', target: 15,
    series: [18, 22, 19, 25, 21, 24, 30, 26, 23, 29, 31, 27],
    by: 'Por antigüedad', rows: [['Menos de 24 h', '11', -3], ['1 a 3 días', '10', 0], ['Más de 3 días', '6', -1]],
    note: 'Solicitudes de material de jefes de obra que todavía no se han despachado.' },
  { id: 'entregamat', area: 'Materiales', app: 'B0', label: 'Entrega de material', unit: 'días promedio', dec: 1, good: 'down', target: 2,
    series: [3.4, 3.1, 3.3, 3.0, 2.9, 3.2, 2.8, 2.9, 2.7, 2.8, 2.5, 2.6],
    by: 'Por familia', rows: [['Acero', '3,1', 0.2], ['Cemento y agregados', '1,8', -0.1], ['Eléctrico', '2,9', 0.3], ['Acabados', '2,7', -0.4]],
    note: 'Desde que se crea la solicitud en B0 hasta que el material llega a la obra.' },
  { id: 'horas', area: 'Personas', app: 'H4', label: 'Horas registradas', unit: 'horas / semana', good: 'up',
    series: [9420, 9510, 9380, 9600, 9710, 9650, 9580, 9800, 9760, 9690, 9900, 9840],
    by: 'Por área', rows: [['Cadena de vivienda', '6 980', -40], ['Infraestructura', '1 720', 0], ['Planta y bodega', '760', -20], ['Administración', '380', 0]],
    note: 'Horas registradas en H4 por supervisores y gerentes.' },
  { id: 'asistencia', area: 'Personas', app: 'H4', label: 'Asistencia', unit: '% del personal programado', pct: true, good: 'up', target: 96,
    series: [92, 93, 91, 94, 95, 93, 92, 94, 95, 93, 94, 94],
    by: 'Por cuadrilla', rows: [['Formaleta', '97%', 1], ['Repello', '91%', -2], ['Complementarias', '93%', 0], ['Soldadura', '96%', 1]],
    note: 'Asistencia contra el personal asignado a obra en H4.' },
  { id: 'personal', area: 'Personas', app: 'H4', label: 'Personal activo', unit: 'personas', good: 'none',
    series: [201, 203, 204, 206, 205, 208, 210, 209, 211, 212, 213, 214],
    by: 'Por área', rows: [['Cadena de vivienda', '151', 1], ['Infraestructura', '34', 0], ['Planta y bodega', '17', 0], ['Administración', '12', 0]],
    note: 'Personas con rol y obra asignados en H4.' },
  { id: 'vendidas', area: 'Ventas', app: 'V5', label: 'Viviendas vendidas', unit: 'viviendas / semana', good: 'up', target: 7,
    series: [4, 6, 5, 7, 5, 6, 8, 5, 7, 6, 4, 6],
    by: 'Por producto', rows: [['Casa 2 habitaciones', '3', 1], ['Casa 3 habitaciones', '2', 1], ['Lote con servicios', '1', 0]],
    note: 'Contratos de venta firmados en la semana.' },
  { id: 'reservas', area: 'Ventas', app: 'V5', label: 'Reservas activas', unit: 'reservas', good: 'up',
    series: [34, 35, 37, 36, 38, 39, 40, 38, 39, 41, 40, 41],
    by: 'Por estado', rows: [['En trámite de crédito', '23', 2], ['Con prima completa', '11', -1], ['Recién reservadas', '7', 0]],
    note: 'Reservas que aún no pasan a contrato.' },
  { id: 'ventasmonto', area: 'Ventas', app: 'V5', label: 'Ventas firmadas', unit: 'millones de ₡ / semana', good: 'up',
    series: [310, 420, 365, 505, 350, 430, 580, 360, 495, 440, 290, 435],
    by: 'Por producto', rows: [['Casa 2 habitaciones', '₡ 198 M', 70], ['Casa 3 habitaciones', '₡ 172 M', 85], ['Lote con servicios', '₡ 65 M', -10]],
    note: 'Monto de contratos firmados en V5.' },
  { id: 'costom2', area: 'Finanzas', app: 'BC', label: 'Costo directo por m²', unit: 'miles de ₡ / m²', good: 'down', target: 400,
    series: [398, 401, 403, 405, 404, 407, 409, 408, 410, 411, 413, 412],
    by: 'Por partida', rows: [['Materiales', '238', 2], ['Mano de obra', '131', -1], ['Equipo', '27', 0], ['Subcontratos', '16', -2]],
    note: 'Costo directo de construcción por metro cuadrado, desde Business Central.' },
  { id: 'desvio', area: 'Finanzas', app: 'BC', label: 'Desvío vs presupuesto', unit: '% sobre presupuesto', pct: true, dec: 1, good: 'down', target: 2,
    series: [1.2, 1.5, 1.9, 2.1, 2.4, 2.2, 2.8, 3.1, 3.3, 3.5, 4.1, 3.8],
    by: 'Por etapa', rows: [['Etapa 1', '2,1%', -0.2], ['Etapa 2', '4,6%', -0.4], ['Etapa 3', '5,2%', 0.1]],
    note: 'Costo real acumulado contra presupuesto aprobado.' },
];

// ── Formato es-CR determinista (miles con espacio, decimales con coma) ───────
// Determinista a propósito: evita que el formato difiera entre servidor (SSR) y
// navegador y rompa la hidratación.
const NBSP = ' ';
export function fmt(v: number, dec = 0): string {
  const neg = v < 0;
  const [ent, frac] = Math.abs(v).toFixed(dec).split('.');
  const miles = ent.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return (neg ? '−' : '') + (frac ? `${miles},${frac}` : miles);
}

function dirDe(n: number): Direccion { return n > 0 ? 'up' : n < 0 ? 'down' : 'flat'; }
/** Color de una variación: la flecha sigue al signo, el color a si "más es mejor". */
export function sentimiento(n: number, good: Good): Sentimiento {
  if (n === 0 || good === 'none') return 'neutral';
  return (n > 0) === (good === 'up') ? 'good' : 'bad';
}

export interface Desglose { etiqueta: string; valor: string; delta: string; sent: Sentimiento }
export interface Kpi {
  id: string; nombre: string; valor: string; unidad: string;
  fuente: string; obra: string; categoria: CategoriaId;
  trend: { dir: Direccion; delta: string; sent: Sentimiento };
  meta: string; semAnterior: string; prom12: string; metaNum: number | null;
  serie: number[]; desgloseTitulo: string; desglose: Desglose[]; note: string;
}

function construir(r: Raw): Kpi {
  const dec = r.dec || 0;
  const sfx = r.pct ? '%' : '';
  const n = r.series.length;
  const last = r.series[n - 1];
  const prev = r.series[n - 2];
  const avg = r.series.reduce((a, b) => a + b, 0) / n;

  // Badge de tendencia del tablero: variación vs. la semana anterior.
  const d = Math.round((last - prev) * 10 ** dec) / 10 ** dec;
  const signo = d > 0 ? '+' : d < 0 ? '−' : '';
  const trendDelta = `${signo}${fmt(Math.abs(d), dec)}${r.pct ? ' pts' : ''}`;

  const desglose: Desglose[] = r.rows.map(([etiqueta, valor, dd]) => {
    const ddec = Number.isInteger(Math.abs(dd)) ? 0 : 1;
    const sg = dd > 0 ? '+' : dd < 0 ? '−' : '';
    const pts = r.pct && ddec === 0 && dd !== 0 ? ' pts' : '';
    return { etiqueta, valor, delta: `${sg}${fmt(Math.abs(dd), ddec)}${pts}`, sent: sentimiento(dd, r.good) };
  });

  return {
    id: r.id, nombre: r.label, valor: fmt(last, dec) + sfx, unidad: r.unit,
    fuente: r.app, obra: APP_NOMBRE[r.app] ?? r.app, categoria: AREA_A_CAT[r.area],
    trend: { dir: dirDe(d), delta: trendDelta, sent: sentimiento(d, r.good) },
    meta: r.target != null ? fmt(r.target, dec) + sfx : '—',
    semAnterior: fmt(prev, dec) + sfx,
    prom12: fmt(avg, dec) + sfx,
    metaNum: r.target ?? null,
    serie: r.series, desgloseTitulo: r.by, desglose, note: r.note,
  };
}

export const KPIS: Kpi[] = RAW.map(construir);
export const KPI_POR_ID: Record<string, Kpi> = Object.fromEntries(KPIS.map((k) => [k.id, k]));

export function descripcionDetalle(k: Kpi): string {
  return `${k.note} Datos de ejemplo para el prototipo.`;
}

// ── Semana ISO (como la app original) ────────────────────────────────────────
export function isoWeek(d = new Date()): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - y0.getTime()) / 86400000 + 1) / 7);
}
export const WEEK = isoWeek();
/** Etiquetas de las 12 semanas del gráfico, terminando en la actual. */
export const SEMANAS: string[] = Array.from({ length: 12 }, (_, i) => {
  let w = WEEK - 11 + i;
  if (w < 1) w += 52;
  return `S${w}`;
});
export const TICKS = [0, 3, 6, 9, 11];

// ── Tablero: 8 espacios fijos (1 principal + 1 ancho + 6 pequeños) ───────────
export const SLOTS: SlotSize[] = ['hero', 'sm', 'sm', 'wide', 'sm', 'sm', 'sm', 'sm'];
export const SLOT_NOMBRE: Record<SlotSize, string> = {
  hero: 'espacio principal', sm: 'espacio pequeño', wide: 'espacio ancho',
};
/** Disposición por defecto (los null son espacios vacíos "+"). */
export const DEFAULT_SLOTS: (string | null)[] =
  ['ppc', 'entregadas', 'solpend', null, 'vendidas', null, 'asistencia', null];
