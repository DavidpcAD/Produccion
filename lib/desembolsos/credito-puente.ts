// Tipos + mappers del módulo Crédito Puente (portado de adelante-flujo-desembolsos
// `api/src/functions/creditoPuente.ts` y `creditoPuenteMovimientos.ts`).
//
// Datos en AdelanteDB, esquema `app`:
//   - Tablas:  credito_puente, credito_puente_lote, credito_puente_movimiento,
//              credito_puente_link (+ esquema_hito / lote_hito, no usadas aquí).
//   - Vistas:  vw_credito_puente_resumen, vw_lote_credito_puente,
//              vw_credito_puente_movimiento.
//
// DIFERENCIA CLAVE vs. el fuente: la base de Producción NO tiene los stored
// procedures `sp_*` que usa el repo original — solo las tablas y vistas. Por eso
// las lecturas van contra las vistas (idénticas al fuente) y las escrituras usan
// SQL parametrizado directo contra las tablas (patrón de `lib/avance`), en vez de
// `EXEC [pro_app].sp_...`.

export type CreditoPuenteEstado = 'ACTIVO' | 'CANCELADO';
export type CreditoPuenteLoteEstado =
  | 'PENDIENTE'
  | 'CANCELACION_PROGRAMADA'
  | 'CANCELACION_CONFIRMADA';
export type MovimientoCpEstado = 'REGISTRADO' | 'ANULADO';

// ---------------------------------------------------------------- Cabecera / resumen
export interface CreditoPuenteResumen {
  IDCreditoPuente: number;
  IDBan: number;
  AbrevBanco: string;
  NombreBanco: string;
  ColorBanco: string | null;
  Codigo: string | null;
  MontoTotal_CRC: number;
  GastosFormalizacion_CRC: number | null;
  TasaAnual: number | null;
  FechaAprobacion: string | null; // YYYY-MM-DD
  FechaVencimiento: string | null; // YYYY-MM-DD
  Estado: CreditoPuenteEstado;
  Notas: string | null;
  MontoAsignadoLotes_CRC: number;
  MontoSinAsignar_CRC: number;
  CantidadLotes: number;
  LotesPendientes: number;
  LotesProgramados: number;
  LotesConfirmados: number;
  LotesCancelados: number;
  MontoProgramadoTotal_CRC: number;
  MontoConfirmadoTotal_CRC: number;
  MontoCanceladoTotal_CRC: number;
  MontoPendienteCobertura_CRC: number;
  CreadoPor: string;
  FechaCreacion: string;
  ModificadoPor: string | null;
  FechaModificacion: string | null;
}

// ---------------------------------------------------------------- Lote del crédito
export interface CreditoPuenteLote {
  IDLote: number;
  CodigoLote: string;
  IDProyecto: number;
  AbreviaturaProyecto: string;
  NombreProyecto: string;
  IDCreditoPuenteLote: number;
  IDCreditoPuente: number;
  CodigoCP: string | null;
  IDBancoCP: number;
  AbrevBancoCP: string;
  NombreBancoCP: string;
  ColorBancoCP: string | null;
  MontoResponsabilidadTeorica_CRC: number;
  GastosFormalizacionLoteCalculado_CRC: number | null;
  GastosFormalizacionLoteOverride_CRC: number | null;
  GastosFormalizacionOverride: 0 | 1;
  EstadoLoteCP: CreditoPuenteLoteEstado;
  FechaCancelacionAlBanco: string | null;
  MontoCanceladoAlBanco_CRC: number | null;
  FechaConfirmacionCancelacion: string | null;
  MontoConfirmadoAlBanco_CRC: number | null;
  ComprobanteCancelacion: string | null;
  EstadoCredito: CreditoPuenteEstado;
  NotasLoteCP: string | null;
}

