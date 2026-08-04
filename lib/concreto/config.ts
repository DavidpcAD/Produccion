import type sqlModule from 'mssql';
import { sql } from '@/lib/db-adelantedb';
import type { ActividadLab } from './tipos';
import type {
  ActorConfig,
  ActualizarActividadParams,
  ActualizarDensidadParams,
  ActualizarUmbralParams,
  CrearActividadParams,
  CrearDensidadParams,
  ComparadorUmbral,
  DensidadMaterial,
  UmbralAlerta,
} from './tipos-config';

// Portado de `api/src/lib/umbrales-dominio.ts`, `densidades-dominio.ts` y la
// parte de actividades de `lab-dominio.ts`. CRUD del área de Configuración:
//   - pro_hor.umbrales_alerta       (umbrales de alerta parametrizables)
//   - pro_hor.densidades_materiales (densidades por material)
//   - pro_lab.actividades           (catálogo de actividades — solo escritura acá;
//     el listado vive en `./lab` como `listarActividades`)
//
// Los errores de dominio (clave duplicada, no encontrada, body vacío) se lanzan
// como `ErrorConfig` con `status` para que el handler HTTP los mapee.

export class ErrorConfig extends Error {
  readonly codigo: string;
  readonly status: number;
  constructor(codigo: string, mensaje: string, status = 400) {
    super(mensaje);
    this.codigo = codigo;
    this.status = status;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Umbrales de alerta (pro_hor.umbrales_alerta)
// ═══════════════════════════════════════════════════════════════════════════

interface FilaUmbral {
  clave: string;
  descripcion: string | null;
  umbral: number | string;
  comparador: string;
  unidad: string | null;
  activo: boolean;
  actualizado_en: Date | string;
  actualizado_por_email: string | null;
}

function mapearUmbral(r: FilaUmbral): UmbralAlerta {
  return {
    clave: r.clave,
    descripcion: r.descripcion,
    umbral: Number(r.umbral),
    comparador: r.comparador as ComparadorUmbral,
    unidad: r.unidad,
    activo: !!r.activo,
    actualizado_en:
      r.actualizado_en instanceof Date ? r.actualizado_en.toISOString() : String(r.actualizado_en),
    actualizado_por_email: r.actualizado_por_email,
  };
}

export async function listarUmbrales(pool: sqlModule.ConnectionPool): Promise<UmbralAlerta[]> {
  const r = await pool.request().query<FilaUmbral>(`
    SELECT clave, descripcion, umbral, comparador, unidad, activo,
           actualizado_en, actualizado_por_email
    FROM pro_hor.umbrales_alerta
    ORDER BY clave
  `);
  return r.recordset.map(mapearUmbral);
}

export async function actualizarUmbral(
  pool: sqlModule.ConnectionPool,
  clave: string,
  body: ActualizarUmbralParams,
  usuario: ActorConfig,
): Promise<UmbralAlerta> {
  const sets: string[] = [];
  const req = pool
    .request()
    .input('clave', sql.NVarChar(80), clave)
    .input('oid', sql.NVarChar(100), usuario.oid)
    .input('email', sql.NVarChar(200), usuario.email);

  if (body.umbral !== undefined) {
    sets.push('umbral = @umbral');
    req.input('umbral', sql.Decimal(12, 4), body.umbral);
  }
  if (body.comparador !== undefined) {
    sets.push('comparador = @comparador');
    req.input('comparador', sql.NVarChar(20), body.comparador);
  }
  if (body.activo !== undefined) {
    sets.push('activo = @activo');
    req.input('activo', sql.Bit, body.activo);
  }
  if (body.descripcion !== undefined) {
    sets.push('descripcion = @descripcion');
    req.input('descripcion', sql.NVarChar(200), body.descripcion);
  }
  if (body.unidad !== undefined) {
    sets.push('unidad = @unidad');
    req.input('unidad', sql.NVarChar(20), body.unidad);
  }
  if (sets.length === 0) {
    throw new ErrorConfig('SIN_CAMBIOS', 'No se envió ningún campo a actualizar.');
  }
  sets.push('actualizado_en = SYSUTCDATETIME()');
  sets.push('actualizado_por_oid = @oid');
  sets.push('actualizado_por_email = @email');

  const r = await req.query<FilaUmbral>(`
    UPDATE pro_hor.umbrales_alerta
    SET ${sets.join(', ')}
    OUTPUT INSERTED.clave, INSERTED.descripcion, INSERTED.umbral, INSERTED.comparador,
           INSERTED.unidad, INSERTED.activo, INSERTED.actualizado_en,
           INSERTED.actualizado_por_email
    WHERE clave = @clave
  `);
  const fila = r.recordset[0];
  if (!fila) {
    throw new ErrorConfig('UMBRAL_NO_ENCONTRADO', `No existe el umbral "${clave}".`, 404);
  }
  return mapearUmbral(fila);
}

// ═══════════════════════════════════════════════════════════════════════════
// Densidades de materiales (pro_hor.densidades_materiales)
// ═══════════════════════════════════════════════════════════════════════════

interface FilaDensidad {
  clave: string;
  nombre: string;
  codigo_bc: string | null;
  densidad: number | string;
  unidad: string;
  notas: string | null;
  activo: boolean;
  actualizado_en: Date | string;
  actualizado_por_email: string | null;
}

function mapearDensidad(r: FilaDensidad): DensidadMaterial {
  return {
    clave: r.clave,
    nombre: r.nombre,
    codigo_bc: r.codigo_bc,
    densidad: Number(r.densidad),
    unidad: r.unidad,
    notas: r.notas,
    activo: !!r.activo,
    actualizado_en:
      r.actualizado_en instanceof Date ? r.actualizado_en.toISOString() : String(r.actualizado_en),
    actualizado_por_email: r.actualizado_por_email,
  };
}

export async function listarDensidades(
  pool: sqlModule.ConnectionPool,
): Promise<DensidadMaterial[]> {
  const r = await pool.request().query<FilaDensidad>(`
    SELECT clave, nombre, codigo_bc, densidad, unidad, notas, activo,
           actualizado_en, actualizado_por_email
    FROM pro_hor.densidades_materiales
    ORDER BY activo DESC, nombre
  `);
  return r.recordset.map(mapearDensidad);
}

export async function crearDensidad(
  pool: sqlModule.ConnectionPool,
  body: CrearDensidadParams,
  usuario: ActorConfig,
): Promise<DensidadMaterial> {
  try {
    const r = await pool
      .request()
      .input('clave', sql.NVarChar(60), body.clave)
      .input('nombre', sql.NVarChar(100), body.nombre)
      .input('codigo_bc', sql.NVarChar(20), body.codigo_bc ?? null)
      .input('densidad', sql.Decimal(10, 3), body.densidad)
      .input('unidad', sql.NVarChar(20), body.unidad)
      .input('notas', sql.NVarChar(500), body.notas ?? null)
      .input('oid', sql.NVarChar(100), usuario.oid)
      .input('email', sql.NVarChar(200), usuario.email)
      .query<FilaDensidad>(`
        INSERT INTO pro_hor.densidades_materiales
          (clave, nombre, codigo_bc, densidad, unidad, notas,
           actualizado_por_oid, actualizado_por_email)
        OUTPUT INSERTED.clave, INSERTED.nombre, INSERTED.codigo_bc, INSERTED.densidad,
               INSERTED.unidad, INSERTED.notas, INSERTED.activo, INSERTED.actualizado_en,
               INSERTED.actualizado_por_email
        VALUES (@clave, @nombre, @codigo_bc, @densidad, @unidad, @notas, @oid, @email)
      `);
    const fila = r.recordset[0];
    if (!fila) throw new ErrorConfig('INSERT_FALLO', 'No se pudo crear la densidad', 500);
    return mapearDensidad(fila);
  } catch (e) {
    if (e instanceof Error && /PRIMARY KEY|UNIQUE/i.test(e.message)) {
      throw new ErrorConfig(
        'CLAVE_DUPLICADA',
        `Ya existe una densidad con clave "${body.clave}".`,
        409,
      );
    }
    throw e;
  }
}

export async function actualizarDensidad(
  pool: sqlModule.ConnectionPool,
  clave: string,
  body: ActualizarDensidadParams,
  usuario: ActorConfig,
): Promise<DensidadMaterial> {
  const sets: string[] = [];
  const req = pool
    .request()
    .input('clave', sql.NVarChar(60), clave)
    .input('oid', sql.NVarChar(100), usuario.oid)
    .input('email', sql.NVarChar(200), usuario.email);

  if (body.nombre !== undefined) {
    sets.push('nombre = @nombre');
    req.input('nombre', sql.NVarChar(100), body.nombre);
  }
  if (body.codigo_bc !== undefined) {
    sets.push('codigo_bc = @codigo_bc');
    req.input('codigo_bc', sql.NVarChar(20), body.codigo_bc);
  }
  if (body.densidad !== undefined) {
    sets.push('densidad = @densidad');
    req.input('densidad', sql.Decimal(10, 3), body.densidad);
  }
  if (body.unidad !== undefined) {
    sets.push('unidad = @unidad');
    req.input('unidad', sql.NVarChar(20), body.unidad);
  }
  if (body.notas !== undefined) {
    sets.push('notas = @notas');
    req.input('notas', sql.NVarChar(500), body.notas);
  }
  if (body.activo !== undefined) {
    sets.push('activo = @activo');
    req.input('activo', sql.Bit, body.activo);
  }
  if (sets.length === 0) {
    throw new ErrorConfig('SIN_CAMBIOS', 'No se envió ningún campo a actualizar.');
  }
  sets.push('actualizado_en = SYSUTCDATETIME()');
  sets.push('actualizado_por_oid = @oid');
  sets.push('actualizado_por_email = @email');

  const r = await req.query<FilaDensidad>(`
    UPDATE pro_hor.densidades_materiales
    SET ${sets.join(', ')}
    OUTPUT INSERTED.clave, INSERTED.nombre, INSERTED.codigo_bc, INSERTED.densidad,
           INSERTED.unidad, INSERTED.notas, INSERTED.activo, INSERTED.actualizado_en,
           INSERTED.actualizado_por_email
    WHERE clave = @clave
  `);
  const fila = r.recordset[0];
  if (!fila) {
    throw new ErrorConfig('NO_ENCONTRADA', `No existe la densidad "${clave}".`, 404);
  }
  return mapearDensidad(fila);
}

// ═══════════════════════════════════════════════════════════════════════════
// Actividades de laboratorio (pro_lab.actividades) — solo escritura.
// El listado (`listarActividades`) vive en `./lab`.
// ═══════════════════════════════════════════════════════════════════════════

export async function crearActividad(
  pool: sqlModule.ConnectionPool,
  body: CrearActividadParams,
): Promise<ActividadLab> {
  try {
    const r = await pool
      .request()
      .input('nombre', sql.NVarChar(100), body.nombre)
      .input('orden', sql.Int, body.orden ?? 0)
      .query<{ id: number; nombre: string; activo: boolean; orden: number }>(`
        INSERT INTO pro_lab.actividades (nombre, orden)
        OUTPUT INSERTED.id, INSERTED.nombre, INSERTED.activo, INSERTED.orden
        VALUES (@nombre, @orden)
      `);
    const row = r.recordset[0];
    if (!row) throw new ErrorConfig('INSERT_FALLO', 'No se pudo crear la actividad', 500);
    return { id: row.id, nombre: row.nombre, activo: !!row.activo, orden: row.orden };
  } catch (e) {
    if (e instanceof Error && e.message.includes('UNIQUE')) {
      throw new ErrorConfig(
        'NOMBRE_DUPLICADO',
        `Ya existe una actividad con nombre "${body.nombre}".`,
      );
    }
    throw e;
  }
}

export async function actualizarActividad(
  pool: sqlModule.ConnectionPool,
  id: number,
  body: ActualizarActividadParams,
): Promise<ActividadLab> {
  // SET dinámico — actualizamos solo los campos provistos.
  const sets: string[] = [];
  const req = pool.request().input('id', sql.Int, id);
  if (body.nombre !== undefined) {
    sets.push('nombre = @nombre');
    req.input('nombre', sql.NVarChar(100), body.nombre);
  }
  if (body.orden !== undefined) {
    sets.push('orden = @orden');
    req.input('orden', sql.Int, body.orden);
  }
  if (body.activo !== undefined) {
    sets.push('activo = @activo');
    req.input('activo', sql.Bit, body.activo);
  }
  if (sets.length === 0) {
    throw new ErrorConfig('SIN_CAMBIOS', 'Body vacío: nada que actualizar.', 400);
  }
  const r = await req.query<{ id: number; nombre: string; activo: boolean; orden: number }>(`
    UPDATE pro_lab.actividades
    SET ${sets.join(', ')}
    OUTPUT INSERTED.id, INSERTED.nombre, INSERTED.activo, INSERTED.orden
    WHERE id = @id
  `);
  const row = r.recordset[0];
  if (!row) throw new ErrorConfig('NO_ENCONTRADA', `Actividad ${id} no encontrada.`, 404);
  return { id: row.id, nombre: row.nombre, activo: !!row.activo, orden: row.orden };
}
