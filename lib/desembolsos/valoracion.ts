import type { ConnectionPool } from 'mssql';
import { sql } from '@/lib/db-adelantedb';

// =============================================================================
// Valoración de lote por banco × proyecto. Portado de
// adelante-flujo-desembolsos (api/src/functions/valoracion.ts +
// sql/migrations valoracion). Los SPs origen se portan inline como batch T-SQL.
// =============================================================================

export interface Banco {
  IDBan: number;
  Abreviatura: string;
  NombreEntidad: string;
  ColorHexBanco: string | null;
  OrdenGal: number | null;
}

export interface ValoracionConfig {
  IDValoracion: number;
  IDProyecto: number;
  AbreviaturaProyecto: string;
  NombreProyecto: string;
  IDBan: number;
  AbrevBanco: string;
  NombreBanco: string;
  ColorBanco: string | null;
  ValorM2Lote: number;
  Moneda: string;
  PorcentajeFinanciamiento: number;
  VigenteDesde: string;
  VigenteHasta: string | null;
  Estado: 'VIGENTE' | 'HISTORICA';
  DiasVigencia: number;
  Notas: string | null;
  FechaCreacion: string;
}

export interface BancoConValoracion {
  IDBan: number;
  AbrevBanco: string;
  NombreBanco: string;
  ColorBanco: string | null;
  OrdenGal: number | null;
  ValoracionVigente: ValoracionConfig | null;
}

export interface RespuestaValoracion {
  IDProyecto: number;
  AbreviaturaProyecto: string;
  NombreProyecto: string;
  Bancos: BancoConValoracion[];
}

export interface RespuestaValoracionBanco {
  IDProyecto: number;
  IDBan: number;
  AbrevBanco: string;
  NombreBanco: string;
  Versiones: ValoracionConfig[];
}

function toIsoDate(v: Date | string | null): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

export async function listarBancos(db: ConnectionPool): Promise<Banco[]> {
  const r = await db.request().query<Banco>(`
    SELECT IDBan, Abreviatura, NombreEntidad, ColorHEXBan AS ColorHexBanco, OrdenGal
    FROM dbo.Bancos
    ORDER BY ISNULL(OrdenGal, 999), Abreviatura
  `);
  return r.recordset;
}

export async function valoracionPorProyecto(db: ConnectionPool, idProyecto: number): Promise<RespuestaValoracion | null> {
  const proyectoRs = await db.request().input('id', sql.Int, idProyecto)
    .query<{ AbreviaturaProyecto: string; Nombre: string }>(
      `SELECT AbreviaturaProyecto, Nombre FROM dbo.Proyecto WHERE IDProyecto = @id`);
  const proyecto = proyectoRs.recordset[0];
  if (!proyecto) return null;

  const filas = await db.request().input('id', sql.Int, idProyecto).query<{
    IDBan: number; AbrevBanco: string; NombreBanco: string; ColorBanco: string | null;
    OrdenGal: number | null; IDValoracion: number | null; ValorM2Lote: number | null;
    Moneda: string | null; PorcentajeFinanciamiento: number | null; VigenteDesde: Date | null;
    VigenteHasta: Date | null; DiasVigencia: number | null; Notas: string | null; FechaCreacion: Date | null;
  }>(`
    SELECT b.IDBan, b.Abreviatura AS AbrevBanco, b.NombreEntidad AS NombreBanco,
           b.ColorHEXBan AS ColorBanco, b.OrdenGal,
           v.IDValoracion, v.ValorM2Lote, v.Moneda, v.PorcentajeFinanciamiento,
           v.VigenteDesde, v.VigenteHasta, v.DiasVigencia, v.Notas, v.FechaCreacion
    FROM dbo.Bancos b
    OUTER APPLY (
      SELECT TOP 1 * FROM [app].vw_historico_valoracion_banco h
      WHERE h.IDProyecto = @id AND h.IDBan = b.IDBan AND h.Estado = 'VIGENTE'
      ORDER BY h.VigenteDesde DESC
    ) v
    ORDER BY ISNULL(b.OrdenGal, 999), b.Abreviatura
  `);

  return {
    IDProyecto: idProyecto,
    AbreviaturaProyecto: proyecto.AbreviaturaProyecto,
    NombreProyecto: proyecto.Nombre,
    Bancos: filas.recordset.map((row) => ({
      IDBan: row.IDBan,
      AbrevBanco: row.AbrevBanco?.trim() ?? '',
      NombreBanco: row.NombreBanco,
      ColorBanco: row.ColorBanco,
      OrdenGal: row.OrdenGal,
      ValoracionVigente: row.IDValoracion == null ? null : {
        IDValoracion: row.IDValoracion,
        IDProyecto: idProyecto,
        AbreviaturaProyecto: proyecto.AbreviaturaProyecto,
        NombreProyecto: proyecto.Nombre,
        IDBan: row.IDBan,
        AbrevBanco: row.AbrevBanco?.trim() ?? '',
        NombreBanco: row.NombreBanco,
        ColorBanco: row.ColorBanco,
        ValorM2Lote: Number(row.ValorM2Lote),
        Moneda: row.Moneda ?? 'USD',
        PorcentajeFinanciamiento: Number(row.PorcentajeFinanciamiento),
        VigenteDesde: toIsoDate(row.VigenteDesde) ?? '',
        VigenteHasta: toIsoDate(row.VigenteHasta),
        Estado: 'VIGENTE',
        DiasVigencia: row.DiasVigencia ?? 0,
        Notas: row.Notas,
        FechaCreacion: toIsoDate(row.FechaCreacion) ?? '',
      },
    })),
  };
}

