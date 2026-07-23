import type sqlModule from 'mssql';
import { sql } from '@/lib/db-adelantedb';
import type {
  BatchResumenEnColada,
  CilindroEnColada,
  ColadaDetalle,
  ColadaListadoItem,
  EstadoColada,
} from './tipos';

// Portado de `api/src/lib/consultar-coladas.ts` + `obtener-colada.ts` de la app
// original. SQL contra los schemas `hor` (concreto) y la dependencia externa
// de solo-lectura `bi.dim_obra` (data warehouse de Business Central).

export interface ListarColadasParams {
  estado?: EstadoColada[];
  id_planta?: number;
  desde?: string; // YYYY-MM-DD
  hasta?: string; // YYYY-MM-DD
  q?: string;
  pagina: number;
  por_pagina: number;
}

function isoDate(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : String(d);
}

/**
 * Listado paginado de coladas con filtros opcionales por estado, planta, fecha
 * y substring (destino / receta blend / obra). Los JOIN a plantas/recetas/
 * destinos evitan N+1 en la UI.
 */
export async function consultarColadas(
  pool: sqlModule.ConnectionPool,
  params: ListarColadasParams,
): Promise<{ coladas: ColadaListadoItem[]; total: number; pagina: number; por_pagina: number }> {
  const { estado, id_planta, desde, hasta, q, pagina, por_pagina } = params;

  const filtros: string[] = [];
  if (estado && estado.length > 0) {
    // Whitelist: cada valor ya viene validado como EstadoColada.
    const lista = estado.map((e) => `'${e}'`).join(',');
    filtros.push(`c.estado IN (${lista})`);
  }
  if (id_planta !== undefined) filtros.push('c.id_planta = @id_planta');
  if (desde !== undefined) filtros.push('CAST(c.fecha_inicio AS DATE) >= @desde');
  if (hasta !== undefined) filtros.push('CAST(c.fecha_inicio AS DATE) <= @hasta');
  if (q !== undefined) {
    filtros.push(
      `(c.destino_raw LIKE @q
        OR dc.nombre_canonico LIKE @q
        OR rb.nombre_texto LIKE @q
        OR c.obra_works_no LIKE @q
        OR obra.display_name COLLATE DATABASE_DEFAULT LIKE @q COLLATE DATABASE_DEFAULT)`,
    );
  }
  const whereClause = filtros.length > 0 ? `WHERE ${filtros.join(' AND ')}` : '';
  const offset = (pagina - 1) * por_pagina;

  const reqItems = pool
    .request()
    .input('offset', sql.Int, offset)
    .input('por_pagina', sql.Int, por_pagina);
  if (id_planta !== undefined) reqItems.input('id_planta', sql.Int, id_planta);
  if (desde !== undefined) reqItems.input('desde', sql.Date, desde);
  if (hasta !== undefined) reqItems.input('hasta', sql.Date, hasta);
  if (q !== undefined) reqItems.input('q', sql.NVarChar(202), `%${q}%`);

  const rItems = await reqItems.query(`
    SELECT
      c.id_colada,
      c.codigo_interno,
      c.estado,
      p.codigo                  AS planta_codigo,
      p.serial                  AS planta_serial,
      rb.nombre_texto           AS receta_blend_nombre,
      rc.codigo_bc              AS codigo_receta_bc,
      rc.descripcion            AS descripcion_receta_bc,
      c.destino_raw,
      c.id_destino_canonico,
      dc.nombre_canonico        AS nombre_canonico,
      c.fecha_inicio,
      c.fecha_fin,
      c.m3_producidos,
      c.cantidad_batches,
      c.cantidad_alarmas_total,
      c.tuvo_alarma,
      c.numero_pedido_ensamblado_bc,
      c.obra_works_no,
      obra.display_name         AS obra_display_name,
      c.motivo_anulacion
    FROM hor.coladas c
    INNER JOIN hor.plantas p             ON p.id = c.id_planta
    INNER JOIN hor.recetas_blend rb      ON rb.id = c.id_receta_blend
    LEFT  JOIN hor.recetas_bc rc         ON rc.id = c.id_receta_bc
    LEFT  JOIN hor.destinos_canonicos dc ON dc.id_destino_canonico = c.id_destino_canonico
    LEFT  JOIN bi.dim_obra obra
      ON obra.works_no COLLATE DATABASE_DEFAULT = c.obra_works_no COLLATE DATABASE_DEFAULT
    ${whereClause}
    ORDER BY c.fecha_inicio DESC, c.codigo_interno DESC
    OFFSET @offset ROWS
    FETCH NEXT @por_pagina ROWS ONLY
  `);

  const reqTotal = pool.request();
  if (id_planta !== undefined) reqTotal.input('id_planta', sql.Int, id_planta);
  if (desde !== undefined) reqTotal.input('desde', sql.Date, desde);
  if (hasta !== undefined) reqTotal.input('hasta', sql.Date, hasta);
  if (q !== undefined) reqTotal.input('q', sql.NVarChar(202), `%${q}%`);

  const rTotal = await reqTotal.query(`
    SELECT COUNT(*) AS total
    FROM hor.coladas c
    INNER JOIN hor.recetas_blend rb      ON rb.id = c.id_receta_blend
    LEFT  JOIN hor.destinos_canonicos dc ON dc.id_destino_canonico = c.id_destino_canonico
    LEFT  JOIN bi.dim_obra obra
      ON obra.works_no COLLATE DATABASE_DEFAULT = c.obra_works_no COLLATE DATABASE_DEFAULT
    ${whereClause}
  `);

  const coladas: ColadaListadoItem[] = rItems.recordset.map((row) => ({
    id_colada: row.id_colada,
    codigo_interno: row.codigo_interno,
    estado: row.estado as EstadoColada,
    planta_nombre: row.planta_codigo,
    planta_serial: row.planta_serial,
    receta_blend_nombre: row.receta_blend_nombre,
    codigo_receta_bc: row.codigo_receta_bc,
    descripcion_receta_bc: row.descripcion_receta_bc,
    destino_display: row.nombre_canonico ?? row.destino_raw,
    destino_raw: row.destino_raw,
    id_destino_canonico: row.id_destino_canonico,
    nombre_canonico: row.nombre_canonico,
    fecha_inicio: isoDate(row.fecha_inicio),
    fecha_fin: isoDate(row.fecha_fin),
    m3_producidos: Number(row.m3_producidos),
    cantidad_batches: row.cantidad_batches,
    cantidad_alarmas_total: row.cantidad_alarmas_total,
    tuvo_alarma: !!row.tuvo_alarma,
    numero_pedido_ensamblado_bc: row.numero_pedido_ensamblado_bc,
    obra_works_no: row.obra_works_no,
    obra_display_name: row.obra_display_name,
    motivo_anulacion: row.motivo_anulacion,
  }));

  return { coladas, total: rTotal.recordset[0]?.total ?? 0, pagina, por_pagina };
}

