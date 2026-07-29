import type { ConnectionPool } from 'mssql';
import { sql } from '@/lib/db-adelantedb';

/**
 * Casos (cartera operativa). Portado FIEL de la Azure Function `casos.ts`.
 *   - listarCasos: cartera activa (vw_casos_activos).
 *   - buscarCasos: búsqueda libre por texto (cualquier estado) para captura.
 *   - migrarEsquemaVigente: sincroniza los hitos del caso con el esquema
 *     vigente del banco (sp_migrar_caso_a_esquema_vigente).
 *
 * Tablas/vistas: [app].vw_casos_activos, dbo.Casos, dbo.Clientes, dbo.Lotes,
 * dbo.Proyecto, dbo.Bancos.
 */

// --------------------------------------------------------------------- Tipos

export const ESTADOS_CASO = { Entregado: 1, Formalizado: 2, Reservado: 4 } as const;
export type EstadoCaso = (typeof ESTADOS_CASO)[keyof typeof ESTADOS_CASO];

export interface CasoActivo {
  IdCaso: number;
  Codigo: string;
  Cliente: string;
  Estado: EstadoCaso;
  EstadoNombre: string;
  Proyecto: string;
  ProyectoAbrev: string | null;
  Bloque: string | null;
  Lote: string;
  Modelo: string;
  Banco: string;
  BancoAbrev: string;
  ColorBanco: string | null;
  PrecioVenta: number;
  FechaFormalizacion: string | null;
  FechaReserva: string | null;
}

export interface RespuestaCasos {
  total: number;
  casos: CasoActivo[];
}

/** Resultado de una búsqueda libre de casos (forma compatible con DashboardCaso). */
export interface CasoBusqueda {
  IDCaso: number;
  CodigoCaso: string | null;
  Cliente: string;
  IDLote: number;
  CodigoLote: string;
  AreaLote_m2: number | null;
  IDBan: number;
  AbrevBanco: string;
  NombreBanco: string;
  IDProyecto: number;
  AbreviaturaProyecto: string;
  NombreProyecto: string;
  IDEstado: number;
  EsReservado: number;
  PrecioVenta_CRC: number | null;
  TipoCambio: number | null;
}

export interface MigrarEsquemaResponse {
  HitosAgregados: number;
  HitosEliminados: number;
  HitosHuerfanosConservados: number;
  HitosActualizados: number;
}

// --------------------------------------------------------------------- Helpers

function toIsoDate(value: Date | string | null): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value;
}

interface FilaCaso {
  IDCaso: number;
  CodigoCaso: string;
  Cliente: string;
  IDEstado: number;
  NombreEstado: string;
  NombreProyecto: string | null;
  AbrevProyecto: string | null;
  NombreBloque: string | null;
  CodigoLote: string;
  NombreModelo: string | null;
  NombreBanco: string | null;
  AbrevBanco: string | null;
  ColorBanco: string | null;
  PrecioVenta: number | null;
  FechaFormalizacion: Date | string | null;
  FechaReserva: Date | string | null;
}

// --------------------------------------------------------------------- Queries

/** GET /api/casos — cartera operativa completa. */
export async function listarCasos(db: ConnectionPool): Promise<RespuestaCasos> {
  const result = await db.request().query<FilaCaso>(`
    SELECT
      IDCaso, CodigoCaso, Cliente, IDEstado, NombreEstado,
      NombreProyecto, AbrevProyecto, NombreBloque, CodigoLote,
      NombreModelo, NombreBanco, AbrevBanco, ColorBanco,
      PrecioVenta, FechaFormalizacion, FechaReserva
    FROM [app].vw_casos_activos
    ORDER BY IDEstado, FechaFormalizacion DESC, FechaReserva DESC
  `);

  const casos: CasoActivo[] = result.recordset.map((row) => ({
    IdCaso: row.IDCaso,
    Codigo: row.CodigoCaso,
    Cliente: row.Cliente,
    Estado: row.IDEstado as EstadoCaso,
    EstadoNombre: row.NombreEstado,
    Proyecto: row.NombreProyecto ?? '—',
    ProyectoAbrev: row.AbrevProyecto,
    Bloque: row.NombreBloque,
    Lote: row.CodigoLote,
    Modelo: row.NombreModelo ?? '—',
    Banco: row.NombreBanco ?? '—',
    BancoAbrev: row.AbrevBanco ?? '—',
    ColorBanco: row.ColorBanco,
    PrecioVenta: row.PrecioVenta ?? 0,
    FechaFormalizacion: toIsoDate(row.FechaFormalizacion),
    FechaReserva: toIsoDate(row.FechaReserva),
  }));

  return { total: casos.length, casos };
}

