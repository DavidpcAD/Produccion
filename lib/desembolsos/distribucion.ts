import type { ConnectionPool } from 'mssql';
import { sql } from '@/lib/db-adelantedb';

/**
 * Distribución del precio interno del lote entre entidades del grupo
 * (AD/QFI/GM/...). Portado FIEL de la Azure Function `distribucion.ts`.
 *
 * Las tarifas se versionan por fecha de vigencia (tabla distribucion_config +
 * distribucion_config_entidad, expuestas por vw_historico_distribucion). Nunca
 * se editan versiones históricas: cada cambio crea una nueva vigencia vía
 * sp_actualizar_distribucion_config, o edita la vigente in-place vía
 * sp_editar_distribucion_vigente.
 *
 * Tablas/vistas: dbo.Proyecto, [app].catalogo_entidad_distribucion,
 * [app].vw_historico_distribucion.
 */

// --------------------------------------------------------------------- Tipos

export type Dolares = number;

export interface EntidadDistribucion {
  IDEntidad: number;
  Codigo: string; // 'AD', 'QFI', 'GM', ...
  Nombre: string;
  Descripcion: string | null;
  Activo: boolean;
}

export interface DistribucionEntidad {
  IDEntidad: number;
  Codigo: string;
  Nombre: string;
  Porcentaje: number; // 0–100
  Notas: string | null;
}

export interface DistribucionConfig {
  IDConfig: number;
  IDProyecto: number;
  AbreviaturaProyecto: string;
  NombreProyecto: string;
  PrecioInternoM2: Dolares;
  Moneda: string;
  VigenteDesde: string; // ISO YYYY-MM-DD
  VigenteHasta: string | null;
  Estado: 'VIGENTE' | 'HISTORICA';
  DiasVigencia: number;
  Notas: string | null;
  Entidades: DistribucionEntidad[];
  FechaCreacion: string;
}

export interface DistribucionProyectoResumen {
  IDProyecto: number;
  AbreviaturaProyecto: string;
  NombreProyecto: string;
  ColorHex: string | null;
  ConfigVigente: DistribucionConfig | null;
}

export type RespuestaEntidades = EntidadDistribucion[];

export interface RespuestaDistribucion {
  proyectos: DistribucionProyectoResumen[];
}

export interface RespuestaDistribucionProyecto {
  IDProyecto: number;
  AbreviaturaProyecto: string;
  NombreProyecto: string;
  Versiones: DistribucionConfig[];
}

export interface NuevaDistribucionRequest {
  IDProyecto: number;
  PrecioInternoM2: Dolares;
  Moneda?: string;
  VigenteDesde: string; // ISO YYYY-MM-DD
  Notas?: string | null;
  Entidades: Array<{ IDEntidad: number; Porcentaje: number; Notas?: string | null }>;
}

export interface NuevaDistribucionResponse {
  IDConfigCreado: number;
  IDConfigCerrado: number | null;
}

export interface EditarDistribucionVigenteRequest {
  PrecioInternoM2: Dolares;
  Moneda?: string;
  Notas?: string | null;
  Entidades: Array<{ IDEntidad: number; Porcentaje: number; Notas?: string | null }>;
}

export interface EditarDistribucionVigenteResponse {
  IDConfigEditado: number;
}

// --------------------------------------------------------------------- Helpers

function toIsoDate(value: Date | string | null): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value;
}

function parseEntidades(json: string | null): DistribucionEntidad[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json) as Array<{
      Codigo: string;
      Nombre: string;
      Porcentaje: number;
      Notas: string | null;
    }>;
    // SQL no manda IDEntidad en EntidadesJSON; se deja en 0 por compat.
    return arr.map((e) => ({
      IDEntidad: 0,
      Codigo: e.Codigo,
      Nombre: e.Nombre,
      Porcentaje: Number(e.Porcentaje),
      Notas: e.Notas,
    }));
  } catch {
    return [];
  }
}

export function esErrorCliente(message: string): boolean {
  return /THROW|debe|inválido|obligatorio|no existe/i.test(message);
}

