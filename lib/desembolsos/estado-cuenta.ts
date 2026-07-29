import type { ConnectionPool } from 'mssql';
import { sql } from '@/lib/db-adelantedb';

/**
 * Estado de cuenta del cliente — portado (read-only) de la Azure Function
 * `estadoCuenta.ts`. Vista LIMPIA: precio venta + extras/descuentos aprobados,
 * pagos del banco (movs vinculados a hitos) y pagos del cliente (pago_cliente).
 * NO desagrega QFI/AD/GM. Devuelve la estructura JSON; la generación de Excel/PDF
 * del original (exceljs/pdfkit) no se porta porque esas dependencias no están en
 * este proyecto — el front puede exportar client-side si hace falta.
 *
 * Tablas/vistas: [app].vw_dashboard_caso, [app].vw_caso_extras,
 * [app].vw_pagos_cliente_caso, [app].movimiento_hito_link,
 * [app].caso_hito_proyeccion, [app].catalogo_hito, dbo.Movimientos, dbo.TipMovi.
 */

// --------------------------------------------------------------------- Tipos

export interface EstadoCuentaData {
  cabecera: {
    IDCaso: number;
    CodigoCaso: string | null;
    Cliente: string;
    AbreviaturaProyecto: string | null;
    NombreProyecto: string | null;
    NombreBloque: string | null;
    CodigoLote: string;
    NombreModelo: string | null;
    AreaLote_m2: number | null;
    IDBan: number | null;
    AbrevBanco: string | null;
    NombreBanco: string | null;
    IDEstado: number;
    FechaReserva: string | null;
    FechaFormalizacion: string | null;
  };
  extras: Array<{
    IDExtra: number;
    Tipo: string;
    Descripcion: string;
    MontoAjuste_CRC: number;
    FechaCotizacion: string | null;
    FechaAprobacion: string | null;
  }>;
  pagos: Array<{
    IDPago: number;
    Concepto: string;
    MontoPlaneado_CRC: number;
    FechaPlaneada: string | null;
    FechaReal: string | null;
    Notas: string | null;
    Estado: string;
    MontoAplicado_CRC: number;
    NumLinks: number;
  }>;
  pagosBanco: Array<{
    IDLink: number;
    IDMovimiento: number;
    IDHito: number;
    CodigoHito: string;
    NombreHito: string;
    FechaMovimiento: string | null;
    MontoAplicado_CRC: number;
    AbreviaturaTipo: string | null;
    Depositante: string | null;
  }>;
  totales: {
    PrecioVentaContractual_CRC: number;
    TotalExtras_CRC: number;
    TotalDescuentos_CRC: number;
    PrecioVentaActual_CRC: number;
    MontoFinanciaBanco_CRC: number;
    MontoCliente_CRC: number;
    TotalPlaneadoCliente_CRC: number;
    TotalPagadoCliente_CRC: number;
    TotalPagadoBanco_CRC: number;
    TotalCubierto_CRC: number;
    SaldoTotalCaso_CRC: number;
    SaldoPendienteCliente_CRC: number;
  };
  generadoEn: string;
}

// ------------------------------------------------------------------- Crudos

interface RawCabecera {
  IDCaso: number;
  CodigoCaso: string | null;
  Cliente: string;
  AbreviaturaProyecto: string | null;
  NombreProyecto: string | null;
  NombreBloque: string | null;
  CodigoLote: string;
  NombreModelo: string | null;
  AreaLote_m2: number | null;
  IDBan: number | null;
  AbrevBanco: string | null;
  NombreBanco: string | null;
  IDEstado: number;
  FechaReserva: Date | string | null;
  FechaFormalizacion: Date | string | null;
  PrecioVentaContractual_CRC: number;
  PrecioVentaActual_CRC: number;
  TotalExtras_CRC: number;
  TotalDescuentos_CRC: number;
  MontoFinanciaBanco_CRC: number | null;
  PagoCliente_CRC: number;
}

interface RawExtra {
  IDExtra: number;
  Tipo: string;
  Descripcion: string;
  MontoAjuste_CRC: number;
  FechaCotizacion: Date | string;
  FechaAprobacion: Date | string | null;
  Estado: string;
}

