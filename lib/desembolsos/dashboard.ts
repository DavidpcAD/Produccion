import type { ConnectionPool } from 'mssql';
import { sql } from '@/lib/db-adelantedb';

/**
 * Dashboard ejecutivo de Flujo de Desembolsos — portado de la Azure Function
 * `dashboard.ts` de adelante-flujo-desembolsos. Read-only: lee las vistas del
 * esquema `app` (vw_dashboard_caso, vw_proyeccion_desembolsos, pago_cliente,
 * vw_monto_banco_por_lote, distribucion_config) más pro_ventas.Casos / pro_ventas.Lotes.
 *
 * Devuelve, en una sola llamada, los KPIs, la serie de ingresos por semana y la
 * lista de casos de la cartera. Todos los montos vienen en versión "Bruto" (CRC
 * del banco) y "Neto AD" (CRC que termina en AD según ratio
 * IngresoTotalAD/MontoBanco). El cálculo del ratio y del bucketing por semana es
 * idéntico al original.
 */

// --------------------------------------------------------------------- Tipos

export type NivelConfianza = 'A' | 'M' | 'B';
export type RangoDashboard = '4semanas' | 'mes';

export interface FiltroDashboard {
  idProyecto: number | null;
  idBanco: number | null;
  q: string | null;
  rango: RangoDashboard;
}

export interface Banco {
  IDBan: number;
  Abreviatura: string;
  NombreEntidad: string;
  ColorHexBanco: string | null;
  OrdenGal: number | null;
}

export interface DashboardKPIs {
  TotalPendiente_CRC: number;
  TotalPendienteAD_CRC: number;
  PipelineReservados_CRC: number;
  PipelineReservadosAD_CRC: number;
  ProyectadoSemana_CRC: number;
  ProyectadoSemanaAD_CRC: number;
  ProyectadoMes_CRC: number;
  ProyectadoMesAD_CRC: number;
  CasasFormalizadas: number;
  CasasReservadas: number;
  TotalPagoCliente_CRC: number;
  PagoClienteSemana_CRC: number;
  PagoClienteMes_CRC: number;
  TotalPendienteFormalizadoGlobal_CRC: number;
  TotalPendienteReservadoGlobal_CRC: number;
}

export interface DashboardSemana {
  Semana: number;
  FechaInicio: string;
  FechaFin: string;
  EtiquetaCorta: string;
  Formalizados_CRC: number;
  FormalizadosAD_CRC: number;
  Reservados_CRC: number;
  ReservadosAD_CRC: number;
  PagoCliente_CRC: number;
  Total_CRC: number;
  TotalAD_CRC: number;
}

export interface DashboardCaso {
  IDCaso: number;
  CodigoCaso: string | null;
  Cliente: string;
  NombreModelo: string | null;
  IDLote: number;
  NombreBloque: string | null;
  CodigoLote: string;
  AreaLote_m2: number | null;
  IDBan: number;
  AbrevBanco: string;
  NombreBanco: string;
  ColorBanco: string | null;
  IDProyecto: number;
  AbreviaturaProyecto: string;
  NombreProyecto: string;
  IDEstado: number;
  EsReservado: number;
  NivelConfianzaFormalizacion: NivelConfianza | null;
  PrecioVenta_CRC: number | null;
  PrecioVentaContractual_CRC: number | null;
  FechaReserva: string | null;
  FechaFormalizacion: string | null;
  TotalExtras_CRC: number;
  TotalDescuentos_CRC: number;
  ExtrasPendientesAprobacion: number;
  NumExtrasTotal: number;
  MontoBanco_CRC: number | null;
  MontoFinanciaBancoCapturado_CRC: number | null;
  PagoCliente_CRC: number;
  NumPagosCliente: number;
  FechaPagoCliente: string | null;
  PagadoProyectado_CRC: number;
  PagadoReal_CRC: number;
  NumLinks: number;
  Pendiente_CRC: number;
  Sobrecobro_CRC: number;
  TieneSobrecobro: number;
  IngresoTotalAD_CRC: number | null;
  PendienteAD_CRC: number | null;
  PorcentajeAvance: number;
  RatioCobroReal: number | null;
  TotalHitos: number;
  HitosCubiertos: number;
  ProximoCodigoHito: string | null;
  ProximoNombreHito: string | null;
  ProximoColorHito: string | null;
  ProximoMonto_CRC: number | null;
  ProximoMontoAD_CRC: number | null;
  ProximaFechaDesembolso: string | null;
  FechaProyectadaFormalizacion: string | null;
  NotasFormalizacion: string | null;
}

