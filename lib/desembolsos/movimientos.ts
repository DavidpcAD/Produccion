import type { ConnectionPool } from 'mssql';
import { sql } from '@/lib/db-adelantedb';

/**
 * Movimientos de Flujo de Desembolsos — portado (read-only) de las Azure
 * Functions `movimientos.ts` y `movimientosDbo.ts`. Lee pro_ventas.Movimientos vía la
 * vista [pro_app].vw_movimientos_caso, más los hitos vinculables del caso
 * (esquema del banco + huérfanos) y los links existentes en
 * [pro_app].movimiento_hito_link.
 *
 * NOTA: la CAPTURA/edición de movimientos y la (des)vinculación a hitos ocurren
 * mediante stored procedures ([pro_app].sp_vincular_a_hito_de_caso, etc.) que NO
 * están desplegados en AdelanteDB, por lo que aquí solo se portan las lecturas.
 */

// --------------------------------------------------------------------- Tipos

export type OrigenPago = 'BANCO' | 'CLIENTE' | string;

export interface MovimientoCaso {
  IDMovimiento: number;
  IDCaso: number | null;
  CodigoCaso: string | null;
  Cliente: string | null;
  IDLote: number | null;
  CodigoLote: string | null;
  IDBloque: number | null;
  NombreBloque: string | null;
  NombreModelo: string | null;
  IDProyecto: number | null;
  AbreviaturaProyecto: string | null;
  NombreProyecto: string | null;
  IDTipmov: number;
  AbreviaturaTipo: string;
  NombreTipo: string;
  CategoriaTipo: string;
  TgDesembolso: number | null;
  FechaSolicitud: string | null;
  FechaRealizado: string | null;
  Moneda: string | null;
  TipoCambio: number | null;
  MontoColones: number;
  MontoDolares: number | null;
  Depositante: string;
  Clasificacion: OrigenPago;
  DetalleTransferencia: string | null;
  Completado: number | null;
  TgSolicitado: number | null;
  MontoVinculado_CRC: number;
  MontoSinVincular_CRC: number;
  NumHitosVinculados: number;
  EstaVinculado: number;
  NumPagosClienteVinculados: number;
  EstaVinculadoAPagoCliente: number;
  IDBanco: number | null;
}

export interface LinkDeHito {
  IDLink: number;
  IDMovimiento: number;
  AbreviaturaTipo: string;
  FechaRealizado: string | null;
  MontoAplicado_CRC: number;
  Notas: string | null;
}

export interface HitoVinculable {
  IDCasoHito: number | null;
  IDCaso: number;
  IDHito: number;
  CodigoHito: string;
  NombreHito: string;
  ColorHito: string | null;
  OrdenEnEsquema: number;
  PorcentajeHito: number;
  MontoEsperado_CRC: number | null;
  NumPagos: number;
  TotalAplicado_CRC: number;
  EstaCubierto: number;
  UltimaFechaPago: string | null;
  EsHuerfano: number;
  Links: LinkDeHito[];
}

export interface RespuestaMovimientosCaso {
  IDCaso: number;
  movimientos: MovimientoCaso[];
  hitos: HitoVinculable[];
}

export interface TipoMovimiento {
  IDTmov: number;
  Abreviatura: string;
  TipoMovimiento: string;
  Categoria: string;
  Orden: number;
  TgDesembolso: number;
  TgSumaRestaMov: number;
}

export type EstadoVinculacion = 'TODOS' | 'VINCULADOS' | 'SIN_VINCULAR';

export interface FiltroMovimientos {
  idCaso?: number;
  idBanco?: number;
  idProyecto?: number;
  clasificacion?: string;
  categoria?: string;
  estadoVinculacion?: EstadoVinculacion;
  desde?: string;
  hasta?: string;
  q?: string;
}

// ------------------------------------------------------------------- Helpers

