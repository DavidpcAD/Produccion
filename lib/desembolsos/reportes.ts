import type { ConnectionPool } from 'mssql';
import { sql } from '@/lib/db-adelantedb';

// =============================================================================
// Reportes / Exports de Desembolsos. Portado de adelante-flujo-desembolsos
// (exportCartera / exportFlujoProyectado / exportLiquidacionLote /
// exportMovimientos). Cada función devuelve datos planos (JSON); el archivo
// Excel se arma en el cliente con `xlsx` (patrón loadXLSX de compras/avance).
// Sólo lecturas sobre vistas [pro_app].* existentes; no muta nada.
// =============================================================================

function isoDate(v: Date | string | null): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

// ---------------------------------------------------------------------------
// 0) Proyectos (catálogo AdelanteDB) — para los filtros de las pantallas.
// ---------------------------------------------------------------------------
export interface ProyectoOpcion { IDProyecto: number; AbreviaturaProyecto: string; Nombre: string }

export async function listarProyectos(db: ConnectionPool): Promise<ProyectoOpcion[]> {
  const r = await db.request().query<{ IDProyecto: number; AbreviaturaProyecto: string; Nombre: string }>(`
    SELECT IDProyecto, AbreviaturaProyecto, Nombre FROM pro_ventas.Proyecto ORDER BY AbreviaturaProyecto
  `);
  return r.recordset.map((p) => ({
    IDProyecto: Number(p.IDProyecto),
    AbreviaturaProyecto: p.AbreviaturaProyecto?.trim() ?? '',
    Nombre: p.Nombre?.trim() ?? '',
  }));
}

// ---------------------------------------------------------------------------
// 1) CARTERA — lista plana de casos (vw_dashboard_caso)
// ---------------------------------------------------------------------------
export interface CarteraFiltro { idBanco?: number; idProyecto?: number; estado?: string; q?: string }

export interface CarteraRow {
  IDCaso: number; CodigoCaso: string | null; Cliente: string; CodigoLote: string;
  NombreModelo: string | null; AreaLote_m2: number | null; AbrevBanco: string;
  AbreviaturaProyecto: string; IDEstado: number; FechaReserva: string | null;
  FechaFormalizacion: string | null; PrecioVentaContractual_CRC: number; PrecioVenta_CRC: number;
  MontoBanco_CRC: number | null; PagoCliente_CRC: number; PagadoReal_CRC: number;
  Pendiente_CRC: number; PorcentajeAvance: number | null; HitosCubiertos: number;
  TotalHitos: number; ProximoCodigoHito: string | null; ProximaFechaDesembolso: string | null;
  TieneSobrecobro: number;
}

export const ESTADO_LABEL: Record<number, string> = { 1: 'Entregado', 2: 'Formalizado', 4: 'Reservado' };

