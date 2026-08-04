import type { ConnectionPool } from 'mssql';
import { sql } from '@/lib/db-adelantedb';

/**
 * Matriz de desembolsos — motor de lectura + edición de proyecciones. Portado
 * FIEL de la Azure Function `desembolsos.ts` de adelante-flujo-desembolsos.
 *
 * El cálculo pesado (monto por hito, fechas derivadas, real desembolsado,
 * distribución por caso) vive en las vistas de AdelanteDB esquema `app`
 * (vw_proyeccion_desembolsos, vw_distribucion_caso, vw_credito_puente_lote_hito)
 * y en los SP de escritura (sp_upsert_proyeccion_caso,
 * sp_actualizar_proyeccion_formalizacion). Este módulo solo consulta esas
 * vistas y arma la respuesta con la MISMA lógica del original:
 *   - lista de hitos cuya FechaProyectada cae en el rango visible,
 *   - backlog (rn=1 por caso para fechas fuera de rango; NULL siempre visible),
 *   - backlogExpandido (todos los pendientes, para búsqueda),
 *   - real desembolsado por hito (prorrateo del depósito por links),
 *   - distribución del lote por caso,
 *   - hitos y cancelaciones de crédito puente en/fuera de rango.
 *
 * Read-only para GET; la mutación llama a los SP tal cual el original.
 */

// --------------------------------------------------------------------- Tipos

export const ESTADOS_TRAMITE = [
  'PLANEADO',
  'VISITA_SOLICITADA',
  'VISITA_REALIZADA',
  'DESEMBOLSADO',
  'CANCELADO',
] as const;
export type EstadoTramite = (typeof ESTADOS_TRAMITE)[number];

export type Colones = number;

/** Una fila de la matriz: un hito de un caso, con monto, fecha y estado. */
export interface DesembolsoProyectado {
  IDCaso: number;
  CodigoCaso: string | null;
  Cliente: string;
  NombreModelo: string | null;
  IDLote: number;
  NombreBloque: string | null;
  CodigoLote: string;
  IDBan: number;
  AbrevBanco: string;
  NombreBanco: string;
  ColorBanco: string | null;
  IDProyecto: number;
  AbreviaturaProyecto: string;
  NombreProyecto: string;
  IDHito: number;
  CodigoHito: string;
  NombreHito: string;
  ColorHito: string | null;
  OrdenEnEsquema: number;
  PorcentajeHito: number;
  PorcentajeAcumulado: number;
  DiasSolicitudVisita: number;
  DiasDesembolsoPostVisita: number;
  DiaSemanaPeritoFijo: number | null;
  IDEsquema: number;
  EsReservado: number; // 0 formalizado | 1 reservado con proyección
  NivelConfianzaFormalizacion: 'A' | 'M' | 'B' | null;
  AreaLote_m2: number | null;
  MontoBanco: Colones | null;
  MontoHitoEsperado: Colones;
  RealDesembolsado_CRC: Colones | null;
  CantidadMovsVinculados: number;
  PagadoPorBanco: Colones | null;
  PrecioLoteInterno_CRC: Colones | null;
  PagoADBase_CRC: Colones | null;
  DiferenciaBancoVsInterno_CRC: Colones | null;
  IngresoTotalAD_CRC: Colones | null;
  OrigenMontoBanco: 'MANUAL' | 'CALCULADO' | 'NO_DISPONIBLE' | null;
  HitoCubierto: number; // 0 | 1
  EsMontoFijo: number; // 0 | 1
  IDProyeccion: number | null;
  FechaPlaneadaHito: string | null;
  FechaPlaneadaVisitaPerito: string | null;
  FechaProyectadaDesembolso: string | null;
  FechaRealHito: string | null;
  FechaRealVisitaPerito: string | null;
  FechaRealDesembolso: string | null;
  EstadoOverride: EstadoTramite | null;
  NotasOverride: string | null;
  UltimaModificacion: string | null;
  FechaProyectada: string; // ISO YYYY-MM-DD
  EstadoTramite: EstadoTramite;
  EsDerivado: number; // 0 | 1
  FechaFormalizacion: string | null;
}

export interface SemanaInfo {
  numero: number; // ISO week
  desde: string; // ISO YYYY-MM-DD (lunes)
  hasta: string; // ISO YYYY-MM-DD (domingo)
  etiqueta: string; // ej. "27 abr – 03 may"
}

