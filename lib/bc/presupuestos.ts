import 'server-only';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import sql from 'mssql';

/**
 * Presupuestos importados desde Business Central (pro_bi.fact_presupuesto, snapshot
 * ETL en AdelanteSBX). Cada obra puede tener varias VERSIONES (version_code, ej.
 * "REESTUDIO1"); la vigente es es_ultima_version = 1.
 *
 *   listarPresupuestos()          — una fila por obra+versión (total de costo).
 *   detallePresupuesto(obra, ver) — resumen por grupo (Total) + partidas (Posting).
 *
 * Importe = tipo_costo 'Cost' a nivel Posting (costo directo), sin CI (Indirect
 * Cost). Mismo criterio que calcularObraAvance y /api/obras/[id]/presupuesto-detalle.
 * Portado de adelante-obrascontrol (bi.* → pro_bi.*, obc.* → pro_obc.*).
 */

const SOLO_COSTO = `tipo_costo = 'Cost'`;

export interface PresupuestoResumen {
  works_no: string;
  version_code: string;
  es_ultima_version: boolean;
  /** etl_loaded_at — cuándo el ETL cargó esta versión. ISO 8601. */
  fecha_carga: string;
  /** Suma de partidas de costo de construcción (sin CI). */
  total_costo: number;
}

export interface PresupuestoGrupo {
  task_no: string; // "1","2","3","4","CI"
  descripcion: string;
  total: number;
  peso_pct: number;
}

export interface PresupuestoPartida {
  task_no: string; // "1.1","2.1"…
  descripcion: string;
  cantidad: number;
  unidad: string | null;
  precio_unitario: number;
  importe: number;
  peso_pct: number;
}

export interface PresupuestoDetalle extends PresupuestoResumen {
  grupos: PresupuestoGrupo[];
  partidas: PresupuestoPartida[];
}

interface FilaResumen {
  works_no: string;
  version_code: string;
  es_ultima_version: number;
  fecha_carga: Date;
  total_costo: number;
}

function mapResumen(r: FilaResumen): PresupuestoResumen {
  return {
    works_no: r.works_no.trim(),
    version_code: r.version_code,
    es_ultima_version: r.es_ultima_version === 1,
    fecha_carga:
      r.fecha_carga instanceof Date ? r.fecha_carga.toISOString() : String(r.fecha_carga ?? ''),
    total_costo: Number(r.total_costo) || 0,
  };
}

/** Listado de versiones de presupuesto por obra (solo viviendas de pro_obc.vw_obras). */
export async function listarPresupuestos(worksNo?: string): Promise<PresupuestoResumen[]> {
  const pool = await getAdelanteDb();
  const req = pool.request();
  // Solo VIVIENDAS: works_no que existen en pro_obc.vw_obras (deja fuera los
  // works_no administrativos de BC — ALM, COM, CS, F, FE, etc.).
  const condiciones = [
    `works_no COLLATE DATABASE_DEFAULT IN
       (SELECT codigo COLLATE DATABASE_DEFAULT FROM pro_obc.vw_obras)`,
  ];
  if (worksNo) {
    condiciones.push('works_no = @works_no');
    req.input('works_no', sql.NVarChar(20), worksNo);
  }
  const result = await req.query<FilaResumen>(`
    SELECT
      works_no,
      version_code,
      MAX(CAST(es_ultima_version AS INT)) AS es_ultima_version,
      MAX(etl_loaded_at) AS fecha_carga,
      SUM(CASE WHEN task_type = 'Posting' AND ${SOLO_COSTO} THEN line_amount ELSE 0 END)
        AS total_costo
    FROM pro_bi.fact_presupuesto
    WHERE ${condiciones.join(' AND ')}
    GROUP BY works_no, version_code
    ORDER BY works_no, MAX(CAST(es_ultima_version AS INT)) DESC, version_code
  `);
  return result.recordset.map(mapResumen);
}

/** Detalle de una versión de presupuesto (grupos + partidas). null si no existe. */
export async function detallePresupuesto(
  obra: string,
  versionParam?: string | null,
): Promise<PresupuestoDetalle | null> {
  const pool = await getAdelanteDb();

  // Resolver versión: la pedida, o la vigente (es_ultima_version=1).
  let version = versionParam ?? null;
  if (!version) {
    const vq = await pool
      .request()
      .input('obra', sql.NVarChar(20), obra)
      .query<{ version_code: string }>(`
        SELECT TOP 1 version_code FROM pro_bi.fact_presupuesto
        WHERE works_no = @obra
        ORDER BY CAST(es_ultima_version AS INT) DESC, etl_loaded_at DESC
      `);
    version = vq.recordset[0]?.version_code ?? null;
  }
  if (!version) return null;

  const resumenQ = await pool
    .request()
    .input('obra', sql.NVarChar(20), obra)
    .input('ver', sql.NVarChar(50), version)
    .query<FilaResumen>(`
      SELECT works_no, version_code,
             MAX(CAST(es_ultima_version AS INT)) AS es_ultima_version,
             MAX(etl_loaded_at) AS fecha_carga,
             SUM(CASE WHEN task_type = 'Posting' AND ${SOLO_COSTO} THEN line_amount ELSE 0 END)
               AS total_costo
      FROM pro_bi.fact_presupuesto
      WHERE works_no = @obra AND version_code = @ver
      GROUP BY works_no, version_code
    `);
  const resumen = resumenQ.recordset[0];
  if (!resumen) return null;
  const total = Number(resumen.total_costo) || 0;
  const pct = (v: number) => (total > 0 ? Math.round((v / total) * 10000) / 100 : 0);

  const [gruposQ, partidasQ] = await Promise.all([
    pool
      .request()
      .input('obra', sql.NVarChar(20), obra)
      .input('ver', sql.NVarChar(50), version)
      .query<{ task_no: string; description: string; line_amount: number }>(`
        SELECT task_no, description, line_amount
        FROM pro_bi.fact_presupuesto
        WHERE works_no = @obra AND version_code = @ver AND task_type = 'Total' AND ${SOLO_COSTO}
        ORDER BY task_no
      `),
    pool
      .request()
      .input('obra', sql.NVarChar(20), obra)
      .input('ver', sql.NVarChar(50), version)
      .query<{
        task_no: string;
        description: string;
        quantity: number;
        unit_of_measure: string | null;
        unit_amount: number;
        line_amount: number;
      }>(`
        SELECT task_no, description, quantity, unit_of_measure, unit_amount, line_amount
        FROM pro_bi.fact_presupuesto
        WHERE works_no = @obra AND version_code = @ver AND task_type = 'Posting' AND ${SOLO_COSTO}
        ORDER BY task_no
      `),
  ]);

  const grupos: PresupuestoGrupo[] = gruposQ.recordset.map((g) => ({
    task_no: g.task_no,
    descripcion: g.description,
    total: Number(g.line_amount) || 0,
    peso_pct: pct(Number(g.line_amount) || 0),
  }));
  const partidas: PresupuestoPartida[] = partidasQ.recordset.map((p) => ({
    task_no: p.task_no,
    descripcion: p.description,
    cantidad: Number(p.quantity) || 0,
    unidad: p.unit_of_measure,
    precio_unitario: Number(p.unit_amount) || 0,
    importe: Number(p.line_amount) || 0,
    peso_pct: pct(Number(p.line_amount) || 0),
  }));

  return { ...mapResumen(resumen), grupos, partidas };
}
