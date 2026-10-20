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
import { bcItems } from '@/lib/compras/bc';

// Presupuesto vs Liquidado por obra. Portado de Digitación y enriquecido con VALORES
// (₡) y CATEGORÍA:
//   • presupuestado (cant) = rendimiento (descompuesto) × cantidad de la tarea (líneas
//     de venta, versión de re-estudio).
//   • liquidado (cant) = consumido (page 50106 consumidoObra).
//   • unitCost = costo unitario del descompuesto (o lastDirectCost del catálogo en los
//     "extra"); valor = cantidad × unitCost (mismo costo a ambos lados, así la variación
//     en ₡ sigue a la de cantidad).
//   • categoría = ItemCategoryCode del catálogo (bcItems).

export type EstadoPL = 'en_rango' | 'revisar' | 'sobre_presupuesto';

export interface PresupuestoLiquidadoRow {
  itemNo: string;
  description: string;
  categoria: string;
  variantCode: string;
  variantDescription?: string;
  unitOfMeasureCode: string;
  taskNo: string;
  presupuestadoCant: number;
  liquidadoCant: number;
  unitCost: number;
  presupuestadoValor: number;
  liquidadoValor: number;
  diferenciaValor: number;   // presupuestado − liquidado (positivo = ahorro)
  variacionPct: number;      // (liquidado − presupuestado) / presupuestado × 100
  esExtra: boolean;
  estado: EstadoPL;
}
export interface PresupuestoLiquidadoResumen {
  materiales: number;
  conVariacion: number;
  valorPresupuestado: number;
  valorLiquidado: number;
}
export interface PresupuestoLiquidadoResponse {
  obra: string;
  rows: PresupuestoLiquidadoRow[];
  resumen: PresupuestoLiquidadoResumen;
}

const round = (n: number) => Math.round(n * 100) / 100;
const keyOf = (itemNo: string, variantCode: string, taskNo: string) => `${itemNo}|${variantCode}|${taskNo}`;

function estadoDe(esExtra: boolean, presupCant: number, liqCant: number): EstadoPL {
  if (esExtra) return 'sobre_presupuesto';
  if (presupCant <= 0) return liqCant > 0 ? 'sobre_presupuesto' : 'en_rango';
  const v = ((liqCant - presupCant) / presupCant) * 100;
  if (v > 10) return 'sobre_presupuesto';
  if (v > 1e-4) return 'revisar';
  return 'en_rango';
}

function pickVersion(versions: WorkVersionBC[]): string {
  if (!versions.length) return '';
  const byNewest = [...versions].sort((a, b) => Date.parse(b.createDateTime || '') - Date.parse(a.createDateTime || ''));
  const reStudy = byNewest.filter((v) => v.reStudy);
  return (reStudy[0] ?? byNewest[0]).versionCode;
}

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
  const [consumido, decompLines, workLines, versions, items] = await Promise.all([
    bcConsumidoObra(obra, taskNo, company),
    bcDecompLines(obra, company),
    getWorkLines(obra, company),
    bcWorkVersions(obra, company),
    bcItems().catch(() => []),
  ]);

  // Catálogo: categoría y costo de respaldo por material.
  const catPorItem = new Map<string, string>();
  const costCatalogo = new Map<string, number>();
  for (const it of items) {
    if (it.categoria) catPorItem.set(it.code, it.categoria);
    if (it.lastDirectCost) costCatalogo.set(it.code, it.lastDirectCost);
  }

  const taskQty = buildTaskQty(workLines, pickVersion(versions));

  // Presupuesto por material: cantidad (rendimiento × cantidad de tarea) y costo unitario.
  const budgetQty = new Map<string, number>();
  const budgetCost = new Map<string, number>();
  const budgetMeta = new Map<string, { itemNo: string; variantCode: string; taskNo: string; description: string; unit: string }>();
  for (const d of decompLines) {
    if (taskNo && d.taskNo !== taskNo) continue;
    const k = keyOf(d.itemNo, d.variantCode, d.taskNo);
    budgetQty.set(k, (budgetQty.get(k) ?? 0) + (taskQty.get(d.taskNo) ?? 0) * d.performance);
    if (d.unitCost > 0 && !budgetCost.has(k)) budgetCost.set(k, d.unitCost);
    if (!budgetMeta.has(k)) budgetMeta.set(k, { itemNo: d.itemNo, variantCode: d.variantCode, taskNo: d.taskNo, description: d.description, unit: d.unitOfMeasure });
  }

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
      const itemNo = b?.itemNo ?? c?.itemNo ?? '';
      const presupuestadoCant = round(budgetQty.get(k) ?? 0);
      const liquidadoCant = round(consumedQty.get(k) ?? 0);
      const esExtra = !b;
      const unitCost = round(budgetCost.get(k) ?? costCatalogo.get(itemNo) ?? 0);
      const presupuestadoValor = round(presupuestadoCant * unitCost);
      const liquidadoValor = round(liquidadoCant * unitCost);
      const variacionPct = presupuestadoCant > 0
        ? round(((liquidadoCant - presupuestadoCant) / presupuestadoCant) * 100)
        : (liquidadoCant > 0 ? 100 : 0);
      return {
        itemNo,
        description: b?.description || c?.description || '',
        categoria: catPorItem.get(itemNo) ?? '',
        variantCode: b?.variantCode ?? c?.variantCode ?? '',
        variantDescription: c?.variantDescription,
        unitOfMeasureCode: b?.unit || c?.unit || '',
        taskNo: b?.taskNo ?? c?.taskNo ?? '',
        presupuestadoCant,
        liquidadoCant,
        unitCost,
        presupuestadoValor,
        liquidadoValor,
        diferenciaValor: round(presupuestadoValor - liquidadoValor),
        variacionPct,
        esExtra,
        estado: estadoDe(esExtra, presupuestadoCant, liquidadoCant),
      };
    })
    .filter((r) => r.presupuestadoCant > 0 || r.liquidadoCant > 0)
    .sort((a, b) => a.taskNo.localeCompare(b.taskNo, undefined, { numeric: true }) || a.description.localeCompare(b.description));

  const resumen: PresupuestoLiquidadoResumen = {
    materiales: rows.length,
    conVariacion: rows.filter((r) => r.estado !== 'en_rango').length,
    valorPresupuestado: round(rows.reduce((s, r) => s + r.presupuestadoValor, 0)),
    valorLiquidado: round(rows.reduce((s, r) => s + r.liquidadoValor, 0)),
  };

  return { obra, rows, resumen };
}
