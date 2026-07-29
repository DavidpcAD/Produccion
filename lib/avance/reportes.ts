import type { ConnectionPool } from 'mssql';
import { sql } from '@/lib/db-adelantedb';
import { refrescarEstadoVenta } from '@/lib/avance/venta';
import type { EstadoObra, EstadoVenta, TipoCasa } from '@/lib/avance/types';

/**
 * Motor de reportes de avance — portado EXACTO de las Azure Functions
 * `reportes.ts` y `reportes-obra-avance.ts` de obrascontrol. Calcula, para una
 * semana operativa, los KPIs de cronograma (ponderado por pesos de sprint),
 * costo/económicos (ponderado por presupuesto) y las áreas construidas (m²),
 * leyendo el estado AS-OF la semana pedida.
 *
 * Fórmulas clave (idénticas al original):
 *   crono acumulado  = (Σ frac_sprint hechas + sprints de espera pasados) / total_sprints_tipo · 100
 *   crono esperado   = (días_ef/5) · (100 / total_sprints_tipo) · remanente_sprint_programado
 *   costo acumulado  = Σ (pct/100)·(peso_partida/100)·(monto/total_presup) · 100
 *   m² construidos   = (costo_acum/100) · área_prorrateada
 *   m² de la semana  = (costo_semana/100) · área_prorrateada
 *
 * Tablas obc: obra_estado, avance_sub_partidas, avance_semanal_obra,
 * avance_base_semanal, cierres_produccion, cierre_produccion_snapshots,
 * sub_partidas, sub_partida_tipos, sub_partida_pesos_sprint/_partida, obra_pesos,
 * partidas, tipo_casa_sprints, plan_semanal, sprints_cerrados, vw_obras. Además
 * bi.fact_presupuesto (presupuesto/venta/indirecto) y dbo.V_CasosActivos (venta).
 */

// --------------------------------------------------------------------- Tipos

export type FiltroVenta = 'todas' | 'formalizadas' | 'no_formalizadas';

export interface SemanaReporte {
  id: number;
  anio: number;
  numero_semana: number;
  fecha_inicio: string; // YYYY-MM-DD
  fecha_fin: string; // YYYY-MM-DD
  estado: 'abierta' | 'cerrada';
  descripcion: string | null;
  dias_efectivos: number;
}

export interface ReporteObra {
  codigo: string;
  proyecto_codigo: string;
  bloque_letra: string;
  tipo_casa: TipoCasa | null;
  estado: EstadoObra;
  estado_venta: EstadoVenta | null;
  sprint_es_espera: boolean;
  m2: number;
  sprint_actual: number | null;
  total_sprints: number;
  sprints_cerrados: number;
  crono_acumulado: number;
  crono_semana: number;
  crono_esperado: number;
  subs_total: number;
  subs_completadas: number;
  con_trabajo: boolean;
  costo_acumulado: number;
  costo_semana: number;
  costo_esperado: number;
  m2_semana: number;
  m2_esperado: number;
  m2_acumulado: number;
  monto_semana: number;
  monto_acumulado: number;
  presupuesto: number;
  indirecto_total: number;
  venta_total: number;
  indirecto_semana: number;
  indirecto_acumulado: number;
  venta_semana: number;
  venta_acumulada: number;
  utilidad_semana: number;
  utilidad_acumulada: number;
}

export interface ReporteTotales {
  obras_procesadas: number;
  en_ejecucion: number;
  construccion: number;
  trabajando: number;
  en_espera_sprint: number;
  en_espera: number;
  inactivas: number;
  pendientes: number;
  terminadas: number;
  tipo_1n: number;
  tipo_2n: number;
  sin_formalizar: number;
  formalizadas: number;
  reservadas: number;
  disponibles: number;
  entregadas: number;
  sin_trabajo: number;
  con_trabajo: number;
  area_total: number;
  area_total_sin_inactivas: number;
  m2_semana: number;
  m2_esperado: number;
  crono_real_prom: number;
  crono_esperado_prom: number;
  por_tipo: Record<string, number>;
  costo_real_prom: number;
  costo_esperado_prom: number;
  area_construida: number;
  area_construida_sin_inactivas: number;
  area_por_construir: number;
  area_por_construir_sin_inactivas: number;
  monto_semana: number;
  monto_acumulado: number;
  presupuesto_total: number;
  faltante: number;
  indirecto_semana: number;
  indirecto_acumulado: number;
  venta_semana: number;
  venta_acumulada: number;
  utilidad_semana: number;
  utilidad_acumulada: number;
  indirecto_total: number;
  venta_total: number;
}

export interface CierreInfo {
  id: number;
  fecha_cierre: string;
  tipo: 'A' | 'B';
}

export interface ReporteSemanal {
  semana: SemanaReporte;
  cierre: CierreInfo | null;
  base_semanal: boolean;
  totales: ReporteTotales;
  obras: ReporteObra[];
}

export interface ObraAvanceSub {
  sub_id: number;
  codigo: string;
  nombre: string;
  sprint_numero: number;
  partida_codigo: string;
  partida_nombre: string;
  pct_semana: number;
  pct_actual: number;
  m2_semana: number;
  monto_semana: number;
}

export interface ObraAvanceReporte {
  obra: string;
  semana: SemanaReporte;
  base_semanal: boolean;
  subs: ObraAvanceSub[];
  total_m2_semana: number;
  total_monto_semana: number;
}

// --------------------------------------------------------------------- Helpers

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

// Construcción = obras con trabajo/inversión pendiente: en_ejecucion + en_espera
// (congeladas). NO incluye inactivas, pendientes ni finalizadas.
const CONSTRUCCION: EstadoObra[] = ['en_ejecucion', 'en_espera'];

function pasaFiltroVenta(ev: string | null | undefined, filtro: FiltroVenta): boolean {
  if (filtro === 'todas') return true;
  const esFormalizada = ev === 'formalizada' || ev === 'entregada';
  return filtro === 'formalizadas' ? esFormalizada : !esFormalizada;
}

interface ObraRow {
  codigo: string;
  estado: EstadoObra;
  sprint_actual: number | null;
  tipo_casa: TipoCasa | null;
  estado_venta: EstadoVenta | null;
  proyecto_codigo: string | null;
  bloque_letra: string | null;
  m2: number;
  produjo: number;
  en_foto: number;
}

interface DetalleRow {
  obra_codigo: string;
  sub_partida_id: number;
  sprint_numero: number;
  partida_id: number;
  peso: number | null;
  peso_partida: number | null;
  pct_actual: number;
  pct_base: number;
}

// ----------------------------------------------------------- Reporte semanal

/**
 * Calcula el reporte semanal completo (totales + filas por obra). Puerto exacto
 * de `reporteHandler` de obrascontrol. Read-only. `venta` filtra el reporte
 * completo (conteos, áreas, totales y lista) de forma consistente.
 */
