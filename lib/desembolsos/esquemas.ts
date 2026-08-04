import type { ConnectionPool } from 'mssql';
import { sql } from '@/lib/db-adelantedb';

/**
 * Esquemas de desembolso por banco × hito + catálogo de hitos. Portado FIEL de
 * la Azure Function `esquemas.ts`.
 *
 * Cada banco define cómo reparte el desembolso entre los hitos físicos de la
 * obra (FIRMA, MUROS, REPELLOS, ENTREGA...). Versionado por fecha de vigencia
 * (banco_esquema_desembolso, expuesto por vw_historico_esquema_banco). Escritura
 * vía sp_actualizar_esquema_banco / sp_editar_esquema_vigente_banco. El catálogo
 * de hitos (catalogo_hito) se administra con sp_actualizar_catalogo_hito.
 *
 * Tablas/vistas: pro_ventas.Bancos, [pro_app].catalogo_hito, [pro_app].vw_hitos_con_uso,
 * [pro_app].vw_historico_esquema_banco.
 */

// --------------------------------------------------------------------- Tipos

export interface CatalogoHito {
  IDHito: number;
  Codigo: string;
  Nombre: string;
  OrdenEstandar: number;
  Descripcion: string | null;
  ColorHEX: string | null;
  Activo: boolean;
}

export type RespuestaHitos = CatalogoHito[];

export interface HitoConUso extends CatalogoHito {
  BancosUsando: number;
  RowsTotales: number;
}

export type RespuestaHitosConUso = HitoConUso[];

export interface EsquemaHito {
  IDHito: number;
  Codigo: string;
  Nombre: string;
  OrdenHito: number;
  ColorHito: string | null;
  OrdenEnEsquema: number;
  Porcentaje: number;
  DiasSolicitudVisita: number;
  DiasDesembolsoPostVisita: number;
  NotasHito: string | null;
  EsMontoFijo: number; // 0 | 1
}

export interface EsquemaBanco {
  IDBan: number;
  AbrevBanco: string;
  NombreBanco: string;
  ColorBanco: string | null;
  OrdenGal: number | null;
  VigenteDesde: string;
  VigenteHasta: string | null;
  Estado: 'VIGENTE' | 'HISTORICA';
  DiasVigencia: number;
  DiaSemanaPeritoFijo: number | null;
  Notas: string | null;
  Hitos: EsquemaHito[];
  SumaPorcentaje: number;
  FechaCreacion: string;
}

export interface EsquemaBancoResumen {
  IDBan: number;
  AbrevBanco: string;
  NombreBanco: string;
  ColorBanco: string | null;
  OrdenGal: number | null;
  EsquemaVigente: EsquemaBanco | null;
}

export interface RespuestaEsquemas {
  bancos: EsquemaBancoResumen[];
}

export interface RespuestaEsquemaBanco {
  IDBan: number;
  AbrevBanco: string;
  NombreBanco: string;
  Versiones: EsquemaBanco[];
}

export interface HitoEsquemaInput {
  IDHito: number;
  OrdenEnEsquema: number;
  Porcentaje: number;
  DiasSolicitudVisita: number;
  DiasDesembolsoPostVisita: number;
  Notas?: string | null;
}

export interface NuevoEsquemaRequest {
  IDBan: number;
  VigenteDesde: string;
  DiaSemanaPeritoFijo?: number | null;
  Notas?: string | null;
  Hitos: HitoEsquemaInput[];
}

export interface NuevoEsquemaResponse {
  IDBanActualizado: number;
  VigenteDesde: string;
  FilasCerradas: number;
}

export interface EditarEsquemaVigenteRequest {
  DiaSemanaPeritoFijo?: number | null;
  Notas?: string | null;
  Hitos: HitoEsquemaInput[];
}

export interface EditarEsquemaVigenteResponse {
  IDBanEditado: number;
  VigenteDesde: string;
}

