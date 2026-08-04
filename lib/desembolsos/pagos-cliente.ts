import type { ConnectionPool } from 'mssql';
import { sql } from '@/lib/db-adelantedb';

// =============================================================================
// Pagos del cliente (fraccionados, N:N con movimientos). Portado de
// adelante-flujo-desembolsos (api/src/functions/pagosCliente.ts +
// sql/migrations fase4.6a / fase4.6k / fase6.8). SPs portados inline.
//
// NOTA: el repo origen, tras vincular/desvincular, llama a
// [pro_app].sp_recalcular_utilidad_mov (dominio movimientos, best-effort). Ese SP
// no existe en AdelanteDB y pertenece a otro módulo, así que se omite (el
// origen ya tolera que falle). El refresco de FechaReal del pago SÍ se porta.
// =============================================================================

export type PagoClienteConcepto = 'PRIMA' | 'EXTRA' | 'GASTO_ADICIONAL' | 'CUOTA' | 'LOTE';
export type PagoClienteEstado = string;

export const CONCEPTOS_VALIDOS: PagoClienteConcepto[] = ['PRIMA', 'EXTRA', 'GASTO_ADICIONAL', 'CUOTA', 'LOTE'];

export interface PagoClienteMovLink {
  IDLink: number;
  IDMovimiento: number;
  AbreviaturaTipo: string | null;
  FechaRealizado: string | null;
  MontoMovimiento_CRC: number;
  MontoAplicado_CRC: number;
  Notas: string | null;
}

export interface PagoCliente {
  IDPago: number;
  IDCaso: number;
  Concepto: PagoClienteConcepto;
  IDExtra: number | null;
  MontoPlaneado_CRC: number;
  FechaPlaneada: string;
  FechaReal: string | null;
  IDMovimientoVinculado: number | null;
  Notas: string | null;
  Estado: PagoClienteEstado;
  CreadoPor: string;
  FechaCreacion: string;
  ModificadoPor: string | null;
  FechaModificacion: string | null;
  MontoMovimientoVinculado_CRC: number | null;
  FechaMovimientoVinculado: string | null;
  MontoAplicado_CRC: number;
  NumLinks: number;
  Diferencia_CRC: number;
  Links: PagoClienteMovLink[];
}

export interface PagoClienteEnRango extends PagoCliente {
  CodigoCaso: string | null;
  Cliente: string | null;
  AbreviaturaProyecto: string | null;
  CodigoLote: string | null;
}

interface RawPagoCliente {
  IDPago: number; IDCaso: number; Concepto: PagoClienteConcepto; IDExtra: number | null;
  MontoPlaneado_CRC: number; FechaPlaneada: Date; FechaReal: Date | null;
  IDMovimientoVinculado: number | null; Notas: string | null; Estado: PagoClienteEstado;
  CreadoPor: string; FechaCreacion: Date; ModificadoPor: string | null; FechaModificacion: Date | null;
  MontoMovimientoVinculado_CRC: number | null; FechaMovimientoVinculado: Date | null;
  MontoAplicado_CRC: number; NumLinks: number; Diferencia_CRC: number; LinksJSON: string | null;
}
interface RawPagoClienteEnRango extends RawPagoCliente {
  CodigoCaso: string | null; Cliente: string | null; AbreviaturaProyecto: string | null; CodigoLote: string | null;
}

function isoDate(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}
function isoDateStr(v: Date | string | null): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

function parseLinks(linksJSON: string | null): PagoClienteMovLink[] {
  if (!linksJSON) return [];
  try {
    const parsed = JSON.parse(linksJSON) as Partial<PagoClienteMovLink>[];
    return parsed.map((l) => ({
      IDLink: l.IDLink!,
      IDMovimiento: l.IDMovimiento!,
      AbreviaturaTipo: l.AbreviaturaTipo ?? null,
      FechaRealizado: l.FechaRealizado ?? null,
      MontoMovimiento_CRC: Number(l.MontoMovimiento_CRC ?? 0),
      MontoAplicado_CRC: Number(l.MontoAplicado_CRC ?? 0),
      Notas: l.Notas ?? null,
    }));
  } catch {
    return [];
  }
}