export async function calcularReporteSemanal(
  db: ConnectionPool,
  semanaId: number,
  venta: FiltroVenta = 'todas',
): Promise<ReporteSemanal | null> {
  // 1) Semana operativa.
  const semQ = await db
    .request()
    .input('id', sql.BigInt, semanaId)
    .query<{
      id: number;
      anio: number;
      numero_semana: number;
      fecha_inicio: string;
      fecha_fin: string;
      estado: 'abierta' | 'cerrada';
      descripcion: string | null;
      dias_efectivos: number;
    }>(`
      SELECT id, anio, numero_semana,
             CONVERT(varchar(10), fecha_inicio, 23) AS fecha_inicio,
             CONVERT(varchar(10), fecha_fin, 23) AS fecha_fin,
             estado, descripcion, dias_efectivos
      FROM obc.semanas_operativas WHERE id = @id
    `);
  if (semQ.recordset.length === 0) return null;
  const semana = semQ.recordset[0]!;
  const diasEf = semana.dias_efectivos || 5;

  // 2) Corte A de esa semana, si existe.
  const cierreQ = await db
    .request()
    .input('id', sql.BigInt, semanaId)
    .query<{ id: number; fecha_cierre: string; tipo: 'A' | 'B' }>(`
      SELECT TOP 1 id, CONVERT(varchar(10), fecha_cierre, 23) AS fecha_cierre, tipo
      FROM obc.cierres_produccion
      WHERE semana_operativa_id = @id AND tipo = 'A'
      ORDER BY fecha_cierre DESC
    `);
  const cierre = cierreQ.recordset[0] ?? null;
  const cerrada = cierre !== null;

  // ¿Existe un cierre de una semana ANTERIOR?
  const baseQ = await db
    .request()
    .input('id', sql.BigInt, semanaId)
    .query<{ n: number }>(
      'SELECT COUNT(*) AS n FROM obc.cierres_produccion WHERE semana_operativa_id < @id',
    );
  const hayCierrePrevio = (baseQ.recordset[0]?.n ?? 0) > 0;

  // ¿Esta semana tiene foto de LÍNEA BASE?
  const lbQ = await db
    .request()
    .input('id', sql.BigInt, semanaId)
    .query<{ n: number }>(
      'SELECT COUNT(*) AS n FROM obc.avance_base_semanal WHERE semana_operativa_id = @id',
    );
  const tieneBaseLinea = (lbQ.recordset[0]?.n ?? 0) > 0;
  const baseSemanal = tieneBaseLinea || hayCierrePrevio;

  // Estado AL FIN de la semana = LÍNEA BASE de la semana SIGUIENTE.
  const nextLbQ = await db
    .request()
    .input('id', sql.BigInt, semanaId)
    .query<{ id: number }>(
      'SELECT MIN(semana_operativa_id) AS id FROM obc.avance_base_semanal WHERE semana_operativa_id > @id',
    );
  const nextLbSem = nextLbQ.recordset[0]?.id ?? null;

  // 2c) ¿Hay FOTO por-semana del estado de las obras? (Corte A en avance_semanal_obra).
  const fotoQ = await db
    .request()
    .input('id', sql.BigInt, semanaId)
    .query<{ n: number }>(
      "SELECT COUNT(*) AS n FROM obc.avance_semanal_obra WHERE semana_operativa_id = @id AND tipo_cierre = 'A'",
    );
  const hayFoto = (fotoQ.recordset[0]?.n ?? 0) > 0;
  const esAbierta = semana.estado === 'abierta';

  // 3) Obras del reporte. Estado de venta AS-OF la semana reconstruido desde las
  //    fechas del caso de venta vigente (dbo.V_CasosActivos).
  const ventaCase = `CASE
          WHEN cv.FechaEntrega IS NOT NULL AND cv.FechaEntrega <= @fechaFin THEN 'entregada'
          WHEN cv.FechaFormalizacion IS NOT NULL AND cv.FechaFormalizacion <= @fechaFin THEN 'formalizada'
          WHEN cv.FechaCreacion IS NOT NULL AND CAST(cv.FechaCreacion AS DATE) <= @fechaFin THEN 'reservada'
          ELSE 'disponible' END AS estado_venta`;
  const ventaCol = semana.estado === 'abierta' ? 'e.estado_venta' : ventaCase;
  const casoVigente = (obraKey: string) => `LEFT JOIN (
          SELECT IDBD, FechaFormalizacion, FechaEntrega, FechaCreacion FROM (
            SELECT IDBD, FechaFormalizacion, FechaEntrega, FechaCreacion,
                   ROW_NUMBER() OVER (PARTITION BY IDBD ORDER BY IDCaso DESC) rn
            FROM dbo.V_CasosActivos WHERE IDBD IS NOT NULL
          ) z WHERE rn = 1
        ) cv ON cv.IDBD COLLATE DATABASE_DEFAULT = ${obraKey} COLLATE DATABASE_DEFAULT`;

  const obrasQ = await db
    .request()
    .input('id', sql.BigInt, semanaId)
    .input('fechaFin', sql.Date, semana.fecha_fin)
    .query<ObraRow>(`
      SELECT e.obra_codigo AS codigo,
             COALESCE(aso.estado_obra, e.estado) AS estado,
             COALESCE(aso.sprint_actual, e.sprint_actual) AS sprint_actual,
             COALESCE(e.tipo_casa, o.tipo_casa) AS tipo_casa,
             ${ventaCol},
             o.proyecto_codigo, o.bloque_letra,
             ISNULL(o.area_prorrateada, 0) AS m2,
             CASE WHEN prod.obra_codigo IS NOT NULL THEN 1 ELSE 0 END AS produjo,
             CASE WHEN aso.estado_obra IS NOT NULL THEN 1 ELSE 0 END AS en_foto
       FROM obc.obra_estado e
       LEFT JOIN obc.vw_obras o
         ON o.codigo COLLATE DATABASE_DEFAULT = e.obra_codigo COLLATE DATABASE_DEFAULT
       LEFT JOIN obc.avance_semanal_obra aso
         ON aso.obra_codigo COLLATE DATABASE_DEFAULT = e.obra_codigo COLLATE DATABASE_DEFAULT
        AND aso.semana_operativa_id = @id AND aso.tipo_cierre = 'A'
       LEFT JOIN (
         SELECT DISTINCT sn.obra_codigo
         FROM obc.cierre_produccion_snapshots sn
         JOIN obc.cierres_produccion cp ON cp.id = sn.cierre_produccion_id
         WHERE cp.semana_operativa_id = @id
       ) prod ON prod.obra_codigo COLLATE DATABASE_DEFAULT = e.obra_codigo COLLATE DATABASE_DEFAULT
       ${casoVigente('e.obra_codigo')}`);
  const obrasRows = obrasQ.recordset;

  // 4) Sprints cerrados por obra (conteo).
  const cerradosQ = await db
    .request()
    .query<{ obra_codigo: string; n: number }>(
      'SELECT obra_codigo, COUNT(*) AS n FROM obc.sprints_cerrados GROUP BY obra_codigo',
    );
  const cerradosPorObra = new Map<string, number>();
  for (const r of cerradosQ.recordset) cerradosPorObra.set(r.obra_codigo, Number(r.n));

  // 4b) Sprint de cada obra en la BASE (inicio de la semana).
  const sprintPrevQ = tieneBaseLinea
    ? await db
        .request()
        .input('sem', sql.BigInt, semanaId)
        .query<{ obra_codigo: string; sprint_prev: number | null }>(`
          SELECT obra_codigo, sprint_objetivo AS sprint_prev
          FROM obc.plan_semanal
          WHERE semana_operativa_id = @sem
        `)
    : await db
        .request()
        .input('sem', sql.BigInt, semanaId)
        .query<{ obra_codigo: string; sprint_prev: number | null }>(`
          SELECT obra_codigo, sprint_actual AS sprint_prev
          FROM obc.avance_semanal_obra
          WHERE tipo_cierre = 'A' AND semana_operativa_id = (
            SELECT MAX(semana_operativa_id) FROM obc.avance_semanal_obra
            WHERE tipo_cierre = 'A' AND semana_operativa_id < @sem
          )
        `);
  const sprintPrevPorObra = new Map<string, number>();
  for (const r of sprintPrevQ.recordset)
    if (r.sprint_prev != null) sprintPrevPorObra.set(r.obra_codigo, Number(r.sprint_prev));

  // 5) Detalle de crono por sub-partida.
  const detalleQ = await db
    .request()
    .input('sem', sql.BigInt, semanaId)
    .input('cerrada', sql.Bit, cerrada ? 1 : 0)
    .input('tieneBase', sql.Bit, tieneBaseLinea ? 1 : 0)
    .input('hayFoto', sql.Bit, hayFoto ? 1 : 0)
    .input('esAbierta', sql.Bit, esAbierta ? 1 : 0)
    .input('nextLb', sql.BigInt, nextLbSem)
    .query<DetalleRow>(`
      SELECT e.obra_codigo, sp.id AS sub_partida_id, sp.sprint_numero, sp.partida_id,
             COALESCE(op.peso, cat.peso) AS peso,
             COALESCE(opp.peso, catp.peso) AS peso_partida,
             CASE WHEN @tieneBase = 1 AND @nextLb IS NOT NULL THEN ISNULL(lbNext.pct_completado, 0)
                  WHEN @tieneBase = 1 THEN ISNULL(a.pct_completado, 0)
                  WHEN @cerrada = 1 THEN ISNULL(snapAct.pct, 0)
                  ELSE ISNULL(a.pct_completado, 0) END AS pct_actual,
             CASE WHEN @tieneBase = 1 THEN ISNULL(lb.pct_completado, 0)
                  ELSE ISNULL(snapBase.pct, 0) END AS pct_base
      FROM obc.obra_estado e
      JOIN obc.sub_partidas sp ON sp.activo = 1
      JOIN obc.sub_partida_tipos t ON t.sub_partida_id = sp.id AND t.tipo_casa = e.tipo_casa
      LEFT JOIN obc.obra_pesos op
        ON op.obra_codigo = e.obra_codigo AND op.ambito = 'sprint'
       AND op.scope_id = sp.sprint_numero AND op.sub_partida_id = sp.id
      LEFT JOIN obc.sub_partida_pesos_sprint cat
        ON cat.sprint_numero = sp.sprint_numero AND cat.tipo_casa = e.tipo_casa
       AND cat.sub_partida_id = sp.id
      LEFT JOIN obc.obra_pesos opp
        ON opp.obra_codigo = e.obra_codigo AND opp.ambito = 'partida'
       AND opp.scope_id = sp.partida_id AND opp.sub_partida_id = sp.id
      LEFT JOIN obc.sub_partida_pesos_partida catp
        ON catp.partida_id = sp.partida_id AND catp.tipo_casa = e.tipo_casa
       AND catp.sub_partida_id = sp.id
      LEFT JOIN obc.avance_sub_partidas a
        ON a.obra_codigo = e.obra_codigo AND a.sub_partida_id = sp.id
      LEFT JOIN (
        SELECT s.obra_codigo, s.sub_partida_id, MAX(s.pct_completado) AS pct
        FROM obc.cierre_produccion_snapshots s
        JOIN obc.cierres_produccion cp ON cp.id = s.cierre_produccion_id
        WHERE cp.semana_operativa_id <= @sem
        GROUP BY s.obra_codigo, s.sub_partida_id
      ) snapAct ON snapAct.obra_codigo = e.obra_codigo AND snapAct.sub_partida_id = sp.id
      LEFT JOIN (
        SELECT s.obra_codigo, s.sub_partida_id, MAX(s.pct_completado) AS pct
        FROM obc.cierre_produccion_snapshots s
        JOIN obc.cierres_produccion cp ON cp.id = s.cierre_produccion_id
        WHERE cp.semana_operativa_id < @sem
        GROUP BY s.obra_codigo, s.sub_partida_id
      ) snapBase ON snapBase.obra_codigo = e.obra_codigo AND snapBase.sub_partida_id = sp.id
      LEFT JOIN obc.avance_base_semanal lb
        ON lb.semana_operativa_id = @sem
       AND lb.obra_codigo = e.obra_codigo AND lb.sub_partida_id = sp.id
      LEFT JOIN obc.avance_base_semanal lbNext
        ON lbNext.semana_operativa_id = @nextLb
       AND lbNext.obra_codigo = e.obra_codigo AND lbNext.sub_partida_id = sp.id
      WHERE (
          ((@esAbierta = 1 OR @hayFoto = 0) AND e.estado IN ('en_ejecucion', 'en_espera'))
          OR EXISTS (
             SELECT 1 FROM obc.avance_semanal_obra aso2
             WHERE aso2.obra_codigo COLLATE DATABASE_DEFAULT = e.obra_codigo COLLATE DATABASE_DEFAULT
               AND aso2.semana_operativa_id = @sem AND aso2.tipo_cierre = 'A'
               AND aso2.estado_obra IN ('en_ejecucion', 'en_espera'))
          OR EXISTS (
             SELECT 1 FROM obc.cierre_produccion_snapshots sn2
             JOIN obc.cierres_produccion cp2 ON cp2.id = sn2.cierre_produccion_id
             WHERE cp2.semana_operativa_id = @sem
               AND sn2.obra_codigo COLLATE DATABASE_DEFAULT = e.obra_codigo COLLATE DATABASE_DEFAULT)
        )
        AND e.tipo_casa IS NOT NULL
        AND (COALESCE(op.peso, cat.peso) IS NOT NULL
             OR COALESCE(opp.peso, catp.peso) IS NOT NULL)
    `);

  // 6) Presupuesto por obra+partida (última versión, Posting, Cost).
  const presupQ = await db
    .request()
    .query<{ works_no: string; task_no: string; monto: number }>(`
      SELECT works_no, task_no, SUM(line_amount) AS monto
      FROM bi.fact_presupuesto
      WHERE task_type = 'Posting' AND tipo_costo = 'Cost' AND CAST(es_ultima_version AS INT) = 1
      GROUP BY works_no, task_no
    `);
  const partidasQ = await db
    .request()
    .query<{ id: number; codigo: string }>('SELECT id, codigo FROM obc.partidas');
  const codigoPorPartida = new Map<number, string>();
  for (const p of partidasQ.recordset) codigoPorPartida.set(p.id, p.codigo.toUpperCase());
  const presupPorObra = new Map<string, { partidas: Map<string, number>; total: number }>();
  for (const r of presupQ.recordset) {
    let pe = presupPorObra.get(r.works_no);
    if (!pe) {
      pe = { partidas: new Map(), total: 0 };
      presupPorObra.set(r.works_no, pe);
    }
    const m = Number(r.monto) || 0;
    pe.partidas.set(r.task_no.toUpperCase(), m);
    pe.total += m;
  }

  // 6b) Venta ('Sales') e Indirecto ('Indirect Cost') totales por obra.
  const ventaIndQ = await db
    .request()
    .query<{ works_no: string; venta: number; indirecto: number }>(`
      SELECT works_no,
             SUM(CASE WHEN tipo_costo = 'Sales' THEN line_amount ELSE 0 END) AS venta,
             SUM(CASE WHEN tipo_costo = 'Indirect Cost' THEN line_amount ELSE 0 END) AS indirecto
      FROM bi.fact_presupuesto
      WHERE task_type = 'Posting' AND CAST(es_ultima_version AS INT) = 1
        AND tipo_costo IN ('Sales', 'Indirect Cost')
      GROUP BY works_no
    `);
  const ventaPorObra = new Map<string, number>();
  const indirectoPorObra = new Map<string, number>();
  for (const r of ventaIndQ.recordset) {
    ventaPorObra.set(r.works_no, Number(r.venta) || 0);
    indirectoPorObra.set(r.works_no, Number(r.indirecto) || 0);
  }

  // 7) Total de sprints por tipo de casa (denominador del crono).
  const sprintsTipoQ = await db
    .request()
    .query<{ tipo_casa: string; n: number }>(
      'SELECT tipo_casa, COUNT(*) AS n FROM obc.tipo_casa_sprints GROUP BY tipo_casa',
    );
  const sprintsPorTipo = new Map<string, number>();
  for (const r of sprintsTipoQ.recordset) sprintsPorTipo.set(r.tipo_casa, Number(r.n));

  // 7b) Sprints de espera SIN sub-partidas por tipo.
  const sublessQ = await db.request().query<{ tipo_casa: string; sprint_global: number }>(`
      SELECT tcs.tipo_casa, tcs.sprint_global
      FROM obc.tipo_casa_sprints tcs
      WHERE NOT EXISTS (
        SELECT 1 FROM obc.sub_partidas sp
        JOIN obc.sub_partida_tipos t ON t.sub_partida_id = sp.id AND t.tipo_casa = tcs.tipo_casa
        WHERE sp.sprint_numero = tcs.sprint_global AND sp.activo = 1
      )
    `);
  const sublessPorTipo = new Map<string, number[]>();
  for (const r of sublessQ.recordset) {
    const arr = sublessPorTipo.get(r.tipo_casa) ?? [];
    arr.push(r.sprint_global);
    sublessPorTipo.set(r.tipo_casa, arr);
  }

  // --- Agregación en memoria del crono + costo por obra ---
  interface Agg {
    sprintsConSubs: Set<number>;
    cfActual: number;
    cfDelta: number;
    costoActual: number;
    costoDelta: number;
    costoEsp: number;
    cfBaseSprint: number;
    montoActual: number;
    montoDelta: number;
    subsSprintActual: number;
    subsSprintActualComp: number;
  }
  const aggPorObra = new Map<string, Agg>();
  const sprintActualPorObra = new Map<string, number | null>();
  for (const o of obrasRows) sprintActualPorObra.set(o.codigo, o.sprint_actual);

  // Sprint de referencia para "Subs sprint".
  const refSprintPorObra = new Map<string, number>();
  for (const d of detalleQ.recordset) {
    if (d.peso == null) continue;
    const sa = sprintActualPorObra.get(d.obra_codigo);
    if (sa == null || d.sprint_numero > sa) continue;
    const cur = refSprintPorObra.get(d.obra_codigo) ?? -1;
    if (d.sprint_numero > cur) refSprintPorObra.set(d.obra_codigo, d.sprint_numero);
  }

  for (const d of detalleQ.recordset) {
    let a = aggPorObra.get(d.obra_codigo);
    if (!a) {
      a = {
        sprintsConSubs: new Set(),
        cfActual: 0,
        cfDelta: 0,
        costoActual: 0,
        costoDelta: 0,
        costoEsp: 0,
        cfBaseSprint: 0,
        montoActual: 0,
        montoDelta: 0,
        subsSprintActual: 0,
        subsSprintActualComp: 0,
      };
      aggPorObra.set(d.obra_codigo, a);
    }
    const pctA = Number(d.pct_actual);
    const delta = Math.max(0, pctA - Number(d.pct_base));
    const esSprintActual = d.sprint_numero === sprintActualPorObra.get(d.obra_codigo);
    const esSprintRef = d.sprint_numero === refSprintPorObra.get(d.obra_codigo);

    if (d.peso != null) {
      const pesoS = Number(d.peso) / 100;
      a.sprintsConSubs.add(d.sprint_numero);
      a.cfActual += (pctA / 100) * pesoS;
      a.cfDelta += (delta / 100) * pesoS;
      if (esSprintRef) {
        a.subsSprintActual++;
        if (pctA >= 100) a.subsSprintActualComp++;
      }
      if (esSprintActual) a.cfBaseSprint += (Number(d.pct_base) / 100) * pesoS;
    }

    if (d.peso_partida != null) {
      const presup = presupPorObra.get(d.obra_codigo);
      const monto = presup?.partidas.get(codigoPorPartida.get(d.partida_id) ?? '') ?? 0;
      const total = presup?.total ?? 0;
      const pesoP = Number(d.peso_partida) / 100;
      const subCostoW = total > 0 ? pesoP * (monto / total) : 0;
      a.costoActual += (pctA / 100) * subCostoW;
      a.costoDelta += (delta / 100) * subCostoW;
      a.montoActual += (pctA / 100) * pesoP * monto;
      a.montoDelta += (delta / 100) * pesoP * monto;
      const sprintProg = sprintActualPorObra.get(d.obra_codigo);
      if (sprintProg != null && d.sprint_numero <= sprintProg) {
        a.costoEsp += subCostoW * Math.max(0, 1 - Number(d.pct_base) / 100);
      }
    }
  }

  // --- Filas por obra (solo en construcción) + totales ---
  const obras: ReporteObra[] = [];
  const t: ReporteTotales = {
    obras_procesadas: 0,
    en_ejecucion: 0,
    construccion: 0,
    trabajando: 0,
    en_espera_sprint: 0,
    en_espera: 0,
    inactivas: 0,
    pendientes: 0,
    terminadas: 0,
    tipo_1n: 0,
    tipo_2n: 0,
    sin_formalizar: 0,
    formalizadas: 0,
    reservadas: 0,
    disponibles: 0,
    entregadas: 0,
    sin_trabajo: 0,
    con_trabajo: 0,
    area_total: 0,
    area_total_sin_inactivas: 0,
    m2_semana: 0,
    m2_esperado: 0,
    crono_real_prom: 0,
    crono_esperado_prom: 0,
    por_tipo: {},
    costo_real_prom: 0,
    costo_esperado_prom: 0,
    area_construida: 0,
    area_construida_sin_inactivas: 0,
    area_por_construir: 0,
    area_por_construir_sin_inactivas: 0,
    monto_semana: 0,
    monto_acumulado: 0,
    presupuesto_total: 0,
    faltante: 0,
    indirecto_semana: 0,
    indirecto_acumulado: 0,
    venta_semana: 0,
    venta_acumulada: 0,
    utilidad_semana: 0,
    utilidad_acumulada: 0,
    indirecto_total: 0,
    venta_total: 0,
  };
  let sumaCronoReal = 0;
  let sumaCronoEsp = 0;
  let sumaCostoReal = 0;
  let sumaCostoEsp = 0;
  let nEjec = 0;

  for (const o of obrasRows) {
    if (!pasaFiltroVenta(o.estado_venta, venta)) continue;
    const enRoster = o.en_foto === 1 || o.produjo === 1 || esAbierta || !hayFoto;
    if (!enRoster) continue;
    const estadoEff: EstadoObra =
      o.produjo === 1 && o.estado !== 'en_ejecucion' && o.estado !== 'en_espera'
        ? 'en_ejecucion'
        : o.estado;
    if (estadoEff === 'en_ejecucion') t.en_ejecucion++;
    else if (estadoEff === 'en_espera') t.en_espera++;
    else if (estadoEff === 'inactiva') t.inactivas++;
    else if (estadoEff === 'pendiente') t.pendientes++;
    else if (estadoEff === 'finalizada') t.terminadas++;
    if (estadoEff === 'en_ejecucion' || estadoEff === 'en_espera') {
      t.construccion++;
      if (o.tipo_casa?.startsWith('1N')) t.tipo_1n++;
      else if (o.tipo_casa?.startsWith('2N')) t.tipo_2n++;
      if (estadoEff === 'en_ejecucion') {
        const enSprintEspera =
          o.sprint_actual != null &&
          (o.tipo_casa ? (sublessPorTipo.get(o.tipo_casa) ?? []) : []).includes(o.sprint_actual);
        if (enSprintEspera) t.en_espera_sprint++;
        else t.trabajando++;
      }
      if (o.estado_venta === 'formalizada') t.formalizadas++;
      else if (o.estado_venta === 'reservada') t.reservadas++;
      else if (o.estado_venta === 'disponible') t.disponibles++;
      else if (o.estado_venta === 'entregada') t.entregadas++;
      if (o.estado_venta === 'reservada' || o.estado_venta === 'disponible') t.sin_formalizar++;
    }

    if (!CONSTRUCCION.includes(estadoEff)) continue;

    const m2 = Number(o.m2) || 0;
    t.obras_procesadas++;
    t.area_total += m2;
    if (estadoEff !== 'inactiva') t.area_total_sin_inactivas += m2;
    if (o.tipo_casa) t.por_tipo[o.tipo_casa] = (t.por_tipo[o.tipo_casa] ?? 0) + 1;

    const agg = aggPorObra.get(o.codigo);
    const totalSprintsTipo =
      (o.tipo_casa ? sprintsPorTipo.get(o.tipo_casa) : 0) || (agg ? agg.sprintsConSubs.size : 0);
    const esperasTipo = o.tipo_casa ? (sublessPorTipo.get(o.tipo_casa) ?? []) : [];
    const sublessPasados = esperasTipo.filter(
      (s) => o.sprint_actual != null && s < o.sprint_actual,
    ).length;
    const sprintPrev = sprintPrevPorObra.get(o.codigo) ?? null;
    const sublessPasadosPrev = esperasTipo.filter(
      (s) => sprintPrev != null && s < sprintPrev,
    ).length;
    const deltaSubless = Math.max(0, sublessPasados - sublessPasadosPrev);
    const sprintEsEspera = o.sprint_actual != null && esperasTipo.includes(o.sprint_actual);
    const cfA = agg ? agg.cfActual : 0;
    const cfD = agg ? agg.cfDelta : 0;
    const cronoAcum =
      totalSprintsTipo > 0 ? Math.min(100, ((cfA + sublessPasados) / totalSprintsTipo) * 100) : 0;
    const cronoSemana =
      totalSprintsTipo > 0
        ? Math.max(0, Math.min(cronoAcum, ((cfD + deltaSubless) / totalSprintsTipo) * 100))
        : 0;
    const esperadoAplica = estadoEff === 'en_ejecucion' && !sprintEsEspera;
    const remSprint = Math.max(0, 1 - Math.min(1, agg?.cfBaseSprint ?? 0));
    const cronoEsp =
      esperadoAplica && totalSprintsTipo > 0
        ? (diasEf / 5) * (100 / totalSprintsTipo) * remSprint
        : 0;
    const costoAcum = Math.min(100, agg ? agg.costoActual * 100 : 0);
    const costoSemana = Math.max(0, Math.min(costoAcum, agg ? agg.costoDelta * 100 : 0));
    const costoEsp = esperadoAplica && agg ? agg.costoEsp * 100 : 0;
    const montoSemana = agg ? agg.montoDelta : 0;
    const montoAcum = agg ? agg.montoActual : 0;
    const presupuesto = presupPorObra.get(o.codigo)?.total ?? 0;
    const areaConstruidaObra = (costoAcum / 100) * m2;
    const conTrabajo = cronoSemana > 0.01 || costoSemana > 0.01;

    const indirectoTotal = indirectoPorObra.get(o.codigo) ?? 0;
    const ventaTotal = ventaPorObra.get(o.codigo) ?? 0;
    const fAcum = costoAcum / 100;
    const fSem = costoSemana / 100;
    const indirectoSem = fSem * indirectoTotal;
    const indirectoAcum = fAcum * indirectoTotal;
    const ventaSem = fSem * ventaTotal;
    const ventaAcum = fAcum * ventaTotal;
    const utilidadSem = ventaSem - montoSemana - indirectoSem;
    const utilidadAcum = ventaAcum - montoAcum - indirectoAcum;

    t.area_construida += areaConstruidaObra;
    if (estadoEff !== 'inactiva') t.area_construida_sin_inactivas += areaConstruidaObra;
    t.monto_semana += montoSemana;
    t.monto_acumulado += montoAcum;
    t.presupuesto_total += presupuesto;
    t.indirecto_semana += indirectoSem;
    t.indirecto_acumulado += indirectoAcum;
    t.venta_semana += ventaSem;
    t.venta_acumulada += ventaAcum;
    t.utilidad_semana += utilidadSem;
    t.utilidad_acumulada += utilidadAcum;
    t.indirecto_total += indirectoTotal;
    t.venta_total += ventaTotal;
    t.m2_semana += (costoSemana / 100) * m2;

    if (estadoEff === 'en_ejecucion') {
      nEjec++;
      sumaCronoReal += cronoSemana;
      sumaCronoEsp += cronoEsp;
      sumaCostoReal += costoSemana;
      sumaCostoEsp += costoEsp;
      t.m2_esperado += (costoEsp / 100) * m2;
      if (conTrabajo) t.con_trabajo++;
      else t.sin_trabajo++;
    }

    obras.push({
      codigo: o.codigo,
      proyecto_codigo: o.proyecto_codigo ?? '—',
      bloque_letra: o.bloque_letra ?? '—',
      tipo_casa: o.tipo_casa,
      estado: estadoEff,
      estado_venta: o.estado_venta,
      sprint_es_espera: sprintEsEspera,
      m2: redondear(m2),
      sprint_actual: o.sprint_actual,
      total_sprints: totalSprintsTipo,
      sprints_cerrados: cerradosPorObra.get(o.codigo) ?? 0,
      crono_acumulado: redondear(cronoAcum),
      crono_semana: redondear(cronoSemana),
      crono_esperado: redondear(cronoEsp),
      subs_total: agg?.subsSprintActual ?? 0,
      subs_completadas: agg?.subsSprintActualComp ?? 0,
      con_trabajo: conTrabajo,
      costo_acumulado: redondear(costoAcum),
      costo_semana: redondear(costoSemana),
      costo_esperado: redondear(costoEsp),
      m2_semana: redondear((costoSemana / 100) * m2),
      m2_esperado: redondear((costoEsp / 100) * m2),
      m2_acumulado: redondear((costoAcum / 100) * m2),
      monto_semana: Math.round(montoSemana),
      monto_acumulado: Math.round(montoAcum),
      presupuesto: Math.round(presupuesto),
      indirecto_total: Math.round(indirectoTotal),
      venta_total: Math.round(ventaTotal),
      indirecto_semana: Math.round(indirectoSem),
      indirecto_acumulado: Math.round(indirectoAcum),
      venta_semana: Math.round(ventaSem),
      venta_acumulada: Math.round(ventaAcum),
      utilidad_semana: Math.round(utilidadSem),
      utilidad_acumulada: Math.round(utilidadAcum),
    });
  }

  obras.sort(
    (a, b) =>
      a.proyecto_codigo.localeCompare(b.proyecto_codigo) ||
      a.bloque_letra.localeCompare(b.bloque_letra) ||
      a.codigo.localeCompare(b.codigo),
  );

  t.area_total = redondear(t.area_total);
  t.area_total_sin_inactivas = redondear(t.area_total_sin_inactivas);
  t.area_construida = redondear(t.area_construida);
  t.area_construida_sin_inactivas = redondear(t.area_construida_sin_inactivas);
  t.area_por_construir = redondear(Math.max(0, t.area_total - t.area_construida));
  t.area_por_construir_sin_inactivas = redondear(
    Math.max(0, t.area_total_sin_inactivas - t.area_construida_sin_inactivas),
  );
  t.m2_semana = redondear(t.m2_semana);
  t.m2_esperado = redondear(t.m2_esperado);
  t.monto_semana = Math.round(t.monto_semana);
  t.monto_acumulado = Math.round(t.monto_acumulado);
  t.presupuesto_total = Math.round(t.presupuesto_total);
  t.faltante = Math.max(0, t.presupuesto_total - t.monto_acumulado);
  t.indirecto_semana = Math.round(t.indirecto_semana);
  t.indirecto_acumulado = Math.round(t.indirecto_acumulado);
  t.venta_semana = Math.round(t.venta_semana);
  t.venta_acumulada = Math.round(t.venta_acumulada);
  t.utilidad_semana = Math.round(t.utilidad_semana);
  t.utilidad_acumulada = Math.round(t.utilidad_acumulada);
  t.indirecto_total = Math.round(t.indirecto_total);
  t.venta_total = Math.round(t.venta_total);
  t.crono_real_prom = nEjec > 0 ? redondear(sumaCronoReal / nEjec) : 0;
  t.crono_esperado_prom = nEjec > 0 ? redondear(sumaCronoEsp / nEjec) : 0;
  t.costo_real_prom = nEjec > 0 ? redondear(sumaCostoReal / nEjec) : 0;
  t.costo_esperado_prom = nEjec > 0 ? redondear(sumaCostoEsp / nEjec) : 0;

  return {
    semana: {
      id: Number(semana.id),
      anio: semana.anio,
      numero_semana: semana.numero_semana,
      fecha_inicio: semana.fecha_inicio,
      fecha_fin: semana.fecha_fin,
      estado: semana.estado,
      descripcion: semana.descripcion,
      dias_efectivos: semana.dias_efectivos,
    },
    cierre: cierre ? { id: Number(cierre.id), fecha_cierre: cierre.fecha_cierre, tipo: cierre.tipo } : null,
    base_semanal: baseSemanal,
    totales: t,
    obras,
  };
}

