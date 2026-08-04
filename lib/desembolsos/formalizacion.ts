import type { ConnectionPool } from 'mssql';
import { sql } from '@/lib/db-adelantedb';

// =============================================================================
// Formalización — proyección de fecha de firma para casos reservados.
// Portado de adelante-flujo-desembolsos (api/src/functions/formalizacion.ts +
// sql/migrations 2026-05-03_fase3_*). Los stored procedures del repo origen no
// existen en AdelanteDB, así que su lógica se porta inline como batch T-SQL
// parametrizado (mismo comportamiento: versionado + audit_log).
// =============================================================================

export type NivelConfianza = 'A' | 'M' | 'B';

export interface CasoParaFormalizar {
  IDCaso: number;
  CodigoCaso: string | null;
  Cliente: string;
  IDLote: number;
  CodigoLote: string;
  AreaLote_m2: number | null;
  IDBloque: number | null;
  NombreBloque: string | null;
  IDModelo: number | null;
  NombreModelo: string | null;
  IDBan: number | null;
  AbrevBanco: string | null;
  NombreBanco: string | null;
  ColorBanco: string | null;
  IDProyecto: number;
  AbreviaturaProyecto: string;
  NombreProyecto: string;
  ColorProyecto: string | null;
  PrecioVenta: number | null;
  FechaReserva: string | null;
  IDProyeccion: number | null;
  FechaProyectada: string | null;
  NivelConfianza: NivelConfianza | null;
  Notas: string | null;
  ProyeccionCreadaEn: string | null;
  ProyeccionModificadaEn: string | null;
  NumVersiones: number;
}

export interface ProyeccionFormalizacionHistorica {
  IDProyeccion: number;
  IDCaso: number;
  FechaProyectada: string;
  NivelConfianza: NivelConfianza;
  Notas: string | null;
  Activa: boolean;
  FechaCreacion: string;
  FechaModificacion: string | null;
}

function toIsoDate(v: Date | string | null): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}
function toIso(v: Date | string | null): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

interface RawCaso {
  IDCaso: number; CodigoCaso: string | null; Cliente: string; IDLote: number;
  CodigoLote: string; AreaLote_m2: number | null; IDBloque: number | null;
  NombreBloque: string | null; IDModelo: number | null; NombreModelo: string | null;
  IDBan: number | null; AbrevBanco: string | null; NombreBanco: string | null;
  ColorBanco: string | null; IDProyecto: number; AbreviaturaProyecto: string;
  NombreProyecto: string; ColorProyecto: string | null; PrecioVenta: number | null;
  FechaReserva: Date | null; IDProyeccion: number | null; FechaProyectada: Date | null;
  NivelConfianza: NivelConfianza | null; Notas: string | null;
  ProyeccionCreadaEn: Date | null; ProyeccionModificadaEn: Date | null; NumVersiones: number;
}

export async function listarCasos(db: ConnectionPool): Promise<CasoParaFormalizar[]> {
  const r = await db.request().query<RawCaso>(`
    SELECT *
    FROM [pro_app].vw_casos_para_formalizar
    ORDER BY
      CASE WHEN FechaProyectada IS NULL THEN 1 ELSE 0 END,
      FechaProyectada,
      FechaReserva DESC;
  `);
  return r.recordset.map((c) => ({
    IDCaso: c.IDCaso,
    CodigoCaso: c.CodigoCaso,
    Cliente: c.Cliente?.trim() ?? '',
    IDLote: c.IDLote,
    CodigoLote: c.CodigoLote?.trim() ?? '',
    AreaLote_m2: c.AreaLote_m2 != null ? Number(c.AreaLote_m2) : null,
    IDBloque: c.IDBloque,
    NombreBloque: c.NombreBloque,
    IDModelo: c.IDModelo,
    NombreModelo: c.NombreModelo,
    IDBan: c.IDBan,
    AbrevBanco: c.AbrevBanco?.trim() ?? null,
    NombreBanco: c.NombreBanco,
    ColorBanco: c.ColorBanco,
    IDProyecto: c.IDProyecto,
    AbreviaturaProyecto: c.AbreviaturaProyecto,
    NombreProyecto: c.NombreProyecto,
    ColorProyecto: c.ColorProyecto,
    PrecioVenta: c.PrecioVenta != null ? Number(c.PrecioVenta) : null,
    FechaReserva: toIso(c.FechaReserva),
    IDProyeccion: c.IDProyeccion,
    FechaProyectada: toIsoDate(c.FechaProyectada),
    NivelConfianza: c.NivelConfianza,
    Notas: c.Notas,
    ProyeccionCreadaEn: toIso(c.ProyeccionCreadaEn),
    ProyeccionModificadaEn: toIso(c.ProyeccionModificadaEn),
    NumVersiones: Number(c.NumVersiones ?? 0),
  }));
}