function mapPago(r: RawPagoCliente): PagoCliente {
  return {
    IDPago: r.IDPago,
    IDCaso: r.IDCaso,
    Concepto: r.Concepto,
    IDExtra: r.IDExtra,
    MontoPlaneado_CRC: Number(r.MontoPlaneado_CRC ?? 0),
    FechaPlaneada: isoDate(r.FechaPlaneada) ?? '',
    FechaReal: isoDate(r.FechaReal),
    IDMovimientoVinculado: r.IDMovimientoVinculado,
    Notas: r.Notas,
    Estado: r.Estado,
    CreadoPor: r.CreadoPor,
    FechaCreacion: r.FechaCreacion instanceof Date ? r.FechaCreacion.toISOString() : String(r.FechaCreacion ?? ''),
    ModificadoPor: r.ModificadoPor,
    FechaModificacion: r.FechaModificacion instanceof Date ? r.FechaModificacion.toISOString() : (r.FechaModificacion ? String(r.FechaModificacion) : null),
    MontoMovimientoVinculado_CRC: r.MontoMovimientoVinculado_CRC != null ? Number(r.MontoMovimientoVinculado_CRC) : null,
    FechaMovimientoVinculado: isoDate(r.FechaMovimientoVinculado),
    MontoAplicado_CRC: Number(r.MontoAplicado_CRC ?? 0),
    NumLinks: Number(r.NumLinks ?? 0),
    Diferencia_CRC: Number(r.Diferencia_CRC ?? 0),
    Links: parseLinks(r.LinksJSON),
  };
}

const LINKS_SUBQUERY = `(
  SELECT lk.IDLink, lk.IDMovimiento, tm.Abreviatura AS AbreviaturaTipo,
         CONVERT(VARCHAR(10), mm.FechaMovimiento, 23) AS FechaRealizado,
         mm.MontoColones AS MontoMovimiento_CRC, lk.MontoAplicado_CRC AS MontoAplicado_CRC,
         lk.Notas AS Notas
  FROM [pro_app].pago_cliente_mov_link lk
  INNER JOIN pro_ventas.Movimientos mm ON mm.IDMovimiento = lk.IDMovimiento
  LEFT JOIN pro_ventas.TipMovi tm ON tm.IDTmov = mm.IDTipmov
  WHERE lk.IDPago = v.IDPago
  ORDER BY mm.FechaMovimiento, lk.IDLink
  FOR JSON PATH
) AS LinksJSON`;

export async function listarPorCaso(db: ConnectionPool, idCaso: number): Promise<PagoCliente[]> {
  const r = await db.request().input('id', sql.Int, idCaso).query<RawPagoCliente>(`
    SELECT v.*, m.MontoColones AS MontoMovimientoVinculado_CRC,
           m.FechaMovimiento AS FechaMovimientoVinculado,
           ${LINKS_SUBQUERY}
    FROM [pro_app].vw_pagos_cliente_caso v
    LEFT JOIN pro_ventas.Movimientos m ON m.IDMovimiento = v.IDMovimientoVinculado
    WHERE v.IDCaso = @id
    ORDER BY v.FechaPlaneada, v.IDPago;
  `);
  return r.recordset.map(mapPago);
}

