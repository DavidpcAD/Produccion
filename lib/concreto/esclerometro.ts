import type sqlModule from 'mssql';
import { sql } from '@/lib/db-adelantedb';
import {
  type ActualizarEnsayoEsclerometroRequest,
  type ActualizarReboteRequest,
  type CrearEnsayoEsclerometroRequest,
  type CrearReboteRequest,
  type EnsayoEsclerometroDetalle,
  type EnsayoEsclerometroListado,
  type ListaEnsayosEsclerometroResponse,
  type ListarEnsayosEsclerometroRequest,
  type Rebote,
  calcularReboteUtilPromedio,
} from './tipos-esclerometro';

// Portado de `api/src/lib/esclerometro-dominio.ts`. CRUD del módulo
// Esclerómetro (ensayo no destructivo — martillo Schmidt).
//
// Patrón espejo al módulo de muestras: header (ensayos) + N detalles
// (rebotes), con CASCADE en la FK para que borrar un ensayo elimine sus
// rebotes. Validamos rangos y unicidad de numero_golpe por ensayo en
// handler/DB.

export class ErrorEsclerometro extends Error {
  readonly codigo: string;
  readonly status: number;
  constructor(codigo: string, mensaje: string, status = 400) {
    super(mensaje);
    this.codigo = codigo;
    this.status = status;
  }
}

interface FilaEnsayo {
  id: number | string;
  numero: number;
  fecha: Date | string;
  obra_works_no: string | null;
  obra_display_name: string | null;
  id_casa: string | null;
  elemento_estructural: string;
  edad_dias: number | null;
  angulo_impacto: number;
  equipo_serial: string | null;
  notas: string | null;
  creado_por_email: string | null;
  creado_en: Date | string;
  actualizado_en: Date | string;
  cantidad_rebotes: number;
}

interface FilaRebote {
  id: number | string;
  id_ensayo: number | string;
  numero_golpe: number;
  valor_rebote: number | string;
  notas: string | null;
}

const SELECT_ENSAYO_BASE = `
  SELECT
    e.id, e.numero, e.fecha,
    e.obra_works_no,
    obra.display_name                                  AS obra_display_name,
    e.id_casa, e.elemento_estructural, e.edad_dias,
    e.angulo_impacto, e.equipo_serial, e.notas,
    e.creado_por_email, e.creado_en, e.actualizado_en,
    (SELECT COUNT(*) FROM pro_lab.esclerometro_rebotes r WHERE r.id_ensayo = e.id) AS cantidad_rebotes
  FROM pro_lab.esclerometro_ensayos e
  LEFT JOIN pro_bi.dim_obra obra
    ON obra.works_no COLLATE DATABASE_DEFAULT = e.obra_works_no COLLATE DATABASE_DEFAULT
`;

function rowToFecha(d: Date | string): string {
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

function rowToIso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : String(d);
}

function mapearListado(f: FilaEnsayo, reboteProm: number | null): EnsayoEsclerometroListado {
  return {
    id: Number(f.id),
    numero: f.numero,
    fecha: rowToFecha(f.fecha),
    obra_works_no: f.obra_works_no,
    obra_display_name: f.obra_display_name,
    id_casa: f.id_casa,
    elemento_estructural: f.elemento_estructural,
    edad_dias: f.edad_dias,
    angulo_impacto: f.angulo_impacto,
    equipo_serial: f.equipo_serial,
    cantidad_rebotes: f.cantidad_rebotes,
    rebote_promedio: reboteProm,
  };
}

function mapearRebote(r: FilaRebote): Rebote {
  return {
    id: Number(r.id),
    id_ensayo: Number(r.id_ensayo),
    numero_golpe: r.numero_golpe,
    valor_rebote: Number(r.valor_rebote),
    notas: r.notas,
  };
}

