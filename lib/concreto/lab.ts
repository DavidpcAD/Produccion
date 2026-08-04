import type sqlModule from 'mssql';
import { sql } from '@/lib/db-adelantedb';
import type {
  ActividadLab,
  EnsayoDetalle,
  MedicionLab,
  MuestraDetalle,
  MuestraListadoItem,
} from './tipos';

// Portado de `api/src/lib/lab-dominio.ts`. Laboratorio de concreto: muestras
// (grupos de probetas), ensayos (uno por edad) y mediciones (cada probeta).
// La vista `pro_lab.v_ensayos_resumen` precalcula promedio/min/max y convierte
// MPa → kg/cm² (× 10.197).

function rowToFecha(d: Date | string): string {
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

// SELECT base de muestra reutilizado por listar + obtener. LEFT JOIN a
// recetas_bc/coladas/pro_bi.dim_obra para que la muestra sobreviva sin vínculos.
const SELECT_MUESTRA_BASE = `
  SELECT
    m.id,
    m.numero_muestra,
    m.obra_works_no,
    obra.display_name                       AS obra_display_name,
    m.id_casa,
    m.planta_nombre,
    m.id_actividad,
    a.nombre                                AS actividad_nombre,
    m.fecha_colado,
    m.proveedor,
    m.id_colada,
    c.codigo_interno                        AS codigo_interno_colada,
    m.id_receta_bc,
    rbc.codigo_bc                           AS receta_bc_codigo,
    rbc.descripcion                         AS receta_bc_descripcion,
    m.fc_objetivo,
    m.tipo_concreto_libre,
    COALESCE(rbc.descripcion, m.tipo_concreto_libre,
             CONCAT(N'F''C ', m.fc_objetivo, N' KG/CM²'))  AS tipo_concreto_display,
    m.notas,
    m.creado_por_email,
    (SELECT COUNT(*) FROM pro_lab.ensayos e WHERE e.id_muestra = m.id) AS cantidad_ensayos
  FROM pro_lab.muestras m
  INNER JOIN pro_lab.actividades a            ON a.id = m.id_actividad
  LEFT  JOIN pro_hor.coladas c                ON c.id_colada = m.id_colada
  LEFT  JOIN pro_hor.recetas_bc rbc           ON rbc.id = m.id_receta_bc
  LEFT  JOIN pro_bi.dim_obra obra
    ON obra.works_no COLLATE DATABASE_DEFAULT = m.obra_works_no COLLATE DATABASE_DEFAULT
`;

function mapMuestraBase(row: Record<string, unknown>): Omit<MuestraListadoItem, 'ensayos'> {
  return {
    id: row.id as number,
    numero_muestra: row.numero_muestra as number,
    obra_works_no: (row.obra_works_no as string | null) ?? null,
    obra_display_name: (row.obra_display_name as string | null) ?? null,
    id_casa: (row.id_casa as string | null) ?? null,
    planta_nombre: (row.planta_nombre as string | null) ?? null,
    id_actividad: row.id_actividad as number,
    actividad_nombre: row.actividad_nombre as string,
    fecha_colado: rowToFecha(row.fecha_colado as Date | string),
    proveedor: row.proveedor as string,
    id_colada: (row.id_colada as number | null) ?? null,
    codigo_interno_colada: (row.codigo_interno_colada as number | null) ?? null,
    id_receta_bc: (row.id_receta_bc as number | null) ?? null,
    receta_bc_codigo: (row.receta_bc_codigo as string | null) ?? null,
    receta_bc_descripcion: (row.receta_bc_descripcion as string | null) ?? null,
    fc_objetivo: row.fc_objetivo as number,
    tipo_concreto_display: row.tipo_concreto_display as string,
    notas: (row.notas as string | null) ?? null,
    creado_por_email: (row.creado_por_email as string | null) ?? null,
    cantidad_ensayos: row.cantidad_ensayos as number,
  };
}

export interface ListarMuestrasParams {
  obra_works_no?: string;
  id_actividad?: number;
  fc_objetivo?: number;
  desde?: string;
  hasta?: string;
  q?: string;
  pagina: number;
  por_pagina: number;
}

/** Listado paginado de muestras con edades ensayadas (para chips de resultado). */
export async function consultarMuestras(
  pool: sqlModule.ConnectionPool,
  params: ListarMuestrasParams,
): Promise<{ muestras: MuestraListadoItem[]; total: number; pagina: number; por_pagina: number }> {
  const { obra_works_no, id_actividad, fc_objetivo, desde, hasta, q, pagina, por_pagina } = params;

  const filtros: string[] = [];
  if (obra_works_no !== undefined) {
    filtros.push(
      `(m.obra_works_no LIKE @obra_works_no
        OR obra.display_name COLLATE DATABASE_DEFAULT LIKE @obra_works_no COLLATE DATABASE_DEFAULT)`,
    );
  }
  if (id_actividad !== undefined) filtros.push('m.id_actividad = @id_actividad');
  if (fc_objetivo !== undefined) filtros.push('m.fc_objetivo = @fc_objetivo');
  if (desde !== undefined) filtros.push('m.fecha_colado >= @desde');
  if (hasta !== undefined) filtros.push('m.fecha_colado <= @hasta');
  if (q !== undefined) {
    filtros.push(
      '(m.id_casa LIKE @q OR a.nombre LIKE @q OR m.proveedor LIKE @q OR obra.display_name LIKE @q)',
    );
  }
  const whereClause = filtros.length > 0 ? `WHERE ${filtros.join(' AND ')}` : '';
  const offset = (pagina - 1) * por_pagina;

  const reqItems = pool
    .request()
    .input('offset', sql.Int, offset)
    .input('por_pagina', sql.Int, por_pagina);
  if (obra_works_no !== undefined)
    reqItems.input('obra_works_no', sql.NVarChar(102), `%${obra_works_no}%`);
  if (id_actividad !== undefined) reqItems.input('id_actividad', sql.Int, id_actividad);
  if (fc_objetivo !== undefined) reqItems.input('fc_objetivo', sql.Int, fc_objetivo);
  if (desde !== undefined) reqItems.input('desde', sql.Date, desde);
  if (hasta !== undefined) reqItems.input('hasta', sql.Date, hasta);
  if (q !== undefined) reqItems.input('q', sql.NVarChar(102), `%${q}%`);

  const rItems = await reqItems.query(`
    ${SELECT_MUESTRA_BASE}
    ${whereClause}
    ORDER BY m.fecha_colado DESC, m.numero_muestra DESC
    OFFSET @offset ROWS FETCH NEXT @por_pagina ROWS ONLY
  `);

  // Edades ensayadas por muestra (para mostrar resultados en la lista).
  const ids = rItems.recordset.map((r) => r.id as number);
  const ensayosPorMuestra = new Map<number, { edad_dias: number; resistencia_kg_cm2_promedio: number | null }[]>();
  if (ids.length > 0) {
    const rEns = await pool.request().query(`
      SELECT v.id_muestra, v.edad_dias, v.resistencia_kg_cm2_promedio
      FROM pro_lab.v_ensayos_resumen v
      WHERE v.id_muestra IN (${ids.join(',')})
      ORDER BY v.id_muestra, v.edad_dias
    `);
    for (const r of rEns.recordset) {
      const arr = ensayosPorMuestra.get(r.id_muestra) ?? [];
      arr.push({
        edad_dias: r.edad_dias,
        resistencia_kg_cm2_promedio:
          r.resistencia_kg_cm2_promedio !== null ? Number(r.resistencia_kg_cm2_promedio) : null,
      });
      ensayosPorMuestra.set(r.id_muestra, arr);
    }
  }

  const reqTotal = pool.request();
  if (obra_works_no !== undefined)
    reqTotal.input('obra_works_no', sql.NVarChar(102), `%${obra_works_no}%`);
  if (id_actividad !== undefined) reqTotal.input('id_actividad', sql.Int, id_actividad);
  if (fc_objetivo !== undefined) reqTotal.input('fc_objetivo', sql.Int, fc_objetivo);
  if (desde !== undefined) reqTotal.input('desde', sql.Date, desde);
  if (hasta !== undefined) reqTotal.input('hasta', sql.Date, hasta);
  if (q !== undefined) reqTotal.input('q', sql.NVarChar(102), `%${q}%`);

  const rTotal = await reqTotal.query(`
    SELECT COUNT(*) AS total
    FROM pro_lab.muestras m
    INNER JOIN pro_lab.actividades a ON a.id = m.id_actividad
    LEFT JOIN pro_bi.dim_obra obra
      ON obra.works_no COLLATE DATABASE_DEFAULT = m.obra_works_no COLLATE DATABASE_DEFAULT
    ${whereClause}
  `);

  const muestras: MuestraListadoItem[] = rItems.recordset.map((row) => ({
    ...mapMuestraBase(row),
    ensayos: ensayosPorMuestra.get(row.id as number) ?? [],
  }));

  return { muestras, total: rTotal.recordset[0]?.total ?? 0, pagina, por_pagina };
}

/** Detalle de muestra: header + ensayos con sus mediciones. */
export async function obtenerMuestra(
  pool: sqlModule.ConnectionPool,
  id: number,
): Promise<MuestraDetalle | null> {
  const rMuestra = await pool.request().input('id', sql.BigInt, id).query(`
    ${SELECT_MUESTRA_BASE}
    WHERE m.id = @id
  `);
  const fila = rMuestra.recordset[0];
  if (!fila) return null;

  const rEnsayos = await pool.request().input('id_muestra', sql.BigInt, id).query(`
    SELECT
      v.id_ensayo, v.id_muestra, v.edad_dias, v.fecha_prueba,
      v.cantidad_mediciones, v.resistencia_mpa_promedio, v.resistencia_kg_cm2_promedio,
      e.notas
    FROM pro_lab.v_ensayos_resumen v
    INNER JOIN pro_lab.ensayos e ON e.id = v.id_ensayo
    WHERE v.id_muestra = @id_muestra
    ORDER BY v.edad_dias ASC
  `);

  const idsEnsayos = rEnsayos.recordset.map((e) => e.id_ensayo as number);
  const medicionesPorEnsayo = new Map<number, MedicionLab[]>();
  if (idsEnsayos.length > 0) {
    const rMed = await pool.request().query(`
      SELECT id, id_ensayo, resistencia_mpa, orden, notas
      FROM pro_lab.mediciones
      WHERE id_ensayo IN (${idsEnsayos.join(',')})
      ORDER BY id_ensayo, orden
    `);
    for (const m of rMed.recordset) {
      const arr = medicionesPorEnsayo.get(m.id_ensayo) ?? [];
      arr.push({
        id: m.id,
        id_ensayo: m.id_ensayo,
        resistencia_mpa: Number(m.resistencia_mpa),
        orden: m.orden,
        notas: m.notas,
      });
      medicionesPorEnsayo.set(m.id_ensayo, arr);
    }
  }

  const ensayos_detalle: EnsayoDetalle[] = rEnsayos.recordset.map((e) => ({
    id: e.id_ensayo,
    edad_dias: e.edad_dias,
    fecha_prueba: e.fecha_prueba ? rowToFecha(e.fecha_prueba) : null,
    notas: e.notas,
    cantidad_mediciones: e.cantidad_mediciones,
    resistencia_mpa_promedio:
      e.resistencia_mpa_promedio !== null ? Number(e.resistencia_mpa_promedio) : null,
    resistencia_kg_cm2_promedio:
      e.resistencia_kg_cm2_promedio !== null ? Number(e.resistencia_kg_cm2_promedio) : null,
    mediciones: medicionesPorEnsayo.get(e.id_ensayo) ?? [],
  }));

  const base = mapMuestraBase(fila);
  return {
    ...base,
    ensayos: ensayos_detalle.map((e) => ({
      edad_dias: e.edad_dias,
      resistencia_kg_cm2_promedio: e.resistencia_kg_cm2_promedio,
    })),
    ensayos_detalle,
  };
}

/** Catálogo de actividades del laboratorio (para filtros y formularios). */
export async function listarActividades(
  pool: sqlModule.ConnectionPool,
  soloActivas = true,
): Promise<ActividadLab[]> {
  const r = await pool.request().query(`
    SELECT id, nombre, activo, orden
    FROM pro_lab.actividades
    ${soloActivas ? 'WHERE activo = 1' : ''}
    ORDER BY orden, nombre
  `);
  return r.recordset.map((row) => ({
    id: row.id,
    nombre: row.nombre,
    activo: !!row.activo,
    orden: row.orden,
  }));
}