/**
 * GET /api/casos/buscar?q=&soloVigentes= — búsqueda libre (>=2 chars). Devuelve
 * hasta 30 resultados. soloVigentes restringe a estados 1/2/4.
 */
export async function buscarCasos(
  db: ConnectionPool,
  q: string,
  soloVigentes: boolean,
): Promise<CasoBusqueda[]> {
  const result = await db
    .request()
    .input('q', sql.NVarChar(200), `%${q}%`)
    .query<{
      IDCaso: number;
      CodigoCaso: string | null;
      Cliente: string;
      IDLote: number;
      CodigoLote: string;
      IDBan: number;
      AbrevBanco: string;
      NombreBanco: string;
      IDProyecto: number;
      AbreviaturaProyecto: string;
      NombreProyecto: string;
      IDEstado: number;
      Area: number | null;
      PrecioVenta: number | null;
      TipoCambio: number | null;
    }>(`
      SELECT TOP 30
        cs.IDCaso,
        cs.DetCaso              AS CodigoCaso,
        LTRIM(RTRIM(cl.NombreCompleto))   AS Cliente,
        cs.IDLote,
        LTRIM(RTRIM(l.Lote))    AS CodigoLote,
        cs.IDBanco              AS IDBan,
        LTRIM(RTRIM(b.Abreviatura))       AS AbrevBanco,
        LTRIM(RTRIM(b.NombreEntidad))     AS NombreBanco,
        l.IDProyecto,
        LTRIM(RTRIM(p.AbreviaturaProyecto)) AS AbreviaturaProyecto,
        LTRIM(RTRIM(p.Nombre))            AS NombreProyecto,
        cs.IDEstado,
        l.Area,
        cs.PrecioVenta,
        cs.TipoCambio
      FROM dbo.Casos cs
      LEFT JOIN dbo.Clientes cl ON cl.IDCliente = cs.IDCliente
      LEFT JOIN dbo.Lotes l ON l.IDLote = cs.IDLote
      LEFT JOIN dbo.Proyecto p ON p.IDProyecto = l.IDProyecto
      LEFT JOIN dbo.Bancos b ON b.IDBan = cs.IDBanco
      WHERE (cs.DetCaso LIKE @q
         OR cl.NombreCompleto LIKE @q
         OR l.Lote LIKE @q
         OR CAST(cs.IDCaso AS NVARCHAR) = LTRIM(RTRIM(REPLACE(@q, '%', ''))))
         ${soloVigentes ? 'AND cs.IDEstado IN (1, 2, 4)' : ''}
      ORDER BY cs.IDCaso DESC;
    `);

  return result.recordset.map((r) => ({
    IDCaso: r.IDCaso,
    CodigoCaso: r.CodigoCaso ?? null,
    Cliente: r.Cliente ?? '',
    IDLote: r.IDLote,
    CodigoLote: r.CodigoLote ?? '',
    AreaLote_m2: r.Area != null ? Number(r.Area) : null,
    IDBan: r.IDBan,
    AbrevBanco: r.AbrevBanco ?? '',
    NombreBanco: r.NombreBanco ?? '',
    IDProyecto: r.IDProyecto,
    AbreviaturaProyecto: r.AbreviaturaProyecto ?? '',
    NombreProyecto: r.NombreProyecto ?? '',
    IDEstado: r.IDEstado,
    EsReservado: r.IDEstado === 4 ? 1 : 0,
    PrecioVenta_CRC: r.PrecioVenta != null ? Number(r.PrecioVenta) : null,
    TipoCambio: r.TipoCambio != null ? Number(r.TipoCambio) : null,
  }));
}

/**
 * POST /api/casos/:idCaso/migrar-esquema-vigente — sincroniza el caso con el
 * esquema vigente del banco. Idempotente. Errores del SP (53100/53101) llegan
 * como mensaje legible.
 */
export async function migrarEsquemaVigente(
  db: ConnectionPool,
  idCaso: number,
  usuarioEmail: string,
): Promise<MigrarEsquemaResponse> {
  const result = await db
    .request()
    .input('IDCaso', sql.Int, idCaso)
    .input('UsuarioEmail', sql.NVarChar(200), usuarioEmail)
    .execute<MigrarEsquemaResponse>('[app].sp_migrar_caso_a_esquema_vigente');
  const row = result.recordset[0];
  if (!row) throw new Error('SP no devolvió fila');
  return row;
}