// ---------------------------------------------------------------- Movimientos + links
export interface LinkMovCreditoPuente {
  IDLinkCP: number;
  IDMovCP: number;
  IDCreditoPuenteLoteHito: number;
  IDCreditoPuenteLote: number;
  IDLote: number;
  CodigoLote: string;
  AbreviaturaProyecto: string;
  IDHito: number;
  CodigoHito: string;
  NombreHito: string;
  ColorHito: string | null;
  MontoAplicado_CRC: number;
  Notas: string | null;
}

export interface MovimientoCreditoPuente {
  IDMovCP: number;
  IDCreditoPuente: number;
  IDBancoCP: number;
  AbrevBancoCP: string;
  NombreBancoCP: string;
  MontoTotalCP_CRC: number;
  FechaMovimiento: string; // YYYY-MM-DD
  MontoMovimiento_CRC: number;
  Concepto: string | null;
  NumeroComprobante: string | null;
  Estado: MovimientoCpEstado;
  Notas: string | null;
  MontoAplicado_CRC: number;
  MontoSinAplicar_CRC: number;
  CantidadLinks: number;
  EstaVinculado: 0 | 1;
}

// ---------------------------------------------------------------- Bancos (catálogo)
export interface BancoOpcion {
  IDBan: number;
  Abreviatura: string;
  NombreEntidad: string;
  ColorHEXBan: string | null;
}

// ===========================================================================
// Helpers de mapeo (fechas ISO + números robustos), igual criterio que el fuente.
// ===========================================================================

function isoDate(d: Date | string | null): string | null {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}
function num(v: unknown): number {
  return v != null ? Number(v) : 0;
}
function numN(v: unknown): number | null {
  return v != null ? Number(v) : null;
}
const t = (s: unknown) => (s != null ? String(s).trim() : '');

// Filas crudas de las vistas (nombres tal cual las columnas SQL).
export interface RawResumen {
  [k: string]: unknown;
}

export function mapResumen(r: Record<string, unknown>): CreditoPuenteResumen {
  return {
    IDCreditoPuente: Number(r.IDCreditoPuente),
    IDBan: Number(r.IDBan),
    AbrevBanco: t(r.AbrevBanco),
    NombreBanco: t(r.NombreBanco),
    ColorBanco: (r.ColorBanco as string | null) ?? null,
    Codigo: (r.Codigo as string | null) ?? null,
    MontoTotal_CRC: num(r.MontoTotal_CRC),
    GastosFormalizacion_CRC: numN(r.GastosFormalizacion_CRC),
    TasaAnual: numN(r.TasaAnual),
    FechaAprobacion: isoDate(r.FechaAprobacion as Date | string | null),
    FechaVencimiento: isoDate(r.FechaVencimiento as Date | string | null),
    Estado: r.Estado as CreditoPuenteEstado,
    Notas: (r.Notas as string | null) ?? null,
    MontoAsignadoLotes_CRC: num(r.MontoAsignadoLotes_CRC),
    MontoSinAsignar_CRC: num(r.MontoSinAsignar_CRC),
    CantidadLotes: num(r.CantidadLotes),
    LotesPendientes: num(r.LotesPendientes),
    LotesProgramados: num(r.LotesProgramados),
    LotesConfirmados: num(r.LotesConfirmados),
    LotesCancelados: num(r.LotesCancelados),
    MontoProgramadoTotal_CRC: num(r.MontoProgramadoTotal_CRC),
    MontoConfirmadoTotal_CRC: num(r.MontoConfirmadoTotal_CRC),
    MontoCanceladoTotal_CRC: num(r.MontoCanceladoTotal_CRC),
    MontoPendienteCobertura_CRC: num(r.MontoPendienteCobertura_CRC),
    CreadoPor: t(r.CreadoPor),
    FechaCreacion: (r.FechaCreacion instanceof Date
      ? (r.FechaCreacion as Date).toISOString()
      : String(r.FechaCreacion ?? '')),
    ModificadoPor: (r.ModificadoPor as string | null) ?? null,
    FechaModificacion:
      r.FechaModificacion instanceof Date
        ? (r.FechaModificacion as Date).toISOString()
        : (r.FechaModificacion as string | null) ?? null,
  };
}