export async function listarEnRango(db: ConnectionPool, desde: string, hasta: string): Promise<PagoClienteEnRango[]> {
  const r = await db.request()
    .input('desde', sql.Date, desde)
    .input('hasta', sql.Date, hasta)
    .query<RawPagoClienteEnRango>(`
      SELECT v.IDPago, v.IDCaso, v.Concepto, v.IDExtra, v.MontoPlaneado_CRC,
             v.FechaPlaneada, v.FechaReal, v.IDMovimientoVinculado, v.Notas,
             v.CreadoPor, v.FechaCreacion, v.ModificadoPor, v.FechaModificacion, v.Estado,
             v.MontoAplicado_CRC, v.NumLinks, v.Diferencia_CRC,
             cs.DetCaso AS CodigoCaso, cl.NombreCompleto AS Cliente,
             p.AbreviaturaProyecto AS AbreviaturaProyecto, lt.Lote AS CodigoLote,
             m.MontoColones AS MontoMovimientoVinculado_CRC, m.FechaMovimiento AS FechaMovimientoVinculado,
             ${LINKS_SUBQUERY}
      FROM [pro_app].vw_pagos_cliente_caso v
      INNER JOIN pro_ventas.Casos cs ON cs.IDCaso = v.IDCaso
      LEFT JOIN pro_ventas.Clientes cl ON cl.IDCliente = cs.IDCliente
      LEFT JOIN pro_ventas.Lotes lt ON lt.IDLote = cs.IDLote
      LEFT JOIN dbo.Proyecto p ON p.IDProyecto = lt.IDProyecto
      LEFT JOIN pro_ventas.Movimientos m ON m.IDMovimiento = v.IDMovimientoVinculado
      WHERE v.FechaPlaneada >= @desde AND v.FechaPlaneada <= @hasta
      ORDER BY v.FechaPlaneada, v.IDPago;
    `);
  return r.recordset.map((row) => ({
    ...mapPago(row),
    CodigoCaso: row.CodigoCaso,
    Cliente: row.Cliente?.trim() ?? null,
    AbreviaturaProyecto: row.AbreviaturaProyecto,
    CodigoLote: row.CodigoLote?.trim() ?? null,
  }));
}

export interface CrearPagoInput {
  IDCaso: number;
  Concepto: PagoClienteConcepto;
  MontoPlaneado_CRC: number;
  FechaPlaneada: string;
  IDExtra: number | null;
  Notas: string | null;
  UsuarioEmail: string;
}

// Porta [pro_app].sp_crear_pago_cliente inline.
export async function crearPago(db: ConnectionPool, i: CrearPagoInput): Promise<{ IDPago: number }> {
  const r = await db.request()
    .input('IDCaso', sql.Int, i.IDCaso)
    .input('Concepto', sql.VarChar(20), i.Concepto)
    .input('MontoPlaneado_CRC', sql.Money, i.MontoPlaneado_CRC)
    .input('FechaPlaneada', sql.Date, i.FechaPlaneada)
    .input('IDExtra', sql.Int, i.IDExtra ?? null)
    .input('Notas', sql.NVarChar(500), i.Notas ?? null)
    .input('UsuarioEmail', sql.NVarChar(200), i.UsuarioEmail)
    .query<{ IDPago: number }>(`
      SET NOCOUNT ON; SET XACT_ABORT ON;
      IF NOT EXISTS (SELECT 1 FROM pro_ventas.Casos WHERE IDCaso = @IDCaso) THROW 51990, 'IDCaso no existe.', 1;
      IF @Concepto NOT IN ('PRIMA','EXTRA','GASTO_ADICIONAL','CUOTA','LOTE')
        THROW 51991, 'Concepto inválido (PRIMA, EXTRA, GASTO_ADICIONAL, CUOTA, LOTE).', 1;
      IF @MontoPlaneado_CRC IS NULL OR @MontoPlaneado_CRC <= 0 THROW 51992, 'MontoPlaneado_CRC debe ser mayor a cero.', 1;
      IF @FechaPlaneada IS NULL THROW 51993, 'FechaPlaneada es obligatoria.', 1;
      BEGIN TRY
        BEGIN TRANSACTION;
        INSERT INTO [pro_app].pago_cliente (IDCaso, Concepto, IDExtra, MontoPlaneado_CRC, FechaPlaneada, Notas, CreadoPor)
        VALUES (@IDCaso, @Concepto, @IDExtra, @MontoPlaneado_CRC, @FechaPlaneada, @Notas, @UsuarioEmail);
        DECLARE @NuevoID INT = SCOPE_IDENTITY();
        DECLARE @ValorNuevoJSON NVARCHAR(MAX) = (
          SELECT IDPago = @NuevoID, IDCaso = @IDCaso, Concepto = @Concepto, IDExtra = @IDExtra,
                 MontoPlaneado_CRC = @MontoPlaneado_CRC, FechaPlaneada = @FechaPlaneada, Notas = @Notas
          FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        INSERT INTO [pro_app].audit_log (Tabla, IDRegistro, Accion, UsuarioEmail, ValorAnteriorJSON, ValorNuevoJSON, Contexto)
        VALUES ('pro_app.pago_cliente', @NuevoID, 'INSERT', @UsuarioEmail, NULL, @ValorNuevoJSON,
                CONCAT('Pago cliente caso ', @IDCaso, ' · ', @Concepto));
        COMMIT TRANSACTION;
        SELECT @NuevoID AS IDPago;
      END TRY
      BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION; THROW;
      END CATCH;
    `);
  const row = r.recordset[0];
  if (!row) throw new Error('No se devolvió IDPago.');
  return { IDPago: row.IDPago };
}