// -------------------------------------------------------- Drill-down por obra

interface ObraAvanceDetRow {
  sub_partida_id: number;
  codigo: string;
  nombre: string;
  sprint_numero: number;
  partida_id: number;
  partida_codigo: string;
  partida_nombre: string;
  peso_partida: number | null;
  pct_actual: number;
  pct_base: number;
}

/**
 * Drill-down de una obra: las sub-partidas que AVANZARON esta semana, con su %
 * de la semana, m² y ₡. Puerto exacto de `reportes-obra-avance.ts`.
 */
export async function calcularObraAvance(
  db: ConnectionPool,
  semanaId: number,
  obra: string,
): Promise<ObraAvanceReporte | null> {
  const semQ = await db
    .request()
    .input('id', sql.BigInt, semanaId)
    .query<SemanaReporte & { id: number }>(`
      SELECT id, anio, numero_semana,
             CONVERT(varchar(10), fecha_inicio, 23) AS fecha_inicio,
             CONVERT(varchar(10), fecha_fin, 23) AS fecha_fin,
             estado, descripcion, dias_efectivos
      FROM obc.semanas_operativas WHERE id = @id
    `);
  if (semQ.recordset.length === 0) return null;
  const semana = semQ.recordset[0]!;

  const cerrada =
    ((
      await db
        .request()
        .input('id', sql.BigInt, semanaId)
        .query<{ n: number }>(
          "SELECT COUNT(*) AS n FROM obc.cierres_produccion WHERE semana_operativa_id = @id AND tipo = 'A'",
        )
    ).recordset[0]?.n ?? 0) > 0;
  const hayCierrePrevio =
    ((
      await db
        .request()
        .input('id', sql.BigInt, semanaId)
        .query<{ n: number }>(
          'SELECT COUNT(*) AS n FROM obc.cierres_produccion WHERE semana_operativa_id < @id',
        )
    ).recordset[0]?.n ?? 0) > 0;
  const tieneBaseLinea =
    ((
      await db
        .request()
        .input('id', sql.BigInt, semanaId)
        .query<{ n: number }>(
          'SELECT COUNT(*) AS n FROM obc.avance_base_semanal WHERE semana_operativa_id = @id',
        )
    ).recordset[0]?.n ?? 0) > 0;
  const baseSemanal = tieneBaseLinea || hayCierrePrevio;

  const nextLbSem =
    (
      await db
        .request()
        .input('id', sql.BigInt, semanaId)
        .query<{ id: number }>(
          'SELECT MIN(semana_operativa_id) AS id FROM obc.avance_base_semanal WHERE semana_operativa_id > @id',
        )
    ).recordset[0]?.id ?? null;

  const areaQ = await db
    .request()
    .input('o', sql.NVarChar(20), obra)
    .query<{ m2: number }>(
      'SELECT ISNULL(area_prorrateada, 0) AS m2 FROM obc.vw_obras WHERE codigo = @o',
    );
  const area = Number(areaQ.recordset[0]?.m2 ?? 0);

  const presupQ = await db
    .request()
    .input('o', sql.NVarChar(20), obra)
    .query<{ task_no: string; monto: number }>(`
      SELECT task_no, SUM(line_amount) AS monto
      FROM bi.fact_presupuesto
      WHERE works_no = @o AND task_type = 'Posting' AND tipo_costo = 'Cost'
        AND CAST(es_ultima_version AS INT) = 1
      GROUP BY task_no
    `);
  const montoPorPartida = new Map<string, number>();
  let totalPresup = 0;
  for (const r of presupQ.recordset) {
    const m = Number(r.monto) || 0;
    montoPorPartida.set(r.task_no.toUpperCase(), m);
    totalPresup += m;
  }
  const codPartQ = await db
    .request()
    .query<{ id: number; codigo: string }>('SELECT id, codigo FROM obc.partidas');
  const codigoPorPartida = new Map<number, string>();
  for (const p of codPartQ.recordset) codigoPorPartida.set(p.id, p.codigo.toUpperCase());

  const detalleQ = await db
    .request()
    .input('o', sql.NVarChar(20), obra)
    .input('sem', sql.BigInt, semanaId)
    .input('cerrada', sql.Bit, cerrada ? 1 : 0)
    .input('tieneBase', sql.Bit, tieneBaseLinea ? 1 : 0)
    .input('nextLb', sql.BigInt, nextLbSem)
    .query<ObraAvanceDetRow>(`
      SELECT sp.id AS sub_partida_id, sp.codigo, sp.nombre, sp.sprint_numero, sp.partida_id,
             p.codigo AS partida_codigo, p.nombre AS partida_nombre,
             COALESCE(opp.peso, catp.peso) AS peso_partida,
             CASE WHEN @tieneBase = 1 AND @nextLb IS NOT NULL THEN ISNULL(lbNext.pct_completado, 0)
                  WHEN @tieneBase = 1 THEN ISNULL(a.pct_completado, 0)
                  WHEN @cerrada = 1 THEN ISNULL(snapAct.pct, 0)
                  ELSE ISNULL(a.pct_completado, 0) END AS pct_actual,
             CASE WHEN @tieneBase = 1 THEN ISNULL(lb.pct_completado, 0)
                  ELSE ISNULL(snapBase.pct, 0) END AS pct_base
      FROM obc.obra_estado e
      JOIN obc.sub_partidas sp ON sp.activo = 1
      JOIN obc.sub_partida_tipos t ON t.sub_partida_id = sp.id AND t.tipo_casa = e.tipo_casa
      JOIN obc.partidas p ON p.id = sp.partida_id
      LEFT JOIN obc.obra_pesos opp
        ON opp.obra_codigo = e.obra_codigo AND opp.ambito = 'partida'
       AND opp.scope_id = sp.partida_id AND opp.sub_partida_id = sp.id
      LEFT JOIN obc.sub_partida_pesos_partida catp
        ON catp.partida_id = sp.partida_id AND catp.tipo_casa = e.tipo_casa
       AND catp.sub_partida_id = sp.id
      LEFT JOIN obc.avance_sub_partidas a
        ON a.obra_codigo = e.obra_codigo AND a.sub_partida_id = sp.id
      LEFT JOIN (
        SELECT s.obra_codigo, s.sub_partida_id, MAX(s.pct_completado) AS pct
        FROM obc.cierre_produccion_snapshots s
        JOIN obc.cierres_produccion cp ON cp.id = s.cierre_produccion_id
        WHERE cp.semana_operativa_id <= @sem
        GROUP BY s.obra_codigo, s.sub_partida_id
      ) snapAct ON snapAct.obra_codigo = e.obra_codigo AND snapAct.sub_partida_id = sp.id
      LEFT JOIN (
        SELECT s.obra_codigo, s.sub_partida_id, MAX(s.pct_completado) AS pct
        FROM obc.cierre_produccion_snapshots s
        JOIN obc.cierres_produccion cp ON cp.id = s.cierre_produccion_id
        WHERE cp.semana_operativa_id < @sem
        GROUP BY s.obra_codigo, s.sub_partida_id
      ) snapBase ON snapBase.obra_codigo = e.obra_codigo AND snapBase.sub_partida_id = sp.id
      LEFT JOIN obc.avance_base_semanal lb
        ON lb.semana_operativa_id = @sem
       AND lb.obra_codigo = e.obra_codigo AND lb.sub_partida_id = sp.id
      LEFT JOIN obc.avance_base_semanal lbNext
        ON lbNext.semana_operativa_id = @nextLb
       AND lbNext.obra_codigo = e.obra_codigo AND lbNext.sub_partida_id = sp.id
      WHERE e.obra_codigo = @o AND e.tipo_casa IS NOT NULL
        AND COALESCE(opp.peso, catp.peso) IS NOT NULL
    `);

  const subs: ObraAvanceSub[] = [];
  let totalM2 = 0;
  let totalMonto = 0;
  for (const d of detalleQ.recordset) {
    if (d.peso_partida == null) continue;
    const pctA = Number(d.pct_actual);
    const delta = Math.max(0, pctA - Number(d.pct_base));
    if (delta <= 0.001) continue;
    const pesoP = Number(d.peso_partida) / 100;
    const monto = montoPorPartida.get(codigoPorPartida.get(d.partida_id) ?? '') ?? 0;
    const subCostoW = totalPresup > 0 ? pesoP * (monto / totalPresup) : 0;
    const m2 = (delta / 100) * subCostoW * area;
    const montoSem = (delta / 100) * pesoP * monto;
    totalM2 += m2;
    totalMonto += montoSem;
    subs.push({
      sub_id: d.sub_partida_id,
      codigo: d.codigo,
      nombre: d.nombre,
      sprint_numero: d.sprint_numero,
      partida_codigo: d.partida_codigo,
      partida_nombre: d.partida_nombre,
      pct_semana: redondear(delta),
      pct_actual: redondear(pctA),
      m2_semana: redondear(m2),
      monto_semana: Math.round(montoSem),
    });
  }
  subs.sort((a, b) => b.monto_semana - a.monto_semana || b.m2_semana - a.m2_semana);

  return {
    obra,
    semana: {
      id: Number(semana.id),
      anio: semana.anio,
      numero_semana: semana.numero_semana,
      fecha_inicio: semana.fecha_inicio,
      fecha_fin: semana.fecha_fin,
      estado: semana.estado,
      descripcion: semana.descripcion,
      dias_efectivos: semana.dias_efectivos,
    },
    base_semanal: baseSemanal,
    subs,
    total_m2_semana: redondear(totalM2),
    total_monto_semana: Math.round(totalMonto),
  };
}

