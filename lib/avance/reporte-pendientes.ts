import type { ConnectionPool } from 'mssql';
import type { TipoCasa } from '@/lib/avance/types';

/**
 * Reporte de Pendientes arrastrados — puerto de la Azure Function
 * `pendientes.ts` de obrascontrol. Sub-partidas PENDIENTES ARRASTRADAS (estado
 * vivo): de sprints anteriores al sprint_actual de cada obra en construcción,
 * sin completar (pct < 100 y no cerradas al 100% por un cierre). Mismo criterio
 * que el "Pendientes Arrastrados" del cierre, agregado para reporte. Read-only.
 */

export interface PendienteItem {
  obra: string;
  tipo_casa: TipoCasa | null;
  proyecto: string;
  sub_id: number;
  sub_codigo: string;
  sub_nombre: string;
  sprint_origen: number;
  sprint_origen_nombre: string | null;
  es_critica: boolean;
  pct: number;
  nc_causa: string | null;
  /** nº de Cortes A ocurridos desde que la obra cerró el sprint origen. */
  sem_arrastrada: number;
}

export interface PendientesReporte {
  items: PendienteItem[];
}

export async function calcularPendientes(db: ConnectionPool): Promise<PendientesReporte> {
  // Arrastradas vivas: sub de sprint < actual, no completada (ni al 100% por cierre).
  const q = await db.request().query<{
    obra: string;
    tipo_casa: TipoCasa | null;
    sub_id: number;
    sub_codigo: string;
    sub_nombre: string;
    sprint_origen: number;
    sprint_origen_nombre: string | null;
    es_critica: boolean;
    pct: number;
    nc_causa: string | null;
  }>(`
    SELECT e.obra_codigo AS obra, e.tipo_casa,
           sp.id AS sub_id, sp.codigo AS sub_codigo, sp.nombre AS sub_nombre,
           sp.sprint_numero AS sprint_origen, sc.nombre AS sprint_origen_nombre,
           sp.es_critica, ISNULL(a.pct_completado, 0) AS pct, a.nc_causa
    FROM pro_obc.obra_estado e
    JOIN pro_obc.sub_partidas sp ON sp.sprint_numero < e.sprint_actual AND sp.activo = 1
    JOIN pro_obc.sub_partida_tipos t ON t.sub_partida_id = sp.id AND t.tipo_casa = e.tipo_casa
    LEFT JOIN pro_obc.sprints_catalogo sc ON sc.numero_global = sp.sprint_numero
    LEFT JOIN pro_obc.avance_sub_partidas a
      ON a.sub_partida_id = sp.id AND a.obra_codigo = e.obra_codigo
    LEFT JOIN (
      SELECT obra_codigo, sub_partida_id, MAX(pct_completado) AS maxpct
      FROM pro_obc.cierre_produccion_snapshots GROUP BY obra_codigo, sub_partida_id
    ) lk ON lk.obra_codigo = e.obra_codigo AND lk.sub_partida_id = sp.id
    WHERE e.estado IN ('en_ejecucion', 'en_espera') AND e.tipo_casa IS NOT NULL
      AND ISNULL(a.completada, 0) = 0
      AND ISNULL(a.pct_completado, 0) < 100
      AND ISNULL(lk.maxpct, 0) < 100
    ORDER BY sp.sprint_numero, sp.codigo, e.obra_codigo
  `);

  // Proyecto (nombre) por código de proyecto (prefijo del código de obra).
  const proyQ = await db
    .request()
    .query<{ codigo: string; nombre: string }>('SELECT codigo, nombre FROM pro_obc.vw_proyectos');
  const nombreProy = new Map<string, string>();
  for (const p of proyQ.recordset) nombreProy.set(p.codigo.toUpperCase(), p.nombre);
  const proyectoDe = (obra: string) => {
    const cod = obra.split('-')[0]?.toUpperCase() ?? '';
    return nombreProy.get(cod) ?? cod;
  };

  // Semanas arrastrada = nº de Cortes A ocurridos DESPUÉS de que se cerró el
  // sprint origen de la obra (cuántas semanas lleva pendiente desde ese sprint).
  const cerrQ = await db
    .request()
    .query<{ obra_codigo: string; sprint_numero: number; semana: number }>(
      'SELECT obra_codigo, sprint_numero, semana_operativa_id AS semana FROM pro_obc.sprints_cerrados',
    );
  const cierreSprintSem = new Map<string, number>();
  for (const r of cerrQ.recordset) {
    const k = `${r.obra_codigo}|${r.sprint_numero}`;
    const prev = cierreSprintSem.get(k);
    if (prev === undefined || Number(r.semana) < prev) cierreSprintSem.set(k, Number(r.semana));
  }
  const semQ = await db
    .request()
    .query<{ semana: number }>(
      "SELECT DISTINCT semana_operativa_id AS semana FROM pro_obc.cierres_produccion WHERE tipo = 'A' ORDER BY semana_operativa_id",
    );
  const semanasCierre = semQ.recordset.map((r) => Number(r.semana));
  const semArrastrada = (obra: string, sprintOrigen: number) => {
    const semCierre = cierreSprintSem.get(`${obra}|${sprintOrigen}`);
    if (semCierre === undefined) return 0; // pasó el sprint sin cierre (avance manual)
    return semanasCierre.filter((s) => s > semCierre).length;
  };

  const items: PendienteItem[] = q.recordset.map((r) => ({
    obra: r.obra,
    tipo_casa: r.tipo_casa,
    proyecto: proyectoDe(r.obra),
    sub_id: r.sub_id,
    sub_codigo: r.sub_codigo,
    sub_nombre: r.sub_nombre,
    sprint_origen: r.sprint_origen,
    sprint_origen_nombre: r.sprint_origen_nombre,
    es_critica: !!r.es_critica,
    pct: Number(r.pct),
    nc_causa: r.nc_causa,
    sem_arrastrada: semArrastrada(r.obra, r.sprint_origen),
  }));

  return { items };
}