export interface ActualizarPagoInput {
  Concepto?: PagoClienteConcepto | null;
  MontoPlaneado_CRC?: number | null;
  FechaPlaneada?: string | null;
  FechaReal?: string | null;
  IDMovimientoVinculado?: number | null;
  IDExtra?: number | null;
  Notas?: string | null;
  UsuarioEmail: string;
}

// Porta [pro_app].sp_actualizar_pago_cliente inline.
export async function actualizarPago(db: ConnectionPool, idPago: number, i: ActualizarPagoInput): Promise<void> {
  await db.request()
    .input('IDPago', sql.Int, idPago)
    .input('Concepto', sql.VarChar(20), i.Concepto ?? null)
    .input('MontoPlaneado_CRC', sql.Money, i.MontoPlaneado_CRC ?? null)
    .input('FechaPlaneada', sql.Date, i.FechaPlaneada ?? null)
    .input('FechaReal', sql.Date, i.FechaReal ?? null)
    .input('IDMovimientoVinculado', sql.Int, i.IDMovimientoVinculado ?? null)
    .input('IDExtra', sql.Int, i.IDExtra ?? null)
    .input('Notas', sql.NVarChar(500), i.Notas ?? null)
    .input('UsuarioEmail', sql.NVarChar(200), i.UsuarioEmail)
    .query(`
      SET NOCOUNT ON; SET XACT_ABORT ON;
      IF NOT EXISTS (SELECT 1 FROM [pro_app].pago_cliente WHERE IDPago = @IDPago) THROW 51994, 'IDPago no existe.', 1;
      IF @Concepto IS NOT NULL AND @Concepto NOT IN ('PRIMA','EXTRA','GASTO_ADICIONAL','CUOTA','LOTE')
        THROW 51991, 'Concepto inválido.', 1;
      IF @MontoPlaneado_CRC IS NOT NULL AND @MontoPlaneado_CRC <= 0 THROW 51992, 'MontoPlaneado_CRC debe ser mayor a cero.', 1;
      BEGIN TRY
        BEGIN TRANSACTION;
        DECLARE @ValorAnteriorJSON NVARCHAR(MAX) = (
          SELECT IDPago, IDCaso, Concepto, IDExtra, MontoPlaneado_CRC, FechaPlaneada, FechaReal, IDMovimientoVinculado, Notas
          FROM [pro_app].pago_cliente WHERE IDPago = @IDPago FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        UPDATE [pro_app].pago_cliente
        SET Concepto = COALESCE(@Concepto, Concepto),
            MontoPlaneado_CRC = COALESCE(@MontoPlaneado_CRC, MontoPlaneado_CRC),
            FechaPlaneada = COALESCE(@FechaPlaneada, FechaPlaneada),
            FechaReal = COALESCE(@FechaReal, FechaReal),
            IDMovimientoVinculado = COALESCE(@IDMovimientoVinculado, IDMovimientoVinculado),
            IDExtra = COALESCE(@IDExtra, IDExtra),
            Notas = COALESCE(@Notas, Notas),
            ModificadoPor = @UsuarioEmail, FechaModificacion = SYSUTCDATETIME()
        WHERE IDPago = @IDPago;
        DECLARE @ValorNuevoJSON NVARCHAR(MAX) = (
          SELECT IDPago, IDCaso, Concepto, IDExtra, MontoPlaneado_CRC, FechaPlaneada, FechaReal, IDMovimientoVinculado, Notas
          FROM [pro_app].pago_cliente WHERE IDPago = @IDPago FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        INSERT INTO [pro_app].audit_log (Tabla, IDRegistro, Accion, UsuarioEmail, ValorAnteriorJSON, ValorNuevoJSON, Contexto)
        VALUES ('pro_app.pago_cliente', @IDPago, 'UPDATE', @UsuarioEmail, @ValorAnteriorJSON, @ValorNuevoJSON,
                CONCAT('Update pago cliente IDPago=', @IDPago));
        COMMIT TRANSACTION;
      END TRY
      BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION; THROW;
      END CATCH;
    `);
}