// ------------------------------------------------------------- Resumen del mes

export interface FilaResumenMes {
  semana: SemanaReporte;
  base_semanal: boolean;
  crono_esp: number;
  crono_real: number;
  costo_esp: number;
  costo_real: number;
  // Financiero — producido en la semana (₡).
  directo: number;
  indirecto: number;
  venta: number;
  utilidad: number;
}

export interface ResumenMes {
  mes: string; // YYYY-MM
  filas: FilaResumenMes[];
  tot: { crono_esp: number; crono_real: number; costo_esp: number; costo_real: number };
  tot_fin: { directo: number; indirecto: number; venta: number; utilidad: number };
  dif_crono: number;
  dif_costo: number;
}

/**
 * Resumen del Mes: por cada semana operativa del MISMO MES que la seleccionada,
 * corre el reporte semanal y arma la tabla Crono/Costo esperado vs real + los
 * totales financieros producidos (Directo/Indirecto/Venta/Utilidad), con el
 * acumulado a la fecha y la diferencia. Puerto server-side de `useResumenMes`.
 *
 * El mes se determina por el YYYY-MM de fecha_inicio de la semana seleccionada.
 */
export async function calcularResumenMes(
  db: ConnectionPool,
  semanaSel: number,
  venta: FiltroVenta = 'todas',
): Promise<ResumenMes | null> {
  // Todas las semanas operativas (id + fecha_inicio) para agrupar por mes.
  const semanasQ = await db.request().query<{ id: number; fecha_inicio: string }>(`
    SELECT id, CONVERT(varchar(10), fecha_inicio, 23) AS fecha_inicio
    FROM obc.semanas_operativas
    ORDER BY fecha_inicio ASC
  `);
  const sel = semanasQ.recordset.find((s) => Number(s.id) === semanaSel);
  if (!sel) return null;
  const mes = sel.fecha_inicio.slice(0, 7); // YYYY-MM
  const delMes = semanasQ.recordset
    .filter((s) => s.fecha_inicio.slice(0, 7) === mes)
    .sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio));

  const filas: FilaResumenMes[] = [];
  for (const s of delMes) {
    const rep = await calcularReporteSemanal(db, Number(s.id), venta);
    if (!rep) continue;
    const t = rep.totales;
    filas.push({
      semana: rep.semana,
      base_semanal: rep.base_semanal,
      crono_esp: t.crono_esperado_prom,
      crono_real: t.crono_real_prom,
      costo_esp: t.costo_esperado_prom,
      costo_real: t.costo_real_prom,
      directo: t.monto_semana,
      indirecto: t.indirecto_semana,
      venta: t.venta_semana,
      utilidad: t.utilidad_semana,
    });
  }

  const tot = filas.reduce(
    (a, f) => ({
      crono_esp: a.crono_esp + f.crono_esp,
      crono_real: a.crono_real + (f.base_semanal ? f.crono_real : 0),
      costo_esp: a.costo_esp + f.costo_esp,
      costo_real: a.costo_real + (f.base_semanal ? f.costo_real : 0),
    }),
    { crono_esp: 0, crono_real: 0, costo_esp: 0, costo_real: 0 },
  );
  const totFin = filas.reduce(
    (a, f) => ({
      directo: a.directo + (f.base_semanal ? f.directo : 0),
      indirecto: a.indirecto + (f.base_semanal ? f.indirecto : 0),
      venta: a.venta + (f.base_semanal ? f.venta : 0),
      utilidad: a.utilidad + (f.base_semanal ? f.utilidad : 0),
    }),
    { directo: 0, indirecto: 0, venta: 0, utilidad: 0 },
  );

  return {
    mes,
    filas,
    tot: {
      crono_esp: redondear(tot.crono_esp),
      crono_real: redondear(tot.crono_real),
      costo_esp: redondear(tot.costo_esp),
      costo_real: redondear(tot.costo_real),
    },
    tot_fin: totFin,
    dif_crono: redondear(tot.crono_real - tot.crono_esp),
    dif_costo: redondear(tot.costo_real - tot.costo_esp),
  };
}

export { refrescarEstadoVenta };