export async function historicoPorProyectoBanco(db: ConnectionPool, idProyecto: number, idBan: number): Promise<RespuestaValoracionBanco> {
  const rs = await db.request()
    .input('idp', sql.Int, idProyecto)
    .input('idb', sql.Int, idBan)
    .query<ValoracionConfig & { VigenteDesde: Date; VigenteHasta: Date | null; FechaCreacion: Date }>(`
      SELECT * FROM [app].vw_historico_valoracion_banco
      WHERE IDProyecto = @idp AND IDBan = @idb
      ORDER BY VigenteDesde DESC
    `);
  const primera = rs.recordset[0];
  return {
    IDProyecto: idProyecto,
    IDBan: idBan,
    AbrevBanco: primera?.AbrevBanco?.trim() ?? '',
    NombreBanco: primera?.NombreBanco ?? '',
    Versiones: rs.recordset.map((row) => ({
      IDValoracion: row.IDValoracion,
      IDProyecto: row.IDProyecto,
      AbreviaturaProyecto: row.AbreviaturaProyecto,
      NombreProyecto: row.NombreProyecto,
      IDBan: row.IDBan,
      AbrevBanco: row.AbrevBanco?.trim() ?? '',
      NombreBanco: row.NombreBanco,
      ColorBanco: row.ColorBanco,
      ValorM2Lote: Number(row.ValorM2Lote),
      Moneda: row.Moneda,
      PorcentajeFinanciamiento: Number(row.PorcentajeFinanciamiento),
      VigenteDesde: toIsoDate(row.VigenteDesde) ?? '',
      VigenteHasta: toIsoDate(row.VigenteHasta),
      Estado: row.Estado,
      DiasVigencia: row.DiasVigencia,
      Notas: row.Notas,
      FechaCreacion: toIsoDate(row.FechaCreacion) ?? '',
    })),
  };
}

export interface CrearValoracionInput {
  IDProyecto: number;
  IDBan: number;
  ValorM2Lote: number;
  Moneda?: string;
  PorcentajeFinanciamiento: number;
  VigenteDesde: string;
  Notas: string | null;
  UsuarioEmail: string;
}

export function validarCrear(b: Partial<CrearValoracionInput>): string | null {
  if (!b.IDProyecto || !Number.isInteger(b.IDProyecto)) return 'IDProyecto es obligatorio.';
  if (!b.IDBan || !Number.isInteger(b.IDBan)) return 'IDBan es obligatorio.';
  if (!b.ValorM2Lote || b.ValorM2Lote <= 0) return 'ValorM2Lote debe ser mayor a 0.';
  if (!b.PorcentajeFinanciamiento || b.PorcentajeFinanciamiento <= 0 || b.PorcentajeFinanciamiento > 100)
    return 'PorcentajeFinanciamiento debe estar entre 0 y 100.';
  if (!b.VigenteDesde || !/^\d{4}-\d{2}-\d{2}$/.test(b.VigenteDesde)) return 'VigenteDesde debe ser fecha ISO YYYY-MM-DD.';
  return null;
}

