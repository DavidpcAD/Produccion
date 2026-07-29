import type { ConnectionPool } from 'mssql';
import { sql } from '@/lib/db-adelantedb';
import type { SemanaReporte } from '@/lib/avance/reportes';
import type { TipoCasa } from '@/lib/avance/types';

/**
 * Histórico — grilla sub-partida × obra para una semana. Puerto de la Azure
 * Function `historico.ts` de obrascontrol. Si la semana tiene Cierre, el % sale
 * de la FOTO del cierre (carry-forward MAX sobre cierres ≤ semana); si está
 * abierta, estado vivo. Alimenta las 3 vistas (Por Sprint, Por Partida, Kanban).
 * Read-only.
 */

export interface HistoricoObra {
  codigo: string;
  tipo_casa: TipoCasa | null;
  sprint_actual: number | null;
}

export interface HistoricoSub {
  id: number;
  codigo: string;
  nombre: string;
  sprint_numero: number;
  partida_id: number;
  partida_codigo: string;
  partida_nombre: string;
  es_critica: boolean;
}

export interface HistoricoReporte {
  semana: SemanaReporte;
  cerrada: boolean;
  obras: HistoricoObra[];
  subs: HistoricoSub[];
  celdas: Record<string, number>; // clave `${obra}|${sub_partida_id}` → % al fin
  avanceSemana: string[]; // claves que tuvieron avance esta semana
}

