// Tipos del módulo Préstamo Bancario (portado de adelante-flujo-desembolsos
// `api/src/functions/prestamoBancario.ts`).
//
// Captura del préstamo bancario por caso: cuánto financia el banco por el lote,
// el pago del cliente, etc. Datos en AdelanteDB, tabla `pro_app.caso_lote_banco`
// (una fila por caso; se identifica por IDCaso).
//
// DIFERENCIA vs. el fuente: el repo original hace un upsert vía
// `sp_actualizar_monto_financia_banco`; ese SP NO existe en la base de
// Producción, así que aquí el upsert se hace con SQL directo (SELECT + INSERT/
// UPDATE) siguiendo el patrón de `lib/avance`.

export interface PrestamoBancarioCaso {
  IDCasoLoteBanco: number;
  IDCaso: number;
  MontoPagaBancoPorLote_CRC: number;
  MontoFinanciaBanco_CRC: number | null;
  MontoLoteFinanciado_CRC: number | null;
  LoteHistoricoCobrado_CRC: number | null;
  PagoCliente_CRC: number | null;
  FechaPagoCliente: string | null; // YYYY-MM-DD
  Notas: string | null;
}

// Campos que el endpoint acepta para actualizar (todos opcionales; se envía
// al menos uno). Equivale a `ActualizarMontoFinanciaBancoRequest` del fuente.
export interface ActualizarPrestamoBancarioRequest {
  IDCaso: number;
  MontoFinanciaBanco_CRC?: number | null;
  MontoLoteFinanciado_CRC?: number | null;
  LoteHistoricoCobrado_CRC?: number | null;
  PagoCliente_CRC?: number | null;
  FechaPagoCliente?: string | null;
  Notas?: string | null;
}

export type AccionUpsert = 'INSERT' | 'UPDATE';

export interface ActualizarPrestamoBancarioResponse {
  IDCasoLoteBanco: number;
  Accion: AccionUpsert;
}

function isoDate(d: Date | string | null): string | null {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

export function mapPrestamo(r: Record<string, unknown>): PrestamoBancarioCaso {
  const n = (v: unknown) => (v != null ? Number(v) : null);
  return {
    IDCasoLoteBanco: Number(r.IDCasoLoteBanco),
    IDCaso: Number(r.IDCaso),
    MontoPagaBancoPorLote_CRC: Number(r.MontoPagaBancoPorLote_CRC ?? 0),
    MontoFinanciaBanco_CRC: n(r.MontoFinanciaBanco_CRC),
    MontoLoteFinanciado_CRC: n(r.MontoLoteFinanciado_CRC),
    LoteHistoricoCobrado_CRC: n(r.LoteHistoricoCobrado_CRC),
    PagoCliente_CRC: n(r.PagoCliente_CRC),
    FechaPagoCliente: isoDate(r.FechaPagoCliente as Date | string | null),
    Notas: (r.Notas as string | null) ?? null,
  };
}
