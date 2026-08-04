import type { ConnectionPool } from 'mssql';
import {
  calcularReporteSemanal,
  type FiltroVenta,
  type ReporteSemanal,
  type SemanaReporte,
} from '@/lib/avance/reportes';
import type { HorasObra, NominaSemanal, Subcontrato } from '@/lib/avance/mano-obra';

/**
 * Reporte de Mano de Obra — puerto server-side de obrascontrol
 * (`web/src/lib/calcularManoObra.ts` + `useResumenMesMO`). Consolida la captura
 * (nómina directa, horas por obra, subcontratos) con los m² avanzados por obra
 * de la semana (del motor `lib/avance/reportes.ts`) para dar el reparto de la
 * nómina por horas, el costo de M.O./m², la eficiencia y el sobrecosto.
 *
 * Fórmulas (idénticas al original):
 *   nómina_asignada(obra) = (horas_obra / Σ horas_semana) × nómina_directa
 *   M.O.(obra)            = nómina_asignada + Σ subcontratos(obra)
 *   costo M.O./m²         = M.O. / m² avanzados
 *   costo prom HH         = nómina_directa / Σ horas_semana
 *   HH equiv. subcontrato = Σ subcontratos / costo_prom_HH
 *   m² equiv. subcontrato = Σ subcontratos / costo_teórico_m²
 *   MO presupuestada      = costo_teórico_m² × m² construidos semana
 *   sobrecosto            = MO gastada − MO presupuestada
 *   eficiencia            = costo_teórico_m² / costo_MO_m² × 100  (≥100% = eficiente)
 */

// --------------------------------------------------------------------- Tipos

export interface ManoObraFila {
  codigo: string;
  hrs: number;
  pctHoras: number;
  nominaAsig: number;
  sc: number;
  moTotal: number;
  m2: number;
  costoM2: number;
}

export interface ManoObraCalc {
  tieneNomina: boolean;
  teorico: number;
  m2Sem: number;
  hhDirectas: number;
  hhEquivSubc: number;
  costoPromHH: number;
  hhM2Sin: number;
  hhM2Con: number;
  costoMOm2: number;
  eficiencia: number;
  moDirecta: number;
  moSubcontrato: number;
  moTotalGastada: number;
  moPresupuestada: number;
  sobrecosto: number;
  obras: ManoObraFila[];
}

export interface ReporteMO {
  semana: SemanaReporte;
  base_semanal: boolean;
  calc: ManoObraCalc;
}

// --------------------------------------------------------------- Cálculo puro

/**
 * Cálculo de Mano de Obra de una semana (indicadores + distribución por obra).
 * Función pura — puerto EXACTO de `calcularManoObra` de obrascontrol. El
 * `reporte` ya viene filtrado por estado de venta.
 */