// Porta [app].sp_actualizar_valoracion_banco inline.
export async function crearValoracion(db: ConnectionPool, i: CrearValoracionInput): Promise<{ IDValoracionCreada: number; IDValoracionCerrada: number | null }> {
  const r = await db.request()
    .input('IDProyecto', sql.Int, i.IDProyecto)
    .input('IDBan', sql.Int, i.IDBan)
    .input('ValorM2Lote', sql.Decimal(10, 2), i.ValorM2Lote)
    .input('Moneda', sql.Char(3), i.Moneda ?? 'USD')
    .input('PorcentajeFinanciamiento', sql.Decimal(5, 2), i.PorcentajeFinanciamiento)
    .input('VigenteDesde', sql.Date, i.VigenteDesde)
    .input('Notas', sql.NVarChar(500), i.Notas ?? null)
    .input('UsuarioEmail', sql.NVarChar(200), i.UsuarioEmail)
    .query<{ IDValoracionCreada: number; IDValoracionCerrada: number | null }>(`
      SET NOCOUNT ON; SET XACT_ABORT ON;
      IF NOT EXISTS (SELECT 1 FROM dbo.Proyecto WHERE IDProyecto = @IDProyecto)
        THROW 51200, 'IDProyecto inválido o no existe.', 1;
      IF NOT EXISTS (SELECT 1 FROM dbo.Bancos WHERE IDBan = @IDBan)
        THROW 51201, 'IDBan inválido o no existe.', 1;
      IF @ValorM2Lote <= 0 THROW 51202, 'ValorM2Lote debe ser mayor a 0.', 1;
      IF @PorcentajeFinanciamiento <= 0 OR @PorcentajeFinanciamiento > 100
        THROW 51203, 'PorcentajeFinanciamiento debe estar entre 0 y 100.', 1;
      IF EXISTS (SELECT 1 FROM [app].banco_valoracion_lote
                 WHERE IDProyecto = @IDProyecto AND IDBan = @IDBan AND VigenteDesde = @VigenteDesde)
        THROW 51205, 'Ya existe una valoración para ese proyecto/banco con esa fecha.', 1;
      DECLARE @UltimaVigenteDesde DATE = (
        SELECT MAX(VigenteDesde) FROM [app].banco_valoracion_lote
        WHERE IDProyecto = @IDProyecto AND IDBan = @IDBan AND VigenteHasta IS NULL);
      IF @UltimaVigenteDesde IS NOT NULL AND @VigenteDesde <= @UltimaVigenteDesde
        THROW 51206, 'La nueva vigencia debe ser posterior a la valoración actual del proyecto/banco.', 1;
      BEGIN TRY
        BEGIN TRANSACTION;
        DECLARE @IDValoracionCerrada INT;
        DECLARE @VigenteHastaCerrada DATE = DATEADD(DAY, -1, @VigenteDesde);
        UPDATE [app].banco_valoracion_lote
        SET VigenteHasta = @VigenteHastaCerrada, @IDValoracionCerrada = IDValoracion
        WHERE IDProyecto = @IDProyecto AND IDBan = @IDBan AND VigenteHasta IS NULL;
        IF @IDValoracionCerrada IS NOT NULL
          INSERT INTO [app].audit_log (Tabla, IDRegistro, Accion, UsuarioEmail, ValorNuevoJSON, Contexto)
          VALUES ('app.banco_valoracion_lote', @IDValoracionCerrada, 'UPDATE', @UsuarioEmail,
                  (SELECT VigenteHasta = @VigenteHastaCerrada FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
                  CONCAT('Cierre de vigencia por nueva valoración (proy=', @IDProyecto, ', ban=', @IDBan, ')'));
        DECLARE @NuevoID INT;
        INSERT INTO [app].banco_valoracion_lote
          (IDProyecto, IDBan, ValorM2Lote, Moneda, PorcentajeFinanciamiento, VigenteDesde, VigenteHasta, Notas)
        VALUES (@IDProyecto, @IDBan, @ValorM2Lote, @Moneda, @PorcentajeFinanciamiento, @VigenteDesde, NULL, @Notas);
        SET @NuevoID = SCOPE_IDENTITY();
        DECLARE @ValorJSON NVARCHAR(MAX) = (
          SELECT IDProyecto = @IDProyecto, IDBan = @IDBan, ValorM2Lote = @ValorM2Lote,
                 Moneda = @Moneda, PorcentajeFinanciamiento = @PorcentajeFinanciamiento,
                 VigenteDesde = @VigenteDesde, Notas = @Notas
          FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        INSERT INTO [app].audit_log (Tabla, IDRegistro, Accion, UsuarioEmail, ValorNuevoJSON, Contexto)
        VALUES ('app.banco_valoracion_lote', @NuevoID, 'INSERT', @UsuarioEmail, @ValorJSON,
                CONCAT('Nueva valoración (proy=', @IDProyecto, ', ban=', @IDBan, ')'));
        COMMIT TRANSACTION;
        SELECT @NuevoID AS IDValoracionCreada, @IDValoracionCerrada AS IDValoracionCerrada;
      END TRY
      BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION; THROW;
      END CATCH;
    `);
  const row = r.recordset[0];
  if (!row) throw new Error('No se devolvió resultado.');
  return { IDValoracionCreada: row.IDValoracionCreada, IDValoracionCerrada: row.IDValoracionCerrada ?? null };
}

