import 'server-only';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import sql from 'mssql';
import { bcConstructionConfigured, bcCompanies, bcCompanyName, getWork, getWorkLines, type WorkLineBC } from '@/lib/bc-construction';

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

const nver = (v: string) => Number(v.replace(/\D/g, '')) || 0;

/**
 * Versión de las líneas de BC que hay que mostrar como "la vigente".
 *
 * OJO con `works.filterVersionCode`: NO es un dato de la obra, es el filtro de
 * versión de la página de BC. Puede quedar apuntando a un reestudio que no tiene
 * líneas (o que las tiene en ₡0) y entonces los importes de la cabecera —que son
 * FlowFields filtrados por ese código— vienen todos en 0, aunque la obra sí tenga
 * presupuesto en otra versión. Por eso acá manda lo que dicen las LÍNEAS: se toma
 * la última versión con importes; el filtro solo se respeta si esa versión tiene
 * importes. Versión '' o 'NO' = presupuesto base de BC (sin reestudio).
 */
export function versionVigente(lineas: WorkLineBC[], filtro = ''): string {
  const post = lineas.filter((l) => l.taskType === 'Posting');
  const conImporte = [...new Set(post.filter((l) => l.lineAmount !== 0).map((l) => l.versionCode))];
  if (filtro && conImporte.includes(filtro)) return filtro;
  if (conImporte.length > 0) return [...conImporte].sort((a, b) => nver(b) - nver(a))[0];
  // Sin importes en ninguna versión: al menos devolver una que exista (estructura).
  const todas = [...new Set(post.map((l) => l.versionCode))];
  if (filtro && todas.includes(filtro)) return filtro;
  return [...todas].sort((a, b) => nver(b) - nver(a))[0] ?? '';
}

/** 'NO'/'' (base de BC, sin reestudio) → null, para no mostrar "NO" como versión. */
export const versionMostrable = (v: string | null | undefined): string | null => {
  const s = (v ?? '').trim();
  return s && s.toUpperCase() !== 'NO' ? s : null;
};

/** Resumen de importes de la obra (venta / costo / indirecto / resultado). */
export interface PresupuestoObraResumen {
  /**
   * 'bc' = líneas de Business Central en vivo (compañía del app)
   * 'bc-otra' = BC en vivo pero en otra compañía (la anterior, ver bcCompanies)
   * 'bi' = snapshot ETL pro_bi.
   */
  fuente: 'bc' | 'bc-otra' | 'bi';
  /** Nombre de la compañía de BC cuando fuente='bc-otra'. */
  compania?: string | null;
  /** Código de versión; null = presupuesto base de BC (sin reestudio). */
  version: string | null;
  venta: number;
  coste: number;
  indirecto: number;
  resultado: number;
  /** Partidas de costo (Posting) que respaldan el importe. 0 = solo cabecera. */
  partidas: number;
  /** Fecha del snapshot cuando fuente='bi' (ISO). */
  fecha: string | null;
}

const tieneImportes = (r: PresupuestoObraResumen | null): boolean =>
  !!r && !!(r.venta || r.coste || r.indirecto);

/**
 * Resumen de la obra desde BC EN VIVO, calculado sobre las LÍNEAS (no sobre los
 * FlowFields de la cabecera, que dependen del filtro de versión — ver
 * versionVigente). Si las líneas de la versión vigente no traen importes se cae a
 * los totales de la cabecera. null si la obra no existe en BC.
 */
export async function resumenPresupuestoBC(obra: string, company?: string): Promise<PresupuestoObraResumen | null> {
  if (!bcConstructionConfigured()) return null;
  const [work, lineas] = await Promise.all([
    getWork(obra, company).catch(() => null),
    getWorkLines(obra, company).catch(() => []),
  ]);
  if (!work && lineas.length === 0) return null;

  const version = versionVigente(lineas, (work?.filterVersionCode ?? '').trim());
  const dela = (tipo: string) =>
    lineas.filter((l) => l.versionCode === version && l.taskType === 'Posting' && l.lineType === tipo);
  const suma = (tipo: string) => dela(tipo).reduce((s, l) => s + l.lineAmount, 0);

  let venta = suma('Sales');
  let coste = suma('Cost');
  let indirecto = suma('Indirect Cost');
  let resultado = venta - coste - indirecto;
  if (!venta && !coste && !indirecto && work) {
    venta = Number(work.salesLineAmount ?? 0);
    coste = Number(work.costLineAmount ?? 0);
    indirecto = Number(work.indirectCostLineAmount ?? 0);
    resultado = Number(work.result ?? venta - coste - indirecto);
  }
  return {
    fuente: 'bc',
    version: versionMostrable(version),
    venta, coste, indirecto, resultado,
    partidas: dela('Cost').length,
    fecha: null,
  };
}