export async function calcularHistorico(
  db: ConnectionPool,
  semanaId: number,
): Promise<HistoricoReporte | null> {
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

  // ¿La semana tiene Cierre A? → leemos la foto; si no, estado vivo.
  const cerrada =
    ((
      await db
        .request()
        .input('id', sql.BigInt, semanaId)
        .query<{ n: number }>(
          "SELECT COUNT(*) AS n FROM obc.cierres_produccion WHERE semana_operativa_id = @id AND tipo = 'A'",
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

  // Obras (columnas) — en ejecución, con tipo. Con foto: su sprint de ESA semana.
  const obrasQ = await db
    .request()
    .input('id', sql.BigInt, semanaId)
    .query<HistoricoObra>(
      hayFoto
        ? `SELECT aso.obra_codigo AS codigo, e.tipo_casa, aso.sprint_actual
           FROM obc.avance_semanal_obra aso
           JOIN obc.obra_estado e
             ON e.obra_codigo COLLATE DATABASE_DEFAULT = aso.obra_codigo COLLATE DATABASE_DEFAULT
           WHERE aso.semana_operativa_id = @id AND aso.tipo_cierre = 'A'
             AND aso.estado_obra = 'en_ejecucion' AND e.tipo_casa IS NOT NULL
           ORDER BY aso.obra_codigo`
        : `SELECT obra_codigo AS codigo, tipo_casa, sprint_actual
           FROM obc.obra_estado
           WHERE estado = 'en_ejecucion' AND tipo_casa IS NOT NULL
           ORDER BY obra_codigo`,
    );
  const obras: HistoricoObra[] = obrasQ.recordset;
  const obrasSet = new Set(obras.map((o) => o.codigo));

  // Sub-partidas (filas) con su partida.
  const subsQ = await db.request().query<{
    id: number;
    codigo: string;
    nombre: string;
    sprint_numero: number;
    partida_id: number;
    partida_codigo: string;
    partida_nombre: string;
    es_critica: boolean;
  }>(`
    SELECT sp.id, sp.codigo, sp.nombre, sp.sprint_numero, sp.partida_id,
           p.codigo AS partida_codigo, p.nombre AS partida_nombre, sp.es_critica
    FROM obc.sub_partidas sp
    JOIN obc.partidas p ON p.id = sp.partida_id
    WHERE sp.activo = 1
    ORDER BY sp.sprint_numero, sp.codigo
  `);
  const subs: HistoricoSub[] = subsQ.recordset.map((s) => ({ ...s, es_critica: !!s.es_critica }));

  // Aplicabilidad: qué sub-partidas aplican a cada tipo de casa.
  const tiposQ = await db
    .request()
    .query<{ sub_partida_id: number; tipo_casa: TipoCasa }>(
      'SELECT sub_partida_id, tipo_casa FROM obc.sub_partida_tipos',
    );
  const subsPorTipo = new Map<string, Set<number>>();
  for (const r of tiposQ.recordset) {
    const set = subsPorTipo.get(r.tipo_casa) ?? new Set<number>();
    set.add(r.sub_partida_id);
    subsPorTipo.set(r.tipo_casa, set);
  }

  // % por (obra, sub) al FIN de la semana ("ahora" de la celda).
  const avQ =
    tieneBaseLinea && nextLbSem != null
      ? await db
          .request()
          .input('next', sql.BigInt, nextLbSem)
          .query<{ obra_codigo: string; sub_partida_id: number; pct: number }>(
            'SELECT obra_codigo, sub_partida_id, pct_completado AS pct FROM obc.avance_base_semanal WHERE semana_operativa_id = @next',
          )
      : tieneBaseLinea
        ? await db
            .request()
            .query<{ obra_codigo: string; sub_partida_id: number; pct: number }>(
              'SELECT obra_codigo, sub_partida_id, pct_completado AS pct FROM obc.avance_sub_partidas',
            )
        : cerrada
          ? await db
              .request()
              .input('sem', sql.BigInt, semanaId)
              .query<{ obra_codigo: string; sub_partida_id: number; pct: number }>(`
                SELECT s.obra_codigo, s.sub_partida_id, MAX(s.pct_completado) AS pct
                FROM obc.cierre_produccion_snapshots s
                JOIN obc.cierres_produccion cp ON cp.id = s.cierre_produccion_id
                WHERE cp.semana_operativa_id <= @sem
                GROUP BY s.obra_codigo, s.sub_partida_id
              `)
          : await db
              .request()
              .query<{ obra_codigo: string; sub_partida_id: number; pct: number }>(
                'SELECT obra_codigo, sub_partida_id, pct_completado AS pct FROM obc.avance_sub_partidas',
              );
  const pctMap = new Map<string, number>();
  for (const a of avQ.recordset) {
    if (!obrasSet.has(a.obra_codigo)) continue;
    pctMap.set(`${a.obra_codigo}|${a.sub_partida_id}`, Number(a.pct));
  }

  // Estado al INICIO de la semana → para saber qué tuvo AVANCE esta semana.
  const priorQ = tieneBaseLinea
    ? await db
        .request()
        .input('sem', sql.BigInt, semanaId)
        .query<{ obra_codigo: string; sub_partida_id: number; pct: number }>(
          'SELECT obra_codigo, sub_partida_id, pct_completado AS pct FROM obc.avance_base_semanal WHERE semana_operativa_id = @sem',
        )
    : await db
        .request()
        .input('sem', sql.BigInt, semanaId)
        .query<{ obra_codigo: string; sub_partida_id: number; pct: number }>(`
          SELECT s.obra_codigo, s.sub_partida_id, MAX(s.pct_completado) AS pct
          FROM obc.cierre_produccion_snapshots s
          JOIN obc.cierres_produccion cp ON cp.id = s.cierre_produccion_id
          WHERE cp.semana_operativa_id < @sem
          GROUP BY s.obra_codigo, s.sub_partida_id
        `);
  const pctPrior = new Map<string, number>();
  for (const a of priorQ.recordset)
    pctPrior.set(`${a.obra_codigo}|${a.sub_partida_id}`, Number(a.pct));

  // Celdas: para cada obra, las subs que APLICAN a su tipo (resto = NA → ausente).
  const celdas: Record<string, number> = {};
  const avanceSemana: string[] = [];
  for (const o of obras) {
    const aplican = o.tipo_casa ? subsPorTipo.get(o.tipo_casa) : undefined;
    if (!aplican) continue;
    for (const s of subs) {
      if (!aplican.has(s.id)) continue;
      const k = `${o.codigo}|${s.id}`;
      const ahora = pctMap.get(k) ?? 0;
      celdas[k] = ahora;
      if (ahora > (pctPrior.get(k) ?? 0)) avanceSemana.push(k);
    }
  }

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
    obras,
    subs,
    celdas,
    avanceSemana,
  };
}
