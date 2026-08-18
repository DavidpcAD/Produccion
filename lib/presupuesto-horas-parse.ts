import 'server-only';
import * as XLSX from 'xlsx';

// Parser de la plantilla "Presupuesto de Horas y Cantidades" (hoja `Presupuesto`).
// Cada fila = una subpartida de una obra, identificada por CÓDIGO (no por nombre):
//   CodigoObra (numeroObra) · CodigoSubpartida (dbo.SubPartida.codigo) · Cantidad · Horas
// Tolerante: ubica la fila de encabezados por contenido y mapea columnas por nombre.

const norm = (v: unknown) =>
  String(v ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const num = (v: unknown): number | null => {
  const s = String(v ?? '').replace(/[^\d.-]/g, '');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

type Grid = unknown[][];
function sheetGrid(ws: XLSX.WorkSheet): Grid {
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as Grid;
}

// Alias de encabezados aceptados (comparación exacta sobre el nombre normalizado).
const ALIAS: Record<string, string[]> = {
  codigoObra: ['codigoobra', 'codigo obra', 'cod obra', 'obra', 'n obra', 'no obra'],
  codigoSubpartida: ['codigosubpartida', 'codigo subpartida', 'codigo sub partida', 'cod subpartida', 'codsubpartida'],
  cantidad: ['cantidad', 'cant', 'cantidad presupuestada'],
  horas: ['horas (hh)', 'horas hh', 'horas', 'hh', 'hh presupuestadas'],
  // Nombre original de la subtarea (col de referencia de la plantilla). Sirve para
  // sugerir la subpartida del catálogo cuando la fila no trae código.
  nombre: ['nombre original (excel)', 'nombre original', 'subtareaobra (excel)', 'subtareaobra', 'subtarea', 'nombre'],
};

function findHeader(grid: Grid): { row: number; cols: Record<string, number> } | null {
  for (let r = 0; r < Math.min(grid.length, 20); r++) {
    const cells = grid[r].map(norm);
    // Anclas mínimas para reconocer la hoja de captura.
    const tieneCant = cells.some((c) => c === 'cantidad' || c.startsWith('cantidad'));
    const tieneHoras = cells.some((c) => c.includes('horas') || c === 'hh');
    if (!tieneCant || !tieneHoras) continue;
    const cols: Record<string, number> = {};
    for (const [key, names] of Object.entries(ALIAS)) {
      const idx = cells.findIndex((c) => names.some((n) => c === n));
      if (idx >= 0) cols[key] = idx;
    }
    if (cols.codigoObra == null || cols.codigoSubpartida == null) continue;
    return { row: r, cols };
  }
  return null;
}

export interface FilaHoras {
  fila: number;            // fila real del Excel (1-based) para mensajes
  codigoObra: string;
  codigoSubpartida: string;
  nombre: string;          // nombre original de la subtarea (para sugerir), '' si no viene
  cantidad: number | null;
  horas: number | null;
}

export interface HorasParsed {
  hoja: string | null;
  filas: FilaHoras[];
}

// Sugerencia de subpartida del catálogo a partir del nombre libre de la subtarea.
// Match difuso: Jaccard de tokens (sin stopwords) + bonus si uno contiene al otro.
// Devuelve el código del mejor candidato si supera un umbral, o null.
const STOP = new Set(['de', 'y', 'la', 'el', 'los', 'las', 'del', 'e', 'o', 'con', 'a', 'para', 'en']);
// Stem simple de plural: "geoceldas"→"geoceld", "canoas"→"canoa" — para que
// singular/plural matcheen (Geocelda↔Geoceldas, Griferías↔Griferia).
const stem = (t: string) => (t.length > 4 && t.endsWith('s') ? t.slice(0, -1) : t);
function tokens(s: string): Set<string> {
  return new Set(norm(s).split(' ').filter((t) => t.length > 1 && !STOP.has(t)).map(stem));
}
export function sugerirCodigo(nombre: string, catalogo: { codigo: string; nombre: string }[]): string | null {
  const nt = tokens(nombre);
  const nn = norm(nombre);
  if (nt.size === 0) return null;
  let best: { codigo: string; score: number } | null = null;
  for (const c of catalogo) {
    const ct = tokens(c.nombre);
    if (ct.size === 0) continue;
    let inter = 0;
    for (const t of nt) if (ct.has(t)) inter++;
    const union = nt.size + ct.size - inter;
    let score = union ? inter / union : 0;
    const cn = norm(c.nombre);
    if (nn && (nn.includes(cn) || cn.includes(nn))) score += 0.25;
    if (!best || score > best.score) best = { codigo: c.codigo, score };
  }
  return best && best.score >= 0.34 ? best.codigo : null;
}

export function parsePresupuestoHoras(buf: Buffer): HorasParsed {
  const wb = XLSX.read(buf);
  // Preferir la hoja "Presupuesto"; si no aparece, buscar en cualquier hoja.
  const nombres = [...wb.SheetNames].sort(
    (a, b) => (norm(b) === 'presupuesto' ? 1 : 0) - (norm(a) === 'presupuesto' ? 1 : 0),
  );
  for (const name of nombres) {
    const grid = sheetGrid(wb.Sheets[name]);
    const hdr = findHeader(grid);
    if (!hdr) continue;
    const c = hdr.cols;
    const filas: FilaHoras[] = [];
    for (let r = hdr.row + 1; r < grid.length; r++) {
      const row = grid[r];
      // Saltar la fila de ejemplo de la plantilla ("← ejemplo…").
      if (row.some((cell) => norm(cell).includes('ejemplo'))) continue;
      const codigoObra = String(row[c.codigoObra] ?? '').trim();
      const codigoSubpartida = String(row[c.codigoSubpartida] ?? '').trim();
      const nombre = c.nombre != null ? String(row[c.nombre] ?? '').trim() : '';
      if (!codigoObra && !codigoSubpartida && !nombre) continue; // fila vacía
      filas.push({
        fila: r + 1,
        codigoObra,
        codigoSubpartida,
        nombre,
        cantidad: c.cantidad != null ? num(row[c.cantidad]) : null,
        horas: c.horas != null ? num(row[c.horas]) : null,
      });
    }
    return { hoja: name, filas };
  }
  return { hoja: null, filas: [] };
}