export async function cartera(db: ConnectionPool, f: CarteraFiltro): Promise<CarteraRow[]> {
  const request = db.request();
  const conds: string[] = [];
  if (f.estado) {
    const ids = f.estado.split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n));
    if (ids.length > 0) conds.push(`IDEstado IN (${ids.join(',')})`);
  } else {
    conds.push('IDEstado IN (1, 2, 4)');
  }
  if (f.idBanco) { conds.push('IDBan = @idBanco'); request.input('idBanco', sql.Int, f.idBanco); }
  if (f.idProyecto) { conds.push('IDProyecto = @idProyecto'); request.input('idProyecto', sql.Int, f.idProyecto); }
  if (f.q) {
    conds.push('(CodigoCaso LIKE @q OR Cliente LIKE @q OR CodigoLote LIKE @q OR CAST(IDCaso AS NVARCHAR(20)) LIKE @q)');
    request.input('q', sql.NVarChar(200), `%${f.q}%`);
  }
  const r = await request.query<Record<string, unknown>>(`
    SELECT IDCaso, CodigoCaso, Cliente, CodigoLote, NombreBloque, NombreModelo, AreaLote_m2,
           AbrevBanco, NombreBanco, AbreviaturaProyecto, NombreProyecto, IDEstado, EsReservado,
           FechaReserva, FechaFormalizacion, PrecioVenta_CRC, PrecioVentaContractual_CRC,
           MontoBanco_CRC, PagoCliente_CRC, PagadoReal_CRC, Pendiente_CRC,
           PorcentajeAvance, HitosCubiertos, TotalHitos, ProximoCodigoHito, ProximaFechaDesembolso, TieneSobrecobro
    FROM [pro_app].vw_dashboard_caso
    WHERE ${conds.join(' AND ')}
    ORDER BY EsReservado, AbrevBanco, AbreviaturaProyecto, CodigoLote;
  `);
  return r.recordset.map((c) => ({
    IDCaso: Number(c.IDCaso),
    CodigoCaso: (c.CodigoCaso as string | null),
    Cliente: String(c.Cliente ?? '').trim(),
    CodigoLote: String(c.CodigoLote ?? '').trim(),
    NombreModelo: (c.NombreModelo as string | null),
    AreaLote_m2: c.AreaLote_m2 != null ? Number(c.AreaLote_m2) : null,
    AbrevBanco: String(c.AbrevBanco ?? '').trim(),
    AbreviaturaProyecto: String(c.AbreviaturaProyecto ?? '').trim(),
    IDEstado: Number(c.IDEstado),
    FechaReserva: isoDate(c.FechaReserva as Date | null),
    FechaFormalizacion: isoDate(c.FechaFormalizacion as Date | null),
    PrecioVentaContractual_CRC: Number(c.PrecioVentaContractual_CRC ?? 0),
    PrecioVenta_CRC: Number(c.PrecioVenta_CRC ?? 0),
    MontoBanco_CRC: c.MontoBanco_CRC != null ? Number(c.MontoBanco_CRC) : null,
    PagoCliente_CRC: Number(c.PagoCliente_CRC ?? 0),
    PagadoReal_CRC: Number(c.PagadoReal_CRC ?? 0),
    Pendiente_CRC: Number(c.Pendiente_CRC ?? 0),
    PorcentajeAvance: c.PorcentajeAvance != null ? Number(c.PorcentajeAvance) : null,
    HitosCubiertos: Number(c.HitosCubiertos ?? 0),
    TotalHitos: Number(c.TotalHitos ?? 0),
    ProximoCodigoHito: (c.ProximoCodigoHito as string | null),
    ProximaFechaDesembolso: isoDate(c.ProximaFechaDesembolso as Date | null),
    TieneSobrecobro: Number(c.TieneSobrecobro ?? 0),
  }));
}

// ---------------------------------------------------------------------------
// 2) LIQUIDACIÓN DE LOTE — filas por (movimiento × entidad) (vw_liquidacion_lote)
// ---------------------------------------------------------------------------
export interface LiquidacionFiltro { desde: string; hasta: string; idProyecto?: number }

export interface LiquidacionRow {
  IDMovimiento: number; IDCaso: number; CodigoCaso: string | null; Cliente: string | null;
  CodigoLote: string | null; AbreviaturaProyecto: string | null; AbrevBanco: string | null;
  AbreviaturaTipo: string | null; CategoriaTipo: string | null; FechaMovimiento: string | null;
  EsCapturaBruta: number; Origen: string; MontoMovBruto_CRC: number; MontoAplicadoLote_CRC: number;
  CodigoEntidad: string; NombreEntidad: string; PctEntidad: number; LoteInterno_CRC: number;
  Exclusividad_CRC: number; TieneOverride: number; MontoEntidad_CRC: number;
}