export interface NuevoHitoRequest {
  Codigo: string;
  Nombre: string;
  OrdenEstandar: number;
  Descripcion?: string | null;
  ColorHEX?: string | null;
  Activo?: boolean;
}

export interface ActualizarHitoRequest {
  Codigo: string;
  Nombre: string;
  OrdenEstandar: number;
  Descripcion?: string | null;
  ColorHEX?: string | null;
  Activo: boolean;
}

export interface UpsertHitoResponse {
  IDHito: number;
}

// --------------------------------------------------------------------- Helpers

function toIsoDate(value: Date | string | null): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value;
}

function parseHitos(json: string | null): EsquemaHito[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json) as Array<{
      IDHito: number;
      Codigo: string;
      Nombre: string;
      OrdenHito: number;
      ColorHito: string | null;
      OrdenEnEsquema: number;
      Porcentaje: number;
      DiasSolicitudVisita: number;
      DiasDesembolsoPostVisita: number;
      NotasHito: string | null;
      EsMontoFijo?: number | boolean;
    }>;
    return arr.map((h) => ({
      IDHito: h.IDHito,
      Codigo: h.Codigo,
      Nombre: h.Nombre,
      OrdenHito: h.OrdenHito,
      ColorHito: h.ColorHito,
      OrdenEnEsquema: h.OrdenEnEsquema,
      Porcentaje: Number(h.Porcentaje),
      DiasSolicitudVisita: h.DiasSolicitudVisita,
      DiasDesembolsoPostVisita: h.DiasDesembolsoPostVisita,
      NotasHito: h.NotasHito,
      EsMontoFijo: h.EsMontoFijo ? 1 : 0,
    }));
  } catch {
    return [];
  }
}

export function esErrorCliente(message: string): boolean {
  return /THROW|debe|inválido|obligatorio|no existe/i.test(message);
}

export function validarHito(body: NuevoHitoRequest | ActualizarHitoRequest): string | null {
  if (!body.Codigo || !body.Codigo.trim()) return 'Codigo es obligatorio.';
  if (body.Codigo.length > 20) return 'Codigo no puede exceder 20 caracteres.';
  if (!body.Nombre || !body.Nombre.trim()) return 'Nombre es obligatorio.';
  if (body.Nombre.length > 100) return 'Nombre no puede exceder 100 caracteres.';
  if (!Number.isInteger(body.OrdenEstandar) || body.OrdenEstandar <= 0) {
    return 'OrdenEstandar debe ser entero positivo.';
  }
  if (body.ColorHEX && !/^#[0-9A-Fa-f]{6}$/.test(body.ColorHEX)) {
    return 'ColorHEX debe ser formato #RRGGBB (o vacío).';
  }
  return null;
}

export function validarNuevoEsquema(body: NuevoEsquemaRequest): string | null {
  if (!body.IDBan || !Number.isInteger(body.IDBan)) return 'IDBan es obligatorio.';
  if (!body.VigenteDesde || !/^\d{4}-\d{2}-\d{2}$/.test(body.VigenteDesde)) {
    return 'VigenteDesde debe ser fecha ISO YYYY-MM-DD.';
  }
  if (body.DiaSemanaPeritoFijo != null && (body.DiaSemanaPeritoFijo < 1 || body.DiaSemanaPeritoFijo > 7)) {
    return 'DiaSemanaPeritoFijo debe estar entre 1 y 7.';
  }
  if (!Array.isArray(body.Hitos) || body.Hitos.length === 0) return 'Debe especificar al menos un hito.';
  const suma = body.Hitos.reduce((acc, h) => acc + Number(h.Porcentaje), 0);
  if (Math.abs(suma - 100) > 0.001) return `La suma de los porcentajes debe ser 100 (recibí ${suma}).`;
  for (const h of body.Hitos) {
    if (!Number.isInteger(h.IDHito) || h.IDHito <= 0) return 'IDHito inválido en algún hito.';
    if (h.Porcentaje <= 0 || h.Porcentaje > 100) return `Porcentaje inválido para hito ${h.IDHito}.`;
    if (h.DiasSolicitudVisita < 0 || h.DiasDesembolsoPostVisita < 0) return 'Los días no pueden ser negativos.';
  }
  return null;
}