export interface EditarVigenteInput {
  IDProyecto: number;
  IDBan: number;
  ValorM2Lote: number;
  Moneda?: string;
  PorcentajeFinanciamiento: number;
  Notas: string | null;
  UsuarioEmail: string;
}

// Porta [app].sp_editar_valoracion_vigente_banco inline.
export async function editarVigente(db: ConnectionPool, i: EditarVigenteInput): Promise<{ IDValoracionEditada: number }> {
  const r = await db.request()
    .input('IDProyecto', sql.Int, i.IDProyecto)
    .input('IDBan', sql.Int, i.IDBan)
    .input('ValorM2Lote', sql.Decimal(10, 2), i.ValorM2Lote)
    .input('Moneda', sql.Char(3), i.Moneda ?? 'USD')
    .input('PorcentajeFinanciamiento', sql.Decimal(5, 2), i.PorcentajeFinanciamiento)
    .input('Notas', sql.NVarChar(500), i.Notas ?? null)
    .input('UsuarioEmail', sql.NVarChar(200), i.UsuarioEmail)
    .query<{ IDValoracionEditada: number }>(`
      SET NOCOUNT ON; SET XACT_ABORT ON;
      IF NOT EXISTS (SELECT 1 FROM dbo.Proyecto WHERE IDProyecto = @IDProyecto)
        THROW 51700, 'IDProyecto inválido o no existe.', 1;
      IF NOT EXISTS (SELECT 1 FROM dbo.Bancos WHERE IDBan = @IDBan)
        THROW 51701, 'IDBan inválido o no existe.', 1;
      IF @ValorM2Lote <= 0 THROW 51702, 'ValorM2Lote debe ser mayor a 0.', 1;
      IF @PorcentajeFinanciamiento <= 0 OR @PorcentajeFinanciamiento > 100
        THROW 51703, 'PorcentajeFinanciamiento debe estar entre 0 y 100.', 1;
      DECLARE @IDValoracion INT = (
        SELECT TOP 1 IDValoracion FROM [app].banco_valoracion_lote
        WHERE IDProyecto = @IDProyecto AND IDBan = @IDBan AND VigenteHasta IS NULL
        ORDER BY VigenteDesde DESC);
      IF @IDValoracion IS NULL
        THROW 51704, 'No hay valoración vigente para ese proyecto/banco.', 1;
      BEGIN TRY
        BEGIN TRANSACTION;
        DECLARE @ValorAnteriorJSON NVARCHAR(MAX) = (
          SELECT IDProyecto, IDBan, ValorM2Lote, Moneda, PorcentajeFinanciamiento, Notas
          FROM [app].banco_valoracion_lote WHERE IDValoracion = @IDValoracion
          FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        UPDATE [app].banco_valoracion_lote
        SET ValorM2Lote = @ValorM2Lote, Moneda = @Moneda,
            PorcentajeFinanciamiento = @PorcentajeFinanciamiento, Notas = @Notas
        WHERE IDValoracion = @IDValoracion;
        DECLARE @ValorNuevoJSON NVARCHAR(MAX) = (
          SELECT IDProyecto = @IDProyecto, IDBan = @IDBan, ValorM2Lote = @ValorM2Lote,
                 Moneda = @Moneda, PorcentajeFinanciamiento = @PorcentajeFinanciamiento, Notas = @Notas
          FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        INSERT INTO [app].audit_log (Tabla, IDRegistro, Accion, UsuarioEmail, ValorAnteriorJSON, ValorNuevoJSON, Contexto)
        VALUES ('app.banco_valoracion_lote', @IDValoracion, 'UPDATE', @UsuarioEmail,
                @ValorAnteriorJSON, @ValorNuevoJSON,
                CONCAT('Edición in-place de valoración vigente (proy=', @IDProyecto, ', ban=', @IDBan, ')'));
        COMMIT TRANSACTION;
        SELECT @IDValoracion AS IDValoracionEditada;
      END TRY
      BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION; THROW;
      END CATCH;
    `);
  const row = r.recordset[0];
  if (!row) throw new Error('No se devolvió resultado.');
  return { IDValoracionEditada: row.IDValoracionEditada };
}

export function mapDbError(err: unknown): { status: number; error: string } {
  const message = err instanceof Error ? err.message : String(err);
  const isClient = /THROW|debe|inválido|obligatorio|no existe|no puede|no hay/i.test(message);
  return { status: isClient ? 400 : 500, error: message };
}