export interface RespuestaDashboard {
  rango: RangoDashboard;
  desde: string;
  hasta: string;
  kpis: DashboardKPIs;
  serieSemanal: DashboardSemana[];
  casos: DashboardCaso[];
}

// ---------------------------------------------------------------- Helpers fecha

/** Lunes de la semana ISO de la fecha dada. */
function lunesDe(fecha: Date): Date {
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  const dia = d.getDay(); // 0=domingo, 1=lunes...
  const offset = dia === 0 ? -6 : 1 - dia;
  d.setDate(d.getDate() + offset);
  return d;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function sumarDias(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

const MESES_ABR = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** "27 abr – 03 may" */
function etiquetaSemana(lunes: Date, domingo: Date): string {
  const a = `${lunes.getDate()} ${MESES_ABR[lunes.getMonth()]}`;
  const b = `${domingo.getDate()} ${MESES_ABR[domingo.getMonth()]}`;
  return `${a} – ${b}`;
}

function toIso(v: Date | string | null): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

// ------------------------------------------------------------------- Tipos crudos

interface RawKPIs {
  TotalPendiente_CRC: number | null;
  TotalPendienteAD_CRC: number | null;
  PipelineReservados_CRC: number | null;
  PipelineReservadosAD_CRC: number | null;
  ProyectadoSemana_CRC: number | null;
  ProyectadoSemanaAD_CRC: number | null;
  ProyectadoMes_CRC: number | null;
  ProyectadoMesAD_CRC: number | null;
  CasasFormalizadas: number;
  CasasReservadas: number;
  TotalPagoCliente_CRC: number | null;
  PagoClienteSemana_CRC: number | null;
  PagoClienteMes_CRC: number | null;
}

interface RawGlobales {
  TotalPendienteFormalizadoGlobal_CRC: number | null;
  TotalPendienteReservadoGlobal_CRC: number | null;
}

interface RawSemana {
  WeekIdx: number;
  Formalizados_CRC: number | null;
  FormalizadosAD_CRC: number | null;
  Reservados_CRC: number | null;
  ReservadosAD_CRC: number | null;
}

interface RawSemanaCliente {
  WeekIdx: number;
  PagoCliente_CRC: number | null;
}

// ----------------------------------------------------------------- Cálculo

/**
 * Calcula el dashboard completo. Puerto exacto de `dashboard` de flujo. Las 5
 * queries son independientes → se disparan en paralelo con Promise.all.
 */
export async function calcularDashboard(
  db: ConnectionPool,
  filtro: FiltroDashboard,
): Promise<RespuestaDashboard> {
  const { idProyecto, idBanco, q, rango } = filtro;

  // Rango del gráfico.
  const hoy = new Date();
  let desde: Date;
  let hasta: Date;
  let nSemanas: number;
  if (rango === 'mes') {
    desde = lunesDe(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
    hasta = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
    nSemanas = Math.ceil((hasta.getTime() - desde.getTime()) / (7 * 86400000)) + 1;
  } else {
    desde = lunesDe(hoy);
    nSemanas = 4;
    hasta = sumarDias(desde, nSemanas * 7 - 1);
  }

  // Ventanas fijas de KPIs (semana ISO actual + mes calendario actual).
  const lunesEstaSem = lunesDe(hoy);
  const domingoEstaSem = sumarDias(lunesEstaSem, 6);
  const inicioMesActual = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const finMesActual = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);

  // Cláusulas WHERE compartidas.
  const condsCaso: string[] = ['1=1'];
  const condsHito: string[] = ['h.HitoCubierto = 0', 'h.FechaProyectada IS NOT NULL'];
  if (idProyecto) {
    condsCaso.push('v.IDProyecto = @idProyecto');
    condsHito.push('h.IDProyecto = @idProyecto');
  }
  if (idBanco) {
    condsCaso.push('v.IDBan = @idBanco');
    condsHito.push('h.IDBan = @idBanco');
  }
  if (q) {
    condsCaso.push('(v.Cliente LIKE @q OR v.CodigoCaso LIKE @q OR v.CodigoLote LIKE @q)');
    condsHito.push('(h.Cliente LIKE @q OR h.CodigoCaso LIKE @q OR h.CodigoLote LIKE @q)');
  }
  const whereCaso = 'WHERE ' + condsCaso.join(' AND ');
  const whereHito = 'WHERE ' + condsHito.join(' AND ');

  const bind = () => {
    const r = db.request();
    if (idProyecto) r.input('idProyecto', sql.Int, idProyecto);
    if (idBanco) r.input('idBanco', sql.Int, idBanco);
    if (q) r.input('q', sql.NVarChar(200), `%${q}%`);
    return r;
  };

  // 1) Casos.
  const casosPromise = bind().query<Record<string, unknown>>(`
    SELECT
      v.*,
      CAST(
        CASE WHEN mb.MonedaValoracion = 'USD'
             THEN ISNULL(v.AreaLote_m2, 0) * ISNULL(mb.ValorM2BancoUSD, 0) * ISNULL(cs.TipoCambio, 0)
             ELSE ISNULL(v.AreaLote_m2, 0) * ISNULL(mb.ValorM2BancoUSD, 0)
        END * ISNULL(mb.PorcentajeFinanciamiento, 0) / 100.0
      AS MONEY) AS MontoLoteSugerido_CRC,
      dc.PrecioInternoM2 AS LotePrecioInternoM2,
      dc.Moneda          AS LoteMonedaConfig,
      cs.TipoCambio      AS TipoCambio
    FROM [pro_app].vw_dashboard_caso v
    LEFT JOIN [pro_app].vw_monto_banco_por_lote mb ON mb.IDCaso = v.IDCaso
    LEFT JOIN pro_ventas.Casos cs ON cs.IDCaso = v.IDCaso
    OUTER APPLY (
      SELECT TOP 1 dc1.PrecioInternoM2, dc1.Moneda
      FROM [pro_app].distribucion_config dc1
      INNER JOIN pro_ventas.Lotes l ON l.IDLote = cs.IDLote
      WHERE dc1.IDProyecto = l.IDProyecto
        AND dc1.VigenteDesde <= ISNULL(cs.FechaFormalizacion, GETDATE())
        AND (dc1.VigenteHasta IS NULL OR dc1.VigenteHasta >= ISNULL(cs.FechaFormalizacion, GETDATE()))
      ORDER BY dc1.VigenteDesde DESC
    ) dc
    ${whereCaso}
    ORDER BY Pendiente_CRC DESC, Cliente;
  `);

  // 2) KPIs.
  const kpisReq = bind();
  kpisReq.input('lunesSem', sql.Date, isoDate(lunesEstaSem));
  kpisReq.input('domingoSem', sql.Date, isoDate(domingoEstaSem));
  kpisReq.input('inicioMes', sql.Date, isoDate(inicioMesActual));
  kpisReq.input('finMes', sql.Date, isoDate(finMesActual));
  const kpisPromise = kpisReq.query<RawKPIs>(`
    WITH CasosFiltrados AS (
        SELECT v.* FROM [pro_app].vw_dashboard_caso v ${whereCaso}
    ),
    HitosFiltrados AS (
        SELECT h.* FROM [pro_app].vw_proyeccion_desembolsos h ${whereHito}
    )
    SELECT
        SUM(CasosFiltrados.Pendiente_CRC)   AS TotalPendiente_CRC,
        SUM(CasosFiltrados.PendienteAD_CRC) AS TotalPendienteAD_CRC,
        SUM(CASE WHEN CasosFiltrados.EsReservado = 1 THEN CasosFiltrados.Pendiente_CRC ELSE 0 END)   AS PipelineReservados_CRC,
        SUM(CASE WHEN CasosFiltrados.EsReservado = 1 THEN CasosFiltrados.PendienteAD_CRC ELSE 0 END) AS PipelineReservadosAD_CRC,
        SUM(CASE WHEN CasosFiltrados.EsReservado = 0 THEN 1 ELSE 0 END) AS CasasFormalizadas,
        SUM(CASE WHEN CasosFiltrados.EsReservado = 1 THEN 1 ELSE 0 END) AS CasasReservadas,
        (SELECT SUM(MontoHitoEsperado) FROM HitosFiltrados WHERE FechaProyectada BETWEEN @lunesSem AND @domingoSem) AS ProyectadoSemana_CRC,
        (SELECT SUM(MontoHitoEsperado * (ISNULL(IngresoTotalAD_CRC,0) / NULLIF(MontoBanco,0))) FROM HitosFiltrados WHERE FechaProyectada BETWEEN @lunesSem AND @domingoSem) AS ProyectadoSemanaAD_CRC,
        (SELECT SUM(MontoHitoEsperado) FROM HitosFiltrados WHERE FechaProyectada BETWEEN @inicioMes AND @finMes) AS ProyectadoMes_CRC,
        (SELECT SUM(MontoHitoEsperado * (ISNULL(IngresoTotalAD_CRC,0) / NULLIF(MontoBanco,0))) FROM HitosFiltrados WHERE FechaProyectada BETWEEN @inicioMes AND @finMes) AS ProyectadoMesAD_CRC,
        (SELECT SUM(MontoPlaneado_CRC) FROM [pro_app].pago_cliente pc INNER JOIN CasosFiltrados cf ON cf.IDCaso = pc.IDCaso) AS TotalPagoCliente_CRC,
        (SELECT SUM(MontoPlaneado_CRC) FROM [pro_app].pago_cliente pc INNER JOIN CasosFiltrados cf ON cf.IDCaso = pc.IDCaso WHERE pc.FechaPlaneada BETWEEN @lunesSem AND @domingoSem) AS PagoClienteSemana_CRC,
        (SELECT SUM(MontoPlaneado_CRC) FROM [pro_app].pago_cliente pc INNER JOIN CasosFiltrados cf ON cf.IDCaso = pc.IDCaso WHERE pc.FechaPlaneada BETWEEN @inicioMes AND @finMes) AS PagoClienteMes_CRC
    FROM CasosFiltrados;
  `);

  // KPIs globales (sin filtros).
  const globalesPromise = db.request().query<RawGlobales>(`
    SELECT
      SUM(CASE WHEN EsReservado = 0 THEN Pendiente_CRC ELSE 0 END) AS TotalPendienteFormalizadoGlobal_CRC,
      SUM(CASE WHEN EsReservado = 1 THEN Pendiente_CRC ELSE 0 END) AS TotalPendienteReservadoGlobal_CRC
    FROM [pro_app].vw_dashboard_caso;
  `);

  // 3) Serie semanal (hitos).
  const serieReq = bind();
  serieReq.input('desde', sql.Date, isoDate(desde));
  serieReq.input('hasta', sql.Date, isoDate(hasta));
  const seriePromise = serieReq.query<RawSemana>(`
    WITH HitosFiltrados AS (
        SELECT h.* FROM [pro_app].vw_proyeccion_desembolsos h ${whereHito}
    ),
    Bucketed AS (
        SELECT DATEDIFF(day, @desde, FechaProyectada) / 7 AS WeekIdx,
               EsReservado, MontoHitoEsperado, IngresoTotalAD_CRC, MontoBanco
        FROM HitosFiltrados
        WHERE FechaProyectada >= @desde AND FechaProyectada <= @hasta
    )
    SELECT WeekIdx,
        SUM(CASE WHEN EsReservado=0 THEN MontoHitoEsperado ELSE 0 END) AS Formalizados_CRC,
        SUM(CASE WHEN EsReservado=0 THEN MontoHitoEsperado * (ISNULL(IngresoTotalAD_CRC,0) / NULLIF(MontoBanco,0)) ELSE 0 END) AS FormalizadosAD_CRC,
        SUM(CASE WHEN EsReservado=1 THEN MontoHitoEsperado ELSE 0 END) AS Reservados_CRC,
        SUM(CASE WHEN EsReservado=1 THEN MontoHitoEsperado * (ISNULL(IngresoTotalAD_CRC,0) / NULLIF(MontoBanco,0)) ELSE 0 END) AS ReservadosAD_CRC
    FROM Bucketed
    GROUP BY WeekIdx
    ORDER BY WeekIdx;
  `);

  // Pagos del cliente por semana.
  const serieCliReq = bind();
  serieCliReq.input('desde', sql.Date, isoDate(desde));
  serieCliReq.input('hasta', sql.Date, isoDate(hasta));
  const serieClientePromise = serieCliReq.query<RawSemanaCliente>(`
    WITH CasosFiltrados AS (
      SELECT v.* FROM [pro_app].vw_dashboard_caso v ${whereCaso}
    )
    SELECT DATEDIFF(day, @desde, pc.FechaPlaneada) / 7 AS WeekIdx,
           SUM(pc.MontoPlaneado_CRC) AS PagoCliente_CRC
    FROM [pro_app].pago_cliente pc
    INNER JOIN CasosFiltrados cf ON cf.IDCaso = pc.IDCaso
    WHERE pc.FechaPlaneada >= @desde AND pc.FechaPlaneada <= @hasta
    GROUP BY DATEDIFF(day, @desde, pc.FechaPlaneada) / 7
    ORDER BY 1;
  `);

  const [casosRes, kpisRes, globalesRes, serieRes, serieCliRes] = await Promise.all([
    casosPromise,
    kpisPromise,
    globalesPromise,
    seriePromise,
    serieClientePromise,
  ]);

  const rawKpis = kpisRes.recordset[0] ?? ({} as RawKPIs);
  const rawGlobales = globalesRes.recordset[0] ?? ({} as RawGlobales);

  // Serie: generar todas las semanas del rango, aun sin hitos.
  const serieByWeek = new Map<number, RawSemana>();
  for (const r of serieRes.recordset) serieByWeek.set(r.WeekIdx, r);
  const serieCliByWeek = new Map<number, RawSemanaCliente>();
  for (const r of serieCliRes.recordset) serieCliByWeek.set(r.WeekIdx, r);

  const serieSemanal: DashboardSemana[] = [];
  for (let i = 0; i < nSemanas; i++) {
    const lunes = sumarDias(desde, i * 7);
    const domingo = sumarDias(lunes, 6);
    const r = serieByWeek.get(i);
    const c = serieCliByWeek.get(i);
    const formalizados = Number(r?.Formalizados_CRC ?? 0);
    const formalizadosAD = Number(r?.FormalizadosAD_CRC ?? 0);
    const reservados = Number(r?.Reservados_CRC ?? 0);
    const reservadosAD = Number(r?.ReservadosAD_CRC ?? 0);
    const pagoCliente = Number(c?.PagoCliente_CRC ?? 0);
    serieSemanal.push({
      Semana: i,
      FechaInicio: isoDate(lunes),
      FechaFin: isoDate(domingo),
      EtiquetaCorta: etiquetaSemana(lunes, domingo),
      Formalizados_CRC: formalizados,
      FormalizadosAD_CRC: formalizadosAD,
      Reservados_CRC: reservados,
      ReservadosAD_CRC: reservadosAD,
      PagoCliente_CRC: pagoCliente,
      Total_CRC: formalizados + reservados + pagoCliente,
      TotalAD_CRC: formalizadosAD + reservadosAD + pagoCliente,
    });
  }

  const num = (v: unknown): number => Number(v ?? 0);
  const numN = (v: unknown): number | null => (v == null ? null : Number(v));

  const casos: DashboardCaso[] = casosRes.recordset.map((r) => ({
    IDCaso: num(r.IDCaso),
    CodigoCaso: (r.CodigoCaso as string) ?? null,
    Cliente: (r.Cliente as string)?.trim() ?? '',
    NombreModelo: (r.NombreModelo as string) ?? null,
    IDLote: num(r.IDLote),
    NombreBloque: (r.NombreBloque as string) ?? null,
    CodigoLote: (r.CodigoLote as string) ?? '',
    AreaLote_m2: numN(r.AreaLote_m2),
    IDBan: num(r.IDBan),
    AbrevBanco: (r.AbrevBanco as string)?.trim() ?? '',
    NombreBanco: (r.NombreBanco as string)?.trim() ?? '',
    ColorBanco: (r.ColorBanco as string) ?? null,
    IDProyecto: num(r.IDProyecto),
    AbreviaturaProyecto: (r.AbreviaturaProyecto as string)?.trim() ?? '',
    NombreProyecto: (r.NombreProyecto as string)?.trim() ?? '',
    IDEstado: num(r.IDEstado),
    EsReservado: r.EsReservado ? 1 : 0,
    NivelConfianzaFormalizacion: (r.NivelConfianzaFormalizacion as NivelConfianza) ?? null,
    PrecioVenta_CRC: numN(r.PrecioVenta_CRC),
    PrecioVentaContractual_CRC: numN(r.PrecioVentaContractual_CRC),
    FechaReserva: toIso(r.FechaReserva as Date | string | null),
    FechaFormalizacion: toIso(r.FechaFormalizacion as Date | string | null),
    TotalExtras_CRC: num(r.TotalExtras_CRC),
    TotalDescuentos_CRC: num(r.TotalDescuentos_CRC),
    ExtrasPendientesAprobacion: num(r.ExtrasPendientesAprobacion),
    NumExtrasTotal: num(r.NumExtrasTotal),
    MontoBanco_CRC: numN(r.MontoBanco_CRC),
    MontoFinanciaBancoCapturado_CRC: numN(r.MontoFinanciaBancoCapturado_CRC),
    PagoCliente_CRC: num(r.PagoCliente_CRC),
    NumPagosCliente: num(r.NumPagosCliente),
    FechaPagoCliente: toIso(r.FechaPagoCliente as Date | string | null),
    PagadoProyectado_CRC: num(r.PagadoProyectado_CRC),
    PagadoReal_CRC: num(r.PagadoReal_CRC),
    NumLinks: num(r.NumLinks),
    Pendiente_CRC: num(r.Pendiente_CRC),
    Sobrecobro_CRC: num(r.Sobrecobro_CRC),
    TieneSobrecobro: r.TieneSobrecobro ? 1 : 0,
    IngresoTotalAD_CRC: numN(r.IngresoTotalAD_CRC),
    PendienteAD_CRC: numN(r.PendienteAD_CRC),
    PorcentajeAvance: num(r.PorcentajeAvance),
    RatioCobroReal: numN(r.RatioCobroReal),
    TotalHitos: num(r.TotalHitos),
    HitosCubiertos: num(r.HitosCubiertos),
    ProximoCodigoHito: (r.ProximoCodigoHito as string) ?? null,
    ProximoNombreHito: (r.ProximoNombreHito as string) ?? null,
    ProximoColorHito: (r.ProximoColorHito as string) ?? null,
    ProximoMonto_CRC: numN(r.ProximoMonto_CRC),
    ProximoMontoAD_CRC: numN(r.ProximoMontoAD_CRC),
    ProximaFechaDesembolso: toIso(r.ProximaFechaDesembolso as Date | string | null),
    FechaProyectadaFormalizacion: toIso(r.FechaProyectadaFormalizacion as Date | string | null),
    NotasFormalizacion: (r.NotasFormalizacion as string) ?? null,
  }));

  const kpis: DashboardKPIs = {
    TotalPendiente_CRC: num(rawKpis.TotalPendiente_CRC),
    TotalPendienteAD_CRC: num(rawKpis.TotalPendienteAD_CRC),
    PipelineReservados_CRC: num(rawKpis.PipelineReservados_CRC),
    PipelineReservadosAD_CRC: num(rawKpis.PipelineReservadosAD_CRC),
    ProyectadoSemana_CRC: num(rawKpis.ProyectadoSemana_CRC),
    ProyectadoSemanaAD_CRC: num(rawKpis.ProyectadoSemanaAD_CRC),
    ProyectadoMes_CRC: num(rawKpis.ProyectadoMes_CRC),
    ProyectadoMesAD_CRC: num(rawKpis.ProyectadoMesAD_CRC),
    CasasFormalizadas: num(rawKpis.CasasFormalizadas),
    CasasReservadas: num(rawKpis.CasasReservadas),
    TotalPagoCliente_CRC: num(rawKpis.TotalPagoCliente_CRC),
    PagoClienteSemana_CRC: num(rawKpis.PagoClienteSemana_CRC),
    PagoClienteMes_CRC: num(rawKpis.PagoClienteMes_CRC),
    TotalPendienteFormalizadoGlobal_CRC: num(rawGlobales.TotalPendienteFormalizadoGlobal_CRC),
    TotalPendienteReservadoGlobal_CRC: num(rawGlobales.TotalPendienteReservadoGlobal_CRC),
  };

  return {
    rango,
    desde: isoDate(desde),
    hasta: isoDate(hasta),
    kpis,
    serieSemanal,
    casos,
  };
}

// -------------------------------------------------------------------- Bancos

/** Catálogo de bancos (pro_ventas.Bancos, sin la columna Imagen base64). */
export async function listarBancos(db: ConnectionPool): Promise<Banco[]> {
  const r = await db.request().query<Banco>(`
    SELECT IDBan, Abreviatura, NombreEntidad, ColorHEXBan AS ColorHexBanco, OrdenGal
    FROM pro_ventas.Bancos
    ORDER BY ISNULL(OrdenGal, 999), Abreviatura
  `);
  return r.recordset.map((b) => ({
    IDBan: Number(b.IDBan),
    Abreviatura: b.Abreviatura?.trim() ?? '',
    NombreEntidad: b.NombreEntidad?.trim() ?? '',
    ColorHexBanco: b.ColorHexBanco?.trim() ?? null,
    OrdenGal: b.OrdenGal != null ? Number(b.OrdenGal) : null,
  }));
}