interface RawPago {
  IDPago: number;
  Concepto: string;
  MontoPlaneado_CRC: number;
  FechaPlaneada: Date | string;
  FechaReal: Date | string | null;
  Notas: string | null;
  Estado: string;
  MontoAplicado_CRC: number;
  NumLinks: number;
}

interface RawPagoBanco {
  IDLink: number;
  IDMovimiento: number;
  IDHito: number;
  CodigoHito: string;
  NombreHito: string;
  FechaMovimiento: Date | string | null;
  MontoAplicado_CRC: number;
  AbreviaturaTipo: string | null;
  Depositante: string | null;
}

function isoDate(v: Date | string | null): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

// ---------------------------------------------------------------- Consulta

/** Estado de cuenta del cliente para un caso, o null si el caso no existe. */
export async function obtenerEstadoCuenta(
  db: ConnectionPool,
  idCaso: number,
): Promise<EstadoCuentaData | null> {
  const cab = await db
    .request()
    .input('id', sql.Int, idCaso)
    .query<RawCabecera>(`
      SELECT
        d.IDCaso, d.CodigoCaso, d.Cliente,
        d.AbreviaturaProyecto, d.NombreProyecto, d.NombreBloque,
        d.CodigoLote, d.NombreModelo, d.AreaLote_m2,
        d.IDBan, d.AbrevBanco, d.NombreBanco, d.IDEstado,
        CAST(d.FechaReserva AS DATE)        AS FechaReserva,
        CAST(d.FechaFormalizacion AS DATE)  AS FechaFormalizacion,
        d.PrecioVentaContractual_CRC,
        d.PrecioVenta_CRC                   AS PrecioVentaActual_CRC,
        d.TotalExtras_CRC, d.TotalDescuentos_CRC,
        d.MontoFinanciaBancoCapturado_CRC   AS MontoFinanciaBanco_CRC,
        d.PagoCliente_CRC
      FROM [app].vw_dashboard_caso d
      WHERE d.IDCaso = @id;
    `);
  const [r] = cab.recordset;
  if (!r) return null;

  const extras = await db
    .request()
    .input('id', sql.Int, idCaso)
    .query<RawExtra>(`
      SELECT IDExtra, Tipo, Descripcion, MontoAjuste_CRC,
             CAST(FechaCotizacion AS DATE) AS FechaCotizacion,
             CAST(FechaAprobacion AS DATE) AS FechaAprobacion,
             Estado
      FROM [app].vw_caso_extras
      WHERE IDCaso = @id AND Estado = 'APROBADA'
      ORDER BY FechaAprobacion, IDExtra;
    `);

  const pagos = await db
    .request()
    .input('id', sql.Int, idCaso)
    .query<RawPago>(`
      SELECT IDPago, Concepto, MontoPlaneado_CRC,
             CAST(FechaPlaneada AS DATE) AS FechaPlaneada,
             CAST(FechaReal AS DATE)     AS FechaReal,
             Notas, Estado, MontoAplicado_CRC, NumLinks
      FROM [app].vw_pagos_cliente_caso
      WHERE IDCaso = @id
      ORDER BY FechaPlaneada, IDPago;
    `);

  const pagosBanco = await db
    .request()
    .input('id', sql.Int, idCaso)
    .query<RawPagoBanco>(`
      SELECT
        lk.IDLink, lk.IDMovimiento, chp.IDHito,
        h.Codigo                            AS CodigoHito,
        h.Nombre                            AS NombreHito,
        CAST(m.FechaMovimiento AS DATE)     AS FechaMovimiento,
        lk.MontoAplicado_CRC,
        tm.Abreviatura                      AS AbreviaturaTipo,
        LTRIM(RTRIM(ISNULL(m.Depositante, ''))) AS Depositante
      FROM [app].movimiento_hito_link lk
      INNER JOIN [app].caso_hito_proyeccion chp ON chp.IDCasoHito = lk.IDCasoHito
      INNER JOIN [app].catalogo_hito h ON h.IDHito = chp.IDHito
      INNER JOIN dbo.Movimientos m ON m.IDMovimiento = lk.IDMovimiento
      INNER JOIN dbo.TipMovi tm ON tm.IDTmov = m.IDTipmov
      WHERE chp.IDCaso = @id
      ORDER BY m.FechaMovimiento, chp.OrdenEnCaso;
    `);

  const precioVentaActual = Number(r.PrecioVentaActual_CRC ?? 0);
  const montoBanco = Number(r.MontoFinanciaBanco_CRC ?? 0);
  const montoCliente = Math.max(0, precioVentaActual - montoBanco);
  const totalPlaneadoCliente = pagos.recordset.reduce((s, p) => s + Number(p.MontoPlaneado_CRC), 0);
  const totalCobradoCliente = pagos.recordset.reduce((s, p) => s + Number(p.MontoAplicado_CRC), 0);
  const totalPagadoBanco = pagosBanco.recordset.reduce((s, p) => s + Number(p.MontoAplicado_CRC), 0);
  const totalCubierto = totalPagadoBanco + totalCobradoCliente;
  const saldoTotalCaso = Math.max(0, precioVentaActual - totalCubierto);

  return {
    cabecera: {
      IDCaso: r.IDCaso,
      CodigoCaso: r.CodigoCaso,
      Cliente: r.Cliente?.trim() ?? '',
      AbreviaturaProyecto: r.AbreviaturaProyecto?.trim() ?? null,
      NombreProyecto: r.NombreProyecto?.trim() ?? null,
      NombreBloque: r.NombreBloque?.trim() ?? null,
      CodigoLote: r.CodigoLote?.trim() ?? '',
      NombreModelo: r.NombreModelo?.trim() ?? null,
      AreaLote_m2: r.AreaLote_m2 != null ? Number(r.AreaLote_m2) : null,
      IDBan: r.IDBan,
      AbrevBanco: r.AbrevBanco?.trim() ?? null,
      NombreBanco: r.NombreBanco?.trim() ?? null,
      IDEstado: r.IDEstado,
      FechaReserva: isoDate(r.FechaReserva),
      FechaFormalizacion: isoDate(r.FechaFormalizacion),
    },
    extras: extras.recordset.map((e) => ({
      IDExtra: e.IDExtra,
      Tipo: e.Tipo,
      Descripcion: e.Descripcion,
      MontoAjuste_CRC: Number(e.MontoAjuste_CRC),
      FechaCotizacion: isoDate(e.FechaCotizacion),
      FechaAprobacion: isoDate(e.FechaAprobacion),
    })),
    pagos: pagos.recordset.map((p) => ({
      IDPago: p.IDPago,
      Concepto: p.Concepto,
      MontoPlaneado_CRC: Number(p.MontoPlaneado_CRC),
      FechaPlaneada: isoDate(p.FechaPlaneada),
      FechaReal: isoDate(p.FechaReal),
      Notas: p.Notas,
      Estado: p.Estado,
      MontoAplicado_CRC: Number(p.MontoAplicado_CRC),
      NumLinks: p.NumLinks,
    })),
    pagosBanco: pagosBanco.recordset.map((p) => ({
      IDLink: p.IDLink,
      IDMovimiento: p.IDMovimiento,
      IDHito: p.IDHito,
      CodigoHito: p.CodigoHito?.trim() ?? '',
      NombreHito: p.NombreHito?.trim() ?? '',
      FechaMovimiento: isoDate(p.FechaMovimiento),
      MontoAplicado_CRC: Number(p.MontoAplicado_CRC),
      AbreviaturaTipo: p.AbreviaturaTipo?.trim() ?? null,
      Depositante: p.Depositante?.trim() ?? null,
    })),
    totales: {
      PrecioVentaContractual_CRC: Number(r.PrecioVentaContractual_CRC ?? 0),
      TotalExtras_CRC: Number(r.TotalExtras_CRC ?? 0),
      TotalDescuentos_CRC: Number(r.TotalDescuentos_CRC ?? 0),
      PrecioVentaActual_CRC: precioVentaActual,
      MontoFinanciaBanco_CRC: montoBanco,
      MontoCliente_CRC: montoCliente,
      TotalPlaneadoCliente_CRC: totalPlaneadoCliente,
      TotalPagadoCliente_CRC: totalCobradoCliente,
      TotalPagadoBanco_CRC: totalPagadoBanco,
      TotalCubierto_CRC: totalCubierto,
      SaldoTotalCaso_CRC: saldoTotalCaso,
      SaldoPendienteCliente_CRC: Math.max(0, totalPlaneadoCliente - totalCobradoCliente),
    },
    generadoEn: new Date().toISOString(),
  };
}
