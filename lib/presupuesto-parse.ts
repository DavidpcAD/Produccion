import 'server-only';
import * as XLSX from 'xlsx';
import type { BulkLine, DecompLine } from './bc-construction';

// Parser de los Excel de presupuesto de Adelante. Tolerante a variaciones por obra:
// ubica la fila de encabezados por su contenido y mapea columnas por nombre (con alias).

const norm = (v: unknown) => String(v ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const num = (v: unknown) => { const n = Number(String(v ?? '').replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : 0; };

type Grid = unknown[][];
function sheetGrid(ws: XLSX.WorkSheet): Grid { return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as Grid; }

// Encuentra la fila de encabezado (la que contiene TODOS los labels ancla) y devuelve
// un mapa alias→índice de columna.
function findHeader(grid: Grid, anclas: string[], alias: Record<string, string[]>): { row: number; cols: Record<string, number> } | null {
  for (let r = 0; r < Math.min(grid.length, 15); r++) {
    const cells = grid[r].map(norm);
    if (!anclas.every(a => cells.some(c => c === a || c.includes(a)))) continue;
    const cols: Record<string, number> = {};
    for (const [key, names] of Object.entries(alias)) {
      const idx = cells.findIndex(c => names.some(n => c === n));
      if (idx >= 0) cols[key] = idx;
    }
    return { row: r, cols };
  }
  return null;
}

// Plantilla: hojas VentaAD (Sales), CosteAD (Cost), IND (Indirect), ProducAD (producción).
const PLANTILLA_ALIAS = {
  taskNo: ['codigo', 'codigo '], taskType: ['nat'], unitOfMeasure: ['ud'], description: ['resumen'],
  quantity: ['canpres'], unitAmount: ['pres'], lineAmount: ['imppres'],
};
const SHEET_TIPO: Record<string, BulkLine['lineType']> = { ventaad: 'Sales', costead: 'Cost', ind: 'Indirect Cost', producad: 'Production' };
// "Nat" del Excel (Capítulo/Partida/...) → taskType válido en BC (Total = rollup, Posting = hoja).
const natToTaskType = (nat: unknown): string => (norm(nat).startsWith('capitulo') ? 'Total' : 'Posting');

export interface PlantillaParsed {
  porTipo: Record<string, BulkLine[]>;   // 'Sales' | 'Cost' | 'Indirect' | 'Production'
  totales: Record<string, number>;
  hojas: string[];
}

export function parsePlantilla(buf: Buffer): PlantillaParsed {
  const wb = XLSX.read(buf);
  const porTipo: Record<string, BulkLine[]> = {};
  const totales: Record<string, number> = {};
  const hojas: string[] = [];
  for (const name of wb.SheetNames) {
    const tipo = SHEET_TIPO[norm(name).replace(/\s+/g, '')];
    if (!tipo) continue;
    hojas.push(name);
    const grid = sheetGrid(wb.Sheets[name]);
    const hdr = findHeader(grid, ['codigo', 'resumen'], PLANTILLA_ALIAS);
    if (!hdr) continue;
    const c = hdr.cols;
    const lineas: BulkLine[] = [];
    for (let r = hdr.row + 1; r < grid.length; r++) {
      const row = grid[r];
      const taskNo = String(row[c.taskNo] ?? '').trim();
      const description = String(row[c.description] ?? '').trim();
      if (!taskNo || !description) continue;
      lineas.push({
        lineNo: lineas.length + 1,
        lineType: tipo,
        taskType: natToTaskType(row[c.taskType]),
        taskNo,
        description,
        unitOfMeasure: String(row[c.unitOfMeasure] ?? '').trim(),
        quantity: num(row[c.quantity]),
        unitAmount: num(row[c.unitAmount]),
        lineAmount: num(row[c.lineAmount]),
      });
    }
    porTipo[tipo] = lineas;
    totales[tipo] = lineas.reduce((s, l) => s + (l.lineAmount ?? 0), 0);
  }
  return { porTipo, totales, hojas };
}

// Descompuesto (materiales). Hoja con encabezados tipo "Nº obra / Nº tarea / ...".
const DECOMP_ALIAS = {
  worksNo: ['n obra', 'no obra', 'nº obra', 'n° obra', 'numero obra'],
  lineNo: ['n linea', 'no linea', 'nº linea', 'n° linea'],
  taskNo: ['n tarea', 'nº tarea', 'n° tarea', 'n actividad', 'nº actividad'],
  description: ['descripcion', 'descripcion actividad'],
  taskType: ['tipo tarea'],
  tipo: ['tipo'],
  no: ['nº', 'n°', 'no', 'n', 'no.'],
  performance: ['rendimiento', 'cantidad'],
  unitCost: ['coste unitario', 'unit mat', 'coste', 'costo unitario'],
  variantCode: ['cod. variante', 'cod variante', 'variante', 'cód. variante'],
};

export interface DescompuestoParsed { lineas: DecompLine[]; hoja: string | null }

export function parseDescompuesto(buf: Buffer): DescompuestoParsed {
  const wb = XLSX.read(buf);
  for (const name of wb.SheetNames) {
    const grid = sheetGrid(wb.Sheets[name]);
    const hdr = findHeader(grid, ['tipo tarea'], DECOMP_ALIAS);
    if (!hdr) continue;
    const c = hdr.cols;
    if (c.taskNo == null || c.description == null) continue;
    const lineas: DecompLine[] = [];
    for (let r = hdr.row + 1; r < grid.length; r++) {
      const row = grid[r];
      const taskNo = String(row[c.taskNo] ?? '').trim();
      const description = String(row[c.description] ?? '').trim();
      const no = c.no != null ? String(row[c.no] ?? '').trim() : '';
      if (!taskNo || !description) continue;
      lineas.push({
        lineNo: lineas.length + 1,
        taskNo,
        description,
        taskType: c.taskType != null ? String(row[c.taskType] ?? '').trim() : '',
        no,
        performance: c.performance != null ? num(row[c.performance]) : 0,
        unitCost: c.unitCost != null ? num(row[c.unitCost]) : 0,
        variantCode: c.variantCode != null ? String(row[c.variantCode] ?? '').trim() : '',
      });
    }
    return { lineas, hoja: name };
  }
  return { lineas: [], hoja: null };
}