// Porta [pro_app].sp_eliminar_pago_cliente inline.
export async function eliminarPago(db: ConnectionPool, idPago: number, usuarioEmail: string): Promise<void> {
  await db.request()
    .input('IDPago', sql.Int, idPago)
    .input('UsuarioEmail', sql.NVarChar(200), usuarioEmail)
    .query(`
      SET NOCOUNT ON; SET XACT_ABORT ON;
      DECLARE @ValorAnteriorJSON NVARCHAR(MAX) = (
        SELECT IDPago, IDCaso, Concepto, IDExtra, MontoPlaneado_CRC, FechaPlaneada, FechaReal, IDMovimientoVinculado, Notas
        FROM [pro_app].pago_cliente WHERE IDPago = @IDPago FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
      IF @ValorAnteriorJSON IS NULL THROW 51994, 'IDPago no existe.', 1;
      BEGIN TRY
        BEGIN TRANSACTION;
        DELETE FROM [pro_app].pago_cliente WHERE IDPago = @IDPago;
        INSERT INTO [pro_app].audit_log (Tabla, IDRegistro, Accion, UsuarioEmail, ValorAnteriorJSON, ValorNuevoJSON, Contexto)
        VALUES ('pro_app.pago_cliente', @IDPago, 'DELETE', @UsuarioEmail, @ValorAnteriorJSON, NULL,
                CONCAT('Eliminación pago cliente ', @IDPago));
        COMMIT TRANSACTION;
      END TRY
      BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION; THROW;
      END CATCH;
    `);
}

export interface VincularInput {
  IDMovimiento: number;
  IDPago: number;
  MontoAplicado_CRC: number;
  Notas: string | null;
  UsuarioEmail: string;
}

