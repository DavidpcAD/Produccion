import type { ConnectionPool } from 'mssql';
import { sql } from '@/lib/db-adelantedb';
import type { SemanaReporte } from '@/lib/avance/reportes';
import type { TipoCasa } from '@/lib/avance/types';

/**
 * Reporte de m² producidos por partida / sub-partida — puerto de la Azure
 * Function `reportes-m2.ts` de obrascontrol. Descompone el KPI "M² construidos
 * semana" (del motor de avance) al nivel de cada sub-partida. Para cada
 * obra × sub-partida:
 *
 *   subCostoW    = (peso de la sub en la partida) × (presupuesto partida / total)
 *   m² semana    = max(0, %ahora − %inicio) / 100 × subCostoW × área prorrateada
 *   m² acumulado = %ahora / 100 × subCostoW × área prorrateada
 *
 * Mismos pesos, presupuesto y base "as-of la semana" que el reporte semanal, así
 * la suma de m² de la semana reconcilia con el KPI. Read-only.
 */

// --------------------------------------------------------------------- Tipos

export interface M2Celda {
  s: number; // m² de la semana
  a: number; // m² acumulados
}

export interface M2Sub {
  id: number;
  codigo: string;
  nombre: string;
  sprint_numero: number;
  m2_semana: number;
  m2_acumulado: number;
}

export interface M2Partida {
  partida_id: number;
  partida_codigo: string;
  partida_nombre: string;
  m2_semana: number;
  m2_acumulado: number;
  subs: M2Sub[];
}

export interface M2Obra {
  codigo: string;
  tipo_casa: TipoCasa | null;
  sprint_actual: number | null;
  m2_semana: number;
  m2_acumulado: number;
}

export interface M2Reporte {
  semana: SemanaReporte;
  cerrada: boolean;
  base_semanal: boolean;
  total_semana: number;
  total_acumulado: number;
  partidas: M2Partida[];
  obras: M2Obra[];
  celdas: Record<string, M2Celda>; // clave `${obra}|${sub_partida_id}`
}