export function calcularManoObra(
  semana: number,
  reporte: ReporteSemanal,
  nominaArr: NominaSemanal[],
  horasArr: HorasObra[],
  subcArr: Subcontrato[],
): ManoObraCalc {
  const sem = Number(semana);
  const nomina = nominaArr.find((n) => Number(n.semana_operativa_id) === sem);
  const horas = horasArr.filter((h) => Number(h.semana_operativa_id) === sem);
  const subc = subcArr.filter((s) => Number(s.semana_operativa_id) === sem);

  const montoNomina = nomina ? Number(nomina.monto_nomina_directa) : 0;
  const teorico = nomina ? Number(nomina.costo_teorico_m2) : 0;

  // Solo cuentan las obras presentes en el reporte (ya filtrado por venta).
  const obrasReporte = new Set(reporte.obras.map((o) => o.codigo));
  const m2PorObra = new Map(reporte.obras.map((o) => [o.codigo, o.m2_semana]));
  const enReporte = (codigo: string) => obrasReporte.has(codigo);

  const horasTotal = horas.reduce((a, h) => a + Number(h.horas), 0);
  const costoPromHH = horasTotal > 0 ? montoNomina / horasTotal : 0;
  const m2Sem = reporte.totales.m2_semana;

  const subcPorObra = new Map<string, number>();
  for (const s of subc) {
    if (!enReporte(s.obra_codigo)) continue;
    subcPorObra.set(s.obra_codigo, (subcPorObra.get(s.obra_codigo) ?? 0) + Number(s.monto));
  }
  const moSubcontrato = [...subcPorObra.values()].reduce((a, v) => a + v, 0);

  const hhDirectas = horas
    .filter((h) => enReporte(h.obra_codigo))
    .reduce((a, h) => a + Number(h.horas), 0);
  const moDirecta = horasTotal > 0 ? montoNomina * (hhDirectas / horasTotal) : 0;

  const hhEquivSubc = costoPromHH > 0 ? moSubcontrato / costoPromHH : 0;
  const m2EquivSubc = teorico > 0 ? moSubcontrato / teorico : 0;

  const moTotalGastada = moDirecta + moSubcontrato;
  const moPresupuestada = teorico * m2Sem;
  const sobrecosto = moTotalGastada - moPresupuestada;
  const m2SinSubc = m2Sem - m2EquivSubc;
  const hhM2Sin = m2SinSubc > 0 ? hhDirectas / m2SinSubc : 0;
  const hhM2Con = m2Sem > 0 ? (hhDirectas + hhEquivSubc) / m2Sem : 0;
  const costoMOm2 = m2Sem > 0 ? moTotalGastada / m2Sem : 0;
  const eficiencia = costoMOm2 > 0 ? (teorico / costoMOm2) * 100 : 0;

  const codigos = new Set<string>([
    ...horas.filter((h) => enReporte(h.obra_codigo)).map((h) => h.obra_codigo),
    ...subcPorObra.keys(),
  ]);
  const obras = [...codigos]
    .map((codigo) => {
      const hrs = Number(horas.find((h) => h.obra_codigo === codigo)?.horas ?? 0);
      const pctHoras = horasTotal > 0 ? (hrs / horasTotal) * 100 : 0;
      const nominaAsig = horasTotal > 0 ? (hrs / horasTotal) * montoNomina : 0;
      const sc = subcPorObra.get(codigo) ?? 0;
      const moTotal = nominaAsig + sc;
      const m2 = m2PorObra.get(codigo) ?? 0;
      const costoM2 = m2 > 0 ? moTotal / m2 : 0;
      return { codigo, hrs, pctHoras, nominaAsig, sc, moTotal, m2, costoM2 };
    })
    .sort((a, b) => b.moTotal - a.moTotal);

  return {
    tieneNomina: !!nomina,
    teorico,
    m2Sem,
    hhDirectas,
    hhEquivSubc,
    costoPromHH,
    hhM2Sin,
    hhM2Con,
    costoMOm2,
    eficiencia,
    moDirecta,
    moSubcontrato,
    moTotalGastada,
    moPresupuestada,
    sobrecosto,
    obras,
  };
}

// ------------------------------------------------------------ Carga de datos

async function cargarNomina(db: ConnectionPool): Promise<NominaSemanal[]> {
  const r = await db.request().query<NominaSemanal>(`
    SELECT n.semana_operativa_id, n.monto_nomina_directa, n.costo_teorico_m2, n.notas,
           s.anio, s.numero_semana,
           CONVERT(varchar(10), s.fecha_inicio, 23) AS fecha_inicio,
           CONVERT(varchar(10), s.fecha_fin, 23) AS fecha_fin
    FROM pro_obc.mo_nomina_semanal n
    JOIN pro_obc.semanas_operativas s ON s.id = n.semana_operativa_id
  `);
  return r.recordset;
}

async function cargarHoras(db: ConnectionPool): Promise<HorasObra[]> {
  const r = await db.request().query<HorasObra>(`
    SELECT semana_operativa_id, obra_codigo, horas FROM pro_obc.mo_horas_obra
  `);
  return r.recordset;
}

async function cargarSubcontratos(db: ConnectionPool): Promise<Subcontrato[]> {
  const r = await db.request().query<Subcontrato>(`
    SELECT id, semana_operativa_id, obra_codigo, tipo, monto, descripcion
    FROM pro_obc.mo_subcontratos
  `);
  return r.recordset;
}