// Porta [pro_app].sp_vincular_mov_a_pago_cliente inline (incluye refresco de
// FechaReal — sp_refrescar_pago_cliente — dentro de la misma transacción).
// Omite sp_recalcular_utilidad_mov (dominio movimientos, no portado aquí).
export async function vincularMov(db: ConnectionPool, i: VincularInput): Promise<{ IDLink: number; Accion: 'INSERT' | 'UPDATE' }> {
  const r = await db.request()
    .input('IDMovimiento', sql.Int, i.IDMovimiento)
    .input('IDPago', sql.Int, i.IDPago)
    .input('MontoAplicado_CRC', sql.Money, i.MontoAplicado_CRC)
    .input('Notas', sql.NVarChar(500), i.Notas ?? null)
    .input('UsuarioEmail', sql.NVarChar(200), i.UsuarioEmail)
    .query<{ IDLink: number; Accion: 'INSERT' | 'UPDATE' }>(`
      SET NOCOUNT ON; SET XACT_ABORT ON;
      DECLARE @IDCasoMov INT, @MontoMov MONEY;
      SELECT @IDCasoMov = IDCaso, @MontoMov = MontoColones FROM pro_ventas.Movimientos WHERE IDMovimiento = @IDMovimiento;
      IF @IDCasoMov IS NULL THROW 52200, 'IDMovimiento no existe en pro_ventas.Movimientos.', 1;
      DECLARE @IDCasoPago INT;
      SELECT @IDCasoPago = IDCaso FROM [pro_app].pago_cliente WHERE IDPago = @IDPago;
      IF @IDCasoPago IS NULL THROW 52201, 'IDPago no existe en [pro_app].pago_cliente.', 1;
      IF @IDCasoMov <> @IDCasoPago THROW 52202, 'El movimiento y el pago cliente pertenecen a casos distintos.', 1;
      IF @MontoAplicado_CRC IS NULL OR @MontoAplicado_CRC <= 0 THROW 52203, 'MontoAplicado_CRC debe ser mayor a cero.', 1;
      DECLARE @MontoActualEnLink MONEY;
      SELECT @MontoActualEnLink = MontoAplicado_CRC FROM [pro_app].pago_cliente_mov_link
      WHERE IDMovimiento = @IDMovimiento AND IDPago = @IDPago;
      DECLARE @SumaHitos MONEY = ISNULL((SELECT SUM(MontoAplicado_CRC) FROM [pro_app].movimiento_hito_link WHERE IDMovimiento = @IDMovimiento), 0);
      DECLARE @SumaOtrosPagos MONEY = ISNULL((SELECT SUM(MontoAplicado_CRC) FROM [pro_app].pago_cliente_mov_link WHERE IDMovimiento = @IDMovimiento AND IDPago <> @IDPago), 0);
      IF (@SumaHitos + @SumaOtrosPagos + @MontoAplicado_CRC) > ISNULL(@MontoMov, 0)
        THROW 52204, 'La suma de montos vinculados (hitos + pagos cliente) excede el MontoColones del movimiento.', 1;
      BEGIN TRY
        BEGIN TRANSACTION;
        DECLARE @ValorAnteriorJSON NVARCHAR(MAX) = NULL;
        DECLARE @Accion VARCHAR(20);
        DECLARE @IDLink INT;
        IF @MontoActualEnLink IS NOT NULL
        BEGIN
          SET @ValorAnteriorJSON = (SELECT IDLink, IDPago, IDMovimiento, MontoAplicado_CRC, Notas, UsuarioVinculo, FechaVinculacion
            FROM [pro_app].pago_cliente_mov_link WHERE IDPago = @IDPago AND IDMovimiento = @IDMovimiento FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
          UPDATE [pro_app].pago_cliente_mov_link
          SET MontoAplicado_CRC = @MontoAplicado_CRC, Notas = @Notas, UsuarioVinculo = @UsuarioEmail, FechaVinculacion = SYSUTCDATETIME()
          WHERE IDPago = @IDPago AND IDMovimiento = @IDMovimiento;
          SELECT @IDLink = IDLink FROM [pro_app].pago_cliente_mov_link WHERE IDPago = @IDPago AND IDMovimiento = @IDMovimiento;
          SET @Accion = 'UPDATE';
        END
        ELSE
        BEGIN
          INSERT INTO [pro_app].pago_cliente_mov_link (IDPago, IDMovimiento, MontoAplicado_CRC, Notas, UsuarioVinculo)
          VALUES (@IDPago, @IDMovimiento, @MontoAplicado_CRC, @Notas, @UsuarioEmail);
          SET @IDLink = SCOPE_IDENTITY();
          SET @Accion = 'INSERT';
        END
        DECLARE @ValorNuevoJSON NVARCHAR(MAX) = (SELECT IDLink = @IDLink, IDPago = @IDPago, IDMovimiento = @IDMovimiento,
          MontoAplicado_CRC = @MontoAplicado_CRC, Notas = @Notas FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        INSERT INTO [pro_app].audit_log (Tabla, IDRegistro, Accion, UsuarioEmail, ValorAnteriorJSON, ValorNuevoJSON, Contexto)
        VALUES ('pro_app.pago_cliente_mov_link', @IDLink, @Accion, @UsuarioEmail, @ValorAnteriorJSON, @ValorNuevoJSON,
                CONCAT('Vinculación mov ', @IDMovimiento, ' -> pago cliente ', @IDPago, ' por ', CAST(@MontoAplicado_CRC AS NVARCHAR(40)), ' CRC'));
        -- Refrescar FechaReal (porta sp_refrescar_pago_cliente).
        UPDATE [pro_app].pago_cliente
        SET FechaReal = (SELECT MAX(m.FechaMovimiento) FROM [pro_app].pago_cliente_mov_link lk
                         INNER JOIN pro_ventas.Movimientos m ON m.IDMovimiento = lk.IDMovimiento WHERE lk.IDPago = @IDPago)
        WHERE IDPago = @IDPago;
        COMMIT TRANSACTION;
        SELECT @IDLink AS IDLink, @Accion AS Accion;
      END TRY
      BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION; THROW;
      END CATCH;
    `);
  const row = r.recordset[0];
  if (!row) throw new Error('No se devolvió IDLink.');
  return { IDLink: row.IDLink, Accion: row.Accion };
}

