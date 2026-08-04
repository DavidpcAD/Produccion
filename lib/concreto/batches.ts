import type sqlModule from 'mssql';
import { sql } from '@/lib/db-adelantedb';
import type { BatchDetallePlanta, KpisResponse, M3PorDia } from './tipos';

// Portado de `api/src/lib/consultar-batches.ts` y `consultar-kpis.ts` de la app
// original. SQL contra `pro_hor.batches` / `pro_hor.plantas` / `pro_hor.colada_batches`.

// ─── KPIs de producción ───────────────────────────────────────────────────

export interface KpisParams {
  desde: string; // YYYY-MM-DD
  hasta: string; // YYYY-MM-DD
  id_planta?: number;
}

/**
 * KPIs agregados del periodo + serie diaria de m³ (con gap-filling en código,
 * incluyendo TODOS los días del rango con 0 en los vacíos). El caller valida
 * el rango (<= 90 días) antes de invocar.
 */
export async function consultarKpis(
  pool: sqlModule.ConnectionPool,
  params: KpisParams,
): Promise<KpisResponse> {
  const { desde, hasta, id_planta: idPlanta } = params;
  const filtroPlantaSinAlias = idPlanta !== undefined ? 'AND id_planta = @id_planta' : '';
  const filtroPlantaConBatchAlias = idPlanta !== undefined ? 'AND b.id_planta = @id_planta' : '';

  const reqKpis = pool.request().input('desde', sql.Date, desde).input('hasta', sql.Date, hasta);
  if (idPlanta !== undefined) reqKpis.input('id_planta', sql.Int, idPlanta);
  const rKpis = await reqKpis.query(`
    SELECT
      COUNT(*) AS total_batches,
      SUM(m3_producidos) AS total_m3,
      100.0 * SUM(CASE WHEN tuvo_alarma = 1 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS pct_con_alarma,
      100.0 * SUM(CASE WHEN receta_modificada = 1 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS pct_receta_modificada
    FROM pro_hor.batches
    WHERE fecha_inicio >= @desde
      AND fecha_inicio < DATEADD(day, 1, @hasta)
      ${filtroPlantaSinAlias}
  `);

  const k = rKpis.recordset[0] ?? {};

  const reqSerie = pool.request().input('desde', sql.Date, desde).input('hasta', sql.Date, hasta);
  if (idPlanta !== undefined) reqSerie.input('id_planta', sql.Int, idPlanta);
  const rSerie = await reqSerie.query(`
    SELECT
      CAST(b.fecha_inicio AS DATE) AS fecha,
      p.codigo AS planta_nombre,
      SUM(b.m3_producidos) AS m3
    FROM pro_hor.batches b
    INNER JOIN pro_hor.plantas p ON p.id = b.id_planta
    WHERE b.fecha_inicio >= @desde
      AND b.fecha_inicio < DATEADD(day, 1, @hasta)
      ${filtroPlantaConBatchAlias}
    GROUP BY CAST(b.fecha_inicio AS DATE), p.codigo
    ORDER BY CAST(b.fecha_inicio AS DATE), p.codigo
  `);

  type Agregado = { total: number; porPlanta: Record<string, number> };
  const porFecha = new Map<string, Agregado>();
  for (const fila of rSerie.recordset) {
    const iso = toIsoDate(fila.fecha);
    const m3 = Number(fila.m3 ?? 0);
    let agg = porFecha.get(iso);
    if (!agg) {
      agg = { total: 0, porPlanta: {} };
      porFecha.set(iso, agg);
    }
    agg.total += m3;
    agg.porPlanta[fila.planta_nombre] = (agg.porPlanta[fila.planta_nombre] ?? 0) + m3;
  }

  const serieCompleta: M3PorDia[] = construirRangoDiario(desde, hasta).map((iso) => {
    const agg = porFecha.get(iso);
    if (!agg) return { fecha: iso, m3: 0, m3_por_planta: {} };
    const porPlantaRedondeado: Record<string, number> = {};
    for (const [kk, v] of Object.entries(agg.porPlanta)) porPlantaRedondeado[kk] = redondear2(v);
    return { fecha: iso, m3: redondear2(agg.total), m3_por_planta: porPlantaRedondeado };
  });

  return {
    total_batches: Number(k.total_batches ?? 0),
    total_m3: redondear2(Number(k.total_m3 ?? 0)),
    pct_con_alarma: redondear2(Number(k.pct_con_alarma ?? 0)),
    pct_receta_modificada: redondear2(Number(k.pct_receta_modificada ?? 0)),
    m3_por_dia: serieCompleta,
  };
}