export function validarEditarEsquema(body: EditarEsquemaVigenteRequest): string | null {
  if (!Array.isArray(body.Hitos) || body.Hitos.length === 0) return 'Debe especificar al menos un hito.';
  const suma = body.Hitos.reduce((acc, h) => acc + Number(h.Porcentaje), 0);
  if (Math.abs(suma - 100) > 0.001) return `La suma de los porcentajes debe ser 100 (recibí ${suma}).`;
  return null;
}

// --------------------------------------------------------------------- Hitos

/** GET /api/hitos — catálogo. incluirInactivos=true agrega conteo de uso. */
export async function listarHitos(
  db: ConnectionPool,
  incluirInactivos: boolean,
): Promise<RespuestaHitos | RespuestaHitosConUso> {
  if (incluirInactivos) {
    const result = await db.request().query<HitoConUso>(`
      SELECT IDHito, Codigo, Nombre, OrdenEstandar, Descripcion, ColorHEX, Activo,
             BancosUsando, RowsTotales
      FROM [pro_app].vw_hitos_con_uso
      ORDER BY OrdenEstandar
    `);
    return result.recordset;
  }
  const result = await db.request().query<CatalogoHito>(`
    SELECT IDHito, Codigo, Nombre, OrdenEstandar, Descripcion, ColorHEX, Activo
    FROM [pro_app].catalogo_hito
    WHERE Activo = 1
    ORDER BY OrdenEstandar
  `);
  return result.recordset;
}

interface UpsertHitoArgs {
  IDHito: number | null;
  Codigo: string;
  Nombre: string;
  OrdenEstandar: number;
  Descripcion: string | null;
  ColorHEX: string | null;
  Activo: boolean;
}

/** POST/PATCH /api/hitos — upsert del catálogo de hitos. */
export async function upsertHito(
  db: ConnectionPool,
  usuarioEmail: string,
  args: UpsertHitoArgs,
): Promise<UpsertHitoResponse> {
  const request = db.request();
  request.input('IDHito', sql.Int, args.IDHito);
  request.input('Codigo', sql.VarChar(20), args.Codigo);
  request.input('Nombre', sql.NVarChar(100), args.Nombre);
  request.input('OrdenEstandar', sql.Int, args.OrdenEstandar);
  request.input('Descripcion', sql.NVarChar(500), args.Descripcion);
  request.input('ColorHEX', sql.NVarChar(10), args.ColorHEX);
  request.input('Activo', sql.Bit, args.Activo);
  request.input('UsuarioEmail', sql.NVarChar(200), usuarioEmail);

  const result = await request.execute<{ IDHito: number }>('[pro_app].sp_actualizar_catalogo_hito');
  const row = result.recordset[0];
  if (!row) throw new Error('SP no devolvió fila de resultado');
  return { IDHito: row.IDHito };
}

export function crearHitoArgs(body: NuevoHitoRequest): UpsertHitoArgs {
  return {
    IDHito: null,
    Codigo: body.Codigo,
    Nombre: body.Nombre,
    OrdenEstandar: body.OrdenEstandar,
    Descripcion: body.Descripcion ?? null,
    ColorHEX: body.ColorHEX ?? null,
    Activo: body.Activo ?? true,
  };
}

export function actualizarHitoArgs(idHito: number, body: ActualizarHitoRequest): UpsertHitoArgs {
  return {
    IDHito: idHito,
    Codigo: body.Codigo,
    Nombre: body.Nombre,
    OrdenEstandar: body.OrdenEstandar,
    Descripcion: body.Descripcion ?? null,
    ColorHEX: body.ColorHEX ?? null,
    Activo: body.Activo,
  };
}