export function validarNuevaConfig(body: NuevaDistribucionRequest): string | null {
  if (!body.IDProyecto || !Number.isInteger(body.IDProyecto)) return 'IDProyecto es obligatorio.';
  if (!body.PrecioInternoM2 || body.PrecioInternoM2 <= 0) return 'PrecioInternoM2 debe ser mayor a 0.';
  if (!body.VigenteDesde || !/^\d{4}-\d{2}-\d{2}$/.test(body.VigenteDesde)) {
    return 'VigenteDesde debe ser una fecha ISO YYYY-MM-DD.';
  }
  if (!Array.isArray(body.Entidades) || body.Entidades.length === 0) {
    return 'Debe especificar al menos una entidad.';
  }
  const suma = body.Entidades.reduce((acc, e) => acc + Number(e.Porcentaje), 0);
  if (Math.abs(suma - 100) > 0.001) return `La suma de los porcentajes debe ser 100 (recibí ${suma}).`;
  for (const e of body.Entidades) {
    if (!Number.isInteger(e.IDEntidad) || e.IDEntidad <= 0) return 'IDEntidad inválido en alguna entidad.';
    if (e.Porcentaje < 0 || e.Porcentaje > 100) return `Porcentaje inválido para entidad ${e.IDEntidad}.`;
  }
  return null;
}

export function validarEditarVigente(body: EditarDistribucionVigenteRequest): string | null {
  if (!body.PrecioInternoM2 || body.PrecioInternoM2 <= 0) return 'PrecioInternoM2 debe ser mayor a 0.';
  if (!Array.isArray(body.Entidades) || body.Entidades.length === 0) {
    return 'Debe especificar al menos una entidad.';
  }
  const suma = body.Entidades.reduce((acc, e) => acc + Number(e.Porcentaje), 0);
  if (Math.abs(suma - 100) > 0.001) return `La suma de los porcentajes debe ser 100 (recibí ${suma}).`;
  return null;
}

// --------------------------------------------------------------------- Queries

/** GET /api/entidades-distribucion — catálogo de entidades activas. */
export async function listarEntidades(db: ConnectionPool): Promise<RespuestaEntidades> {
  const result = await db.request().query<EntidadDistribucion>(`
    SELECT IDEntidad, Codigo, Nombre, Descripcion, Activo
    FROM [app].catalogo_entidad_distribucion
    WHERE Activo = 1
    ORDER BY IDEntidad
  `);
  return result.recordset;
}

/** GET /api/distribucion — proyectos (TgVentas=1) con su config vigente. */
export async function listarDistribucion(db: ConnectionPool): Promise<RespuestaDistribucion> {
  const filas = await db.request().query<{
    IDProyecto: number;
    AbreviaturaProyecto: string;
    NombreProyecto: string;
    ColorHex: string | null;
    IDConfig: number | null;
    PrecioInternoM2: number | null;
    Moneda: string | null;
    VigenteDesde: Date | null;
    VigenteHasta: Date | null;
    DiasVigencia: number | null;
    NotasConfig: string | null;
    EntidadesJSON: string | null;
    FechaCreacion: Date | null;
  }>(`
    SELECT
      p.IDProyecto,
      p.AbreviaturaProyecto,
      p.Nombre AS NombreProyecto,
      p.ColorHEX_P AS ColorHex,
      h.IDConfig,
      h.PrecioInternoM2,
      h.Moneda,
      h.VigenteDesde,
      h.VigenteHasta,
      h.DiasVigencia,
      h.Notas AS NotasConfig,
      h.EntidadesJSON,
      h.FechaCreacion
    FROM dbo.Proyecto p
    OUTER APPLY (
      SELECT TOP 1 *
      FROM [app].vw_historico_distribucion v
      WHERE v.IDProyecto = p.IDProyecto AND v.Estado = 'VIGENTE'
      ORDER BY v.VigenteDesde DESC
    ) h
    WHERE p.TgVentas = 1
    ORDER BY p.AbreviaturaProyecto
  `);

  const proyectos: DistribucionProyectoResumen[] = filas.recordset.map((row) => ({
    IDProyecto: row.IDProyecto,
    AbreviaturaProyecto: row.AbreviaturaProyecto,
    NombreProyecto: row.NombreProyecto,
    ColorHex: row.ColorHex,
    ConfigVigente:
      row.IDConfig === null
        ? null
        : {
            IDConfig: row.IDConfig,
            IDProyecto: row.IDProyecto,
            AbreviaturaProyecto: row.AbreviaturaProyecto,
            NombreProyecto: row.NombreProyecto,
            PrecioInternoM2: Number(row.PrecioInternoM2),
            Moneda: row.Moneda ?? 'USD',
            VigenteDesde: toIsoDate(row.VigenteDesde) ?? '',
            VigenteHasta: toIsoDate(row.VigenteHasta),
            Estado: 'VIGENTE',
            DiasVigencia: row.DiasVigencia ?? 0,
            Notas: row.NotasConfig,
            Entidades: parseEntidades(row.EntidadesJSON),
            FechaCreacion: toIsoDate(row.FechaCreacion) ?? '',
          },
  }));

  return { proyectos };
}