/**
 * Detalle de una colada: header + batches (incluidos y excluidos, vía
 * junction `hor.colada_batches`) + cilindros del laboratorio de campo.
 * Devuelve `null` si no existe.
 */
export async function obtenerColada(
  pool: sqlModule.ConnectionPool,
  idColada: number,
): Promise<ColadaDetalle | null> {
  const rColada = await pool.request().input('id', sql.Int, idColada).query(`
    SELECT
      c.id_colada,
      c.codigo_interno,
      c.estado,
      p.codigo                AS planta_codigo,
      p.serial                AS planta_serial,
      rb.nombre_texto         AS receta_blend_nombre,
      rc.codigo_bc            AS codigo_receta_bc,
      rc.descripcion          AS descripcion_receta_bc,
      (SELECT TOP 1 mr.fc_teorica_kg_cm2
       FROM hor.mapeo_recetas mr
       WHERE mr.id_receta_blend = c.id_receta_blend
         AND mr.vigente_desde <= CAST(GETUTCDATE() AS DATE)
         AND (mr.vigente_hasta IS NULL OR mr.vigente_hasta >= CAST(GETUTCDATE() AS DATE))
       ORDER BY mr.vigente_desde DESC)  AS fc_teorica_kg_cm2,
      c.destino_raw,
      c.id_destino_canonico,
      dc.nombre_canonico,
      c.fecha_inicio,
      c.fecha_fin,
      c.m3_producidos,
      c.cantidad_batches,
      c.cantidad_alarmas_total,
      c.tuvo_alarma,
      c.relacion_agua_cemento_promedio,
      c.numero_pedido_ensamblado_bc,
      c.obra_works_no,
      obra.display_name         AS obra_display_name,
      c.creada_en,
      c.actualizada_en,
      c.motivo_anulacion
    FROM hor.coladas c
    INNER JOIN hor.plantas p             ON p.id = c.id_planta
    INNER JOIN hor.recetas_blend rb      ON rb.id = c.id_receta_blend
    LEFT  JOIN hor.recetas_bc rc         ON rc.id = c.id_receta_bc
    LEFT  JOIN hor.destinos_canonicos dc ON dc.id_destino_canonico = c.id_destino_canonico
    LEFT  JOIN bi.dim_obra obra
      ON obra.works_no COLLATE DATABASE_DEFAULT = c.obra_works_no COLLATE DATABASE_DEFAULT
    WHERE c.id_colada = @id
  `);

  const h = rColada.recordset[0];
  if (!h) return null;

  const rBatches = await pool.request().input('id', sql.Int, idColada).query(`
    SELECT
      b.id AS id_batch,
      b.record_no,
      b.fecha_inicio,
      b.m3_producidos,
      b.relacion_agua_cemento,
      b.tuvo_alarma,
      b.cantidad_alarmas,
      cb.excluido,
      cb.excluido_motivo
    FROM hor.colada_batches cb
    INNER JOIN hor.batches b ON b.id = cb.id_batch
    WHERE cb.id_colada = @id
    ORDER BY b.fecha_inicio
  `);

  const batches: BatchResumenEnColada[] = rBatches.recordset.map((row) => ({
    id_batch: row.id_batch,
    record_no: row.record_no,
    fecha_inicio: isoDate(row.fecha_inicio),
    m3_producidos: Number(row.m3_producidos),
    ac_real: row.relacion_agua_cemento === null ? null : Number(row.relacion_agua_cemento),
    tuvo_alarma: !!row.tuvo_alarma,
    cantidad_alarmas: row.cantidad_alarmas,
    excluido: !!row.excluido,
    excluido_motivo: row.excluido_motivo,
  }));

  const rCilindros = await pool.request().input('id', sql.Int, idColada).query(`
    SELECT
      id_cilindro, numero_serie, fecha_toma, slump_cm,
      fecha_ensayo_7d, resistencia_7d_kg_cm2,
      fecha_ensayo_28d, resistencia_28d_kg_cm2, observaciones
    FROM hor.cilindros
    WHERE id_colada = @id
    ORDER BY fecha_toma, numero_serie
  `);

  const cilindros: CilindroEnColada[] = rCilindros.recordset.map((row) => ({
    id_cilindro: row.id_cilindro,
    numero_serie: row.numero_serie,
    fecha_toma: isoDate(row.fecha_toma).slice(0, 10),
    slump_cm: row.slump_cm === null ? null : Number(row.slump_cm),
    fecha_ensayo_7d: row.fecha_ensayo_7d ? isoDate(row.fecha_ensayo_7d).slice(0, 10) : null,
    resistencia_7d_kg_cm2:
      row.resistencia_7d_kg_cm2 === null ? null : Number(row.resistencia_7d_kg_cm2),
    fecha_ensayo_28d: row.fecha_ensayo_28d ? isoDate(row.fecha_ensayo_28d).slice(0, 10) : null,
    resistencia_28d_kg_cm2:
      row.resistencia_28d_kg_cm2 === null ? null : Number(row.resistencia_28d_kg_cm2),
    observaciones: row.observaciones,
  }));

  return {
    colada: {
      id_colada: h.id_colada,
      codigo_interno: h.codigo_interno,
      estado: h.estado as EstadoColada,
      planta_nombre: h.planta_codigo,
      planta_serial: h.planta_serial,
      receta_blend_nombre: h.receta_blend_nombre,
      codigo_receta_bc: h.codigo_receta_bc,
      descripcion_receta_bc: h.descripcion_receta_bc,
      destino_display: h.nombre_canonico ?? h.destino_raw,
      destino_raw: h.destino_raw,
      id_destino_canonico: h.id_destino_canonico,
      nombre_canonico: h.nombre_canonico,
      fecha_inicio: isoDate(h.fecha_inicio),
      fecha_fin: isoDate(h.fecha_fin),
      m3_producidos: Number(h.m3_producidos),
      cantidad_batches: h.cantidad_batches,
      cantidad_alarmas_total: h.cantidad_alarmas_total,
      tuvo_alarma: !!h.tuvo_alarma,
      numero_pedido_ensamblado_bc: h.numero_pedido_ensamblado_bc,
      obra_works_no: h.obra_works_no,
      obra_display_name: h.obra_display_name,
      relacion_agua_cemento_promedio:
        h.relacion_agua_cemento_promedio === null
          ? null
          : Number(h.relacion_agua_cemento_promedio),
      fc_teorica_kg_cm2: h.fc_teorica_kg_cm2 === null ? null : Number(h.fc_teorica_kg_cm2),
      motivo_anulacion: h.motivo_anulacion,
      creada_en: isoDate(h.creada_en),
      actualizada_en: isoDate(h.actualizada_en),
    },
    batches,
    cilindros,
  };
}