// --------------------------------------------------------------------- Esquemas

/** GET /api/esquemas — todos los bancos con su esquema vigente (o null). */
export async function listarEsquemas(db: ConnectionPool): Promise<RespuestaEsquemas> {
  const filas = await db.request().query<{
    IDBan: number;
    AbrevBanco: string;
    NombreBanco: string;
    ColorBanco: string | null;
    OrdenGal: number | null;
    VigenteDesde: Date | null;
    VigenteHasta: Date | null;
    DiasVigencia: number | null;
    DiaSemanaPeritoFijo: number | null;
    Notas: string | null;
    HitosJSON: string | null;
    SumaPorcentaje: number | null;
    FechaCreacion: Date | null;
  }>(`
    SELECT
      b.IDBan,
      b.Abreviatura       AS AbrevBanco,
      b.NombreEntidad     AS NombreBanco,
      b.ColorHEXBan       AS ColorBanco,
      b.OrdenGal,
      h.VigenteDesde,
      h.VigenteHasta,
      h.DiasVigencia,
      h.DiaSemanaPeritoFijo,
      h.Notas,
      h.HitosJSON,
      h.SumaPorcentaje,
      h.FechaCreacion
    FROM pro_ventas.Bancos b
    OUTER APPLY (
      SELECT TOP 1 *
      FROM [pro_app].vw_historico_esquema_banco v
      WHERE v.IDBan = b.IDBan AND v.Estado = 'VIGENTE'
      ORDER BY v.VigenteDesde DESC
    ) h
    ORDER BY ISNULL(b.OrdenGal, 999), b.Abreviatura
  `);

  return {
    bancos: filas.recordset.map(
      (row): EsquemaBancoResumen => ({
        IDBan: row.IDBan,
        AbrevBanco: row.AbrevBanco,
        NombreBanco: row.NombreBanco,
        ColorBanco: row.ColorBanco,
        OrdenGal: row.OrdenGal,
        EsquemaVigente:
          row.VigenteDesde === null
            ? null
            : {
                IDBan: row.IDBan,
                AbrevBanco: row.AbrevBanco,
                NombreBanco: row.NombreBanco,
                ColorBanco: row.ColorBanco,
                OrdenGal: row.OrdenGal,
                VigenteDesde: toIsoDate(row.VigenteDesde) ?? '',
                VigenteHasta: toIsoDate(row.VigenteHasta),
                Estado: 'VIGENTE',
                DiasVigencia: row.DiasVigencia ?? 0,
                DiaSemanaPeritoFijo: row.DiaSemanaPeritoFijo,
                Notas: row.Notas,
                Hitos: parseHitos(row.HitosJSON),
                SumaPorcentaje: Number(row.SumaPorcentaje ?? 0),
                FechaCreacion: toIsoDate(row.FechaCreacion) ?? '',
              },
      }),
    ),
  };
}

