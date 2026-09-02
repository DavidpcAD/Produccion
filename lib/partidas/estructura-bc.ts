import 'server-only';
import { getAdelanteDb, sql } from '@/lib/db-adelantedb';
import { bcCompanies, bcCompanyName, bcConstructionConfigured, getWorkLines } from '@/lib/bc-construction';
import { versionVigente } from '@/lib/bc/presupuestos';
import type { LineaEstructura } from './sync-estructura';

/**
 * LEER DE BC la estructura de presupuesto de una obra (capítulos "Total" y
 * partidas "Posting" de la versión vigente), para meterla al catálogo.
 *
 * Recorre las compañías igual que el resto del app (`bcCompanies()`): primero la
 * del app (BC_COMPANY_ID) y después las anteriores (BC_COMPANY_IDS_LEGACY). Hay
 * obras cuyo presupuesto quedó SOLO en la compañía vieja —las casas de socios, por
 * ejemplo— y sin este recorrido se verían como "sin estructura".
 *
 * Si BC no responde (o no está configurado en el entorno), cae al snapshot del ETL
 * (`pro_bi.fact_presupuesto`) y lo avisa: es mejor traer algo viejo y decirlo que
 * no traer nada.
 *
 * OJO con el ENTORNO: el que manda es BC_BASE_URL / BC_ENVIRONMENT del proceso.
 * En producción eso apunta a BC Production; en local, al Sandbox — que tiene datos
 * de prueba que NO existen en Production.
 */

export type FuenteEstructura = 'bc' | 'bc-otra' | 'snapshot';

export interface EstructuraObra {
  lineas: LineaEstructura[];
  fuente: FuenteEstructura;
  /** Compañía de BC de la que salió, cuando no es la del app. */
  compania: string | null;
  /** Versión de BC de la que se tomó la estructura ('' = base, sin reestudio). */
  version: string | null;
  aviso?: string;
}

/**
 * Capítulos y partidas de la versión vigente de una compañía.
 *
 * Se toma la UNIÓN de las líneas de costo y de venta: una partida es una partida
 * aunque en BC solo tenga línea de venta (pasa en administrativas y en fábrica —
 * F-MUEBLES tiene una así). Es el mismo criterio con el que se sembró el catálogo
 * desde el snapshot del ETL. Las líneas de coste indirecto no aportan estructura:
 * su tarea es el bucket 'CI'.
 */
async function estructuraDeCompania(obra: string, company: string): Promise<{ lineas: LineaEstructura[]; version: string } | null> {
  const todas = await getWorkLines(obra, company);
  if (todas.length === 0) return null;
  const version = versionVigente(todas);
  const deVersion = todas.filter((l) => l.versionCode === version && String(l.taskNo ?? '').trim().toUpperCase() !== 'CI');
  const directas = deVersion.filter((l) => l.lineType === 'Cost' || l.lineType === 'Sales');
  const base = directas.length > 0 ? directas : deVersion;
  if (base.length === 0) return null;
  return {
    version,
    lineas: base.map((l) => ({ taskNo: l.taskNo, taskType: l.taskType, description: l.description })),
  };
}

export async function leerEstructuraBC(obra: string): Promise<EstructuraObra> {
  if (bcConstructionConfigured()) {
    const [principal, ...otras] = bcCompanies();
    const errores: string[] = [];
    try {
      const propia = await estructuraDeCompania(obra, principal);
      if (propia) return { ...propia, fuente: 'bc', compania: null };
    } catch (e) {
      errores.push(e instanceof Error ? e.message : String(e));
    }
    for (const company of otras) {
      try {
        const alt = await estructuraDeCompania(obra, company);
        if (alt) {
          const nombre = await bcCompanyName(company).catch(() => null);
          return {
            ...alt, fuente: 'bc-otra', compania: nombre,
            aviso: `${obra}: la estructura está en la compañía ${nombre ?? company} de BC, no en la del app.`,
          };
        }
      } catch (e) {
        errores.push(e instanceof Error ? e.message : String(e));
      }
    }
    if (errores.length === 0) {
      return { lineas: [], fuente: 'bc', compania: null, version: null, aviso: `${obra}: BC no tiene líneas de presupuesto.` };
    }
    const snap = await leerEstructuraSnapshot(obra);
    return { ...snap, aviso: `${obra}: BC falló (${errores[0]}); se usó el snapshot del ETL.` };
  }
  const snap = await leerEstructuraSnapshot(obra);
  return { ...snap, aviso: `${obra}: Business Central no está configurado en este entorno; se usó el snapshot del ETL.` };
}

/** Respaldo: la estructura como la dejó el ETL en pro_bi.fact_presupuesto. */
export async function leerEstructuraSnapshot(obra: string): Promise<EstructuraObra> {
  const db = await getAdelanteDb();
  const r = await db.request()
    .input('obra', sql.NVarChar(20), obra)
    .query<{ task_no: string; task_type: string; description: string; version_code: string }>(`
      SELECT DISTINCT task_no, task_type, description, version_code
      FROM pro_bi.fact_presupuesto
      WHERE works_no = @obra AND es_ultima_version = 1 AND tipo_costo IN ('Cost','Sales')
        AND NULLIF(LTRIM(RTRIM(task_no)), '') IS NOT NULL AND task_no <> 'CI'
    `);
  return {
    lineas: r.recordset.map((f) => ({
      taskNo: String(f.task_no ?? '').trim(),
      taskType: String(f.task_type ?? '').trim(),
      description: String(f.description ?? '').trim(),
    })),
    fuente: 'snapshot',
    compania: null,
    version: r.recordset[0]?.version_code ?? null,
  };
}