/** Distribución del lote de un caso entre las entidades (AD/QFI/GM/...). */
export interface DistribucionPorCaso {
  IDCaso: number;
  IDProyecto: number;
  items: Array<{
    IDEntidad: number;
    Codigo: string;
    Nombre: string;
    Porcentaje: number;
    Monto: Colones;
  }>;
}

/** Fila de hito de un lote del CP visible en la matriz (Fase 6.1d). */
export interface CreditoPuenteHitoEnRango {
  IDCreditoPuenteLoteHito: number;
  IDCreditoPuente: number;
  IDCreditoPuenteLote: number;
  IDLote: number;
  CodigoLote: string;
  AbreviaturaProyecto: string;
  IDBancoCP: number;
  AbrevBancoCP: string;
  IDHito: number;
  CodigoHito: string;
  NombreHito: string;
  ColorHito: string | null;
  OrdenEnEsquema: number;
  Porcentaje: number;
  MontoHitoEsperado_CRC: number;
  MontoAplicado_CRC: number;
  MontoPendiente_CRC: number;
  CantidadLinks: number;
  FechaProyectada: string | null;
  FechaProyectadaDesembolso: string | null;
  FechaRealDesembolso: string | null;
  EstadoTramite: EstadoTramite;
}

/** Fila de cancelación de lote del CP en la matriz (Fase 6.2 + 6.3). */
export interface CreditoPuenteCancelacion {
  IDCreditoPuenteLote: number;
  IDCreditoPuente: number;
  IDLote: number;
  CodigoLote: string;
  AbreviaturaProyecto: string;
  IDBancoCP: number;
  AbrevBancoCP: string;
  Estado: 'CANCELACION_PROGRAMADA' | 'CANCELACION_CONFIRMADA';
  MontoCanceladoAlBanco_CRC: number;
  FechaCancelacionAlBanco: string; // ISO YYYY-MM-DD
  FechaConfirmacionCancelacion: string | null;
  MontoConfirmadoAlBanco_CRC: number | null;
  Notas: string | null;
}

/** GET /api/desembolsos/matriz?desde=&hasta= */
export interface RespuestaDesembolsos {
  desde: string;
  hasta: string;
  semanas: SemanaInfo[];
  desembolsos: DesembolsoProyectado[];
  totalProyectado: Colones;
  backlog: DesembolsoProyectado[];
  backlogExpandido: DesembolsoProyectado[];
  distribuciones: DistribucionPorCaso[];
  creditoPuente: {
    hitos: CreditoPuenteHitoEnRango[];
    backlog: CreditoPuenteHitoEnRango[];
    cancelaciones: CreditoPuenteCancelacion[];
  };
}

/** PATCH /api/desembolsos/desembolsos/:idCaso/:idHito */
export interface ActualizarProyeccionRequest {
  FechaPlaneadaHito?: string | null;
  FechaPlaneadaVisitaPerito?: string | null;
  FechaProyectadaDesembolso?: string | null;
  FechaRealHito?: string | null;
  FechaRealVisitaPerito?: string | null;
  FechaRealDesembolso?: string | null;
  EstadoTramite: EstadoTramite;
  Notas?: string | null;
}

export interface ActualizarProyeccionResponse {
  IDProyeccion: number;
}

export const ESTADOS_VALIDOS = new Set<EstadoTramite>(ESTADOS_TRAMITE);

// --------------------------------------------------------------------- Helpers

function toIsoDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value;
}

export function lunesDeEstaSemana(): Date {
  const hoy = new Date();
  const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()));
  const diaSemana = d.getUTCDay(); // 0 = domingo
  const offset = diaSemana === 0 ? -6 : 1 - diaSemana; // a lunes
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
}