export async function liquidacionLote(db: ConnectionPool, f: LiquidacionFiltro): Promise<LiquidacionRow[]> {
  const request = db.request().input('desde', sql.Date, f.desde).input('hasta', sql.Date, f.hasta);
  const conds = ['lq.FechaMovimiento BETWEEN @desde AND @hasta'];
  if (f.idProyecto) { conds.push('lq.IDProyecto = @idProyecto'); request.input('idProyecto', sql.Int, f.idProyecto); }
  const r = await request.query<Record<string, unknown>>(`
    SELECT lq.IDMovimiento, lq.IDCaso, lq.FechaMovimiento, lq.MontoMovBruto_CRC, lq.MontoAplicadoLote_CRC,
           lq.Origen, CAST(lq.EsCapturaBruta AS INT) AS EsCapturaBruta,
           lq.CodigoEntidad, lq.NombreEntidad, lq.PctEntidad, lq.LoteInterno_CRC, lq.Exclusividad_CRC,
           CAST(lq.TieneOverride AS INT) AS TieneOverride, lq.MontoEntidad_CRC,
           cs.DetCaso AS CodigoCaso, LTRIM(RTRIM(cl.NombreCompleto)) AS Cliente, l.Lote AS CodigoLote,
           pry.AbreviaturaProyecto, b.Abreviatura AS AbrevBanco, tm.Abreviatura AS AbreviaturaTipo, tm.Categoria AS CategoriaTipo
    FROM [pro_app].vw_liquidacion_lote lq
    INNER JOIN pro_ventas.Movimientos m ON m.IDMovimiento = lq.IDMovimiento
    LEFT JOIN pro_ventas.Casos cs ON cs.IDCaso = lq.IDCaso
    LEFT JOIN pro_ventas.Clientes cl ON cl.IDCliente = cs.IDCliente
    LEFT JOIN pro_ventas.Lotes l ON l.IDLote = lq.IDLote
    LEFT JOIN pro_ventas.Proyecto pry ON pry.IDProyecto = lq.IDProyecto
    LEFT JOIN pro_ventas.Bancos b ON b.IDBan = cs.IDBanco
    LEFT JOIN pro_ventas.TipMovi tm ON tm.IDTmov = m.IDTipmov
    WHERE ${conds.join(' AND ')}
    ORDER BY lq.FechaMovimiento, lq.IDMovimiento, lq.CodigoEntidad;
  `);
  return r.recordset.map((x) => ({
    IDMovimiento: Number(x.IDMovimiento),
    IDCaso: Number(x.IDCaso),
    CodigoCaso: (x.CodigoCaso as string | null),
    Cliente: (x.Cliente as string | null),
    CodigoLote: x.CodigoLote != null ? String(x.CodigoLote).trim() : null,
    AbreviaturaProyecto: (x.AbreviaturaProyecto as string | null),
    AbrevBanco: x.AbrevBanco != null ? String(x.AbrevBanco).trim() : null,
    AbreviaturaTipo: (x.AbreviaturaTipo as string | null),
    CategoriaTipo: (x.CategoriaTipo as string | null),
    FechaMovimiento: isoDate(x.FechaMovimiento as Date | null),
    EsCapturaBruta: Number(x.EsCapturaBruta ?? 0),
    Origen: String(x.Origen ?? ''),
    MontoMovBruto_CRC: Number(x.MontoMovBruto_CRC ?? 0),
    MontoAplicadoLote_CRC: Number(x.MontoAplicadoLote_CRC ?? 0),
    CodigoEntidad: String(x.CodigoEntidad ?? ''),
    NombreEntidad: String(x.NombreEntidad ?? ''),
    PctEntidad: Number(x.PctEntidad ?? 0),
    LoteInterno_CRC: Number(x.LoteInterno_CRC ?? 0),
    Exclusividad_CRC: Number(x.Exclusividad_CRC ?? 0),
    TieneOverride: Number(x.TieneOverride ?? 0),
    MontoEntidad_CRC: Number(x.MontoEntidad_CRC ?? 0),
  }));
}

// ---------------------------------------------------------------------------
// 3) MOVIMIENTOS — lista plana (vw_movimientos_caso)
// ---------------------------------------------------------------------------
export interface MovimientosFiltro {
  idCaso?: number; idBanco?: number; idProyecto?: number; clasificacion?: string;
  categoria?: string; estadoVinculacion?: 'VINCULADOS' | 'SIN_VINCULAR'; desde?: string; hasta?: string; q?: string;
}

export interface MovimientoRow {
  IDMovimiento: number; IDCaso: number; CodigoCaso: string | null; Cliente: string | null;
  CodigoLote: string | null; NombreBloque: string | null; AbreviaturaTipo: string | null;
  NombreTipo: string | null; CategoriaTipo: string | null; FechaRealizado: string | null;
  FechaSolicitud: string | null; Moneda: string | null; TipoCambio: number | null;
  MontoColones: number; MontoDolares: number | null; Depositante: string | null;
  Clasificacion: string | null; DetalleTransferencia: string | null; MontoVinculado_CRC: number;
  MontoSinVincular_CRC: number; EstaVinculado: number; NumHitosVinculados: number;
  NumPagosClienteVinculados: number; AbrevBanco: string | null; NombreProyecto: string | null;
  AbreviaturaProyecto: string | null;
}