interface DetalleRow {
  obra_codigo: string;
  sub_partida_id: number;
  sprint_numero: number;
  partida_id: number;
  peso_partida: number | null;
  pct_actual: number;
  pct_base: number;
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

// ------------------------------------------------------------------- Cálculo

export async function calcularReporteM2(
  db: ConnectionPool,
  semanaId: number,
): Promise<M2Reporte | null> {
  // 1) Semana.
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

  // 2) Flags de cierre / base / foto (misma lógica que el reporte semanal).
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

  const hayFoto =
    ((
      await db
        .request()
        .input('id', sql.BigInt, semanaId)
        .query<{ n: number }>(
          "SELECT COUNT(*) AS n FROM obc.avance_semanal_obra WHERE semana_operativa_id = @id AND tipo_cierre = 'A'",
        )
    ).recordset[0]?.n ?? 0) > 0;
  const esAbierta = semana.estado === 'abierta';

  // 3) Obras: área prorrateada + tipo + sprint AS-OF la semana + roster.
  const obrasQ = await db
    .request()
    .input('id', sql.BigInt, semanaId)
    .query<{
      codigo: string;
      estado: string;
      sprint_actual: number | null;
      tipo_casa: TipoCasa | null;
      m2: number;
      produjo: number;
      en_foto: number;
    }>(`
      SELECT e.obra_codigo AS codigo,
             COALESCE(aso.estado_obra, e.estado) AS estado,
             COALESCE(aso.sprint_actual, e.sprint_actual) AS sprint_actual,
             COALESCE(e.tipo_casa, o.tipo_casa) AS tipo_casa,
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
    `);

  const areaPorObra = new Map<string, number>();
  const obraMeta = new Map<string, { tipo_casa: TipoCasa | null; sprint_actual: number | null }>();
  for (const o of obrasQ.recordset) {
    const enRoster = o.en_foto === 1 || o.produjo === 1 || esAbierta || !hayFoto;
    if (!enRoster) continue;
    const estadoEff =
      o.produjo === 1 && o.estado !== 'en_ejecucion' && o.estado !== 'en_espera'
        ? 'en_ejecucion'
        : o.estado;
    if (estadoEff !== 'en_ejecucion' && estadoEff !== 'en_espera') continue;
    areaPorObra.set(o.codigo, Number(o.m2) || 0);
    obraMeta.set(o.codigo, { tipo_casa: o.tipo_casa, sprint_actual: o.sprint_actual });
  }

  // 4) Detalle por sub-partida (peso de partida + pct as-of + pct base).
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
        AND COALESCE(opp.peso, catp.peso) IS NOT NULL
    `);

  // 5) Presupuesto por obra+partida → participación de cada partida en la obra.
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
    .query<{ id: number; codigo: string; nombre: string }>(
      'SELECT id, codigo, nombre FROM obc.partidas',
    );
  const codigoPorPartida = new Map<number, string>();
  const partidaMeta = new Map<number, { codigo: string; nombre: string }>();
  for (const p of partidasQ.recordset) {
    codigoPorPartida.set(p.id, p.codigo.toUpperCase());
    partidaMeta.set(p.id, { codigo: p.codigo, nombre: p.nombre });
  }
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

  // 6) Metadata de sub-partidas (código, nombre, partida).
  const subsQ = await db.request().query<{
    id: number;
    codigo: string;
    nombre: string;
    sprint_numero: number;
    partida_id: number;
  }>(`
    SELECT id, codigo, nombre, sprint_numero, partida_id
    FROM obc.sub_partidas WHERE activo = 1
  `);
  const subMeta = new Map<
    number,
    { codigo: string; nombre: string; sprint_numero: number; partida_id: number }
  >();
  for (const s of subsQ.recordset) subMeta.set(s.id, s);

  // --- Cálculo de m² por (obra, sub) ---
  interface Acc {
    m2s: number;
    m2a: number;
  }
  const porSub = new Map<number, Acc>();
  const porObra = new Map<string, Acc>();
  const celdas: Record<string, M2Celda> = {};

  for (const d of detalleQ.recordset) {
    const area = areaPorObra.get(d.obra_codigo);
    if (area == null) continue; // obra fuera del roster de construcción
    if (d.peso_partida == null) continue;
    const presup = presupPorObra.get(d.obra_codigo);
    const monto = presup?.partidas.get(codigoPorPartida.get(d.partida_id) ?? '') ?? 0;
    const total = presup?.total ?? 0;
    if (total <= 0) continue;
    const subCostoW = (Number(d.peso_partida) / 100) * (monto / total);
    const pctA = Number(d.pct_actual);
    const delta = Math.max(0, pctA - Number(d.pct_base));
    const m2a = (pctA / 100) * subCostoW * area;
    const m2s = (delta / 100) * subCostoW * area;
    if (m2a <= 0 && m2s <= 0) continue;

    const s = porSub.get(d.sub_partida_id) ?? { m2s: 0, m2a: 0 };
    s.m2s += m2s;
    s.m2a += m2a;
    porSub.set(d.sub_partida_id, s);

    const o = porObra.get(d.obra_codigo) ?? { m2s: 0, m2a: 0 };
    o.m2s += m2s;
    o.m2a += m2a;
    porObra.set(d.obra_codigo, o);

    const k = `${d.obra_codigo}|${d.sub_partida_id}`;
    celdas[k] = { s: redondear(m2s), a: redondear(m2a) };
  }

  // --- Agregado por partida → sub-partida ---
  const partidasMap = new Map<number, M2Partida>();
  for (const [subId, acc] of porSub) {
    const meta = subMeta.get(subId);
    if (!meta) continue;
    const pmeta = partidaMeta.get(meta.partida_id);
    let p = partidasMap.get(meta.partida_id);
    if (!p) {
      p = {
        partida_id: meta.partida_id,
        partida_codigo: pmeta?.codigo ?? '—',
        partida_nombre: pmeta?.nombre ?? '—',
        m2_semana: 0,
        m2_acumulado: 0,
        subs: [],
      };
      partidasMap.set(meta.partida_id, p);
    }
    const sub: M2Sub = {
      id: subId,
      codigo: meta.codigo,
      nombre: meta.nombre,
      sprint_numero: meta.sprint_numero,
      m2_semana: redondear(acc.m2s),
      m2_acumulado: redondear(acc.m2a),
    };
    p.subs.push(sub);
    p.m2_semana += acc.m2s;
    p.m2_acumulado += acc.m2a;
  }
  const partidas: M2Partida[] = [...partidasMap.values()]
    .map((p) => ({
      ...p,
      m2_semana: redondear(p.m2_semana),
      m2_acumulado: redondear(p.m2_acumulado),
      subs: p.subs.sort((a, b) => a.codigo.localeCompare(b.codigo)),
    }))
    .sort((a, b) => a.partida_codigo.localeCompare(b.partida_codigo, undefined, { numeric: true }));

  // --- Obras (columnas de la matriz) ---
  const obras: M2Obra[] = [...porObra.entries()]
    .map(([codigo, acc]) => ({
      codigo,
      tipo_casa: obraMeta.get(codigo)?.tipo_casa ?? null,
      sprint_actual: obraMeta.get(codigo)?.sprint_actual ?? null,
      m2_semana: redondear(acc.m2s),
      m2_acumulado: redondear(acc.m2a),
    }))
    .sort((a, b) => a.codigo.localeCompare(b.codigo));

  const total_semana = redondear([...porSub.values()].reduce((acc, s) => acc + s.m2s, 0));
  const total_acumulado = redondear([...porSub.values()].reduce((acc, s) => acc + s.m2a, 0));

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
    cerrada,
    base_semanal: baseSemanal,
    total_semana,
    total_acumulado,
    partidas,
    obras,
    celdas,
  };
}