export function mapLote(r: Record<string, unknown>): CreditoPuenteLote {
  return {
    IDLote: Number(r.IDLote),
    CodigoLote: t(r.CodigoLote),
    IDProyecto: Number(r.IDProyecto),
    AbreviaturaProyecto: t(r.AbreviaturaProyecto),
    NombreProyecto: t(r.NombreProyecto),
    IDCreditoPuenteLote: Number(r.IDCreditoPuenteLote),
    IDCreditoPuente: Number(r.IDCreditoPuente),
    CodigoCP: (r.CodigoCP as string | null) ?? null,
    IDBancoCP: Number(r.IDBancoCP),
    AbrevBancoCP: t(r.AbrevBancoCP),
    NombreBancoCP: t(r.NombreBancoCP),
    ColorBancoCP: (r.ColorBancoCP as string | null) ?? null,
    MontoResponsabilidadTeorica_CRC: num(r.MontoResponsabilidadTeorica_CRC),
    GastosFormalizacionLoteCalculado_CRC: numN(r.GastosFormalizacionLoteCalculado_CRC),
    GastosFormalizacionLoteOverride_CRC: numN(r.GastosFormalizacionLoteOverride_CRC),
    GastosFormalizacionOverride: r.GastosFormalizacionOverride ? 1 : 0,
    EstadoLoteCP: r.EstadoLoteCP as CreditoPuenteLoteEstado,
    FechaCancelacionAlBanco: isoDate(r.FechaCancelacionAlBanco as Date | string | null),
    MontoCanceladoAlBanco_CRC: numN(r.MontoCanceladoAlBanco_CRC),
    FechaConfirmacionCancelacion: isoDate(r.FechaConfirmacionCancelacion as Date | string | null),
    MontoConfirmadoAlBanco_CRC: numN(r.MontoConfirmadoAlBanco_CRC),
    ComprobanteCancelacion: (r.ComprobanteCancelacion as string | null) ?? null,
    EstadoCredito: r.EstadoCredito as CreditoPuenteEstado,
    NotasLoteCP: (r.NotasLoteCP as string | null) ?? null,
  };
}

export function mapMov(r: Record<string, unknown>): MovimientoCreditoPuente {
  return {
    IDMovCP: Number(r.IDMovCP),
    IDCreditoPuente: Number(r.IDCreditoPuente),
    IDBancoCP: Number(r.IDBancoCP),
    AbrevBancoCP: t(r.AbrevBancoCP),
    NombreBancoCP: t(r.NombreBancoCP),
    MontoTotalCP_CRC: num(r.MontoTotalCP_CRC),
    FechaMovimiento: isoDate(r.FechaMovimiento as Date | string | null) ?? '',
    MontoMovimiento_CRC: num(r.MontoMovimiento_CRC),
    Concepto: (r.Concepto as string | null) ?? null,
    NumeroComprobante: (r.NumeroComprobante as string | null) ?? null,
    Estado: r.Estado as MovimientoCpEstado,
    Notas: (r.Notas as string | null) ?? null,
    MontoAplicado_CRC: num(r.MontoAplicado_CRC),
    MontoSinAplicar_CRC: num(r.MontoSinAplicar_CRC),
    CantidadLinks: num(r.CantidadLinks),
    EstaVinculado: r.EstaVinculado ? 1 : 0,
  };
}

// ---------------------------------------------------------------- Respuestas API
export interface RespuestaListaCreditoPuente {
  creditos: CreditoPuenteResumen[];
  bancos: BancoOpcion[];
}
export interface RespuestaCreditoPuenteDetalle {
  credito: CreditoPuenteResumen;
  lotes: CreditoPuenteLote[];
}
export interface RespuestaListaMovimientosCreditoPuente {
  movimientos: MovimientoCreditoPuente[];
}