export async function movimientos(db: ConnectionPool, f: MovimientosFiltro): Promise<MovimientoRow[]> {
  const request = db.request();
  const conds: string[] = ['vw.IDCaso IS NOT NULL'];
  if (f.idCaso) { conds.push('vw.IDCaso = @idCaso'); request.input('idCaso', sql.Int, f.idCaso); }
  if (f.clasificacion && f.clasificacion !== 'TODOS') { conds.push('vw.Clasificacion = @clasif'); request.input('clasif', sql.VarChar(20), f.clasificacion); }
  if (f.categoria && f.categoria !== 'TODOS') { conds.push('vw.CategoriaTipo = @cat'); request.input('cat', sql.VarChar(20), f.categoria); }
  if (f.estadoVinculacion === 'VINCULADOS') conds.push('vw.EstaVinculado = 1');
  else if (f.estadoVinculacion === 'SIN_VINCULAR') conds.push('vw.EstaVinculado = 0');
  if (f.desde) { conds.push('vw.FechaRealizado >= @desde'); request.input('desde', sql.Date, f.desde); }
  if (f.hasta) { conds.push('vw.FechaRealizado <= @hasta'); request.input('hasta', sql.Date, f.hasta); }
  if (f.q) {
    conds.push('(vw.CodigoCaso LIKE @q OR vw.Cliente LIKE @q OR vw.DetalleTransferencia LIKE @q OR vw.CodigoLote LIKE @q OR CAST(vw.IDCaso AS NVARCHAR(20)) LIKE @q)');
    request.input('q', sql.NVarChar(200), `%${f.q}%`);
  }
  let joinBanco = '';
  if (f.idBanco) { joinBanco = 'INNER JOIN pro_ventas.Casos cs2 ON cs2.IDCaso = vw.IDCaso AND cs2.IDBanco = @idBanco'; request.input('idBanco', sql.Int, f.idBanco); }
  let joinProyecto = '';
  if (f.idProyecto) { joinProyecto = 'INNER JOIN pro_ventas.Lotes lt2 ON lt2.IDLote = vw.IDLote AND lt2.IDProyecto = @idProyecto'; request.input('idProyecto', sql.Int, f.idProyecto); }

  const r = await request.query<Record<string, unknown>>(`
    SELECT vw.IDMovimiento, vw.IDCaso, vw.CodigoCaso, vw.Cliente, vw.CodigoLote, vw.NombreBloque,
           vw.AbreviaturaTipo, vw.NombreTipo, vw.CategoriaTipo, vw.FechaRealizado, vw.FechaSolicitud,
           vw.Moneda, vw.TipoCambio, vw.MontoColones, vw.MontoDolares, vw.Depositante, vw.Clasificacion,
           vw.DetalleTransferencia, vw.MontoVinculado_CRC, vw.MontoSinVincular_CRC, vw.EstaVinculado,
           vw.NumHitosVinculados, vw.NumPagosClienteVinculados,
           bnk.Abreviatura AS AbrevBanco, pry.Nombre AS NombreProyecto, pry.AbreviaturaProyecto
    FROM [pro_app].vw_movimientos_caso vw
    LEFT JOIN pro_ventas.Casos csB ON csB.IDCaso = vw.IDCaso
    LEFT JOIN pro_ventas.Bancos bnk ON bnk.IDBan = csB.IDBanco
    LEFT JOIN pro_ventas.Lotes ltB ON ltB.IDLote = vw.IDLote
    LEFT JOIN pro_ventas.Proyecto pry ON pry.IDProyecto = ltB.IDProyecto
    ${joinBanco} ${joinProyecto}
    WHERE ${conds.join(' AND ')}
    ORDER BY vw.FechaRealizado DESC, vw.IDMovimiento DESC;
  `);
  return r.recordset.map((x) => ({
    IDMovimiento: Number(x.IDMovimiento),
    IDCaso: Number(x.IDCaso),
    CodigoCaso: (x.CodigoCaso as string | null),
    Cliente: x.Cliente != null ? String(x.Cliente).trim() : null,
    CodigoLote: x.CodigoLote != null ? String(x.CodigoLote).trim() : null,
    NombreBloque: (x.NombreBloque as string | null),
    AbreviaturaTipo: (x.AbreviaturaTipo as string | null),
    NombreTipo: (x.NombreTipo as string | null),
    CategoriaTipo: (x.CategoriaTipo as string | null),
    FechaRealizado: isoDate(x.FechaRealizado as Date | null),
    FechaSolicitud: isoDate(x.FechaSolicitud as Date | null),
    Moneda: (x.Moneda as string | null),
    TipoCambio: x.TipoCambio != null ? Number(x.TipoCambio) : null,
    MontoColones: Number(x.MontoColones ?? 0),
    MontoDolares: x.MontoDolares != null ? Number(x.MontoDolares) : null,
    Depositante: (x.Depositante as string | null),
    Clasificacion: (x.Clasificacion as string | null),
    DetalleTransferencia: (x.DetalleTransferencia as string | null),
    MontoVinculado_CRC: Number(x.MontoVinculado_CRC ?? 0),
    MontoSinVincular_CRC: Number(x.MontoSinVincular_CRC ?? 0),
    EstaVinculado: Number(x.EstaVinculado ?? 0),
    NumHitosVinculados: Number(x.NumHitosVinculados ?? 0),
    NumPagosClienteVinculados: Number(x.NumPagosClienteVinculados ?? 0),
    AbrevBanco: x.AbrevBanco != null ? String(x.AbrevBanco).trim() : null,
    NombreProyecto: (x.NombreProyecto as string | null),
    AbreviaturaProyecto: (x.AbreviaturaProyecto as string | null),
  }));
}