export async function listarHistorico(db: ConnectionPool, idCaso: number): Promise<ProyeccionFormalizacionHistorica[]> {
  const r = await db.request().input('id', sql.Int, idCaso).query<{
    IDProyeccion: number; IDCaso: number; FechaProyectada: Date; NivelConfianza: NivelConfianza;
    Notas: string | null; Activa: boolean; FechaCreacion: Date; FechaModificacion: Date | null;
  }>(`
    SELECT IDProyeccion, IDCaso, FechaProyectada, NivelConfianza, Notas,
           Activa, FechaCreacion, FechaModificacion
    FROM [pro_app].proyeccion_formalizacion
    WHERE IDCaso = @id
    ORDER BY FechaCreacion DESC;
  `);
  return r.recordset.map((x) => ({
    IDProyeccion: x.IDProyeccion,
    IDCaso: x.IDCaso,
    FechaProyectada: toIsoDate(x.FechaProyectada) ?? '',
    NivelConfianza: x.NivelConfianza,
    Notas: x.Notas,
    Activa: Boolean(x.Activa),
    FechaCreacion: toIso(x.FechaCreacion) ?? '',
    FechaModificacion: toIso(x.FechaModificacion),
  }));
}

export interface UpsertProyeccionInput {
  IDCaso: number;
  FechaProyectada: string;
  NivelConfianza: NivelConfianza;
  Notas: string | null;
  UsuarioEmail: string;
}

// Valida el body del upsert. Devuelve mensaje de error o null.
export function validarProyeccion(b: Partial<UpsertProyeccionInput>): string | null {
  if (!b.IDCaso || !Number.isInteger(b.IDCaso)) return 'IDCaso es obligatorio.';
  if (!b.FechaProyectada || !/^\d{4}-\d{2}-\d{2}$/.test(b.FechaProyectada))
    return 'FechaProyectada debe ser fecha ISO YYYY-MM-DD.';
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const f = new Date(b.FechaProyectada + 'T00:00:00');
  if (f < hoy) return 'FechaProyectada no puede ser anterior a hoy.';
  if (!b.NivelConfianza || !['A', 'M', 'B'].includes(b.NivelConfianza))
    return 'NivelConfianza debe ser A, M o B.';
  return null;
}