function isoWeekNumber(d: Date): number {
  const target = new Date(d.valueOf());
  const dayNr = (d.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diff = (target.valueOf() - firstThursday.valueOf()) / 86400000;
  return 1 + Math.round((diff - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}

const MESES_CORTOS = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

function etiquetaSemana(desde: Date, hasta: Date): string {
  const d1 = desde.getUTCDate();
  const d2 = hasta.getUTCDate();
  const m1 = MESES_CORTOS[desde.getUTCMonth()];
  const m2 = MESES_CORTOS[hasta.getUTCMonth()];
  if (desde.getUTCMonth() === hasta.getUTCMonth()) return `${d1} – ${d2} ${m1}`;
  return `${d1} ${m1} – ${d2} ${m2}`;
}

function generarSemanas(desde: Date, hasta: Date): SemanaInfo[] {
  const semanas: SemanaInfo[] = [];
  const cursor = new Date(desde);
  let i = 0;
  while (cursor <= hasta && i < 12) {
    // protección: máx 12 semanas
    const inicio = new Date(cursor);
    const fin = new Date(cursor);
    fin.setUTCDate(inicio.getUTCDate() + 6);
    semanas.push({
      numero: isoWeekNumber(inicio),
      desde: toIsoDate(inicio) ?? '',
      hasta: toIsoDate(fin) ?? '',
      etiqueta: etiquetaSemana(inicio, fin),
    });
    cursor.setUTCDate(cursor.getUTCDate() + 7);
    i++;
  }
  return semanas;
}

// Forma cruda de vw_proyeccion_desembolsos + reales.
interface DbDesembolso {
  IDCaso: number;
  CodigoCaso: string | null;
  Cliente: string;
  NombreModelo: string | null;
  IDLote: number;
  NombreBloque: string | null;
  CodigoLote: string;
  IDBan: number;
  AbrevBanco: string;
  NombreBanco: string;
  ColorBanco: string | null;
  IDProyecto: number;
  AbreviaturaProyecto: string;
  NombreProyecto: string;
  IDHito: number;
  CodigoHito: string;
  NombreHito: string;
  ColorHito: string | null;
  OrdenEnEsquema: number;
  PorcentajeHito: number;
  PorcentajeAcumulado: number;
  DiasSolicitudVisita: number;
  DiasDesembolsoPostVisita: number;
  DiaSemanaPeritoFijo: number | null;
  IDEsquema: number;
  EsReservado: number;
  NivelConfianzaFormalizacion: 'A' | 'M' | 'B' | null;
  AreaLote_m2: number | null;
  MontoBanco: number | null;
  MontoHitoEsperado: number;
  RealDesembolsado_CRC: number | null;
  CantidadMovsVinculados: number | null;
  PagadoPorBanco: number | null;
  PrecioLoteInterno_CRC: number | null;
  PagoADBase_CRC: number | null;
  DiferenciaBancoVsInterno_CRC: number | null;
  IngresoTotalAD_CRC: number | null;
  OrigenMontoBanco: 'MANUAL' | 'CALCULADO' | 'NO_DISPONIBLE' | null;
  HitoCubierto: number;
  EsMontoFijo: boolean | number;
  IDProyeccion: number | null;
  FechaPlaneadaHito: Date | null;
  FechaPlaneadaVisitaPerito: Date | null;
  FechaProyectadaDesembolso: Date | null;
  FechaRealHito: Date | null;
  FechaRealVisitaPerito: Date | null;
  FechaRealDesembolso: Date | null;
  EstadoOverride: EstadoTramite | null;
  NotasOverride: string | null;
  UltimaModificacion: Date | null;
  FechaProyectada: Date;
  EstadoTramite: EstadoTramite;
  EsDerivado: number;
  FechaFormalizacion: Date | null;
}

function toDesembolsoProyectado(row: DbDesembolso): DesembolsoProyectado {
  return {
    ...row,
    // BIT de SQL Server llega como boolean a JS — normalizar a 0/1.
    EsReservado: row.EsReservado ? 1 : 0,
    EsDerivado: row.EsDerivado ? 1 : 0,
    HitoCubierto: row.HitoCubierto ? 1 : 0,
    EsMontoFijo: row.EsMontoFijo ? 1 : 0,
    Cliente: row.Cliente?.trim() ?? '',
    AreaLote_m2: row.AreaLote_m2 != null ? Number(row.AreaLote_m2) : null,
    MontoBanco: row.MontoBanco != null ? Number(row.MontoBanco) : null,
    MontoHitoEsperado: Number(row.MontoHitoEsperado),
    RealDesembolsado_CRC:
      row.RealDesembolsado_CRC != null ? Number(row.RealDesembolsado_CRC) : null,
    CantidadMovsVinculados:
      row.CantidadMovsVinculados != null ? Number(row.CantidadMovsVinculados) : 0,
    PagadoPorBanco: row.PagadoPorBanco != null ? Number(row.PagadoPorBanco) : null,
    PrecioLoteInterno_CRC:
      row.PrecioLoteInterno_CRC != null ? Number(row.PrecioLoteInterno_CRC) : null,
    PagoADBase_CRC: row.PagoADBase_CRC != null ? Number(row.PagoADBase_CRC) : null,
    DiferenciaBancoVsInterno_CRC:
      row.DiferenciaBancoVsInterno_CRC != null
        ? Number(row.DiferenciaBancoVsInterno_CRC)
        : null,
    IngresoTotalAD_CRC:
      row.IngresoTotalAD_CRC != null ? Number(row.IngresoTotalAD_CRC) : null,
    PorcentajeHito: Number(row.PorcentajeHito),
    PorcentajeAcumulado: Number(row.PorcentajeAcumulado),
    FechaPlaneadaHito: toIsoDate(row.FechaPlaneadaHito),
    FechaPlaneadaVisitaPerito: toIsoDate(row.FechaPlaneadaVisitaPerito),
    FechaProyectadaDesembolso: toIsoDate(row.FechaProyectadaDesembolso),
    FechaRealHito: toIsoDate(row.FechaRealHito),
    FechaRealVisitaPerito: toIsoDate(row.FechaRealVisitaPerito),
    FechaRealDesembolso: toIsoDate(row.FechaRealDesembolso),
    UltimaModificacion: row.UltimaModificacion
      ? row.UltimaModificacion.toISOString()
      : null,
    FechaProyectada: toIsoDate(row.FechaProyectada) ?? '',
    FechaFormalizacion: toIsoDate(row.FechaFormalizacion),
  };
}

// ------------------------------------------------------- Lista de la matriz

/**
 * Lista de desembolsos proyectados para el rango [desde, hasta]. Puerto exacto
 * de `desembolsosLista`. Ambas fechas son objetos Date (UTC medianoche).
 */
export async function listarDesembolsos(
  db: ConnectionPool,
  desde: Date,
  hasta: Date,
): Promise<RespuestaDesembolsos> {
  // Todos los hitos cuya FechaProyectada cae en el rango visible (pendientes y
  // ya desembolsados). La UI distingue visualmente.
  const result = await db
    .request()
    .input('desde', sql.Date, desde)
    .input('hasta', sql.Date, hasta)
    .query<DbDesembolso>(`
      SELECT
        v.*,
        rd.RealDesembolsado_CRC,
        rd.CantidadMovsVinculados
      FROM [pro_app].vw_proyeccion_desembolsos v
      LEFT JOIN (
        SELECT
          mhl.IDCasoHito,
          -- CAST a DECIMAL(38,4): el original multiplica money x money, que en
          -- AdelanteDB con montos reales en CRC desborda el rango del tipo money.
          -- El cast preserva la formula (prorrateo del deposito por links) sin
          -- overflow. Unica desviacion del port literal.
          SUM(CAST(m.MontoColones AS DECIMAL(38, 4)) * mhl.MontoAplicado_CRC / NULLIF(sa.SumAplicado, 0))
            AS RealDesembolsado_CRC,
          COUNT(*) AS CantidadMovsVinculados
        FROM [pro_app].movimiento_hito_link mhl
        INNER JOIN pro_ventas.Movimientos m ON m.IDMovimiento = mhl.IDMovimiento
        INNER JOIN (
          SELECT IDMovimiento, SUM(MontoAplicado_CRC) AS SumAplicado
          FROM [pro_app].movimiento_hito_link
          GROUP BY IDMovimiento
        ) sa ON sa.IDMovimiento = mhl.IDMovimiento
        GROUP BY mhl.IDCasoHito
      ) rd ON rd.IDCasoHito = v.IDProyeccion
      WHERE v.FechaProyectada BETWEEN @desde AND @hasta
      ORDER BY v.IDBan, v.OrdenEnEsquema, v.FechaProyectada;
    `);

  // Backlog por defecto: hitos sin fecha (NULL) siempre visibles; con fecha
  // fuera de rango, rn=1 por caso.
  const backlogResult = await db
    .request()
    .input('desde', sql.Date, desde)
    .input('hasta', sql.Date, hasta)
    .query<DbDesembolso>(`
      WITH PendientesFueraRango AS (
        SELECT v.*,
               CASE
                 WHEN v.FechaProyectada IS NULL THEN 1
                 ELSE ROW_NUMBER() OVER (
                   PARTITION BY v.IDCaso ORDER BY v.OrdenEnEsquema
                 )
               END AS rn
        FROM [pro_app].vw_proyeccion_desembolsos v
        INNER JOIN pro_ventas.Casos cs ON cs.IDCaso = v.IDCaso
        WHERE cs.IDEstado IN (2, 4)
          AND v.HitoCubierto = 0
          AND (v.FechaProyectada IS NULL
               OR v.FechaProyectada < @desde
               OR v.FechaProyectada > @hasta)
      )
      SELECT * FROM PendientesFueraRango
      WHERE rn = 1
      ORDER BY
        CASE WHEN FechaProyectada IS NULL THEN 0 ELSE 1 END,
        FechaProyectada;
    `);

  // Backlog expandido: todos los pendientes (sin rn=1), para búsqueda.
  const backlogExpandidoResult = await db
    .request()
    .input('desde', sql.Date, desde)
    .input('hasta', sql.Date, hasta)
    .query<DbDesembolso>(`
      SELECT v.*
      FROM [pro_app].vw_proyeccion_desembolsos v
      INNER JOIN pro_ventas.Casos cs ON cs.IDCaso = v.IDCaso
      WHERE cs.IDEstado IN (2, 4)
        AND v.HitoCubierto = 0
        AND (v.FechaProyectada IS NULL
             OR v.FechaProyectada < @desde
             OR v.FechaProyectada > @hasta)
      ORDER BY
        CASE WHEN v.FechaProyectada IS NULL THEN 0 ELSE 1 END,
        v.FechaProyectada,
        v.OrdenEnEsquema;
    `);

  const desembolsos = result.recordset.map(toDesembolsoProyectado);
  const backlog = backlogResult.recordset.map(toDesembolsoProyectado);
  const backlogExpandido = backlogExpandidoResult.recordset.map(toDesembolsoProyectado);

  // Hitos del Crédito Puente (Fase 6.1d). Solo CP con Estado='ACTIVO'.
  const cpHitosResult = await db
    .request()
    .input('desde', sql.Date, desde)
    .input('hasta', sql.Date, hasta)
    .query<{
      IDCreditoPuenteLoteHito: number;
      IDCreditoPuente: number;
      IDCreditoPuenteLote: number;
      IDLote: number;
      CodigoLote: string;
      AbreviaturaProyecto: string;
      IDBancoCP: number;
      AbrevBancoCP: string;
      IDHito: number;
      CodigoHito: string;
      NombreHito: string;
      ColorHito: string | null;
      OrdenEnEsquema: number;
      Porcentaje: number;
      MontoHitoEsperado_CRC: number;
      MontoAplicado_CRC: number;
      MontoPendiente_CRC: number;
      CantidadLinks: number;
      FechaProyectada: Date | null;
      FechaProyectadaDesembolso: Date | null;
      FechaRealDesembolso: Date | null;
      EstadoTramite: string;
      EnRango: 0 | 1;
    }>(`
      SELECT
        v.IDCreditoPuenteLoteHito,
        v.IDCreditoPuente,
        v.IDCreditoPuenteLote,
        v.IDLote,
        v.CodigoLote,
        v.AbreviaturaProyecto,
        v.IDBancoCP,
        v.AbrevBancoCP,
        v.IDHito,
        v.CodigoHito,
        v.NombreHito,
        v.ColorHito,
        v.OrdenEnEsquema,
        v.Porcentaje,
        v.MontoHitoEsperado_CRC,
        v.MontoAplicado_CRC,
        v.MontoPendiente_CRC,
        v.CantidadLinks,
        v.FechaProyectada,
        v.FechaProyectadaDesembolso,
        v.FechaRealDesembolso,
        v.EstadoTramite,
        CASE
          WHEN v.FechaProyectada BETWEEN @desde AND @hasta THEN CAST(1 AS BIT)
          ELSE CAST(0 AS BIT)
        END AS EnRango
      FROM [pro_app].vw_credito_puente_lote_hito v
      INNER JOIN [pro_app].credito_puente cp ON cp.IDCreditoPuente = v.IDCreditoPuente
      WHERE cp.Estado = 'ACTIVO'
      ORDER BY v.AbrevBancoCP, v.AbreviaturaProyecto, v.CodigoLote, v.OrdenEnEsquema;
    `);
  const cpHitosTodos = cpHitosResult.recordset.map((r) => ({
    IDCreditoPuenteLoteHito: r.IDCreditoPuenteLoteHito,
    IDCreditoPuente: r.IDCreditoPuente,
    IDCreditoPuenteLote: r.IDCreditoPuenteLote,
    IDLote: r.IDLote,
    CodigoLote: r.CodigoLote?.trim() ?? '',
    AbreviaturaProyecto: r.AbreviaturaProyecto?.trim() ?? '',
    IDBancoCP: r.IDBancoCP,
    AbrevBancoCP: r.AbrevBancoCP?.trim() ?? '',
    IDHito: r.IDHito,
    CodigoHito: r.CodigoHito?.trim() ?? '',
    NombreHito: r.NombreHito?.trim() ?? '',
    ColorHito: r.ColorHito,
    OrdenEnEsquema: r.OrdenEnEsquema,
    Porcentaje: Number(r.Porcentaje ?? 0),
    MontoHitoEsperado_CRC: Number(r.MontoHitoEsperado_CRC ?? 0),
    MontoAplicado_CRC: Number(r.MontoAplicado_CRC ?? 0),
    MontoPendiente_CRC: Number(r.MontoPendiente_CRC ?? 0),
    CantidadLinks: Number(r.CantidadLinks ?? 0),
    FechaProyectada: toIsoDate(r.FechaProyectada),
    FechaProyectadaDesembolso: toIsoDate(r.FechaProyectadaDesembolso),
    FechaRealDesembolso: toIsoDate(r.FechaRealDesembolso),
    EstadoTramite: r.EstadoTramite as EstadoTramite,
    _enRango: !!r.EnRango,
  }));
  const cpHitos = cpHitosTodos
    .filter((h) => h._enRango)
    .map(({ _enRango: _drop, ...rest }) => rest);
  const cpBacklog = cpHitosTodos
    .filter((h) => !h._enRango)
    .map(({ _enRango: _drop, ...rest }) => rest);

  // Cancelaciones del CP (Fase 6.2 + 6.3).
  const cpCancelacionesResult = await db
    .request()
    .input('desde', sql.Date, desde)
    .input('hasta', sql.Date, hasta)
    .query<{
      IDCreditoPuenteLote: number;
      IDCreditoPuente: number;
      IDLote: number;
      CodigoLote: string;
      AbreviaturaProyecto: string;
      IDBancoCP: number;
      AbrevBancoCP: string;
      Estado: string;
      MontoCanceladoAlBanco_CRC: number;
      FechaCancelacionAlBanco: Date;
      FechaConfirmacionCancelacion: Date | null;
      MontoConfirmadoAlBanco_CRC: number | null;
      Notas: string | null;
    }>(`
      SELECT
        cpl.IDCreditoPuenteLote,
        cpl.IDCreditoPuente,
        cpl.IDLote,
        l.Lote                AS CodigoLote,
        p.AbreviaturaProyecto,
        cp.IDBan              AS IDBancoCP,
        b.Abreviatura         AS AbrevBancoCP,
        cpl.Estado,
        cpl.MontoCanceladoAlBanco_CRC,
        cpl.FechaCancelacionAlBanco,
        cpl.FechaConfirmacionCancelacion,
        cpl.MontoConfirmadoAlBanco_CRC,
        cpl.Notas
      FROM [pro_app].credito_puente_lote cpl
      INNER JOIN [pro_app].credito_puente cp ON cp.IDCreditoPuente = cpl.IDCreditoPuente
      INNER JOIN pro_ventas.Bancos b            ON b.IDBan = cp.IDBan
      INNER JOIN pro_ventas.Lotes l             ON l.IDLote = cpl.IDLote
      INNER JOIN dbo.Proyecto p          ON p.IDProyecto = l.IDProyecto
      WHERE cpl.Estado IN ('CANCELACION_PROGRAMADA', 'CANCELACION_CONFIRMADA')
        AND COALESCE(cpl.FechaConfirmacionCancelacion, cpl.FechaCancelacionAlBanco) BETWEEN @desde AND @hasta
        AND cp.Estado = 'ACTIVO'
      ORDER BY COALESCE(cpl.FechaConfirmacionCancelacion, cpl.FechaCancelacionAlBanco),
               b.Abreviatura, p.AbreviaturaProyecto, l.Lote;
    `);
  const cpCancelaciones: CreditoPuenteCancelacion[] = cpCancelacionesResult.recordset.map((r) => ({
    IDCreditoPuenteLote: r.IDCreditoPuenteLote,
    IDCreditoPuente: r.IDCreditoPuente,
    IDLote: r.IDLote,
    CodigoLote: r.CodigoLote?.trim() ?? '',
    AbreviaturaProyecto: r.AbreviaturaProyecto?.trim() ?? '',
    IDBancoCP: r.IDBancoCP,
    AbrevBancoCP: r.AbrevBancoCP?.trim() ?? '',
    Estado: r.Estado as 'CANCELACION_PROGRAMADA' | 'CANCELACION_CONFIRMADA',
    MontoCanceladoAlBanco_CRC: Number(r.MontoCanceladoAlBanco_CRC ?? 0),
    FechaCancelacionAlBanco: toIsoDate(r.FechaCancelacionAlBanco) ?? '',
    FechaConfirmacionCancelacion: toIsoDate(r.FechaConfirmacionCancelacion),
    MontoConfirmadoAlBanco_CRC:
      r.MontoConfirmadoAlBanco_CRC != null ? Number(r.MontoConfirmadoAlBanco_CRC) : null,
    Notas: r.Notas,
  }));

  // Distribución del lote por caso (casos con hito visible + casos con pago LOTE).
  const casosConPagoLoteResult = await db
    .request()
    .input('desde', sql.Date, desde)
    .input('hasta', sql.Date, hasta)
    .query<{ IDCaso: number }>(`
      SELECT DISTINCT IDCaso
      FROM [pro_app].pago_cliente
      WHERE Concepto = 'LOTE'
        AND FechaPlaneada BETWEEN @desde AND @hasta;
    `);
  const idsCasoVisibles = Array.from(
    new Set([
      ...desembolsos.map((d) => d.IDCaso),
      ...casosConPagoLoteResult.recordset.map((r) => r.IDCaso),
    ]),
  );
  let distribuciones: DistribucionPorCaso[] = [];
  if (idsCasoVisibles.length > 0) {
    const distRequest = db.request();
    const params = idsCasoVisibles
      .map((id, i) => {
        distRequest.input(`id${i}`, sql.Int, id);
        return `@id${i}`;
      })
      .join(',');
    const distResult = await distRequest.query<{
      IDCaso: number;
      IDProyecto: number;
      IDEntidad: number;
      Codigo: string;
      Nombre: string;
      Porcentaje: number;
      Monto: number;
    }>(`
      SELECT
        d.IDCaso,
        l.IDProyecto,
        d.IDEntidad,
        d.CodigoEntidad         AS Codigo,
        d.NombreEntidad         AS Nombre,
        d.PctEntidad            AS Porcentaje,
        d.MontoEntidad_CRC      AS Monto
      FROM [pro_app].vw_distribucion_caso d
      INNER JOIN pro_ventas.Casos c ON c.IDCaso = d.IDCaso
      INNER JOIN pro_ventas.Lotes l ON l.IDLote = c.IDLote
      WHERE d.IDCaso IN (${params})
      ORDER BY d.IDCaso, d.PctEntidad DESC
    `);
    const map = new Map<number, DistribucionPorCaso>();
    for (const row of distResult.recordset) {
      let entry = map.get(row.IDCaso);
      if (!entry) {
        entry = { IDCaso: row.IDCaso, IDProyecto: row.IDProyecto, items: [] };
        map.set(row.IDCaso, entry);
      }
      entry.items.push({
        IDEntidad: row.IDEntidad,
        Codigo: row.Codigo,
        Nombre: row.Nombre,
        Porcentaje: Number(row.Porcentaje),
        Monto: Number(row.Monto),
      });
    }
    distribuciones = Array.from(map.values());
  }

  const semanas = generarSemanas(desde, hasta);
  const totalProyectado = desembolsos.reduce((acc, d) => acc + (d.MontoHitoEsperado ?? 0), 0);

  return {
    desde: toIsoDate(desde) ?? '',
    hasta: toIsoDate(hasta) ?? '',
    semanas,
    desembolsos,
    totalProyectado,
    backlog,
    backlogExpandido,
    distribuciones,
    creditoPuente: {
      hitos: cpHitos,
      backlog: cpBacklog,
      cancelaciones: cpCancelaciones,
    },
  };
}

// ------------------------------------------------------- Actualizar proyección

/** Marca de error del SP que debe reportarse como 400 (no 500). */
export function esErrorCliente(message: string): boolean {
  return /THROW|debe|inválido|obligatorio|no existe/i.test(message);
}

/**
 * PATCH de una proyección hito×caso. Puerto exacto de `desembolsoActualizar`.
 * Casos especiales de LOTE/FIRMA para Reservados/Formalizados incluidos.
 * Lanza Error con mensaje del tipo del SP; el route decide status.
 */
export async function actualizarProyeccion(
  db: ConnectionPool,
  idCaso: number,
  idHito: number,
  body: ActualizarProyeccionRequest,
  usuarioEmail: string,
): Promise<ActualizarProyeccionResponse> {
  // Contexto: estado del caso + código del hito + nivel de confianza + fecha real.
  const ctxResult = await db
    .request()
    .input('idCaso', sql.Int, idCaso)
    .input('idHito', sql.Int, idHito)
    .query<{
      IDEstado: number;
      CodigoHito: string;
      NivelConfianzaActual: string | null;
      FechaRealHito: Date | null;
    }>(`
      SELECT
        cs.IDEstado,
        h.Codigo                AS CodigoHito,
        (SELECT TOP 1 pf.NivelConfianza
         FROM [pro_app].proyeccion_formalizacion pf
         WHERE pf.IDCaso = cs.IDCaso AND pf.Activa = 1
         ORDER BY pf.IDProyeccion DESC) AS NivelConfianzaActual,
        (SELECT TOP 1 chp.FechaRealHito
         FROM [pro_app].caso_hito_proyeccion chp
         WHERE chp.IDCaso = cs.IDCaso AND chp.IDHito = @idHito) AS FechaRealHito
      FROM pro_ventas.Casos cs
      INNER JOIN [pro_app].catalogo_hito h ON h.IDHito = @idHito
      WHERE cs.IDCaso = @idCaso;
    `);
  const ctxRow = ctxResult.recordset[0];
  if (!ctxRow) {
    const e = new Error('Caso o hito no existe');
    (e as { statusHint?: number }).statusHint = 404;
    throw e;
  }

  const esLoteOFirma = ctxRow.CodigoHito === 'LOTE' || ctxRow.CodigoHito === 'FIRMA';
  const esReservado = ctxRow.IDEstado === 4;
  const esFormalizado = ctxRow.IDEstado === 1 || ctxRow.IDEstado === 2;
  const tieneFechaRealHito = ctxRow.FechaRealHito != null;

  if (esLoteOFirma && esFormalizado && tieneFechaRealHito) {
    const e = new Error(
      'No se puede mover LOTE/FIRMA de un caso con FechaRealHito ya capturada. Borra la fecha real desde el panel del desembolso si necesitas reprogramar.',
    );
    (e as { statusHint?: number }).statusHint = 400;
    throw e;
  }

  if (esLoteOFirma && esReservado) {
    const nuevaFecha = body.FechaProyectadaDesembolso ?? null;
    if (!nuevaFecha) {
      const e = new Error(
        'Para LOTE/FIRMA de un Reservado, FechaProyectadaDesembolso es obligatoria (no se puede devolver a pendientes desde aqui — usa la pantalla de Formalizacion).',
      );
      (e as { statusHint?: number }).statusHint = 400;
      throw e;
    }
    const nivel = ctxRow.NivelConfianzaActual ?? 'M';
    const result = await db
      .request()
      .input('IDCaso', sql.Int, idCaso)
      .input('FechaProyectada', sql.Date, nuevaFecha)
      .input('NivelConfianza', sql.Char(1), nivel)
      .input('Notas', sql.NVarChar(1000), body.Notas ?? null)
      .input('UsuarioEmail', sql.NVarChar(200), usuarioEmail)
      .execute<{ IDProyeccionCreada: number }>(
        '[pro_app].sp_actualizar_proyeccion_formalizacion',
      );
    const row = result.recordset[0];
    return { IDProyeccion: row?.IDProyeccionCreada ?? 0 };
  }

  // Comportamiento normal: upsert de caso_hito_proyeccion.
  const request = db.request();
  request.input('IDCaso', sql.Int, idCaso);
  request.input('IDHito', sql.Int, idHito);
  request.input('FechaPlaneadaHito', sql.Date, body.FechaPlaneadaHito ?? null);
  request.input('FechaPlaneadaVisitaPerito', sql.Date, body.FechaPlaneadaVisitaPerito ?? null);
  request.input('FechaProyectadaDesembolso', sql.Date, body.FechaProyectadaDesembolso ?? null);
  request.input('FechaRealHito', sql.Date, body.FechaRealHito ?? null);
  request.input('FechaRealVisitaPerito', sql.Date, body.FechaRealVisitaPerito ?? null);
  request.input('FechaRealDesembolso', sql.Date, body.FechaRealDesembolso ?? null);
  request.input('EstadoTramite', sql.VarChar(30), body.EstadoTramite);
  request.input('Notas', sql.NVarChar(1000), body.Notas ?? null);
  request.input('UsuarioEmail', sql.NVarChar(200), usuarioEmail);

  const result = await request.execute<{ IDProyeccion: number }>(
    '[pro_app].sp_upsert_proyeccion_caso',
  );
  const row = result.recordset[0];
  if (!row) throw new Error('SP no devolvió fila de resultado');
  return { IDProyeccion: row.IDProyeccion };
}