function toIso(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

function toBit(v: boolean | number | null | undefined): number {
  return v ? 1 : 0;
}

interface RawMovimientoCaso {
  IDMovimiento: number;
  IDCaso: number | null;
  CodigoCaso: string | null;
  Cliente: string | null;
  IDLote: number | null;
  CodigoLote: string | null;
  IDBloque: number | null;
  NombreBloque: string | null;
  NombreModelo: string | null;
  IDProyecto: number | null;
  AbreviaturaProyecto: string | null;
  NombreProyecto: string | null;
  IDTipmov: number;
  AbreviaturaTipo: string;
  NombreTipo: string;
  CategoriaTipo: string;
  TgDesembolso: boolean | null;
  FechaSolicitud: Date | null;
  FechaRealizado: Date | null;
  Moneda: string | null;
  TipoCambio: number | null;
  MontoColones: number;
  MontoDolares: number | null;
  Depositante: string;
  Clasificacion: OrigenPago;
  DetalleTransferencia: string | null;
  Completado: boolean | null;
  TgSolicitado: boolean | null;
  MontoVinculado_CRC: number;
  MontoSinVincular_CRC: number;
  NumHitosVinculados: number;
  EstaVinculado: boolean | number;
  NumPagosClienteVinculados: number;
  EstaVinculadoAPagoCliente: boolean | number;
  IDBanco?: number | null;
}

function mapMovimiento(r: RawMovimientoCaso): MovimientoCaso {
  return {
    IDMovimiento: r.IDMovimiento,
    IDCaso: r.IDCaso,
    CodigoCaso: r.CodigoCaso,
    Cliente: r.Cliente?.trim() ?? null,
    IDLote: r.IDLote,
    CodigoLote: r.CodigoLote?.trim() ?? null,
    IDBloque: r.IDBloque,
    NombreBloque: r.NombreBloque?.trim() ?? null,
    NombreModelo: r.NombreModelo?.trim() ?? null,
    IDProyecto: r.IDProyecto,
    AbreviaturaProyecto: r.AbreviaturaProyecto?.trim() ?? null,
    NombreProyecto: r.NombreProyecto?.trim() ?? null,
    IDTipmov: r.IDTipmov,
    AbreviaturaTipo: r.AbreviaturaTipo?.trim() ?? '',
    NombreTipo: r.NombreTipo?.trim() ?? '',
    CategoriaTipo: r.CategoriaTipo?.trim() ?? '',
    TgDesembolso: r.TgDesembolso == null ? null : toBit(r.TgDesembolso),
    FechaSolicitud: toIso(r.FechaSolicitud),
    FechaRealizado: toIso(r.FechaRealizado),
    Moneda: r.Moneda?.trim() || null,
    TipoCambio: r.TipoCambio != null ? Number(r.TipoCambio) : null,
    MontoColones: Number(r.MontoColones ?? 0),
    MontoDolares: r.MontoDolares != null ? Number(r.MontoDolares) : null,
    Depositante: r.Depositante ?? '',
    Clasificacion: r.Clasificacion,
    DetalleTransferencia: r.DetalleTransferencia,
    Completado: r.Completado == null ? null : toBit(r.Completado),
    TgSolicitado: r.TgSolicitado == null ? null : toBit(r.TgSolicitado),
    MontoVinculado_CRC: Number(r.MontoVinculado_CRC ?? 0),
    MontoSinVincular_CRC: Number(r.MontoSinVincular_CRC ?? 0),
    NumHitosVinculados: r.NumHitosVinculados ?? 0,
    EstaVinculado: toBit(r.EstaVinculado),
    NumPagosClienteVinculados: r.NumPagosClienteVinculados ?? 0,
    EstaVinculadoAPagoCliente: toBit(r.EstaVinculadoAPagoCliente),
    IDBanco: r.IDBanco ?? null,
  };
}

// -------------------------------------------------------- Lista global (Slice D)

/**
 * Lista global de movimientos con filtros. Puerto de `listarMovimientosGlobal`.
 * Devuelve hasta 500 movimientos. Expone IDBanco/IDProyecto como columnas extra
 * para filtrado client-side multi-select.
 */
export async function listarMovimientosGlobal(
  db: ConnectionPool,
  filtro: FiltroMovimientos,
): Promise<MovimientoCaso[]> {
  const request = db.request();
  const conds: string[] = ['vw.IDCaso IS NOT NULL'];

  if (filtro.idCaso) {
    conds.push('vw.IDCaso = @idCaso');
    request.input('idCaso', sql.Int, filtro.idCaso);
  }
  if (filtro.clasificacion) {
    conds.push('vw.Clasificacion = @clasif');
    request.input('clasif', sql.VarChar(20), filtro.clasificacion);
  }
  if (filtro.categoria) {
    conds.push('vw.CategoriaTipo = @cat');
    request.input('cat', sql.VarChar(20), filtro.categoria);
  }
  if (filtro.estadoVinculacion === 'VINCULADOS') conds.push('vw.EstaVinculado = 1');
  else if (filtro.estadoVinculacion === 'SIN_VINCULAR') conds.push('vw.EstaVinculado = 0');
  if (filtro.desde) {
    conds.push('vw.FechaRealizado >= @desde');
    request.input('desde', sql.Date, filtro.desde);
  }
  if (filtro.hasta) {
    conds.push('vw.FechaRealizado <= @hasta');
    request.input('hasta', sql.Date, filtro.hasta);
  }
  if (filtro.q) {
    conds.push(`(
      vw.CodigoCaso LIKE @q
      OR vw.Cliente LIKE @q
      OR vw.DetalleTransferencia LIKE @q
      OR vw.CodigoLote LIKE @q
      OR CAST(vw.IDCaso AS NVARCHAR(20)) LIKE @q
    )`);
    request.input('q', sql.NVarChar(200), `%${filtro.q}%`);
  }

  let joinBanco = '';
  if (filtro.idBanco) {
    joinBanco = 'INNER JOIN pro_ventas.Casos cs2 ON cs2.IDCaso = vw.IDCaso AND cs2.IDBanco = @idBanco';
    request.input('idBanco', sql.Int, filtro.idBanco);
  }
  let joinProyecto = '';
  if (filtro.idProyecto) {
    joinProyecto = 'INNER JOIN pro_ventas.Lotes lt2 ON lt2.IDLote = vw.IDLote AND lt2.IDProyecto = @idProyecto';
    request.input('idProyecto', sql.Int, filtro.idProyecto);
  }

  const whereClause = 'WHERE ' + conds.join(' AND ');
  const result = await request.query<RawMovimientoCaso>(`
    SELECT TOP 500
      vw.*,
      csB.IDBanco     AS IDBanco,
      ltB.IDProyecto  AS IDProyecto
    FROM [pro_app].vw_movimientos_caso vw
    LEFT JOIN pro_ventas.Casos csB ON csB.IDCaso = vw.IDCaso
    LEFT JOIN pro_ventas.Lotes ltB ON ltB.IDLote = vw.IDLote
    ${joinBanco}
    ${joinProyecto}
    ${whereClause}
    ORDER BY vw.FechaRealizado DESC, vw.IDMovimiento DESC;
  `);
  return result.recordset.map(mapMovimiento);
}

// ------------------------------------------------------------ Detalle por caso

interface RawHitoVinculable {
  IDCasoHito: number | null;
  IDCaso: number;
  IDHito: number;
  CodigoHito: string;
  NombreHito: string;
  ColorHito: string | null;
  OrdenEnEsquema: number;
  PorcentajeHito: number;
  MontoEsperado_CRC: number | null;
  NumPagos: number;
  TotalAplicado_CRC: number;
  EstaCubierto: boolean | number;
  UltimaFechaPago: Date | null;
  EsHuerfano: boolean | number;
}

interface RawLinkDeHito {
  IDLink: number;
  IDCasoHito: number;
  IDMovimiento: number;
  AbreviaturaTipo: string;
  FechaRealizado: Date | null;
  MontoAplicado_CRC: number;
  Notas: string | null;
}

/**
 * Movimientos + hitos vinculables (con sus links) de un caso. Puerto de
 * `listarMovimientosDelCaso`. Los hitos son la unión del esquema vigente del
 * banco del caso y los hitos huérfanos (proyección creada pero fuera del
 * esquema vigente).
 */
export async function listarMovimientosDelCaso(
  db: ConnectionPool,
  idCaso: number,
): Promise<RespuestaMovimientosCaso> {
  const movsRes = await db
    .request()
    .input('id', sql.Int, idCaso)
    .query<RawMovimientoCaso>(`
      SELECT * FROM [pro_app].vw_movimientos_caso
      WHERE IDCaso = @id
      ORDER BY FechaRealizado DESC, IDMovimiento DESC;
    `);
  const movimientos = movsRes.recordset.map(mapMovimiento);

  const hitosRes = await db
    .request()
    .input('id', sql.Int, idCaso)
    .query<RawHitoVinculable>(`
      WITH HitosVigentes AS (
        SELECT cs.IDCaso, e.IDHito, e.OrdenEnEsquema, e.PorcentajeDesembolso, e.EsMontoFijo,
               CAST(0 AS BIT) AS EsHuerfano
        FROM pro_ventas.Casos cs
        INNER JOIN [pro_app].banco_esquema_desembolso e ON e.IDBan = cs.IDBanco AND e.VigenteHasta IS NULL
        WHERE cs.IDCaso = @id
      ),
      HitosHuerfanos AS (
        SELECT chp.IDCaso, chp.IDHito, 999 AS OrdenEnEsquema,
               CAST(0 AS DECIMAL(5,2)) AS PorcentajeDesembolso,
               CAST(0 AS BIT) AS EsMontoFijo, CAST(1 AS BIT) AS EsHuerfano
        FROM [pro_app].caso_hito_proyeccion chp
        WHERE chp.IDCaso = @id
          AND NOT EXISTS (SELECT 1 FROM HitosVigentes v WHERE v.IDCaso = chp.IDCaso AND v.IDHito = chp.IDHito)
      ),
      TodosLosHitos AS (
        SELECT * FROM HitosVigentes UNION ALL SELECT * FROM HitosHuerfanos
      )
      SELECT
        chp.IDCasoHito, th.IDCaso, th.IDHito,
        h.Codigo   AS CodigoHito,
        h.Nombre   AS NombreHito,
        h.ColorHEX AS ColorHito,
        th.OrdenEnEsquema, th.PorcentajeDesembolso AS PorcentajeHito,
        CAST(
          CASE
            WHEN th.EsHuerfano = 1 THEN ISNULL(hp.TotalAplicado_CRC, 0)
            WHEN th.EsMontoFijo = 1 THEN ISNULL(clb.MontoLoteFinanciado_CRC, 0)
            ELSE (COALESCE(clb.MontoFinanciaBanco_CRC, clb.PrecioVentaActual_CRC, cs.PrecioVenta)
                  - ISNULL(clb.MontoLoteFinanciado_CRC, 0)) * th.PorcentajeDesembolso / 100.0
          END
        AS MONEY) AS MontoEsperado_CRC,
        ISNULL(hp.NumPagos, 0)          AS NumPagos,
        ISNULL(hp.TotalAplicado_CRC, 0) AS TotalAplicado_CRC,
        CASE WHEN ISNULL(hp.NumPagos, 0) > 0 THEN 1 ELSE 0 END AS EstaCubierto,
        hp.UltimaFechaPago, th.EsHuerfano
      FROM TodosLosHitos th
      INNER JOIN pro_ventas.Casos cs ON cs.IDCaso = th.IDCaso
      INNER JOIN [pro_app].catalogo_hito h ON h.IDHito = th.IDHito
      LEFT JOIN [pro_app].caso_hito_proyeccion chp ON chp.IDCaso = th.IDCaso AND chp.IDHito = th.IDHito
      LEFT JOIN [pro_app].vw_hitos_con_pagos hp ON hp.IDCasoHito = chp.IDCasoHito
      LEFT JOIN [pro_app].caso_lote_banco clb ON clb.IDCaso = th.IDCaso
      ORDER BY th.OrdenEnEsquema, h.Codigo;
    `);

  const linksRes = await db
    .request()
    .input('id', sql.Int, idCaso)
    .query<RawLinkDeHito>(`
      SELECT lk.IDLink, lk.IDCasoHito, lk.IDMovimiento,
             tm.Abreviatura    AS AbreviaturaTipo,
             m.FechaMovimiento AS FechaRealizado,
             lk.MontoAplicado_CRC, lk.Notas
      FROM [pro_app].movimiento_hito_link lk
      INNER JOIN pro_ventas.Movimientos m ON m.IDMovimiento = lk.IDMovimiento
      INNER JOIN pro_ventas.TipMovi tm    ON tm.IDTmov = m.IDTipmov
      INNER JOIN [pro_app].caso_hito_proyeccion chp ON chp.IDCasoHito = lk.IDCasoHito
      WHERE chp.IDCaso = @id;
    `);

  const linksByHito = new Map<number, RawLinkDeHito[]>();
  for (const lk of linksRes.recordset) {
    const arr = linksByHito.get(lk.IDCasoHito) ?? [];
    arr.push(lk);
    linksByHito.set(lk.IDCasoHito, arr);
  }

  const hitos: HitoVinculable[] = hitosRes.recordset.map((r) => ({
    IDCasoHito: r.IDCasoHito,
    IDCaso: r.IDCaso,
    IDHito: r.IDHito,
    CodigoHito: r.CodigoHito?.trim() ?? '',
    NombreHito: r.NombreHito?.trim() ?? '',
    ColorHito: r.ColorHito?.trim() ?? null,
    OrdenEnEsquema: Number(r.OrdenEnEsquema ?? 0),
    PorcentajeHito: Number(r.PorcentajeHito ?? 0),
    MontoEsperado_CRC: r.MontoEsperado_CRC != null ? Number(r.MontoEsperado_CRC) : null,
    NumPagos: Number(r.NumPagos ?? 0),
    TotalAplicado_CRC: Number(r.TotalAplicado_CRC ?? 0),
    EstaCubierto: toBit(r.EstaCubierto),
    UltimaFechaPago: toIso(r.UltimaFechaPago),
    EsHuerfano: toBit(r.EsHuerfano),
    Links: (r.IDCasoHito != null ? linksByHito.get(r.IDCasoHito) ?? [] : []).map((lk) => ({
      IDLink: lk.IDLink,
      IDMovimiento: lk.IDMovimiento,
      AbreviaturaTipo: lk.AbreviaturaTipo?.trim() ?? '',
      FechaRealizado: toIso(lk.FechaRealizado),
      MontoAplicado_CRC: Number(lk.MontoAplicado_CRC ?? 0),
      Notas: lk.Notas,
    })),
  }));

  return { IDCaso: idCaso, movimientos, hitos };
}

// --------------------------------------------------------- Tipos de movimiento

/** Catálogo de tipos de movimiento (pro_ventas.TipMovi vía vw_tipos_movimiento). */
export async function listarTiposMovimiento(db: ConnectionPool): Promise<TipoMovimiento[]> {
  const r = await db.request().query<{
    IDTmov: number;
    Abreviatura: string;
    TipoMovimiento: string;
    Categoria: string;
    Orden: number;
    TgDesembolso: boolean | null;
    TgSumaRestaMov: boolean | null;
  }>(`
    SELECT IDTmov, Abreviatura, TipoMovimiento, Categoria, Orden, TgDesembolso, TgSumaRestaMov
    FROM [pro_app].vw_tipos_movimiento
    ORDER BY Orden, Abreviatura;
  `);
  return r.recordset.map((t) => ({
    IDTmov: Number(t.IDTmov),
    Abreviatura: t.Abreviatura?.trim() ?? '',
    TipoMovimiento: t.TipoMovimiento?.trim() ?? '',
    Categoria: t.Categoria?.trim() ?? '',
    Orden: Number(t.Orden ?? 0),
    TgDesembolso: toBit(t.TgDesembolso),
    TgSumaRestaMov: toBit(t.TgSumaRestaMov),
  }));
}