// Porta [pro_app].sp_actualizar_proyeccion_formalizacion inline.
export async function upsertProyeccion(db: ConnectionPool, i: UpsertProyeccionInput): Promise<{ IDProyeccionCreada: number; VersionesCerradas: number }> {
  const r = await db.request()
    .input('IDCaso', sql.Int, i.IDCaso)
    .input('FechaProyectada', sql.Date, i.FechaProyectada)
    .input('NivelConfianza', sql.Char(1), i.NivelConfianza)
    .input('Notas', sql.NVarChar(1000), i.Notas ?? null)
    .input('UsuarioEmail', sql.NVarChar(200), i.UsuarioEmail)
    .query<{ IDProyeccionCreada: number; VersionesCerradas: number }>(`
      SET NOCOUNT ON; SET XACT_ABORT ON;
      IF NOT EXISTS (SELECT 1 FROM pro_ventas.Casos WHERE IDCaso = @IDCaso AND IDEstado = 4)
        THROW 51900, 'IDCaso inválido o no está en estado Reservado.', 1;
      IF @FechaProyectada < CAST(GETDATE() AS DATE)
        THROW 51902, 'FechaProyectada no puede ser anterior a hoy.', 1;
      BEGIN TRY
        BEGIN TRANSACTION;
        DECLARE @ValorAnteriorJSON NVARCHAR(MAX) = (
          SELECT IDProyeccion, FechaProyectada, NivelConfianza, Notas
          FROM [pro_app].proyeccion_formalizacion WHERE IDCaso = @IDCaso AND Activa = 1
          FOR JSON PATH);
        DECLARE @CantCerradas INT;
        UPDATE [pro_app].proyeccion_formalizacion
        SET Activa = 0, FechaModificacion = SYSUTCDATETIME()
        WHERE IDCaso = @IDCaso AND Activa = 1;
        SET @CantCerradas = @@ROWCOUNT;
        INSERT INTO [pro_app].proyeccion_formalizacion (IDCaso, FechaProyectada, NivelConfianza, Notas, Activa)
        VALUES (@IDCaso, @FechaProyectada, @NivelConfianza, @Notas, 1);
        DECLARE @NuevoID INT = SCOPE_IDENTITY();
        DECLARE @ValorNuevoJSON NVARCHAR(MAX) = (
          SELECT IDCaso = @IDCaso, FechaProyectada = @FechaProyectada,
                 NivelConfianza = @NivelConfianza, Notas = @Notas
          FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        INSERT INTO [pro_app].audit_log (Tabla, IDRegistro, Accion, UsuarioEmail, ValorAnteriorJSON, ValorNuevoJSON, Contexto)
        VALUES ('pro_app.proyeccion_formalizacion', @NuevoID,
                CASE WHEN @CantCerradas > 0 THEN 'UPDATE' ELSE 'INSERT' END,
                @UsuarioEmail, @ValorAnteriorJSON, @ValorNuevoJSON,
                CONCAT('Proyección de formalización del caso ', @IDCaso, ' (', @CantCerradas, ' versión(es) anterior(es) marcadas inactivas)'));
        COMMIT TRANSACTION;
        SELECT @NuevoID AS IDProyeccionCreada, @CantCerradas AS VersionesCerradas;
      END TRY
      BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION; THROW;
      END CATCH;
    `);
  const row = r.recordset[0];
  if (!row) throw new Error('No se devolvió resultado del upsert.');
  return { IDProyeccionCreada: row.IDProyeccionCreada, VersionesCerradas: row.VersionesCerradas };
}

// Porta [pro_app].sp_desactivar_proyeccion_formalizacion inline.
export async function desactivarProyeccion(db: ConnectionPool, idCaso: number, usuarioEmail: string): Promise<{ VersionesCerradas: number }> {
  const r = await db.request()
    .input('IDCaso', sql.Int, idCaso)
    .input('UsuarioEmail', sql.NVarChar(200), usuarioEmail)
    .query<{ VersionesCerradas: number }>(`
      SET NOCOUNT ON; SET XACT_ABORT ON;
      IF NOT EXISTS (SELECT 1 FROM pro_ventas.Casos WHERE IDCaso = @IDCaso)
        THROW 51910, 'IDCaso no existe.', 1;
      BEGIN TRY
        BEGIN TRANSACTION;
        DECLARE @ValorAnteriorJSON NVARCHAR(MAX) = (
          SELECT IDProyeccion, FechaProyectada, NivelConfianza, Notas
          FROM [pro_app].proyeccion_formalizacion WHERE IDCaso = @IDCaso AND Activa = 1
          FOR JSON PATH);
        DECLARE @CantCerradas INT;
        UPDATE [pro_app].proyeccion_formalizacion
        SET Activa = 0, FechaModificacion = SYSUTCDATETIME()
        WHERE IDCaso = @IDCaso AND Activa = 1;
        SET @CantCerradas = @@ROWCOUNT;
        IF @CantCerradas > 0
          INSERT INTO [pro_app].audit_log (Tabla, IDRegistro, Accion, UsuarioEmail, ValorAnteriorJSON, Contexto)
          VALUES ('pro_app.proyeccion_formalizacion', @IDCaso, 'DELETE', @UsuarioEmail, @ValorAnteriorJSON,
                  CONCAT('Devuelto a sin proyectar — ', @CantCerradas, ' versión(es) marcada(s) inactiva(s).'));
        COMMIT TRANSACTION;
        SELECT @CantCerradas AS VersionesCerradas;
      END TRY
      BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION; THROW;
      END CATCH;
    `);
  return { VersionesCerradas: r.recordset[0]?.VersionesCerradas ?? 0 };
}

// Mapea un error de DB/validación a { status, error } estilo repo origen.
export function mapDbError(err: unknown): { status: number; error: string } {
  const message = err instanceof Error ? err.message : String(err);
  const isClient = /THROW|debe|inválido|obligatorio|no existe|no puede/i.test(message);
  return { status: isClient ? 400 : 500, error: message };
}