/** Resumen de la obra desde el snapshot ETL (versión vigente de pro_bi). */
export async function resumenPresupuestoBI(obra: string): Promise<PresupuestoObraResumen | null> {
  const pool = await getAdelanteDb();
  const r = await pool.request().input('obra', sql.NVarChar(20), obra).query<{
    version_code: string; fecha: Date | null; venta: number; coste: number;
    indirecto: number; partidas: number;
  }>(`
    WITH v AS (
      SELECT TOP 1 version_code FROM pro_bi.fact_presupuesto
      WHERE works_no = @obra
      ORDER BY CAST(es_ultima_version AS INT) DESC, etl_loaded_at DESC
    )
    SELECT fp.version_code, MAX(fp.etl_loaded_at) AS fecha,
           SUM(CASE WHEN fp.tipo_costo = 'Sales'         THEN fp.line_amount ELSE 0 END) AS venta,
           SUM(CASE WHEN fp.tipo_costo = 'Cost'          THEN fp.line_amount ELSE 0 END) AS coste,
           SUM(CASE WHEN fp.tipo_costo = 'Indirect Cost' THEN fp.line_amount ELSE 0 END) AS indirecto,
           SUM(CASE WHEN fp.tipo_costo = 'Cost'          THEN 1 ELSE 0 END) AS partidas
    FROM pro_bi.fact_presupuesto fp
    WHERE fp.works_no = @obra AND fp.task_type = 'Posting'
      AND fp.version_code = (SELECT version_code FROM v)
    GROUP BY fp.version_code
  `);
  const f = r.recordset[0];
  if (!f) return null;
  const venta = Number(f.venta) || 0, coste = Number(f.coste) || 0, indirecto = Number(f.indirecto) || 0;
  return {
    fuente: 'bi',
    version: versionMostrable(f.version_code),
    venta, coste, indirecto,
    resultado: venta - coste - indirecto,
    partidas: Number(f.partidas) || 0,
    fecha: f.fecha instanceof Date ? f.fecha.toISOString() : null,
  };
}

/**
 * Resumen del presupuesto de la obra tomando la primera fuente que REALMENTE
 * tenga importes, en este orden:
 *
 *   1. BC en vivo, compañía del app (BC_COMPANY_ID).
 *   2. BC en vivo, compañías anteriores (BC_COMPANY_IDS_LEGACY) — hay obras cuyo
 *      presupuesto quedó solo en la compañía vieja del environment.
 *   3. Snapshot ETL pro_bi — obras que en BC quedaron con la estructura en ₡0.
 *
 * Si ninguna tiene importes se devuelve la que al menos tenga partidas, para que
 * la UI pueda decir "hay partidas pero en ₡0" en vez de "sin presupuesto".
 */
export async function resumenPresupuestoObra(obra: string): Promise<PresupuestoObraResumen | null> {
  const [principal, ...otras] = bcCompanies();
  const bc = await resumenPresupuestoBC(obra, principal).catch(() => null);
  if (tieneImportes(bc)) return bc;

  for (const company of otras) {
    const alt = await resumenPresupuestoBC(obra, company).catch(() => null);
    if (tieneImportes(alt)) {
      return { ...alt!, fuente: 'bc-otra', compania: await bcCompanyName(company) };
    }
  }

  const bi = await resumenPresupuestoBI(obra).catch(() => null);
  if (tieneImportes(bi)) return bi;
  return (bc?.partidas ? bc : null) ?? (bi?.partidas ? bi : null) ?? bc ?? bi;
}

/**
 * Detalle por partida leído de BC EN VIVO (workLines), como fallback cuando el
 * snapshot ETL (pro_bi.fact_presupuesto) todavía no tiene la obra — p.ej. obras
 * administrativas o presupuestadas después de la última corrida del ETL. Toma la
 * versión vigente (la última con importes, ver versionVigente) y el costo directo
 * (lineType 'Cost'). `fecha_carga` queda vacío (no viene del ETL).
 */
export async function detallePresupuestoBC(obra: string, company?: string): Promise<PresupuestoDetalle | null> {
  if (!bcConstructionConfigured()) return null;
  const [work, lineas] = await Promise.all([
    getWork(obra, company).catch(() => null),
    getWorkLines(obra, company).catch(() => []),
  ]);
  const cost = lineas.filter((l) => l.lineType === 'Cost');
  if (cost.length === 0) return null;

  const version = versionVigente(cost, (work?.filterVersionCode ?? '').trim());

  const vlines = cost.filter((l) => l.versionCode === version);
  const posting = vlines.filter((l) => l.taskType === 'Posting');
  if (posting.length === 0) return null;
  const totales = vlines.filter((l) => l.taskType === 'Total');
  const total = posting.reduce((s, l) => s + l.lineAmount, 0);
  const pct = (v: number) => (total > 0 ? Math.round((v / total) * 10000) / 100 : 0);
  const porCodigo = (a: { taskNo: string }, b: { taskNo: string }) =>
    a.taskNo.localeCompare(b.taskNo, undefined, { numeric: true });

  return {
    works_no: obra,
    version_code: version,
    es_ultima_version: true,
    fecha_carga: '',
    total_costo: total,
    grupos: totales.sort(porCodigo).map((g) => ({
      task_no: g.taskNo,
      descripcion: g.description,
      total: g.lineAmount,
      peso_pct: pct(g.lineAmount),
    })),
    partidas: posting.sort(porCodigo).map((p) => ({
      task_no: p.taskNo,
      descripcion: p.description,
      cantidad: p.quantity,
      unidad: p.unitOfMeasure,
      precio_unitario: p.unitAmount,
      importe: p.lineAmount,
      peso_pct: pct(p.lineAmount),
    })),
  };
}

/**
 * Detalle de BC recorriendo las compañías: la del app primero y después las
 * anteriores (BC_COMPANY_IDS_LEGACY). Gana la primera que traiga importes; si
 * ninguna los trae, se devuelve lo de la compañía del app (estructura en ₡0).
 */
export async function detallePresupuestoObraBC(
  obra: string,
): Promise<{ detalle: PresupuestoDetalle; compania: string | null } | null> {
  const [principal, ...otras] = bcCompanies();
  const propio = await detallePresupuestoBC(obra, principal).catch(() => null);
  if (propio && propio.total_costo > 0) return { detalle: propio, compania: null };
  for (const company of otras) {
    const alt = await detallePresupuestoBC(obra, company).catch(() => null);
    if (alt && alt.total_costo > 0) return { detalle: alt, compania: await bcCompanyName(company) };
  }
  return propio ? { detalle: propio, compania: null } : null;
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
  // Sin snapshot para esta obra → fallback a BC en vivo (workLines).
  if (!version) return detallePresupuestoBC(obra);

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