export async function listarEnsayos(
  pool: sqlModule.ConnectionPool,
  params: ListarEnsayosEsclerometroRequest,
): Promise<ListaEnsayosEsclerometroResponse> {
  const { obra_works_no, desde, hasta, q, pagina, por_pagina } = params;
  const filtros: string[] = [];
  if (obra_works_no !== undefined) {
    filtros.push(
      '(e.obra_works_no LIKE @obra OR obra.display_name COLLATE DATABASE_DEFAULT LIKE @obra COLLATE DATABASE_DEFAULT)',
    );
  }
  if (desde !== undefined) filtros.push('e.fecha >= @desde');
  if (hasta !== undefined) filtros.push('e.fecha <= @hasta');
  if (q !== undefined) {
    filtros.push(
      '(e.elemento_estructural LIKE @q OR e.id_casa LIKE @q OR e.equipo_serial LIKE @q)',
    );
  }
  const whereClause = filtros.length > 0 ? `WHERE ${filtros.join(' AND ')}` : '';
  const offset = (pagina - 1) * por_pagina;

  const bind = (req: sqlModule.Request) => {
    if (obra_works_no !== undefined) req.input('obra', sql.NVarChar(102), `%${obra_works_no}%`);
    if (desde !== undefined) req.input('desde', sql.Date, desde);
    if (hasta !== undefined) req.input('hasta', sql.Date, hasta);
    if (q !== undefined) req.input('q', sql.NVarChar(102), `%${q}%`);
    return req;
  };

  const reqItems = bind(pool.request())
    .input('offset', sql.Int, offset)
    .input('por_pagina', sql.Int, por_pagina);

  const rItems = await reqItems.query<FilaEnsayo>(`
    ${SELECT_ENSAYO_BASE}
    ${whereClause}
    ORDER BY e.fecha DESC, e.numero DESC
    OFFSET @offset ROWS FETCH NEXT @por_pagina ROWS ONLY
  `);

  // Promedio: cargamos los rebotes de la página en una sola query para no
  // pegar N veces a la BD.
  const ids = rItems.recordset.map((r) => Number(r.id));
  const rebotePromedioPorEnsayo = new Map<number, number | null>();
  if (ids.length > 0) {
    const lista = ids.map((n) => String(Math.trunc(n))).join(',');
    const rRebotes = await pool
      .request()
      .query<{ id_ensayo: number | string; valor_rebote: number | string }>(`
      SELECT id_ensayo, valor_rebote
      FROM pro_lab.esclerometro_rebotes
      WHERE id_ensayo IN (${lista})
      ORDER BY id_ensayo
    `);
    const porEnsayo = new Map<number, number[]>();
    for (const row of rRebotes.recordset) {
      const idE = Number(row.id_ensayo);
      const arr = porEnsayo.get(idE) ?? [];
      arr.push(Number(row.valor_rebote));
      porEnsayo.set(idE, arr);
    }
    for (const idE of ids) {
      rebotePromedioPorEnsayo.set(idE, calcularReboteUtilPromedio(porEnsayo.get(idE) ?? []));
    }
  }

  const rTotal = await bind(pool.request()).query<{ total: number }>(`
    SELECT COUNT(*) AS total
    FROM pro_lab.esclerometro_ensayos e
    LEFT JOIN pro_bi.dim_obra obra
      ON obra.works_no COLLATE DATABASE_DEFAULT = e.obra_works_no COLLATE DATABASE_DEFAULT
    ${whereClause}
  `);

  return {
    ensayos: rItems.recordset.map((r) =>
      mapearListado(r, rebotePromedioPorEnsayo.get(Number(r.id)) ?? null),
    ),
    total: rTotal.recordset[0]?.total ?? 0,
    pagina,
    por_pagina,
  };
}

export async function obtenerEnsayo(
  pool: sqlModule.ConnectionPool,
  id: number,
): Promise<EnsayoEsclerometroDetalle | null> {
  const rE = await pool
    .request()
    .input('id', sql.BigInt, id)
    .query<FilaEnsayo>(`
    ${SELECT_ENSAYO_BASE}
    WHERE e.id = @id
  `);
  const fila = rE.recordset[0];
  if (!fila) return null;

  const rR = await pool
    .request()
    .input('id', sql.BigInt, id)
    .query<FilaRebote>(`
    SELECT id, id_ensayo, numero_golpe, valor_rebote, notas
    FROM pro_lab.esclerometro_rebotes
    WHERE id_ensayo = @id
    ORDER BY numero_golpe
  `);
  const rebotes = rR.recordset.map(mapearRebote);
  const promedio = calcularReboteUtilPromedio(rebotes.map((r) => r.valor_rebote));

  return {
    ...mapearListado(fila, promedio),
    notas: fila.notas,
    creado_por_email: fila.creado_por_email,
    creado_en: rowToIso(fila.creado_en),
    actualizado_en: rowToIso(fila.actualizado_en),
    rebotes,
  };
}