// --------------------------------------------------------- Reporte MO semanal

/**
 * Reporte de Mano de Obra de una semana: corre el motor de avance para obtener
 * los m² por obra de la semana (filtrados por venta) y los consolida con la
 * captura de nómina/horas/subcontratos.
 */
export async function calcularReporteMO(
  db: ConnectionPool,
  semanaId: number,
  venta: FiltroVenta = 'todas',
): Promise<ReporteMO | null> {
  const reporte = await calcularReporteSemanal(db, semanaId, venta);
  if (!reporte) return null;
  const [nomina, horas, subc] = await Promise.all([
    cargarNomina(db),
    cargarHoras(db),
    cargarSubcontratos(db),
  ]);
  const calc = calcularManoObra(semanaId, reporte, nomina, horas, subc);
  return { semana: reporte.semana, base_semanal: reporte.base_semanal, calc };
}

// ----------------------------------------------------- Resumen del mes — M.O.

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface FilaResumenMesMO {
  semana: SemanaReporte;
  base_semanal: boolean;
  /** ₡ MO total gastada de la semana (nómina directa prorrateada + subcontratos). */
  mo_gastada: number;
  /** m² construidos en la semana. */
  m2: number;
  /** ₡ costo de MO por m² = mo_gastada / m². */
  costo_m2: number;
}

export interface ResumenMesMO {
  mes: string; // YYYY-MM
  filas: FilaResumenMesMO[];
  tot: { mo_gastada: number; m2: number; costo_m2: number };
}

/**
 * Resumen del Mes — Mano de Obra: por cada semana operativa del MISMO MES que la
 * seleccionada, corre el reporte de avance y calcula MO total gastada, m²
 * construidos y costo MO/m². Puerto server-side de `useResumenMesMO`. El total
 * del mes solo suma las semanas con base (m² del cierre calculable) y su costo/m²
 * es ponderado (Σ MO / Σ m²), no un promedio simple.
 */
export async function calcularResumenMesMO(
  db: ConnectionPool,
  semanaSel: number,
  venta: FiltroVenta = 'todas',
): Promise<ResumenMesMO | null> {
  const semanasQ = await db.request().query<{ id: number; fecha_inicio: string }>(`
    SELECT id, CONVERT(varchar(10), fecha_inicio, 23) AS fecha_inicio
    FROM pro_obc.semanas_operativas
    ORDER BY fecha_inicio ASC
  `);
  const sel = semanasQ.recordset.find((s) => Number(s.id) === semanaSel);
  if (!sel) return null;
  const mes = sel.fecha_inicio.slice(0, 7); // YYYY-MM
  const delMes = semanasQ.recordset
    .filter((s) => s.fecha_inicio.slice(0, 7) === mes)
    .sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio));

  const [nomina, horas, subc] = await Promise.all([
    cargarNomina(db),
    cargarHoras(db),
    cargarSubcontratos(db),
  ]);

  const filas: FilaResumenMesMO[] = [];
  for (const s of delMes) {
    const rep = await calcularReporteSemanal(db, Number(s.id), venta);
    if (!rep) continue;
    const calc = calcularManoObra(Number(s.id), rep, nomina, horas, subc);
    filas.push({
      semana: rep.semana,
      base_semanal: rep.base_semanal,
      mo_gastada: calc.moTotalGastada,
      m2: calc.m2Sem,
      costo_m2: calc.costoMOm2,
    });
  }

  const moGastada = filas.reduce((a, f) => a + (f.base_semanal ? f.mo_gastada : 0), 0);
  const m2 = filas.reduce((a, f) => a + (f.base_semanal ? f.m2 : 0), 0);

  return {
    mes,
    filas: filas.map((f) => ({
      ...f,
      mo_gastada: Math.round(f.mo_gastada),
      m2: redondear(f.m2),
      costo_m2: Math.round(f.costo_m2),
    })),
    tot: {
      mo_gastada: Math.round(moGastada),
      m2: redondear(m2),
      costo_m2: m2 > 0 ? Math.round(moGastada / m2) : 0,
    },
  };
}