/** GET /api/esquemas/:idBan — histórico completo de un banco. null si no existe. */
export async function esquemaPorBanco(
  db: ConnectionPool,
  idBan: number,
): Promise<RespuestaEsquemaBanco | null> {
  const bancoRs = await db
    .request()
    .input('id', sql.Int, idBan)
    .query<{ Abreviatura: string; NombreEntidad: string }>(
      'SELECT Abreviatura, NombreEntidad FROM pro_ventas.Bancos WHERE IDBan = @id',
    );
  const banco = bancoRs.recordset[0];
  if (!banco) return null;

  const versionesRs = await db
    .request()
    .input('id', sql.Int, idBan)
    .query<{
      IDBan: number;
      AbrevBanco: string;
      NombreBanco: string;
      ColorBanco: string | null;
      OrdenGal: number | null;
      VigenteDesde: Date;
      VigenteHasta: Date | null;
      Estado: 'VIGENTE' | 'HISTORICA';
      DiasVigencia: number;
      DiaSemanaPeritoFijo: number | null;
      Notas: string | null;
      HitosJSON: string | null;
      SumaPorcentaje: number;
      FechaCreacion: Date;
    }>(`
      SELECT *
      FROM [pro_app].vw_historico_esquema_banco
      WHERE IDBan = @id
      ORDER BY VigenteDesde DESC
    `);

  return {
    IDBan: idBan,
    AbrevBanco: banco.Abreviatura,
    NombreBanco: banco.NombreEntidad,
    Versiones: versionesRs.recordset.map(
      (row): EsquemaBanco => ({
        IDBan: row.IDBan,
        AbrevBanco: row.AbrevBanco,
        NombreBanco: row.NombreBanco,
        ColorBanco: row.ColorBanco,
        OrdenGal: row.OrdenGal,
        VigenteDesde: toIsoDate(row.VigenteDesde) ?? '',
        VigenteHasta: toIsoDate(row.VigenteHasta),
        Estado: row.Estado,
        DiasVigencia: row.DiasVigencia,
        DiaSemanaPeritoFijo: row.DiaSemanaPeritoFijo,
        Notas: row.Notas,
        Hitos: parseHitos(row.HitosJSON),
        SumaPorcentaje: Number(row.SumaPorcentaje),
        FechaCreacion: toIsoDate(row.FechaCreacion) ?? '',
      }),
    ),
  };
}

/** POST /api/esquemas — crear nueva versión completa. */
export async function crearEsquema(
  db: ConnectionPool,
  body: NuevoEsquemaRequest,
  usuarioEmail: string,
): Promise<NuevoEsquemaResponse> {
  const request = db.request();
  request.input('IDBan', sql.Int, body.IDBan);
  request.input('VigenteDesde', sql.Date, body.VigenteDesde);
  request.input('DiaSemanaPeritoFijo', sql.TinyInt, body.DiaSemanaPeritoFijo ?? null);
  request.input('Notas', sql.NVarChar(500), body.Notas ?? null);
  request.input('HitosJSON', sql.NVarChar(sql.MAX), JSON.stringify(body.Hitos));
  request.input('UsuarioEmail', sql.NVarChar(200), usuarioEmail);

  const result = await request.execute<{
    IDBanActualizado: number;
    VigenteDesde: Date;
    FilasCerradas: number;
  }>('[pro_app].sp_actualizar_esquema_banco');
  const row = result.recordset[0];
  if (!row) throw new Error('SP no devolvió fila de resultado');
  return {
    IDBanActualizado: row.IDBanActualizado,
    VigenteDesde: toIsoDate(row.VigenteDesde) ?? body.VigenteDesde,
    FilasCerradas: row.FilasCerradas,
  };
}

/** PATCH /api/esquemas/:idBan/vigente — edita la versión vigente in-place. */
export async function editarEsquemaVigente(
  db: ConnectionPool,
  idBan: number,
  body: EditarEsquemaVigenteRequest,
  usuarioEmail: string,
): Promise<EditarEsquemaVigenteResponse> {
  const request = db.request();
  request.input('IDBan', sql.Int, idBan);
  request.input('DiaSemanaPeritoFijo', sql.TinyInt, body.DiaSemanaPeritoFijo ?? null);
  request.input('Notas', sql.NVarChar(500), body.Notas ?? null);
  request.input('HitosJSON', sql.NVarChar(sql.MAX), JSON.stringify(body.Hitos));
  request.input('UsuarioEmail', sql.NVarChar(200), usuarioEmail);

  const result = await request.execute<{ IDBanEditado: number; VigenteDesde: Date }>(
    '[pro_app].sp_editar_esquema_vigente_banco',
  );
  const row = result.recordset[0];
  if (!row) throw new Error('SP no devolvió fila de resultado');
  return { IDBanEditado: row.IDBanEditado, VigenteDesde: toIsoDate(row.VigenteDesde) ?? '' };
}