export async function crearEnsayo(
  pool: sqlModule.ConnectionPool,
  body: CrearEnsayoEsclerometroRequest,
  usuario: { oid: string; email: string },
): Promise<EnsayoEsclerometroDetalle> {
  // Asignar siguiente numero (max+1).
  const rMax = await pool
    .request()
    .query<{ next_num: number }>(
      'SELECT ISNULL(MAX(numero), 0) + 1 AS next_num FROM pro_lab.esclerometro_ensayos',
    );
  const numero = rMax.recordset[0]?.next_num ?? 1;

  const r = await pool
    .request()
    .input('numero', sql.Int, numero)
    .input('fecha', sql.Date, body.fecha)
    .input('obra_works_no', sql.NVarChar(20), body.obra_works_no ?? null)
    .input('id_casa', sql.NVarChar(50), body.id_casa ?? null)
    .input('elemento', sql.NVarChar(100), body.elemento_estructural)
    .input('edad_dias', sql.Int, body.edad_dias ?? null)
    .input('angulo', sql.Int, body.angulo_impacto)
    .input('equipo_serial', sql.NVarChar(50), body.equipo_serial ?? null)
    .input('notas', sql.NVarChar(sql.MAX), body.notas ?? null)
    .input('oid', sql.NVarChar(100), usuario.oid)
    .input('email', sql.NVarChar(200), usuario.email)
    .query<{ id: number | string }>(`
      INSERT INTO pro_lab.esclerometro_ensayos (
        numero, fecha, obra_works_no, id_casa, elemento_estructural,
        edad_dias, angulo_impacto, equipo_serial, notas,
        creado_por_oid, creado_por_email
      )
      OUTPUT INSERTED.id
      VALUES (
        @numero, @fecha, @obra_works_no, @id_casa, @elemento,
        @edad_dias, @angulo, @equipo_serial, @notas,
        @oid, @email
      )
    `);
  const id = Number(r.recordset[0]?.id);
  if (!Number.isFinite(id)) {
    throw new ErrorEsclerometro('INSERT_FALLO', 'No se pudo crear el ensayo', 500);
  }
  const detalle = await obtenerEnsayo(pool, id);
  if (!detalle)
    throw new ErrorEsclerometro('INSERT_FALLO', 'Ensayo recién creado no encontrado', 500);
  return detalle;
}

export async function actualizarEnsayo(
  pool: sqlModule.ConnectionPool,
  id: number,
  body: ActualizarEnsayoEsclerometroRequest,
): Promise<EnsayoEsclerometroDetalle> {
  const sets: string[] = [];
  const req = pool.request().input('id', sql.BigInt, id);
  if (body.fecha !== undefined) {
    sets.push('fecha = @fecha');
    req.input('fecha', sql.Date, body.fecha);
  }
  if (body.obra_works_no !== undefined) {
    sets.push('obra_works_no = @obra_works_no');
    req.input('obra_works_no', sql.NVarChar(20), body.obra_works_no);
  }
  if (body.id_casa !== undefined) {
    sets.push('id_casa = @id_casa');
    req.input('id_casa', sql.NVarChar(50), body.id_casa);
  }
  if (body.elemento_estructural !== undefined) {
    sets.push('elemento_estructural = @elemento');
    req.input('elemento', sql.NVarChar(100), body.elemento_estructural);
  }
  if (body.edad_dias !== undefined) {
    sets.push('edad_dias = @edad_dias');
    req.input('edad_dias', sql.Int, body.edad_dias);
  }
  if (body.angulo_impacto !== undefined) {
    sets.push('angulo_impacto = @angulo');
    req.input('angulo', sql.Int, body.angulo_impacto);
  }
  if (body.equipo_serial !== undefined) {
    sets.push('equipo_serial = @equipo_serial');
    req.input('equipo_serial', sql.NVarChar(50), body.equipo_serial);
  }
  if (body.notas !== undefined) {
    sets.push('notas = @notas');
    req.input('notas', sql.NVarChar(sql.MAX), body.notas);
  }
  if (sets.length === 0) {
    throw new ErrorEsclerometro('SIN_CAMBIOS', 'Body vacío: nada para actualizar.');
  }
  sets.push('actualizado_en = SYSUTCDATETIME()');

  const r = await req.query<{ id: number | string }>(`
    UPDATE pro_lab.esclerometro_ensayos
    SET ${sets.join(', ')}
    OUTPUT INSERTED.id
    WHERE id = @id
  `);
  if (!r.recordset[0]) {
    throw new ErrorEsclerometro('NO_ENCONTRADO', `Ensayo ${id} no encontrado.`, 404);
  }
  const det = await obtenerEnsayo(pool, id);
  if (!det) throw new ErrorEsclerometro('NO_ENCONTRADO', `Ensayo ${id} no encontrado.`, 404);
  return det;
}