// ---------------------------------------------------------------------------
// 4) FLUJO PROYECTADO — matriz banco × semana (vw_proyeccion_desembolsos +
//    credito puente + pagos cliente + distribución de lote).
// ---------------------------------------------------------------------------
export type VistaFlujo = 'bruto' | 'netoAD';
export interface FlujoFiltro { desde: string; hasta: string; idBanco?: number; idProyecto?: number; vista: VistaFlujo }

export interface SemanaCol { numero: number; desde: string; hasta: string; etiqueta: string }
export interface FilaFlujo { clave: string; etiqueta: string; semanas: number[]; total: number }
export interface FlujoResultado {
  desde: string; hasta: string; vista: VistaFlujo;
  semanas: SemanaCol[];
  bancos: FilaFlujo[]; creditoPuente: FilaFlujo[]; cliente: FilaFlujo; lotes: FilaFlujo[];
  totalGeneral: { semanas: number[]; total: number };
}

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function isoWeekNumber(d: Date): number {
  const target = new Date(d.valueOf());
  const dayNr = (d.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diff = (target.valueOf() - firstThursday.valueOf()) / 86400000;
  return 1 + Math.round((diff - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}
function etiquetaSemana(d: Date): string { return `${d.getUTCDate()}-${MESES_CORTOS[d.getUTCMonth()]}`; }

function generarSemanas(desde: Date, hasta: Date): { cols: SemanaCol[]; rangos: { desde: number; hasta: number }[] } {
  const cols: SemanaCol[] = []; const rangos: { desde: number; hasta: number }[] = [];
  const cursor = new Date(desde); let i = 0;
  while (cursor <= hasta && i < 16) {
    const ini = new Date(cursor); const fin = new Date(cursor); fin.setUTCDate(ini.getUTCDate() + 6);
    cols.push({ numero: isoWeekNumber(ini), desde: ini.toISOString().slice(0, 10), hasta: fin.toISOString().slice(0, 10), etiqueta: etiquetaSemana(ini) });
    rangos.push({ desde: ini.getTime(), hasta: fin.getTime() });
    cursor.setUTCDate(cursor.getUTCDate() + 7); i++;
  }
  return { cols, rangos };
}
function indiceSemana(fecha: Date, rangos: { desde: number; hasta: number }[]): number {
  const t = fecha.getTime();
  for (let i = 0; i < rangos.length; i++) if (t >= rangos[i].desde && t <= rangos[i].hasta) return i;
  return -1;
}

export async function flujoProyectado(db: ConnectionPool, f: FlujoFiltro): Promise<FlujoResultado> {
  const desde = new Date(f.desde + 'T00:00:00Z');
  const hasta = new Date(f.hasta + 'T00:00:00Z');
  const { cols, rangos } = generarSemanas(desde, hasta);
  const n = cols.length;
  const mkFila = (clave: string, etiqueta: string): FilaFlujo => ({ clave, etiqueta, semanas: new Array(n).fill(0), total: 0 });

  // --- Hitos bancarios (excluye LOTE hito, EsMontoFijo=1) ---
  const reqB = db.request().input('desde', sql.Date, f.desde).input('hasta', sql.Date, f.hasta);
  const condsB = ['v.FechaProyectada BETWEEN @desde AND @hasta', 'v.EsMontoFijo = 0'];
  if (f.idBanco) { condsB.push('v.IDBan = @idBanco'); reqB.input('idBanco', sql.Int, f.idBanco); }
  if (f.idProyecto) { condsB.push('v.IDProyecto = @idProyecto'); reqB.input('idProyecto', sql.Int, f.idProyecto); }
  const hitos = await reqB.query<{ IDBan: number; AbrevBanco: string; FechaProyectada: Date; MontoHitoEsperado: number }>(`
    SELECT v.IDBan, v.AbrevBanco, v.FechaProyectada, v.MontoHitoEsperado
    FROM [pro_app].vw_proyeccion_desembolsos v WHERE ${condsB.join(' AND ')}
    ORDER BY v.IDBan, v.FechaProyectada;
  `);
  const mapBancos = new Map<number, FilaFlujo>();
  for (const h of hitos.recordset) {
    let fila = mapBancos.get(h.IDBan);
    if (!fila) { fila = mkFila(String(h.IDBan), h.AbrevBanco?.trim() ?? `Banco ${h.IDBan}`); mapBancos.set(h.IDBan, fila); }
    const idx = indiceSemana(new Date(h.FechaProyectada), rangos); if (idx < 0) continue;
    const monto = Number(h.MontoHitoEsperado ?? 0); fila.semanas[idx] += monto; fila.total += monto;
  }
  const bancos = Array.from(mapBancos.values()).sort((a, b) => a.etiqueta.localeCompare(b.etiqueta));

  // --- Crédito puente (hitos + cancelaciones que restan) ---
  const reqCP = db.request().input('desde', sql.Date, f.desde).input('hasta', sql.Date, f.hasta);
  const condsCP = ['v.FechaProyectada BETWEEN @desde AND @hasta', "cp.Estado = 'ACTIVO'"];
  if (f.idProyecto) { condsCP.push('l.IDProyecto = @idProyectoCP'); reqCP.input('idProyectoCP', sql.Int, f.idProyecto); }
  const hitosCP = await reqCP.query<{ IDCreditoPuente: number; AbrevBancoCP: string; FechaProyectada: Date; MontoHitoEsperado_CRC: number }>(`
    SELECT v.IDCreditoPuente, v.AbrevBancoCP, v.FechaProyectada, v.MontoHitoEsperado_CRC
    FROM [pro_app].vw_credito_puente_lote_hito v
    INNER JOIN [pro_app].credito_puente cp ON cp.IDCreditoPuente = v.IDCreditoPuente
    INNER JOIN pro_ventas.Lotes l ON l.IDLote = v.IDLote
    WHERE ${condsCP.join(' AND ')} ORDER BY v.IDBancoCP, v.FechaProyectada;
  `);
  const cancel = await db.request().input('desde', sql.Date, f.desde).input('hasta', sql.Date, f.hasta)
    .query<{ IDCreditoPuente: number; AbrevBancoCP: string; FechaEgreso: Date; MontoEgreso_CRC: number }>(`
      SELECT cpl.IDCreditoPuente, b.Abreviatura AS AbrevBancoCP,
             COALESCE(cpl.FechaConfirmacionCancelacion, cpl.FechaCancelacionAlBanco) AS FechaEgreso,
             COALESCE(cpl.MontoConfirmadoAlBanco_CRC, cpl.MontoCanceladoAlBanco_CRC) AS MontoEgreso_CRC
      FROM [pro_app].credito_puente_lote cpl
      INNER JOIN [pro_app].credito_puente cp ON cp.IDCreditoPuente = cpl.IDCreditoPuente
      INNER JOIN pro_ventas.Bancos b ON b.IDBan = cp.IDBan
      WHERE cpl.Estado IN ('CANCELACION_PROGRAMADA','CANCELACION_CONFIRMADA') AND cp.Estado = 'ACTIVO'
        AND COALESCE(cpl.FechaConfirmacionCancelacion, cpl.FechaCancelacionAlBanco) BETWEEN @desde AND @hasta;
    `);
  const mapCP = new Map<number, FilaFlujo>();
  for (const h of hitosCP.recordset) {
    let fila = mapCP.get(h.IDCreditoPuente);
    if (!fila) { fila = mkFila(`CP-${h.IDCreditoPuente}`, `CP ${h.AbrevBancoCP?.trim() ?? h.IDCreditoPuente}`); mapCP.set(h.IDCreditoPuente, fila); }
    const idx = indiceSemana(new Date(h.FechaProyectada), rangos); if (idx < 0) continue;
    const monto = Number(h.MontoHitoEsperado_CRC ?? 0); fila.semanas[idx] += monto; fila.total += monto;
  }
  for (const c of cancel.recordset) {
    let fila = mapCP.get(c.IDCreditoPuente);
    if (!fila) { fila = mkFila(`CP-${c.IDCreditoPuente}`, `CP ${c.AbrevBancoCP?.trim() ?? c.IDCreditoPuente}`); mapCP.set(c.IDCreditoPuente, fila); }
    const idx = indiceSemana(new Date(c.FechaEgreso), rangos); if (idx < 0) continue;
    const monto = -Number(c.MontoEgreso_CRC ?? 0); fila.semanas[idx] += monto; fila.total += monto;
  }
  const creditoPuente = Array.from(mapCP.values()).sort((a, b) => a.etiqueta.localeCompare(b.etiqueta));

  // --- Pagos cliente (excluye LOTE, se contabiliza en Lotes) ---
  const reqPC = db.request().input('desde', sql.Date, f.desde).input('hasta', sql.Date, f.hasta);
  const condsPC = ['pc.FechaPlaneada BETWEEN @desde AND @hasta', "pc.Concepto <> 'LOTE'"];
  if (f.idProyecto) { condsPC.push('l.IDProyecto = @idProyecto'); reqPC.input('idProyecto', sql.Int, f.idProyecto); }
  if (f.idBanco) { condsPC.push('c.IDBanco = @idBanco'); reqPC.input('idBanco', sql.Int, f.idBanco); }
  const pagos = await reqPC.query<{ FechaPlaneada: Date; MontoPlaneado_CRC: number }>(`
    SELECT pc.FechaPlaneada, pc.MontoPlaneado_CRC
    FROM [pro_app].pago_cliente pc
    INNER JOIN pro_ventas.Casos c ON c.IDCaso = pc.IDCaso
    INNER JOIN pro_ventas.Lotes l ON l.IDLote = c.IDLote
    WHERE ${condsPC.join(' AND ')};
  `);
  const cliente = mkFila('CLIENTE', 'Pagos cliente');
  for (const p of pagos.recordset) {
    const idx = indiceSemana(new Date(p.FechaPlaneada), rangos); if (idx < 0) continue;
    const monto = Number(p.MontoPlaneado_CRC ?? 0); cliente.semanas[idx] += monto; cliente.total += monto;
  }

  // --- Distribución de lote (path bancario FIRMA/LOTE + path contado) ---
  const dist: { FechaLote: Date; CodigoEntidad: string; Monto_CRC: number }[] = [];
  {
    const req = db.request().input('desde', sql.Date, f.desde).input('hasta', sql.Date, f.hasta);
    const conds = ["vp.CodigoHito = 'LOTE'", 'vp.FechaProyectada BETWEEN @desde AND @hasta'];
    if (f.idBanco) { conds.push('vp.IDBan = @idBanco'); req.input('idBanco', sql.Int, f.idBanco); }
    if (f.idProyecto) { conds.push('vp.IDProyecto = @idProyecto'); req.input('idProyecto', sql.Int, f.idProyecto); }
    const r = await req.query<{ FechaLote: Date; CodigoEntidad: string; Monto_CRC: number; DiferenciaBancoVsInterno_CRC: number }>(`
      SELECT vp.FechaProyectada AS FechaLote, d.CodigoEntidad, d.MontoEntidad_CRC AS Monto_CRC,
             ISNULL(vp.DiferenciaBancoVsInterno_CRC, 0) AS DiferenciaBancoVsInterno_CRC
      FROM [pro_app].vw_proyeccion_desembolsos vp
      INNER JOIN [pro_app].vw_distribucion_caso d ON d.IDCaso = vp.IDCaso
      WHERE ${conds.join(' AND ')};
    `);
    for (const x of r.recordset) {
      const construccionAD = x.CodigoEntidad === 'AD' ? Number(x.DiferenciaBancoVsInterno_CRC ?? 0) : 0;
      dist.push({ FechaLote: x.FechaLote, CodigoEntidad: x.CodigoEntidad, Monto_CRC: Number(x.Monto_CRC ?? 0) + construccionAD });
    }
  }
  {
    const req = db.request().input('desde', sql.Date, f.desde).input('hasta', sql.Date, f.hasta);
    const conds = ["pc.Concepto = 'LOTE'", 'pc.FechaPlaneada BETWEEN @desde AND @hasta',
      `NOT EXISTS (SELECT 1 FROM [pro_app].vw_proyeccion_desembolsos vp WHERE vp.IDCaso = pc.IDCaso AND vp.CodigoHito = 'LOTE')`];
    if (f.idProyecto) { conds.push('l.IDProyecto = @idProyectoPC'); req.input('idProyectoPC', sql.Int, f.idProyecto); }
    if (f.idBanco) { conds.push('c.IDBanco = @idBancoPC'); req.input('idBancoPC', sql.Int, f.idBanco); }
    const r = await req.query<{ FechaLote: Date; CodigoEntidad: string; MontoOriginal_CRC: number; MontoPagoEfectivo_CRC: number; TotalDistribucion_CRC: number }>(`
      WITH PagosLOTE AS (
        SELECT pc.IDCaso, pc.FechaPlaneada, pc.MontoPlaneado_CRC AS MontoPagoEfectivo_CRC
        FROM [pro_app].pago_cliente pc
        INNER JOIN pro_ventas.Casos c ON c.IDCaso = pc.IDCaso
        INNER JOIN pro_ventas.Lotes l ON l.IDLote = c.IDLote
        WHERE ${conds.join(' AND ')})
      SELECT pl.FechaPlaneada AS FechaLote, d.CodigoEntidad, d.MontoEntidad_CRC AS MontoOriginal_CRC,
             pl.MontoPagoEfectivo_CRC, SUM(d.MontoEntidad_CRC) OVER (PARTITION BY pl.IDCaso) AS TotalDistribucion_CRC
      FROM PagosLOTE pl INNER JOIN [pro_app].vw_distribucion_caso d ON d.IDCaso = pl.IDCaso;
    `);
    for (const x of r.recordset) {
      const total = Number(x.TotalDistribucion_CRC ?? 0);
      const ratio = total > 0 ? Number(x.MontoPagoEfectivo_CRC ?? 0) / total : 1;
      dist.push({ FechaLote: x.FechaLote, CodigoEntidad: x.CodigoEntidad, Monto_CRC: Number(x.MontoOriginal_CRC ?? 0) * ratio });
    }
  }
  const mapLotes = new Map<string, FilaFlujo>();
  for (const d of dist) {
    let fila = mapLotes.get(d.CodigoEntidad);
    if (!fila) { fila = mkFila(`LOTE-${d.CodigoEntidad}`, d.CodigoEntidad); mapLotes.set(d.CodigoEntidad, fila); }
    const idx = indiceSemana(new Date(d.FechaLote), rangos); if (idx < 0) continue;
    const monto = Number(d.Monto_CRC ?? 0); fila.semanas[idx] += monto; fila.total += monto;
  }
  const lotes = Array.from(mapLotes.values()).sort((a, b) => b.total - a.total);

  // --- Total general: bancos + CP + cliente + lotes(por vista) ---
  const lotesEnTotal = f.vista === 'netoAD' ? lotes.filter((l) => l.etiqueta === 'AD') : lotes;
  const totSem = new Array(n).fill(0); let tot = 0;
  for (const filas of [bancos, creditoPuente, [cliente], lotesEnTotal]) {
    for (const fila of filas) { for (let i = 0; i < n; i++) totSem[i] += fila.semanas[i] ?? 0; tot += fila.total; }
  }

  return {
    desde: f.desde, hasta: f.hasta, vista: f.vista, semanas: cols,
    bancos, creditoPuente, cliente, lotes,
    totalGeneral: { semanas: totSem, total: tot },
  };
}