function redondear2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toIsoDate(d: Date | string): string {
  if (typeof d === 'string') return d.slice(0, 10);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Lista de fechas YYYY-MM-DD desde `desde` hasta `hasta` inclusive (gap-fill). */
export function construirRangoDiario(desde: string, hasta: string): string[] {
  const fechas: string[] = [];
  const inicio = new Date(`${desde}T00:00:00Z`);
  const fin = new Date(`${hasta}T00:00:00Z`);
  const cursor = new Date(inicio);
  while (cursor.getTime() <= fin.getTime()) {
    fechas.push(toIsoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return fechas;
}

// ─── Listado de batches (datos crudos) ──────────────────────────────────────

export interface ListarBatchesParams {
  id_colada?: number;
  id_planta?: number;
  desde?: string;
  hasta?: string;
  q?: string;
  solo_anomalias?: boolean;
  pagina: number;
  por_pagina: number;
}

export async function consultarBatches(
  pool: sqlModule.ConnectionPool,
  params: ListarBatchesParams,
): Promise<{ batches: BatchDetallePlanta[]; total: number; pagina: number; por_pagina: number }> {
  const { id_colada, id_planta, desde, hasta, q, solo_anomalias, pagina, por_pagina } = params;

  const filtros: string[] = [];
  if (id_colada !== undefined) filtros.push('cb.id_colada = @id_colada');
  if (id_planta !== undefined) filtros.push('b.id_planta = @id_planta');
  if (desde !== undefined) filtros.push('b.fecha_inicio >= @desde');
  if (hasta !== undefined) filtros.push('b.fecha_inicio < DATEADD(day, 1, @hasta)');
  if (q !== undefined) {
    filtros.push(
      '(b.cliente_raw LIKE @q OR b.recipe_name_raw LIKE @q OR CAST(b.record_no AS NVARCHAR) LIKE @q)',
    );
  }
  if (solo_anomalias) filtros.push('(b.tuvo_alarma = 1 OR b.receta_modificada = 1)');
  const whereClause = filtros.length > 0 ? `WHERE ${filtros.join(' AND ')}` : '';
  const offset = (pagina - 1) * por_pagina;

  const baseFrom = `
    FROM pro_hor.batches b
    INNER JOIN pro_hor.plantas p ON p.id = b.id_planta
    LEFT JOIN pro_hor.colada_batches cb ON cb.id_batch = b.id AND cb.excluido = 0
    LEFT JOIN pro_hor.coladas c ON c.id_colada = cb.id_colada
  `;

  const bind = (req: sqlModule.Request) => {
    if (id_colada !== undefined) req.input('id_colada', sql.Int, id_colada);
    if (id_planta !== undefined) req.input('id_planta', sql.Int, id_planta);
    if (desde !== undefined) req.input('desde', sql.Date, desde);
    if (hasta !== undefined) req.input('hasta', sql.Date, hasta);
    if (q !== undefined) req.input('q', sql.NVarChar(102), `%${q}%`);
    return req;
  };

  const reqItems = bind(pool.request())
    .input('offset', sql.Int, offset)
    .input('por_pagina', sql.Int, por_pagina);

  const rItems = await reqItems.query(`
    SELECT
      b.id, b.record_no, b.fecha_inicio,
      p.codigo                        AS planta_nombre,
      b.cliente_raw, b.recipe_name_raw,
      b.m3_producidos,
      b.arido_a_nombre, b.arido_a_dosis_kg_m3,
      b.arido_b_nombre, b.arido_b_dosis_kg_m3,
      b.cemento_dosis_kg_m3, b.agua_dosis_l_m3,
      b.aditivo1_dosis_l_m3, b.aditivo2_dosis_l_m3, b.aditivo3_dosis_l_m3,
      b.agua_l, b.agua_l_teor, b.agua_delta_l, b.agua_delta_pct,
      b.water_dosage_adj, b.water_total_adj_l, b.relacion_agua_cemento,
      b.arido_a_moisture_pct, b.arido_b_moisture_pct,
      b.cemento_kg, b.cemento_kg_teor, b.cemento_delta_pct,
      b.arido_a_kg, b.arido_a_kg_teor, b.arido_a_delta_pct,
      b.arido_b_kg, b.arido_b_kg_teor, b.arido_b_delta_pct,
      b.aditivo1_l, b.aditivo1_l_teor, b.aditivo1_delta_pct,
      b.aditivo2_l, b.aditivo2_l_teor, b.aditivo2_delta_pct,
      b.aditivo3_l, b.aditivo3_l_teor, b.aditivo3_delta_pct,
      b.temp_ambiente_inicio, b.temp_ambiente_fin,
      b.production_rate, b.production_rate_adj,
      b.receta_modificada, b.tuvo_alarma, b.cantidad_alarmas, b.operador,
      cb.id_colada, c.codigo_interno AS codigo_interno_colada
    ${baseFrom}
    ${whereClause}
    ORDER BY b.fecha_inicio DESC, b.record_no DESC
    OFFSET @offset ROWS FETCH NEXT @por_pagina ROWS ONLY
  `);

  const rTotal = await bind(pool.request()).query(`
    SELECT COUNT(*) AS total
    ${baseFrom}
    ${whereClause}
  `);

  return {
    batches: rItems.recordset.map(mapearBatch),
    total: rTotal.recordset[0]?.total ?? 0,
    pagina,
    por_pagina,
  };
}

/** El driver mssql devuelve DECIMAL como string en algunas versiones. */
function num(v: number | string | null): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapearBatch(r: Record<string, unknown>): BatchDetallePlanta {
  const g = <T>(k: string) => r[k] as T;
  const fi = g<Date | string>('fecha_inicio');
  return {
    id: g<number>('id'),
    record_no: g<number>('record_no'),
    fecha_inicio: fi instanceof Date ? fi.toISOString() : String(fi),
    planta_nombre: g<string>('planta_nombre'),
    cliente_raw: g<string | null>('cliente_raw'),
    recipe_name_raw: g<string | null>('recipe_name_raw'),
    m3_producidos: num(g('m3_producidos')) ?? 0,
    arido_a_nombre: g<string | null>('arido_a_nombre'),
    arido_a_dosis_kg_m3: num(g('arido_a_dosis_kg_m3')),
    arido_b_nombre: g<string | null>('arido_b_nombre'),
    arido_b_dosis_kg_m3: num(g('arido_b_dosis_kg_m3')),
    cemento_dosis_kg_m3: num(g('cemento_dosis_kg_m3')),
    agua_dosis_l_m3: num(g('agua_dosis_l_m3')),
    aditivo1_dosis_l_m3: num(g('aditivo1_dosis_l_m3')),
    aditivo2_dosis_l_m3: num(g('aditivo2_dosis_l_m3')),
    aditivo3_dosis_l_m3: num(g('aditivo3_dosis_l_m3')),
    agua_l: num(g('agua_l')),
    agua_l_teor: num(g('agua_l_teor')),
    agua_delta_l: num(g('agua_delta_l')),
    agua_delta_pct: num(g('agua_delta_pct')),
    water_dosage_adj: g<boolean | null>('water_dosage_adj'),
    water_total_adj_l: num(g('water_total_adj_l')),
    relacion_agua_cemento: num(g('relacion_agua_cemento')),
    arido_a_moisture_pct: num(g('arido_a_moisture_pct')),
    arido_b_moisture_pct: num(g('arido_b_moisture_pct')),
    cemento_kg: num(g('cemento_kg')),
    cemento_kg_teor: num(g('cemento_kg_teor')),
    cemento_delta_pct: num(g('cemento_delta_pct')),
    arido_a_kg: num(g('arido_a_kg')),
    arido_a_kg_teor: num(g('arido_a_kg_teor')),
    arido_a_delta_pct: num(g('arido_a_delta_pct')),
    arido_b_kg: num(g('arido_b_kg')),
    arido_b_kg_teor: num(g('arido_b_kg_teor')),
    arido_b_delta_pct: num(g('arido_b_delta_pct')),
    aditivo1_l: num(g('aditivo1_l')),
    aditivo1_l_teor: num(g('aditivo1_l_teor')),
    aditivo1_delta_pct: num(g('aditivo1_delta_pct')),
    aditivo2_l: num(g('aditivo2_l')),
    aditivo2_l_teor: num(g('aditivo2_l_teor')),
    aditivo2_delta_pct: num(g('aditivo2_delta_pct')),
    aditivo3_l: num(g('aditivo3_l')),
    aditivo3_l_teor: num(g('aditivo3_l_teor')),
    aditivo3_delta_pct: num(g('aditivo3_delta_pct')),
    temp_ambiente_inicio: num(g('temp_ambiente_inicio')),
    temp_ambiente_fin: num(g('temp_ambiente_fin')),
    production_rate: num(g('production_rate')),
    production_rate_adj: g<boolean | null>('production_rate_adj'),
    receta_modificada: !!g('receta_modificada'),
    tuvo_alarma: !!g('tuvo_alarma'),
    cantidad_alarmas: (g<number>('cantidad_alarmas')) ?? 0,
    operador: g<string | null>('operador'),
    id_colada: g<number | null>('id_colada'),
    codigo_interno_colada: g<number | null>('codigo_interno_colada'),
  };
}
