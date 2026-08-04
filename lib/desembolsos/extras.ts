import type { ConnectionPool } from 'mssql';
import { sql } from '@/lib/db-adelantedb';

// =============================================================================
// Extras y descuentos por caso. Portado de adelante-flujo-desembolsos
// (api/src/functions/extras.ts + sql/migrations fase4.6c). SPs portados inline.
// Al aprobar/rechazar una APROBADA se recalcula PrecioVentaActual del caso
// (porta sp_recalcular_precio_venta_actual sobre [pro_app].caso_lote_banco).
// =============================================================================

export type ExtraTipo = 'EXTRA' | 'DESCUENTO';
export type ExtraEstado = 'COTIZADA' | 'APROBADA' | 'RECHAZADA';

export const TIPOS_VALIDOS: ExtraTipo[] = ['EXTRA', 'DESCUENTO'];
export const ESTADOS_VALIDOS: ExtraEstado[] = ['COTIZADA', 'APROBADA', 'RECHAZADA'];

export interface CasoExtra {
  IDExtra: number;
  IDCaso: number;
  CodigoCaso: string | null;
  Cliente: string | null;
  AbreviaturaProyecto: string | null;
  CodigoLote: string | null;
  Tipo: ExtraTipo;
  Descripcion: string;
  MontoAjuste_CRC: number;
  Estado: ExtraEstado;
  FechaCotizacion: string;
  FechaAprobacion: string | null;
  ArchivoCotizacion: string | null;
  ArchivoAprobacion: string | null;
  Notas: string | null;
  CreadoPor: string;
  AprobadoPor: string | null;
  FechaCreacion: string;
  ModificadoPor: string | null;
  FechaModificacion: string | null;
}

interface RawExtra {
  IDExtra: number; IDCaso: number; CodigoCaso: string | null; Cliente: string | null;
  AbreviaturaProyecto: string | null; CodigoLote: string | null; Tipo: ExtraTipo;
  Descripcion: string; MontoAjuste_CRC: number; Estado: ExtraEstado; FechaCotizacion: Date;
  FechaAprobacion: Date | null; ArchivoCotizacion: string | null; ArchivoAprobacion: string | null;
  Notas: string | null; CreadoPor: string; AprobadoPor: string | null; FechaCreacion: Date;
  ModificadoPor: string | null; FechaModificacion: Date | null;
}