// Porta [pro_app].sp_desvincular_mov_de_pago_cliente inline (con refresco).
export async function desvincularMov(db: ConnectionPool, idLink: number, usuarioEmail: string): Promise<void> {
  await db.request()
    .input('IDLink', sql.Int, idLink)
    .input('UsuarioEmail', sql.NVarChar(200), usuarioEmail)
    .query(`
      SET NOCOUNT ON; SET XACT_ABORT ON;
      DECLARE @IDPago INT;
      SELECT @IDPago = IDPago FROM [pro_app].pago_cliente_mov_link WHERE IDLink = @IDLink;
      DECLARE @ValorAnteriorJSON NVARCHAR(MAX) = (
        SELECT IDLink, IDPago, IDMovimiento, MontoAplicado_CRC, Notas, UsuarioVinculo, FechaVinculacion
        FROM [pro_app].pago_cliente_mov_link WHERE IDLink = @IDLink FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
      IF @ValorAnteriorJSON IS NULL THROW 52205, 'IDLink no existe.', 1;
      BEGIN TRY
        BEGIN TRANSACTION;
        DELETE FROM [pro_app].pago_cliente_mov_link WHERE IDLink = @IDLink;
        INSERT INTO [pro_app].audit_log (Tabla, IDRegistro, Accion, UsuarioEmail, ValorAnteriorJSON, ValorNuevoJSON, Contexto)
        VALUES ('pro_app.pago_cliente_mov_link', @IDLink, 'DELETE', @UsuarioEmail, @ValorAnteriorJSON, NULL,
                CONCAT('Desvinculación de link ', @IDLink, ' (pago cliente)'));
        IF @IDPago IS NOT NULL
          UPDATE [pro_app].pago_cliente
          SET FechaReal = (SELECT MAX(m.FechaMovimiento) FROM [pro_app].pago_cliente_mov_link lk
                           INNER JOIN pro_ventas.Movimientos m ON m.IDMovimiento = lk.IDMovimiento WHERE lk.IDPago = @IDPago)
          WHERE IDPago = @IDPago;
        COMMIT TRANSACTION;
      END TRY
      BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION; THROW;
      END CATCH;
    `);
}

export function mapDbError(err: unknown): { status: number; error: string } {
  const message = err instanceof Error ? err.message : String(err);
  const isClient = /THROW|debe|inválido|obligatorio|no existe|no puede|excede|distintos/i.test(message);
  return { status: isClient ? 400 : 500, error: message };
}