/** GET /api/distribucion/:idProyecto — histórico completo. null si no existe. */
export async function distribucionPorProyecto(
  db: ConnectionPool,
  idProyecto: number,
): Promise<RespuestaDistribucionProyecto | null> {
  const proyectoRs = await db
    .request()
    .input('id', sql.Int, idProyecto)
    .query<{ AbreviaturaProyecto: string; Nombre: string }>(
      'SELECT AbreviaturaProyecto, Nombre FROM dbo.Proyecto WHERE IDProyecto = @id',
    );
  const proyecto = proyectoRs.recordset[0];
  if (!proyecto) return null;

  const versiones = await db
    .request()
    .input('id', sql.Int, idProyecto)
    .query<{
      IDConfig: number;
      IDProyecto: number;
      AbreviaturaProyecto: string;
      NombreProyecto: string;
      PrecioInternoM2: number;
      Moneda: string;
      VigenteDesde: Date;
      VigenteHasta: Date | null;
      Estado: 'VIGENTE' | 'HISTORICA';
      DiasVigencia: number;
      Notas: string | null;
      EntidadesJSON: string | null;
      FechaCreacion: Date;
    }>(`
      SELECT *
      FROM [app].vw_historico_distribucion
      WHERE IDProyecto = @id
      ORDER BY VigenteDesde DESC
    `);

  return {
    IDProyecto: idProyecto,
    AbreviaturaProyecto: proyecto.AbreviaturaProyecto,
    NombreProyecto: proyecto.Nombre,
    Versiones: versiones.recordset.map((row) => ({
      IDConfig: row.IDConfig,
      IDProyecto: row.IDProyecto,
      AbreviaturaProyecto: row.AbreviaturaProyecto,
      NombreProyecto: row.NombreProyecto,
      PrecioInternoM2: Number(row.PrecioInternoM2),
      Moneda: row.Moneda,
      VigenteDesde: toIsoDate(row.VigenteDesde) ?? '',
      VigenteHasta: toIsoDate(row.VigenteHasta),
      Estado: row.Estado,
      DiasVigencia: row.DiasVigencia,
      Notas: row.Notas,
      Entidades: parseEntidades(row.EntidadesJSON),
      FechaCreacion: toIsoDate(row.FechaCreacion) ?? '',
    })),
  };
}

/** POST /api/distribucion — crear nueva versión. */
export async function crearDistribucion(
  db: ConnectionPool,
  body: NuevaDistribucionRequest,
  usuarioEmail: string,
): Promise<NuevaDistribucionResponse> {
  const request = db.request();
  request.input('IDProyecto', sql.Int, body.IDProyecto);
  request.input('PrecioInternoM2', sql.Decimal(10, 2), body.PrecioInternoM2);
  request.input('Moneda', sql.Char(3), body.Moneda ?? 'USD');
  request.input('VigenteDesde', sql.Date, body.VigenteDesde);
  request.input('Notas', sql.NVarChar(500), body.Notas ?? null);
  request.input('EntidadesJSON', sql.NVarChar(sql.MAX), JSON.stringify(body.Entidades));
  request.input('UsuarioEmail', sql.NVarChar(200), usuarioEmail);

  const result = await request.execute<{
    IDConfigCreado: number;
    IDConfigCerrado: number | null;
  }>('[app].sp_actualizar_distribucion_config');
  const row = result.recordset[0];
  if (!row) throw new Error('SP no devolvió fila de resultado');
  return { IDConfigCreado: row.IDConfigCreado, IDConfigCerrado: row.IDConfigCerrado };
}

/** PATCH /api/distribucion/:idProyecto/vigente — edita la vigente in-place. */
export async function editarDistribucionVigente(
  db: ConnectionPool,
  idProyecto: number,
  body: EditarDistribucionVigenteRequest,
  usuarioEmail: string,
): Promise<EditarDistribucionVigenteResponse> {
  const request = db.request();
  request.input('IDProyecto', sql.Int, idProyecto);
  request.input('PrecioInternoM2', sql.Decimal(10, 2), body.PrecioInternoM2);
  request.input('Moneda', sql.Char(3), body.Moneda ?? 'USD');
  request.input('Notas', sql.NVarChar(500), body.Notas ?? null);
  request.input('EntidadesJSON', sql.NVarChar(sql.MAX), JSON.stringify(body.Entidades));
  request.input('UsuarioEmail', sql.NVarChar(200), usuarioEmail);

  const result = await request.execute<{ IDConfigEditado: number }>(
    '[app].sp_editar_distribucion_vigente',
  );
  const row = result.recordset[0];
  if (!row) throw new Error('SP no devolvió fila de resultado');
  return { IDConfigEditado: row.IDConfigEditado };
}