export async function eliminarEnsayo(pool: sqlModule.ConnectionPool, id: number): Promise<void> {
  const r = await pool
    .request()
    .input('id', sql.BigInt, id)
    .query<{ rows: number }>(`
      DELETE FROM pro_lab.esclerometro_ensayos WHERE id = @id;
      SELECT @@ROWCOUNT AS rows;
    `);
  if ((r.recordset[0]?.rows ?? 0) === 0) {
    throw new ErrorEsclerometro('NO_ENCONTRADO', `Ensayo ${id} no encontrado.`, 404);
  }
}

// =============================================================================
// Rebotes
// =============================================================================

export async function crearRebote(
  pool: sqlModule.ConnectionPool,
  idEnsayo: number,
  body: CrearReboteRequest,
): Promise<Rebote> {
  // Validar que exista el ensayo.
  const rE = await pool
    .request()
    .input('id', sql.BigInt, idEnsayo)
    .query<{ id: number }>('SELECT id FROM pro_lab.esclerometro_ensayos WHERE id = @id');
  if (!rE.recordset[0]) {
    throw new ErrorEsclerometro('ENSAYO_NO_ENCONTRADO', `Ensayo ${idEnsayo} no encontrado.`, 404);
  }

  try {
    const r = await pool
      .request()
      .input('id_ensayo', sql.BigInt, idEnsayo)
      .input('numero_golpe', sql.Int, body.numero_golpe)
      .input('valor_rebote', sql.Decimal(5, 1), body.valor_rebote)
      .input('notas', sql.NVarChar(300), body.notas ?? null)
      .query<FilaRebote>(`
        INSERT INTO pro_lab.esclerometro_rebotes (id_ensayo, numero_golpe, valor_rebote, notas)
        OUTPUT INSERTED.id, INSERTED.id_ensayo, INSERTED.numero_golpe,
               INSERTED.valor_rebote, INSERTED.notas
        VALUES (@id_ensayo, @numero_golpe, @valor_rebote, @notas)
      `);
    const fila = r.recordset[0];
    if (!fila) throw new ErrorEsclerometro('INSERT_FALLO', 'No se pudo crear el rebote', 500);
    return mapearRebote(fila);
  } catch (e) {
    if (e instanceof Error && /UNIQUE/i.test(e.message)) {
      throw new ErrorEsclerometro(
        'NUMERO_GOLPE_DUPLICADO',
        `Ya existe el golpe N° ${body.numero_golpe} en este ensayo.`,
        409,
      );
    }
    throw e;
  }
}

export async function actualizarRebote(
  pool: sqlModule.ConnectionPool,
  id: number,
  body: ActualizarReboteRequest,
): Promise<void> {
  const sets: string[] = [];
  const req = pool.request().input('id', sql.BigInt, id);
  if (body.valor_rebote !== undefined) {
    sets.push('valor_rebote = @valor');
    req.input('valor', sql.Decimal(5, 1), body.valor_rebote);
  }
  if (body.numero_golpe !== undefined) {
    sets.push('numero_golpe = @golpe');
    req.input('golpe', sql.Int, body.numero_golpe);
  }
  if (body.notas !== undefined) {
    sets.push('notas = @notas');
    req.input('notas', sql.NVarChar(300), body.notas);
  }
  if (sets.length === 0) {
    throw new ErrorEsclerometro('SIN_CAMBIOS', 'Body vacío: nada para actualizar.');
  }
  const r = await req.query<{ rows: number }>(`
    UPDATE pro_lab.esclerometro_rebotes SET ${sets.join(', ')} WHERE id = @id;
    SELECT @@ROWCOUNT AS rows;
  `);
  if ((r.recordset[0]?.rows ?? 0) === 0) {
    throw new ErrorEsclerometro('NO_ENCONTRADO', `Rebote ${id} no encontrado.`, 404);
  }
}

export async function eliminarRebote(pool: sqlModule.ConnectionPool, id: number): Promise<void> {
  const r = await pool
    .request()
    .input('id', sql.BigInt, id)
    .query<{ rows: number }>(`
      DELETE FROM pro_lab.esclerometro_rebotes WHERE id = @id;
      SELECT @@ROWCOUNT AS rows;
    `);
  if ((r.recordset[0]?.rows ?? 0) === 0) {
    throw new ErrorEsclerometro('NO_ENCONTRADO', `Rebote ${id} no encontrado.`, 404);
  }
}
