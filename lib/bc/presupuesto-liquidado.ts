import 'server-only';
import {
  bcConsumidoObra,
  bcDecompLines,
  bcWorkVersions,
  companyConObra,
  getWorkLines,
  type WorkLineBC,
  type WorkVersionBC,
} from '@/lib/bc-construction';

// Presupuesto vs Liquidado por obra (solo cantidades, por material). Portado de la
// app de Digitación. El presupuesto de cada material NO está guardado como total: se
// calcula cruzando dos fuentes de BC:
//   • Descompuesto (workDecomposedLines) → rendimiento (performance) por material/tarea.
//   • Líneas de venta (workLines) → cantidad de la tarea, en la versión de re-estudio.
//   presupuestado = rendimiento × cantidad de la tarea (emparejado por Task No.).
// El liquidado (consumido) y los "Extra" (consumo sin línea de presupuesto) salen de
// consumidoObra (page 50106).

export type EstadoPresupuesto = 'sin_consumo' | 'en_presupuesto' | 'completo' | 'sobregiro' | 'extra';

export interface PresupuestoLiquidadoRow {
  itemNo: string;
  description: string;
  variantCode: string;
  variantDescription?: string;
  unitOfMeasureCode: string;
  taskNo: string;
  presupuestado: number;
  liquidado: number;
  saldo: number;
  esExtra: boolean;
  estado: EstadoPresupuesto;
}
export interface PresupuestoLiquidadoResumen {
  materiales: number;
  actividades: number;
  presupuestadas: number;
  sinConsumo: number;
  sobregiros: number;
  extras: number;
}
export interface PresupuestoLiquidadoResponse {
  obra: string;
  rows: PresupuestoLiquidadoRow[];
  resumen: PresupuestoLiquidadoResumen;
}

const round = (n: number) => Math.round(n * 100) / 100;
const keyOf = (itemNo: string, variantCode: string, taskNo: string) => `${itemNo}|${variantCode}|${taskNo}`;

function estadoDe(esExtra: boolean, presupuestado: number, liquidado: number): EstadoPresupuesto {
  if (esExtra) return 'extra';
  if (liquidado <= 0) return 'sin_consumo';
  if (liquidado > presupuestado + 1e-9) return 'sobregiro';
  if (liquidado >= presupuestado - 1e-9) return 'completo';
  return 'en_presupuesto';
}

// Versión de líneas de venta que manda: la de re-estudio más reciente; si no hay flag
// de re-estudio, la más reciente de todas.
function pickVersion(versions: WorkVersionBC[]): string {
  if (!versions.length) return '';
  const byNewest = [...versions].sort((a, b) => Date.parse(b.createDateTime || '') - Date.parse(a.createDateTime || ''));
  const reStudy = byNewest.filter((v) => v.reStudy);
  return (reStudy[0] ?? byNewest[0]).versionCode;
}

// Mapa tarea → cantidad presupuestada (lado ventas) en la versión elegida. Si esa
// versión no empareja (desfase de datos), cae a todas las líneas para no dejar 0.
function buildTaskQty(lines: WorkLineBC[], versionCode: string): Map<string, number> {
  const esVenta = (l: WorkLineBC) => /vent|sale/i.test(l.lineType);
  const build = (pool: WorkLineBC[]): Map<string, number> => {
    const base = pool.some(esVenta) ? pool.filter(esVenta) : pool;
    const map = new Map<string, number>();
    for (const l of base) {
      if (!l.taskNo) continue;
      const prev = map.get(l.taskNo);
      if (prev === undefined || l.quantity > prev) map.set(l.taskNo, l.quantity);
    }
    return map;
  };
  const filtered = versionCode ? lines.filter((l) => l.versionCode === versionCode) : lines;
  const map = build(filtered);
  return map.size > 0 ? map : build(lines);
}

export async function presupuestoLiquidado(obra: string, taskNo?: string): Promise<PresupuestoLiquidadoResponse> {
  const company = await companyConObra(obra);
  const [consumido, decompLines, workLines, versions] = await Promise.all([
    bcConsumidoObra(obra, taskNo, company),
    bcDecompLines(obra, company),
    getWorkLines(obra, company),
    bcWorkVersions(obra, company),
  ]);

  const taskQty = buildTaskQty(workLines, pickVersion(versions));

  // Presupuesto por material = rendimiento × cantidad de la tarea (se suman líneas).
  const budgetQty = new Map<string, number>();
  const budgetMeta = new Map<string, { itemNo: string; variantCode: string; taskNo: string; description: string; unit: string }>();
  for (const d of decompLines) {
    if (taskNo && d.taskNo !== taskNo) continue;
    const k = keyOf(d.itemNo, d.variantCode, d.taskNo);
    const aporte = (taskQty.get(d.taskNo) ?? 0) * d.performance;
    budgetQty.set(k, (budgetQty.get(k) ?? 0) + aporte);
    if (!budgetMeta.has(k)) budgetMeta.set(k, { itemNo: d.itemNo, variantCode: d.variantCode, taskNo: d.taskNo, description: d.description, unit: d.unitOfMeasure });
  }

  // Liquidado (consumido neto) + metadatos.
  const consumedQty = new Map<string, number>();
  const consumedMeta = new Map<string, { itemNo: string; variantCode: string; taskNo: string; description: string; unit: string; variantDescription?: string }>();
  for (const r of consumido) {
    const k = keyOf(r.itemNo, r.variantCode, r.jobTaskNo);
    consumedQty.set(k, r.quantityConsumed);
    if (!consumedMeta.has(k)) consumedMeta.set(k, { itemNo: r.itemNo, variantCode: r.variantCode, taskNo: r.jobTaskNo, description: r.description, unit: r.unitOfMeasureCode, variantDescription: r.variantDescription });
  }

  const rows: PresupuestoLiquidadoRow[] = Array.from(new Set([...budgetQty.keys(), ...consumedQty.keys()]))
    .map((k) => {
      const b = budgetMeta.get(k);
      const c = consumedMeta.get(k);
      const presupuestado = round(budgetQty.get(k) ?? 0);
      const liquidado = round(consumedQty.get(k) ?? 0);
      const esExtra = !b;
      return {
        itemNo: b?.itemNo ?? c?.itemNo ?? '',
        description: b?.description || c?.description || '',
        variantCode: b?.variantCode ?? c?.variantCode ?? '',
        variantDescription: c?.variantDescription,
        unitOfMeasureCode: b?.unit || c?.unit || '',
        taskNo: b?.taskNo ?? c?.taskNo ?? '',
        presupuestado,
        liquidado,
        saldo: round(presupuestado - liquidado),
        esExtra,
        estado: estadoDe(esExtra, presupuestado, liquidado),
      };
    })
    .filter((r) => r.presupuestado > 0 || r.liquidado > 0)
    .sort((a, b) => a.taskNo.localeCompare(b.taskNo, undefined, { numeric: true }) || a.description.localeCompare(b.description));

  const resumen: PresupuestoLiquidadoResumen = {
    materiales: rows.length,
    actividades: new Set(rows.map((r) => r.taskNo)).size,
    presupuestadas: rows.filter((r) => !r.esExtra).length,
    sinConsumo: rows.filter((r) => r.estado === 'sin_consumo').length,
    sobregiros: rows.filter((r) => r.estado === 'sobregiro').length,
    extras: rows.filter((r) => r.esExtra).length,
  };

  return { obra, rows, resumen };
}