function isoDate(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

function mapExtra(r: RawExtra): CasoExtra {
  return {
    IDExtra: r.IDExtra,
    IDCaso: r.IDCaso,
    CodigoCaso: r.CodigoCaso,
    Cliente: r.Cliente?.trim() ?? null,
    AbreviaturaProyecto: r.AbreviaturaProyecto,
    CodigoLote: r.CodigoLote?.trim() ?? null,
    Tipo: r.Tipo,
    Descripcion: r.Descripcion,
    MontoAjuste_CRC: Number(r.MontoAjuste_CRC ?? 0),
    Estado: r.Estado,
    FechaCotizacion: isoDate(r.FechaCotizacion) ?? '',
    FechaAprobacion: isoDate(r.FechaAprobacion),
    ArchivoCotizacion: r.ArchivoCotizacion,
    ArchivoAprobacion: r.ArchivoAprobacion,
    Notas: r.Notas,
    CreadoPor: r.CreadoPor,
    AprobadoPor: r.AprobadoPor,
    FechaCreacion: r.FechaCreacion instanceof Date ? r.FechaCreacion.toISOString() : String(r.FechaCreacion ?? ''),
    ModificadoPor: r.ModificadoPor,
    FechaModificacion: r.FechaModificacion instanceof Date ? r.FechaModificacion.toISOString() : (r.FechaModificacion ? String(r.FechaModificacion) : null),
  };
}

export async function listarPorCaso(db: ConnectionPool, idCaso: number): Promise<CasoExtra[]> {
  const r = await db.request().input('id', sql.Int, idCaso).query<RawExtra>(`
    SELECT * FROM [pro_app].vw_caso_extras WHERE IDCaso = @id
    ORDER BY FechaCotizacion DESC, IDExtra DESC;
  `);
  return r.recordset.map(mapExtra);
}

export interface FiltroExtras {
  estado?: ExtraEstado | null;
  tipo?: ExtraTipo | null;
  idProyecto?: number | null;
  q?: string | null;
}

export async function listarGlobal(db: ConnectionPool, f: FiltroExtras): Promise<CasoExtra[]> {
  const request = db.request();
  const conds: string[] = ['1=1'];
  if (f.estado) { conds.push('Estado = @estado'); request.input('estado', sql.VarChar(20), f.estado); }
  if (f.tipo) { conds.push('Tipo = @tipo'); request.input('tipo', sql.VarChar(20), f.tipo); }
  if (f.idProyecto) {
    conds.push('IDCaso IN (SELECT cs.IDCaso FROM pro_ventas.Casos cs INNER JOIN pro_ventas.Lotes lt ON lt.IDLote = cs.IDLote WHERE lt.IDProyecto = @idProyecto)');
    request.input('idProyecto', sql.Int, f.idProyecto);
  }
  if (f.q) {
    conds.push('(Descripcion LIKE @q OR Cliente LIKE @q OR CodigoCaso LIKE @q OR CodigoLote LIKE @q)');
    request.input('q', sql.NVarChar(200), `%${f.q}%`);
  }
  const r = await request.query<RawExtra>(`
    SELECT TOP 500 * FROM [pro_app].vw_caso_extras WHERE ${conds.join(' AND ')}
    ORDER BY CASE Estado WHEN 'COTIZADA' THEN 0 WHEN 'APROBADA' THEN 1 ELSE 2 END,
             FechaCotizacion DESC, IDExtra DESC;
  `);
  return r.recordset.map(mapExtra);
}

export interface CrearExtraInput {
  IDCaso: number;
  Tipo: ExtraTipo;
  Descripcion: string;
  MontoAjuste_CRC: number;
  FechaCotizacion: string;
  Notas: string | null;
  UsuarioEmail: string;
}

// Porta [pro_app].sp_crear_extra inline.
export async function crearExtra(db: ConnectionPool, i: CrearExtraInput): Promise<{ IDExtra: number }> {
  const r = await db.request()
    .input('IDCaso', sql.Int, i.IDCaso)
    .input('Tipo', sql.VarChar(20), i.Tipo)
    .input('Descripcion', sql.NVarChar(500), i.Descripcion.trim())
    .input('MontoAjuste_CRC', sql.Money, i.MontoAjuste_CRC)
    .input('FechaCotizacion', sql.Date, i.FechaCotizacion)
    .input('Notas', sql.NVarChar(1000), i.Notas ?? null)
    .input('UsuarioEmail', sql.NVarChar(200), i.UsuarioEmail)
    .query<{ IDExtra: number }>(`
      SET NOCOUNT ON; SET XACT_ABORT ON;
      IF NOT EXISTS (SELECT 1 FROM pro_ventas.Casos WHERE IDCaso = @IDCaso) THROW 52000, 'IDCaso no existe.', 1;
      IF @Tipo NOT IN ('EXTRA','DESCUENTO') THROW 52001, 'Tipo inválido (EXTRA, DESCUENTO).', 1;
      IF @MontoAjuste_CRC IS NULL OR @MontoAjuste_CRC <= 0 THROW 52002, 'MontoAjuste_CRC debe ser mayor a cero.', 1;
      IF @Descripcion IS NULL OR LTRIM(RTRIM(@Descripcion)) = '' THROW 52003, 'Descripcion es obligatoria.', 1;
      BEGIN TRY
        BEGIN TRANSACTION;
        INSERT INTO [pro_app].caso_extra (IDCaso, Tipo, Descripcion, MontoAjuste_CRC, FechaCotizacion, Notas, CreadoPor)
        VALUES (@IDCaso, @Tipo, @Descripcion, @MontoAjuste_CRC, @FechaCotizacion, @Notas, @UsuarioEmail);
        DECLARE @NuevoID INT = SCOPE_IDENTITY();
        DECLARE @ValorNuevoJSON NVARCHAR(MAX) = (
          SELECT IDExtra = @NuevoID, IDCaso = @IDCaso, Tipo = @Tipo, Descripcion = @Descripcion,
                 MontoAjuste_CRC = @MontoAjuste_CRC, FechaCotizacion = @FechaCotizacion, Estado = 'COTIZADA', Notas = @Notas
          FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        INSERT INTO [pro_app].audit_log (Tabla, IDRegistro, Accion, UsuarioEmail, ValorAnteriorJSON, ValorNuevoJSON, Contexto)
        VALUES ('pro_app.caso_extra', @NuevoID, 'INSERT', @UsuarioEmail, NULL, @ValorNuevoJSON,
                CONCAT('Extra creada caso ', @IDCaso, ' · ', @Tipo, ' · ', CAST(@MontoAjuste_CRC AS NVARCHAR(40))));
        COMMIT TRANSACTION;
        SELECT @NuevoID AS IDExtra;
      END TRY
      BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION; THROW;
      END CATCH;
    `);
  const row = r.recordset[0];
  if (!row) throw new Error('No se devolvió IDExtra.');
  return { IDExtra: row.IDExtra };
}

export interface ActualizarExtraInput {
  Descripcion?: string | null;
  MontoAjuste_CRC?: number | null;
  FechaCotizacion?: string | null;
  Notas?: string | null;
  UsuarioEmail: string;
}

// Porta [pro_app].sp_actualizar_extra inline (solo si Estado=COTIZADA).
export async function actualizarExtra(db: ConnectionPool, idExtra: number, i: ActualizarExtraInput): Promise<void> {
  await db.request()
    .input('IDExtra', sql.Int, idExtra)
    .input('Descripcion', sql.NVarChar(500), i.Descripcion ?? null)
    .input('MontoAjuste_CRC', sql.Money, i.MontoAjuste_CRC ?? null)
    .input('FechaCotizacion', sql.Date, i.FechaCotizacion ?? null)
    .input('Notas', sql.NVarChar(1000), i.Notas ?? null)
    .input('UsuarioEmail', sql.NVarChar(200), i.UsuarioEmail)
    .query(`
      SET NOCOUNT ON; SET XACT_ABORT ON;
      DECLARE @Estado VARCHAR(20);
      SELECT @Estado = Estado FROM [pro_app].caso_extra WHERE IDExtra = @IDExtra;
      IF @Estado IS NULL THROW 52004, 'IDExtra no existe.', 1;
      IF @Estado <> 'COTIZADA' THROW 52005, 'Solo se puede editar una extra en estado COTIZADA.', 1;
      IF @MontoAjuste_CRC IS NOT NULL AND @MontoAjuste_CRC <= 0 THROW 52002, 'MontoAjuste_CRC debe ser mayor a cero.', 1;
      BEGIN TRY
        BEGIN TRANSACTION;
        DECLARE @ValorAnteriorJSON NVARCHAR(MAX) = (
          SELECT IDExtra, IDCaso, Tipo, Descripcion, MontoAjuste_CRC, FechaCotizacion, Estado, Notas
          FROM [pro_app].caso_extra WHERE IDExtra = @IDExtra FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        UPDATE [pro_app].caso_extra
        SET Descripcion = COALESCE(@Descripcion, Descripcion),
            MontoAjuste_CRC = COALESCE(@MontoAjuste_CRC, MontoAjuste_CRC),
            FechaCotizacion = COALESCE(@FechaCotizacion, FechaCotizacion),
            Notas = COALESCE(@Notas, Notas),
            ModificadoPor = @UsuarioEmail, FechaModificacion = SYSUTCDATETIME()
        WHERE IDExtra = @IDExtra;
        DECLARE @ValorNuevoJSON NVARCHAR(MAX) = (
          SELECT IDExtra, IDCaso, Tipo, Descripcion, MontoAjuste_CRC, FechaCotizacion, Estado, Notas
          FROM [pro_app].caso_extra WHERE IDExtra = @IDExtra FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        INSERT INTO [pro_app].audit_log (Tabla, IDRegistro, Accion, UsuarioEmail, ValorAnteriorJSON, ValorNuevoJSON, Contexto)
        VALUES ('pro_app.caso_extra', @IDExtra, 'UPDATE', @UsuarioEmail, @ValorAnteriorJSON, @ValorNuevoJSON,
                CONCAT('Edición extra ', @IDExtra));
        COMMIT TRANSACTION;
      END TRY
      BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION; THROW;
      END CATCH;
    `);
}

// Recalcula PrecioVentaActual del caso (porta sp_recalcular_precio_venta_actual)
// como bloque reusable dentro de aprobar/rechazar.
const RECALCULAR_PRECIO = `
  DECLARE @PrecioBase MONEY;
  SELECT @PrecioBase = PrecioVenta FROM pro_ventas.Casos WHERE IDCaso = @IDCaso;
  IF @PrecioBase IS NOT NULL
  BEGIN
    DECLARE @SumaExtras MONEY = (SELECT ISNULL(SUM(MontoAjuste_CRC),0) FROM [pro_app].caso_extra WHERE IDCaso = @IDCaso AND Estado='APROBADA' AND Tipo='EXTRA');
    DECLARE @SumaDescuentos MONEY = (SELECT ISNULL(SUM(MontoAjuste_CRC),0) FROM [pro_app].caso_extra WHERE IDCaso = @IDCaso AND Estado='APROBADA' AND Tipo='DESCUENTO');
    DECLARE @PrecioActual MONEY = @PrecioBase + @SumaExtras - @SumaDescuentos;
    IF EXISTS (SELECT 1 FROM [pro_app].caso_lote_banco WHERE IDCaso = @IDCaso)
      UPDATE [pro_app].caso_lote_banco SET PrecioVentaActual_CRC = @PrecioActual, FechaModificacion = SYSUTCDATETIME() WHERE IDCaso = @IDCaso;
    ELSE
      INSERT INTO [pro_app].caso_lote_banco (IDCaso, MontoPagaBancoPorLote_CRC, PrecioVentaActual_CRC) VALUES (@IDCaso, @PrecioActual, @PrecioActual);
  END
`;

// Porta [pro_app].sp_aprobar_extra inline.
export async function aprobarExtra(db: ConnectionPool, idExtra: number, fechaAprobacion: string, usuarioEmail: string): Promise<void> {
  await db.request()
    .input('IDExtra', sql.Int, idExtra)
    .input('FechaAprobacion', sql.Date, fechaAprobacion)
    .input('UsuarioEmail', sql.NVarChar(200), usuarioEmail)
    .query(`
      SET NOCOUNT ON; SET XACT_ABORT ON;
      DECLARE @Estado VARCHAR(20), @IDCaso INT;
      SELECT @Estado = Estado, @IDCaso = IDCaso FROM [pro_app].caso_extra WHERE IDExtra = @IDExtra;
      IF @Estado IS NULL THROW 52004, 'IDExtra no existe.', 1;
      IF @Estado <> 'COTIZADA' THROW 52006, 'Solo se puede aprobar una extra en estado COTIZADA.', 1;
      IF @FechaAprobacion IS NULL THROW 52007, 'FechaAprobacion es obligatoria.', 1;
      BEGIN TRY
        BEGIN TRANSACTION;
        DECLARE @ValorAnteriorJSON NVARCHAR(MAX) = (SELECT IDExtra, Estado, FechaAprobacion, AprobadoPor FROM [pro_app].caso_extra WHERE IDExtra = @IDExtra FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        UPDATE [pro_app].caso_extra
        SET Estado = 'APROBADA', FechaAprobacion = @FechaAprobacion, AprobadoPor = @UsuarioEmail,
            ModificadoPor = @UsuarioEmail, FechaModificacion = SYSUTCDATETIME()
        WHERE IDExtra = @IDExtra;
        DECLARE @ValorNuevoJSON NVARCHAR(MAX) = (SELECT IDExtra, Estado, FechaAprobacion, AprobadoPor FROM [pro_app].caso_extra WHERE IDExtra = @IDExtra FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        INSERT INTO [pro_app].audit_log (Tabla, IDRegistro, Accion, UsuarioEmail, ValorAnteriorJSON, ValorNuevoJSON, Contexto)
        VALUES ('pro_app.caso_extra', @IDExtra, 'UPDATE', @UsuarioEmail, @ValorAnteriorJSON, @ValorNuevoJSON, CONCAT('Aprobación extra ', @IDExtra));
        ${RECALCULAR_PRECIO}
        COMMIT TRANSACTION;
      END TRY
      BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION; THROW;
      END CATCH;
    `);
}

// Porta [pro_app].sp_rechazar_extra inline.
export async function rechazarExtra(db: ConnectionPool, idExtra: number, notas: string | null, usuarioEmail: string): Promise<void> {
  await db.request()
    .input('IDExtra', sql.Int, idExtra)
    .input('Notas', sql.NVarChar(1000), notas ?? null)
    .input('UsuarioEmail', sql.NVarChar(200), usuarioEmail)
    .query(`
      SET NOCOUNT ON; SET XACT_ABORT ON;
      DECLARE @Estado VARCHAR(20), @IDCaso INT;
      SELECT @Estado = Estado, @IDCaso = IDCaso FROM [pro_app].caso_extra WHERE IDExtra = @IDExtra;
      IF @Estado IS NULL THROW 52004, 'IDExtra no existe.', 1;
      IF @Estado = 'RECHAZADA' THROW 52008, 'La extra ya está rechazada.', 1;
      BEGIN TRY
        BEGIN TRANSACTION;
        DECLARE @EstadoAnterior VARCHAR(20) = @Estado;
        UPDATE [pro_app].caso_extra
        SET Estado = 'RECHAZADA', Notas = COALESCE(@Notas, Notas), ModificadoPor = @UsuarioEmail, FechaModificacion = SYSUTCDATETIME()
        WHERE IDExtra = @IDExtra;
        INSERT INTO [pro_app].audit_log (Tabla, IDRegistro, Accion, UsuarioEmail, ValorAnteriorJSON, ValorNuevoJSON, Contexto)
        VALUES ('pro_app.caso_extra', @IDExtra, 'UPDATE', @UsuarioEmail, CONCAT('{"Estado":"', @EstadoAnterior, '"}'), '{"Estado":"RECHAZADA"}', CONCAT('Rechazo extra ', @IDExtra));
        IF @EstadoAnterior = 'APROBADA'
        BEGIN
          ${RECALCULAR_PRECIO}
        END
        COMMIT TRANSACTION;
      END TRY
      BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION; THROW;
      END CATCH;
    `);
}

// Porta [pro_app].sp_eliminar_extra inline (no si APROBADA).
export async function eliminarExtra(db: ConnectionPool, idExtra: number, usuarioEmail: string): Promise<void> {
  await db.request()
    .input('IDExtra', sql.Int, idExtra)
    .input('UsuarioEmail', sql.NVarChar(200), usuarioEmail)
    .query(`
      SET NOCOUNT ON; SET XACT_ABORT ON;
      DECLARE @Estado VARCHAR(20);
      SELECT @Estado = Estado FROM [pro_app].caso_extra WHERE IDExtra = @IDExtra;
      IF @Estado IS NULL THROW 52004, 'IDExtra no existe.', 1;
      IF @Estado = 'APROBADA' THROW 52009, 'No se puede eliminar una extra aprobada. Rechazala primero.', 1;
      DECLARE @ValorAnteriorJSON NVARCHAR(MAX) = (
        SELECT IDExtra, IDCaso, Tipo, Descripcion, MontoAjuste_CRC, Estado, FechaCotizacion, Notas
        FROM [pro_app].caso_extra WHERE IDExtra = @IDExtra FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
      BEGIN TRY
        BEGIN TRANSACTION;
        DELETE FROM [pro_app].caso_extra WHERE IDExtra = @IDExtra;
        INSERT INTO [pro_app].audit_log (Tabla, IDRegistro, Accion, UsuarioEmail, ValorAnteriorJSON, ValorNuevoJSON, Contexto)
        VALUES ('pro_app.caso_extra', @IDExtra, 'DELETE', @UsuarioEmail, @ValorAnteriorJSON, NULL, CONCAT('Eliminación extra ', @IDExtra));
        COMMIT TRANSACTION;
      END TRY
      BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION; THROW;
      END CATCH;
    `);
}

export function mapDbError(err: unknown): { status: number; error: string } {
  const message = err instanceof Error ? err.message : String(err);
  const isClient = /THROW|debe|inválido|obligatorio|no existe|no puede|no se puede|aprobada|rechazada/i.test(message);
  return { status: isClient ? 400 : 500, error: message };
}
